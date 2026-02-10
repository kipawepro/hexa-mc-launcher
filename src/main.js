const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsOriginal = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const msmc = require("msmc");
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const os = require('os');
const crypto = require('crypto');
const DiscordRPC = require('discord-rpc');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const AUTH_API_URL = 'https://hgstudio.strator.gg/auth_api.php';  
const launcherConfigUrl = 'http://91.197.6.177:24607/api/launcher/config';
const rpcClientId = '1462409497116016682';
let rpcClient = null;
let rpcStarted = false;
async function initRPC(enabled = true) {
    if (!enabled) {
        if (rpcClient) {
            rpcClient.destroy();
            rpcClient = null;
            rpcStarted = false;
        }
        return;
    }
    if (rpcStarted) return;
    rpcClient = new DiscordRPC.Client({ transport: 'ipc' });
    rpcClient.on('ready', () => {
        rpcStarted = true;
        setRPCActivity({
            details: 'Dans les menus',
            state: 'HG Studio Launcher',
            largeImageKey: 'logo',
            largeImageText: 'HG Launcher',
            smallImageKey: 'logo',
            smallImageText: 'V2.0.0'
        });
    });
    try {
        await rpcClient.login({ clientId: rpcClientId });
    } catch (e) {
        console.error("RPC Login Failed", e);
    }
}
async function setRPCActivity(activity) {
    if (!rpcClient || !rpcStarted) return;
    try {
        const startTimestamp = Date.now();
        rpcClient.setActivity({
            details: activity.details,
            state: activity.state,
            largeImageKey: activity.largeImageKey || 'logo',
            largeImageText: activity.largeImageText || 'HG Launcher',
            smallImageKey: activity.smallImageKey,
            smallImageText: activity.smallImageText,
            instance: false,
            ...activity
        });
    } catch (e) {
        console.error("RPC Set Activity Failed", e);
    }
}
let currentUser = null;
const configPath = path.join(app.getPath('userData'), 'config.json');
let mainWindow;
let tray = null;
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('hg-launcher', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('hg-launcher');
}
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        const url = commandLine.find(arg => arg.startsWith('hg-launcher://'));
        if (url) {
            handleDeepLink(url);
        }
    });
    app.whenReady().then(async () => {
        loadConfig().then(config => {
            if (config.discordRPC !== false) {
                initRPC(true);
            }
        });
        createWindow();
        const iconPath = path.join(__dirname, 'assets', 'logo.ico');
        const icon = nativeImage.createFromPath(iconPath);
        tray = new Tray(icon);
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Ouvrir', click: () => mainWindow.show() },
            { label: 'Quitter', click: () => app.quit() }
        ]);
        tray.setToolTip('HG Launcher');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => mainWindow.show());
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}
app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
});
function handleDeepLink(url) {
    try {
        const urlObj = new URL(url);
        const params = new URLSearchParams(urlObj.search);
        const accessToken = params.get('accessToken');
        const uuid = params.get('uuid');
        const name = params.get('name');
        const refreshToken = params.get('refreshToken');
        if (accessToken && uuid && name) {
            currentUser = {
                username: name,
                uuid: uuid,
                accessToken: accessToken,
                refreshToken: refreshToken,
                type: 'microsoft'
            };
            if (mainWindow) {
                mainWindow.webContents.send('auth-success', currentUser);
            }
        }
    } catch (error) {
        console.error('Deep Link Error:', error);
    }
}
async function loadConfig() {
    const defaults = {
        minRam: '2G',
        maxRam: '4G',
        javaPath: '',
        jvmArgs: '',
        resolution: { width: 854, height: 480 },
        fullscreen: false,
        closeLauncher: true,
        activeTheme: 'Autum' 
    };
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        const loaded = JSON.parse(data);
        return { ...defaults, ...loaded };
    } catch (error) {
        return defaults;
    }
}
async function saveConfig(config) {
    await fs.writeFile(configPath, JSON.stringify(config, null, 4));
}
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 650,
        frame: false,
        show: false, // Start hidden to prevent white flash
        icon: path.join(__dirname, 'assets', 'logo.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        resizable: false,
        backgroundColor: '#1a1a1a'
    });
    mainWindow.loadFile('src/index.html');
    
    // Show window only when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
ipcMain.handle('login-user', async (event, credentials) => {
    const { identifier, password } = credentials;
    try {
        console.log('Authenticating via API:', AUTH_API_URL);
        const response = await fetch(AUTH_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        if (!response.ok) {
           throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        if (data.success) {
            currentUser = data.user;
            return { success: true, user: currentUser };
        } else {
            return { success: false, message: data.message || 'Erreur inconnue.' };
        }
    } catch (error) {
        console.error('Login API Error:', error);
        return { success: false, message: "Impossible de contacter le serveur d'authentification." };
    }
});
ipcMain.handle('restore-session', (event, user) => {
    if (user) {
        console.log("Session restored for:", user.username);
        currentUser = user;
        return { success: true };
    } else {
        console.log("Session cleared.");
        currentUser = null;
        return { success: true };
    }
});
async function downloadFile(url, dest, retries = 3) {
    const dir = path.dirname(dest);
    await fs.mkdir(dir, { recursive: true });
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            await fs.writeFile(dest, buffer);
            return;
        } catch (e) {
            if (i === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 500)); 
        }
    }
}
async function verifyAssets(assetIndexObj, globalRoot, mainWindow) {
    const assetsRoot = path.join(globalRoot, 'assets');
    const objects = assetIndexObj.objects;
    const msgh = [];
    const entries = Object.entries(objects);
    console.log(`[Assets] Scanning ${entries.length} objects from index ${assetIndexObj.id || 'unknown'}...`);
    if(mainWindow) mainWindow.webContents.send('log', `Vérification ${entries.length} assets (Audio/Textures)...`);
    let missingCount = 0;
    for (const [key, meta] of entries) {
        const hash = meta.hash;
        const prefix = hash.substring(0, 2);
        const p = path.join(assetsRoot, 'objects', prefix, hash);
        try {
            await fs.access(p); 
        } catch {
            msgh.push({ hash, path: p, url: `https://resources.download.minecraft.net/${prefix}/${hash}` });
            missingCount++;
        }
    }
    if (msgh.length > 0) {
        console.log(`[Assets] Found ${msgh.length} missing assets. Downloading manually (Modrinth-style)...`);
        if(mainWindow) mainWindow.webContents.send('log', `Récupération de ${msgh.length} assets manquants...`);
        const BATCH_SIZE = 50; 
        for (let i = 0; i < msgh.length; i += BATCH_SIZE) {
            const batch = msgh.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(item => downloadFile(item.url, item.path).catch(e => console.error(`Failed ${item.hash}`, e))));
            if (mainWindow) {
                const pct = Math.round(((i + batch.length) / msgh.length) * 100);
                mainWindow.webContents.send('log', `Téléchargement Assets: ${pct}%`);
            }
        }
        if(mainWindow) mainWindow.webContents.send('log', `Assets complets !`);
    } else {
        console.log("[Assets] All assets verified present.");
        if(mainWindow) mainWindow.webContents.send('log', `Assets intègres.`);
    }
}
async function fixAssetIndex(globalRoot, assetIndexId, assetIndexContent) {
    const indexesDir = path.join(globalRoot, 'assets', 'indexes');
    await fs.mkdir(indexesDir, { recursive: true });
    await fs.writeFile(
        path.join(indexesDir, `${assetIndexId}.json`), 
        JSON.stringify(assetIndexContent)
    );
    if (assetIndexId !== '1.20.1') { 
         await fs.writeFile(
            path.join(indexesDir, `1.20.1.json`), 
            JSON.stringify(assetIndexContent)
        );
    }
}
async function ensureJava(rootDir, mainWindow, version = 17) {
    const javaDir = path.join(rootDir, 'java');
    const javaVerDir = path.join(javaDir, version.toString());
    const javaExec = path.join(javaVerDir, 'bin', 'java.exe');
    try {
        await fs.access(javaExec);
        return javaExec;
    } catch (e) {
    }
    if (mainWindow) mainWindow.webContents.send('log', `Downloading Java ${version}...`);
    console.log(`Downloading Java ${version}...`);
    const urls = {
        8: "https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk",
        17: "https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk",
        21: "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk"
    };
    const url = urls[version];
    if (!url) throw new Error(`Unsupported Java version: ${version}`);
    const zipPath = path.join(rootDir, `java_${version}.zip`);
    await fs.mkdir(rootDir, { recursive: true });
    await fs.mkdir(javaDir, { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download Java: ${response.statusText} (${response.status})`);
    const fileStream = require('fs').createWriteStream(zipPath);
    await new Promise((resolve, reject) => {
        response.body.pipe(fileStream);
        response.body.on('error', reject);
        fileStream.on('finish', resolve);
    });
    if (mainWindow) mainWindow.webContents.send('log', `Extracting Java ${version}...`);
    console.log(`Extracting Java ${version}...`);
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(javaDir, true);
    await fs.unlink(zipPath);
    const files = await fs.readdir(javaDir);
    const jdkFolder = files.find(f => f.includes(`jdk-${version}`) || f.includes(`jdk${version}`));
    if (!jdkFolder) throw new Error(`Java extraction failed: JDK folder for ${version} not found`);
    try {
        await fs.rm(javaVerDir, { recursive: true, force: true });
    } catch (e) {}
    await fs.rename(path.join(javaDir, jdkFolder), javaVerDir);
    return javaExec;
}
ipcMain.handle('install-java', async (event, version) => {
    const rootPath = path.join(app.getPath('appData'), '.hg_oo');
    try {
        const javaPath = await ensureJava(rootPath, mainWindow, version);
        return { success: true, path: javaPath };
    } catch (error) {
        console.error('Java Install Error:', error);
        return { success: false, error: error.message };
    }
});
ipcMain.handle('test-java', async (event, javaPath) => {
    const { exec } = require('child_process');
    return new Promise((resolve) => {
        exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, output: error.message });
            } else {
                resolve({ success: true, output: stderr || stdout });
            }
        });
    });
});
ipcMain.handle('detect-java', async (event, version) => {
    const rootPath = path.join(app.getPath('appData'), '.hg_oo');
    const javaExec = path.join(rootPath, 'java', version.toString(), 'bin', 'java.exe');
    try {
        await fs.access(javaExec);
        return javaExec;
    } catch {
        return null;
    }
});
ipcMain.handle('get-launcher-config', async () => {
    try {
        const response = await fetch(launcherConfigUrl);
        if (!response.ok) throw new Error('Failed to fetch config');
        const data = await response.json();
        return data.config || data;
    } catch (error) {
        console.error('Failed to fetch launcher config:', error);
        return { error: error.message };
    }
});
ipcMain.handle('launch-game', async (event, options) => {
    console.log("Launch Game requested!");
    if (mainWindow) mainWindow.webContents.send('log', "Préparation du lancement...");
    if (!currentUser) {
        return { success: false, message: "Vous devez être connecté." };
    }
    if (currentUser.refreshToken) {
        try {
            if (mainWindow) mainWindow.webContents.send('log', "Rafraîchissement du token Microsoft (Via API Secure)...");
            console.log("Refreshing Microsoft Token via Auth API...");
            try {
                const refreshRes = await fetch(AUTH_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        action: 'refresh',
                        refresh_token: currentUser.refreshToken 
                    })
                });
                if (!refreshRes.ok) throw new Error(`Auth API Error: ${refreshRes.status}`);
                const apiData = await refreshRes.json();
                if (!apiData.success) {
                    throw new Error("Echec du rafraichissement API: " + JSON.stringify(apiData));
                }
                const refreshData = apiData.data;
                msToken = refreshData.access_token;
                newRefreshToken = refreshData.refresh_token; 
                currentUser.refreshToken = newRefreshToken; 
            } catch (err) {
                 console.error("Secure Refresh Failed:", err);
                 if (mainWindow) mainWindow.webContents.send('log', "Erreur rafraîchissement: " + err.message);
                 throw err;
            }
            let mwAuth;
            if (msToken) {
                 console.log("Authenticating with Xbox Live (Manual via Fetch)...");
                 const rxboxlive = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
                    method: "post",
                    body: JSON.stringify({
                        Properties: {
                            AuthMethod: "RPS",
                            SiteName: "user.auth.xboxlive.com",
                            RpsTicket: `d=${msToken}`, 
                        },
                        RelyingParty: "http://auth.xboxlive.com",
                        TokenType: "JWT",
                    }),
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                 });
                 if (!rxboxlive.ok) {
                     const err = await rxboxlive.text();
                     throw new Error(`Xbox Live Auth Failed: ${rxboxlive.status} - ${err}`);
                 }
                 const xblToken = await rxboxlive.json();
                 const dummyAuth = { emit: () => {} };
                 const msTokenObj = { access_token: msToken, refresh_token: newRefreshToken };
                 const xboxAuth = new msmc.Xbox(dummyAuth, msTokenObj, xblToken);
                 let msmcUser = null;
                 for(let i=0; i<3; i++) {
                     try {
                         msmcUser = await xboxAuth.getMinecraft();
                         break;
                     } catch(e) {
                         console.log(`getMinecraft attempt ${i+1} failed:`, e.message);
                         if(i===2) throw e;
                         await new Promise(r => setTimeout(r, 1500));
                     }
                 }
                 mwAuth = msmcUser;
            } else {
                const msmcConfig = { client_id: "6d1d88e9-bb5c-4d03-a4c9-58227e577ba7", prompt: "select_profile" };
                const authManager = new msmc.Auth(msmcConfig);
                const result = await authManager.refresh(currentUser.refreshToken);
                for(let i=0; i<3; i++) {
                     try {
                         mwAuth = await result.getMinecraft();
                         break;
                     } catch(e) {
                         console.log(`getMinecraft (fallback) attempt ${i+1} failed:`, e.message);
                         if(i===2) throw e;
                         await new Promise(r => setTimeout(r, 1500));
                     }
                 }
            }
            console.log("Refreshed Auth Object:", JSON.stringify(mwAuth, null, 2));
            const tokenHeader = mwAuth.getToken(true);
            console.log("Normalized Token Header:", JSON.stringify(tokenHeader, null, 2));
            if (tokenHeader.profile) {
                currentUser.accessToken = tokenHeader.mcToken;
                currentUser.uuid = tokenHeader.profile.id;
                currentUser.username = tokenHeader.profile.name;
                currentUser.type = 'microsoft';
            } else {
                currentUser.accessToken = mwAuth.mcToken || mwAuth.access_token;
                currentUser.uuid = mwAuth.uuid || mwAuth.id;
                currentUser.username = mwAuth.name || mwAuth.username;
                currentUser.type = 'microsoft';
            }
            console.log("Token refreshed successfully for:", currentUser.username, "UUID:", currentUser.uuid);
        } catch (e) {
            console.error("Token Refresh Failed:", e);
            let errorMessage = e.message || "Erreur inconnue";
            if (e.response && typeof e.response.text === 'function') {
                try {
                    const errorBody = await e.response.text();
                    console.error("Microsoft Error Body:", errorBody);
                    errorMessage += ` | Details: ${errorBody}`;
                } catch (readErr) {
                    console.error("Could not read error body", readErr);
                }
            }
            if (mainWindow) mainWindow.webContents.send('log', "Erreur authentification (Refresh): " + errorMessage);
            if (JSON.stringify(e).includes("invalid_client")) {
                 console.error("HINT: The Refresh Token was likely generated with a different Azure Client ID.");
                 console.error("Please ensure AZURE_CLIENT_ID in .env matches the one from your website.");
            }
            return { success: false, message: "Impossible de rafraîchir la session Microsoft. Vérifiez votre configuration (.env)." };
        }
    } else {
        if (currentUser.type !== 'microsoft' || !currentUser.accessToken) {
            console.error("No refresh token and no valid session found.");
            if (mainWindow) mainWindow.webContents.send('log', "Aucun token valide trouvé.");
            return { success: false, message: "Erreur d'authentification: Session invalide/expirée." };
        }
    }
    let gameVersion = "1.20.1";
    let loaderConfig = null;
    let activeModpack = null;
    try {
        console.log("Fetching config from", launcherConfigUrl);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000); 
        const response = await fetch(launcherConfigUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.config) {
                if (data.config.gameVersion) {
                    gameVersion = data.config.gameVersion;
                }
                if (options && options.activeModpack) {
                    console.log("Using Theme Specific Modpack overridden by Renderer");
                    activeModpack = options.activeModpack;
                } else if (data.config.activeModpack) {
                    activeModpack = data.config.activeModpack;
                }
                if (data.config.maintenance) {
                     return { success: false, message: "Le serveur est en maintenance." };
                }
            }
        }
    } catch (e) {
        console.warn("Could not fetch remote config, using default version", e);
        if (mainWindow) mainWindow.webContents.send('log', "Impossible de récupérer la config serveur, mode hors ligne...");
    }
    const config = await loadConfig();
    const globalRoot = path.join(app.getPath('appData'), '.hg_oo');
    let rootPath = globalRoot; 
    let instanceFolderName = 'hg_studio_official';
    if (config.activeTheme) {
        const t = config.activeTheme.toLowerCase();
        if (t.includes('hardcore')) instanceFolderName = 'hg_studio_hardcore';
        else if (t.includes('cherry')) instanceFolderName = 'hg_studio_cherry';
        else if (t.includes('dragon')) instanceFolderName = 'hg_studio_dragon';
        else if (t.includes('autumn') || t.includes('autum')) instanceFolderName = 'hg_studio_autumn';
    }
    if (activeModpack) {
        try {
            console.log("Active Modpack found:", activeModpack.name);
            if (mainWindow) mainWindow.webContents.send('log', `Modpack détecté: ${activeModpack.name}`);
            const safeName = instanceFolderName; 
            rootPath = path.join(globalRoot, 'instances', safeName);
            await fs.mkdir(rootPath, { recursive: true });
            let modpackUrl = activeModpack.url;
            if (modpackUrl.startsWith('/')) {
                modpackUrl = `http://91.197.6.177:24607${modpackUrl}`;
            }
            modpackUrl = encodeURI(modpackUrl) + `?t=${Date.now()}`;
            const installResult = await installMrPack(modpackUrl, rootPath, mainWindow);
            if (installResult) {
                gameVersion = installResult.gameVersion;
                loaderConfig = installResult.loader;
            }
        } catch (err) {
            console.error(err);
            if (mainWindow) mainWindow.webContents.send('log', `Erreur Modpack: ${err.message}`);
            return { success: false, message: "Erreur lors de l'installation du modpack: " + err.message };
        }
    }
    let javaPath = config.javaPath17 || config.javaPath;
    if (!javaPath) {
        try {
            javaPath = await ensureJava(globalRoot, mainWindow, 17);
        } catch (error) {
            console.error('Java Setup Error:', error);
            if (mainWindow) mainWindow.webContents.send('log', `Java Error: ${error.message}`);
            return { success: false, message: "Erreur lors de l'installation de Java." };
        }
    }
    let authorization;
    if (!currentUser.accessToken) {
        console.error("Launch aborted: No access token available for user", currentUser.username);
        if (mainWindow) mainWindow.webContents.send('log', "Erreur fatale: Token d'accès manquant.");
        return { success: false, message: "Impossible de lancer le jeu : Session invalide (Token manquant)." };
    }
    const formatUuid = (uuid) => {
        if (uuid && uuid.length === 32) {
            return uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        }
        return uuid;
    };
    authorization = {
        access_token: currentUser.accessToken,
        client_token: formatUuid(currentUser.uuid),
        uuid: formatUuid(currentUser.uuid),
        name: currentUser.username,
        user_properties: {},
        meta: {
            type: "msa", 
            demo: false
        }
    };
    const opts = {
        authorization: authorization, 
        root: rootPath,
        version: {
            number: gameVersion,
            type: "release"
        },
        memory: {
            max: config.maxRam,
            min: config.minRam
        },
        javaPath: javaPath,
        customArgs: [
            '-Dminecraft.launcher.brand=hg.studio',
            '-Dminecraft.launcher.version=1.0.0',
            ...(config.jvmArgs ? config.jvmArgs.split(' ') : [])
        ],
        customLaunchArgs: [
            '--accessToken', authorization.access_token,
            '--uuid', authorization.uuid,
            '--username', authorization.name,
            '--userType', 'msa',
            '--assetsDir', path.join(rootPath, 'assets'),
            '--assetIndex', gameVersion 
        ],
        checkFiles: true,
        ignoreMissingAssets: false, 
        overrides: {
            assetRoot: path.join(rootPath, 'assets'), 
            libraryRoot: path.join(globalRoot, 'libraries') 
        },
        window: {
            width: config.resolution ? config.resolution.width : 1280,
            height: config.resolution ? config.resolution.height : 720,
            fullscreen: config.fullscreen || false
        }
    };
    if (config.autoConnectIP) {
        const parts = config.autoConnectIP.split(':');
        const ip = parts[0];
        const port = parts[1] || '25565';
        console.log(`[Feature] Auto-Connect enabled for ${ip}:${port}`);
        if (mainWindow) mainWindow.webContents.send('log', `Auto-Connect activé: ${ip}:${port}`);
        opts.customArgs.push('--server', ip);
        opts.customArgs.push('--port', port);
    }
    try {
        const globalOptionsDir = path.join(rootPath, 'global-options');
        await fs.mkdir(globalOptionsDir, { recursive: true });
        const filesToSync = ['options.txt', 'optionsof.txt', 'optionsshaders.txt', 'servers.dat'];
        for (const file of filesToSync) {
            const globalFile = path.join(globalOptionsDir, file);
            const instanceFile = path.join(rootPath, file);
            try {
                await fs.access(globalFile);
                await fs.copyFile(globalFile, instanceFile);
                console.log(`Synced ${file} from Global to Instance.`);
            } catch {
            }
        }
        const sharedDirs = ['resourcepacks', 'shaderpacks'];
        for (const dir of sharedDirs) {
            const instanceDirPath = path.join(rootPath, dir);
            await fs.mkdir(instanceDirPath, { recursive: true });
        }
    } catch (syncErr) {
        console.error("Options Sync Error (Non-fatal):", syncErr);
    }
    console.log("FINAL LAUNCH AUTH:", JSON.stringify(opts.authorization, null, 2));
    if (loaderConfig) {
        if (loaderConfig.type === 'fabric') {
            const fabricVersion = loaderConfig.version;
            const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${fabricVersion}/profile/json`;
            const versionId = `fabric-loader-${fabricVersion}-${gameVersion}`;
            try {
                if (mainWindow) mainWindow.webContents.send('log', `Résolution des dépendances Vanilla...`);
                const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                const manifest = await manifestRes.json();
                const versionInfo = manifest.versions.find(v => v.id === gameVersion);
                if (!versionInfo) throw new Error(`Version Vanilla ${gameVersion} introuvable.`);
                const vanillaRes = await fetch(versionInfo.url);
                const vanillaJson = await vanillaRes.json();
                const assetIndexId = vanillaJson.assetIndex.id;
                const assetIndexUrl = vanillaJson.assetIndex.url;
                const assetsDir = path.join(globalRoot, 'assets');
                const indexesDir = path.join(assetsDir, 'indexes');
                const indexesPath = path.join(indexesDir, `${assetIndexId}.json`);
                await fs.mkdir(indexesDir, { recursive: true });
                if (mainWindow) mainWindow.webContents.send('log', `Vérification index assets ${assetIndexId}...`);
                const idxRes = await fetch(assetIndexUrl);
                if (idxRes.ok) {
                    const idxData = await idxRes.text();
                    await fs.writeFile(indexesPath, idxData);
                }
                const vanillaVersionDir = path.join(rootPath, 'versions', gameVersion);
                await fs.mkdir(vanillaVersionDir, { recursive: true });
                await fs.writeFile(
                    path.join(vanillaVersionDir, `${gameVersion}.json`), 
                    JSON.stringify(vanillaJson, null, 2)
                );
                console.log(`[Re-Build] Saved Parent JSON: ${gameVersion}`);
                if (mainWindow) mainWindow.webContents.send('log', `Préparation profil Fabric...`);
                const fabricRes = await fetch(fabricUrl);
                if (!fabricRes.ok) throw new Error("Impossible de télécharger le profil Fabric.");
                const fabricJson = await fabricRes.json();
                fabricJson.original_id = fabricJson.id; 
                fabricJson.id = versionId;
                fabricJson.inheritsFrom = gameVersion;
                fabricJson.downloads = vanillaJson.downloads;
                fabricJson.assetIndex = vanillaJson.assetIndex;
                fabricJson.assets = vanillaJson.assets;
                const vanLibs = vanillaJson.libraries || [];
                const fabLibs = fabricJson.libraries || [];
                const libMap = new Map();
                const getLibKey = (lib) => {
                    let key = lib.name;
                    if (lib.natives) {
                        key += ':natives';
                    } else if (lib.downloads && lib.downloads.classifiers) {
                        key += ':classifiers';
                    }
                    return key;
                };
                vanLibs.forEach(l => libMap.set(getLibKey(l), l));
                fabLibs.forEach(l => libMap.set(getLibKey(l), l));
                fabricJson.libraries = Array.from(libMap.values());
                console.log(`[Re-Build] Merged libraries safely. Total: ${fabricJson.libraries.length} (Vanilla: ${vanLibs.length})`);
                try {
                     if (vanillaJson.assetIndex && vanillaJson.assetIndex.url) {
                        const idxRes = await fetch(vanillaJson.assetIndex.url);
                        if(idxRes.ok) {
                             const idxContent = await idxRes.json();
                             vanillaJson.assetIndex.id = gameVersion; 
                             vanillaJson.assets = gameVersion;
                             await fixAssetIndex(rootPath, gameVersion, idxContent);
                             await verifyAssets({ 
                                 id: gameVersion, 
                                 objects: idxContent.objects 
                             }, rootPath, mainWindow);
                             opts.overrides = {
                                 ...opts.overrides,
                                 assetRoot: path.join(rootPath, 'assets')
                             };
                        }
                     }
                } catch (assetErr) {
                    console.error("Manual Asset Download Failed:", assetErr);
                }
                fabricJson.assetIndex.id = gameVersion;
                fabricJson.assets = gameVersion;
                if (config.debugConsole) {
                    console.log("Using Hybrid Mode: Inheritance + Explicit Library Merge + Manual Asset Sync");
                }
                const fabricVersionDir = path.join(rootPath, 'versions', versionId);
                await fs.mkdir(fabricVersionDir, { recursive: true });
                await fs.writeFile(
                    path.join(fabricVersionDir, `${versionId}.json`), 
                    JSON.stringify(fabricJson, null, 2)
                );
                console.log(`[Re-Build] Fabric Profile Ready: ${versionId}`);
                if (mainWindow) mainWindow.webContents.send('log', `Profil Fabric installé.`);
            } catch (err) {
                console.error("Critical verification error:", err);
                if (mainWindow) mainWindow.webContents.send('log', `ERREUR CRITIQUE: ${err.message}`);
            }
            opts.version.number = versionId;
            opts.version.custom = versionId;
        } else if (loaderConfig.type === 'forge') {
            const forgeVersion = `${gameVersion}-${loaderConfig.version}`;
            const forgeUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${forgeVersion}/forge-${forgeVersion}-installer.jar`;
            const forgePath = path.join(rootPath, 'forge', `${forgeVersion}`, `forge-${forgeVersion}-installer.jar`);
            try {
                await fs.mkdir(path.dirname(forgePath), { recursive: true });
                try {
                    await fs.access(forgePath);
                } catch {
                    if (mainWindow) mainWindow.webContents.send('log', `Téléchargement de Forge...`);
                    const res = await fetch(forgeUrl);
                    if (res.ok) {
                        const dest = fsOriginal.createWriteStream(forgePath);
                        await new Promise((resolve, reject) => {
                            res.body.pipe(dest);
                            res.body.on("error", reject);
                            dest.on("finish", resolve);
                        });
                    }
                }
                opts.forge = forgePath;
            } catch (e) {
                console.error("Error preparing Forge", e);
            }
        } else if (loaderConfig.type === 'quilt') {
            const quiltVersion = loaderConfig.version;
            const quiltUrl = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${quiltVersion}/profile/json`;
            const versionId = `quilt-loader-${quiltVersion}-${gameVersion}`;
            const versionDir = path.join(rootPath, 'versions', versionId);
            const versionJsonPath = path.join(versionDir, `${versionId}.json`);
            try {
                await fs.mkdir(versionDir, { recursive: true });
                try {
                    await fs.access(versionJsonPath);
                } catch {
                    if (mainWindow) mainWindow.webContents.send('log', `Installation de Quilt Loader...`);
                    const res = await fetch(quiltUrl);
                    if (res.ok) {
                        const json = await res.text();
                        await fs.writeFile(versionJsonPath, json);
                    }
                }
            } catch (e) {}
             opts.version.number = versionId;
             opts.version.custom = versionId;
        }
    }
    if (rootPath) {
        if (mainWindow) mainWindow.webContents.send('log', `Vérification intégrité bibliothèques...`);
        const librariesPath = path.join(globalRoot, 'libraries');
        const versionsPath = path.join(rootPath, 'versions');
        await Promise.all([
            removeZeroByteFiles(librariesPath),
            removeZeroByteFiles(versionsPath)
        ]);
        await enforceAntiCheat(rootPath, mainWindow);
    }
    console.log('Starting Minecraft for user:', currentUser.username);
    console.log('Launch Options:', JSON.stringify(opts, null, 2));
    if (mainWindow) mainWindow.webContents.send('log', `Starting Minecraft ${gameVersion}...`);
    let debugWindow = null;
    if (config.debugConsole) {
        debugWindow = new BrowserWindow({
            width: 900,
            height: 600,
            title: "Minecraft Debug Console",
            backgroundColor: '#1e1e1e',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });
        debugWindow.setMenu(null);
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Minecraft Debug Console</title>
            <style>
                body { background: #1e1e1e; color: #d4d4d4; font-family: 'Consolas', 'Courier New', monospace; padding: 10px; margin: 0; overflow-y: auto; }
                .log-line { margin-bottom: 2px; white-space: pre-wrap; word-wrap: break-word; font-size: 13px; }
                .log-error { color: #f48771; }
                .log-warn { color: #cca700; }
                .log-info { color: #9cdcfe; }
                .log-debug { color: #6a9955; }
            </style>
        </head>
        <body>
            <div id="log-container"></div>
            <script>
                const container = document.getElementById('log-container');
                window.electron = {
                    onLog: (callback) => {
                    }
                };
            </script>
        </body>
        </html>
        `;
        debugWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
        debugWindow.on('closed', () => {
            debugWindow = null;
        });
    }
    const sendToDebug = (msg, type = 'info') => {
        if (debugWindow && !debugWindow.isDestroyed()) {
            const safeMsg = msg.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const js = `
                (function() {
                    const container = document.getElementById('log-container');
                    const div = document.createElement('div');
                    div.className = 'log-line log-${type}';
                    div.innerHTML = \`${safeMsg}\`;
                    container.appendChild(div);
                    window.scrollTo(0, document.body.scrollHeight);
                })();
            `;
            debugWindow.webContents.executeJavaScript(js).catch(() => {});
        }
    };
    launcher.on('debug', (e) => {
        console.log('[DEBUG]', e);
        if (mainWindow) mainWindow.webContents.send('log', `[DEBUG] ${e}`);
        sendToDebug(`[DEBUG] ${e}`, 'debug');
    });
    launcher.on('data', (e) => {
        console.log('[DATA]', e);
        if (mainWindow) mainWindow.webContents.send('log', `[GAME] ${e}`);
        let type = 'info';
        const lower = e.toLowerCase();
        if (lower.includes('error') || lower.includes('exception') || lower.includes('fatal')) type = 'error';
        else if (lower.includes('warn')) type = 'warn';
        sendToDebug(e, type);
    });
    launcher.on('progress', (e) => {
        if (mainWindow) mainWindow.webContents.send('log', `[Progress] ${e.type} - ${(e.task / e.total * 100).toFixed(0)}%`);
    });
    launcher.on('close', (e) => {
        console.log('Game closed', e);
        if (mainWindow) {
            mainWindow.webContents.send('log', `Game closed with code ${e}`);
            mainWindow.webContents.send('stop-loading');
            mainWindow.show();
            mainWindow.focus();
        }
    });
    try {
        // Force delete indexes to ensure fresh download if previous one was corrupted
        if (config.repairAssets) { // Hidden toggle or auto-repair logic could trigger this
             // For now, let's just log.
        }
        await launcher.launch(opts);
    } catch (error) {
        console.error('Launch Error:', error);
        if (mainWindow) mainWindow.webContents.send('log', `Error: ${error.message}`);
        return { success: false, message: error.message };
    }
    if (config.closeLauncher) {
        mainWindow.hide();
    }
    return { success: true, message: "Lancement du jeu..." };
});
ipcMain.handle('get-settings', async () => {
    return await loadConfig();
});
ipcMain.handle('save-settings', async (event, newSettings) => {
    try {
        await saveConfig(newSettings);
        if (newSettings.discordRPC !== undefined) {
             await initRPC(newSettings.discordRPC);
        }
        return { success: true };
    } catch (error) {
        console.error('Failed to save settings:', error);
        return { success: false, message: "Erreur lors de la sauvegarde." };
    }
});
ipcMain.on('update-rpc', (event, activity) => {
    setRPCActivity(activity);
});
ipcMain.on('minimize-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.minimize();
});
ipcMain.on('close-window', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.close();
});
ipcMain.on('open-external', (event, url) => {
    require('electron').shell.openExternal(url);
});
ipcMain.handle('check-update', async () => {
    const currentVersion = app.getVersion(); 
    try {
        const response = await fetch(launcherConfigUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        if (data.success && data.config) {
            const latestVersion = data.config.launcherVersion;
            
            // CONSTRUCT DOWNLOAD URL IF MISSING (Based on new JSON schema)
            let downloadUrl = data.config.launcherDownloadUrl;
            if (!downloadUrl) {
                // Fallback: Assume it's in /storage/launcher/setup.exe relative to API base
                 const apiBase = 'http://91.197.6.177:24607';
                 downloadUrl = `${apiBase}/storage/launcher/setup.exe`;
            } else if (downloadUrl.startsWith('/')) {
                 const apiBase = 'http://91.197.6.177:24607';
                 downloadUrl = apiBase + downloadUrl;
            }

            // Simple cleanup of version string just in case
            const cleanLatest = latestVersion.replace(/^v/, '');
            const cleanCurrent = currentVersion.replace(/^v/, '');

            if (latestVersion && cleanLatest !== cleanCurrent) {
                return { updateAvailable: true, version: latestVersion, url: downloadUrl };
            }
        }
        return { updateAvailable: false };
    } catch (error) {
        console.error('Update check failed:', error);
        return { error: error.message };
    }
});
ipcMain.handle('install-update', async (event, url) => {
    const tempDir = app.getPath('temp');
    const installerPath = path.join(tempDir, 'launcher-setup.exe');

    try {
        if (mainWindow) mainWindow.webContents.send('log', "Téléchargement de la mise à jour...");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download update: ${response.statusText}`);
        
        const totalLength = response.headers.get('content-length');
        const fileStream = require('fs').createWriteStream(installerPath);
        
        await new Promise((resolve, reject) => {
            fileStream.on('error', reject);
            
            if (!totalLength) {
                response.body.pipe(fileStream);
                fileStream.on('finish', () => {
                    fileStream.close(resolve); 
                });
                return;
            }

            let downloaded = 0;
            const size = parseInt(totalLength, 10);
            
            response.body.on('data', (chunk) => {
                downloaded += chunk.length;
                fileStream.write(chunk);
                const progress = (downloaded / size) * 100;
                if (mainWindow) {
                    mainWindow.webContents.send('update-progress', progress.toFixed(1));
                }
            });
            
            response.body.on('end', () => {
                fileStream.end();
            });

            // Wait for the stream to fully finish writing and close the file
            fileStream.on('finish', () => {
                fileStream.close(resolve); // Explicitly close to release handle
            });
            
            response.body.on('error', reject);
        });

        // Small delay to ensure OS releases the file handle completely (Fix EBUSY)
        await new Promise(r => setTimeout(r, 1000));

        const { spawn } = require('child_process');
        console.log("Spawning installer:", installerPath);
        
        // Setup spawn with detached process
        const subprocess = spawn(installerPath, ['/S', '/SILENT'], {
            detached: true,
            stdio: 'ignore'
        });
        
        subprocess.unref();
        app.quit(); 
        return { success: true };
    } catch (err) {
        console.error("Update failed:", err);
        return { success: false, message: err.message };
    }
});
ipcMain.handle('get-system-info', () => {
    return {
        totalMem: os.totalmem(),
        freeMem: os.freemem()
    };
});
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});
ipcMain.handle('get-themes', async () => {
    const themesDir = path.join(__dirname, 'assets', 'themes');
    const themes = [];
    try {
        const items = await fs.readdir(themesDir, { withFileTypes: true });
        for (const item of items) {
            if (item.isDirectory()) {
                try {
                    const themePath = path.join(themesDir, item.name);
                    const configPath = path.join(themePath, 'theme.json');
                    await fs.access(configPath);
                    const configData = await fs.readFile(configPath, 'utf8');
                    const config = JSON.parse(configData);
                    const videoPath = path.join(themePath, 'background.mp4');
                    let hasVideo = false;
                    try {
                        await fs.access(videoPath);
                        hasVideo = true;
                    } catch(e) {}
                    if (hasVideo) {
                        themes.push({
                            id: item.name,
                            folder: item.name, 
                            title: config.title || item.name,
                            accentColor: config.accentColor || '#ff0055' 
                        });
                    }
                } catch (e) {
                    console.warn(`Skipping invalid theme folder ${item.name}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error("Error loading themes:", e);
    }
    return themes;
});
ipcMain.handle('open-file-dialog', async (event, filters = []) => {
    let appliedFilters = [{ name: 'Executables', extensions: ['exe', 'bin'] }];
    if (filters && filters.length > 0) {
        appliedFilters = filters;
    }
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: appliedFilters
    });
    if (result.canceled) {
        return null;
    } else {
        return result.filePaths[0];
    }
});
async function removeZeroByteFiles(dir) {
    try {
        const items = await fs.readdir(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            try {
                const stat = await fs.stat(fullPath);
                if (stat.isDirectory()) {
                    await removeZeroByteFiles(fullPath);
                } else if (stat.isFile() && stat.size === 0) {
                    console.log(`[Fix] Deleting empty file: ${fullPath}`);
                    await fs.unlink(fullPath);
                }
            } catch (e) {
            }
        }
    } catch (e) {
    }
}
ipcMain.handle('apply-custom-skin-loader', async (event, { username, skinPath, capeUrl }) => {
    try {
        const root = await getInstanceRoot();
        const baseDir = path.join(root, 'CustomSkinLoader', 'LocalSkin');
        const skinsDir = path.join(baseDir, 'skins');
        const capesDir = path.join(baseDir, 'capes');
        await fs.mkdir(skinsDir, { recursive: true });
        await fs.mkdir(capesDir, { recursive: true });
        console.log(`[CustomSkinLoader] Applying for ${username}`);
        console.log(`Skin: ${skinPath}`);
        console.log(`Cape: ${capeUrl}`);
        if (skinPath) {
            const destSkin = path.join(skinsDir, `${username}.png`);
            if (skinPath.startsWith('http')) {
                 const res = await fetch(skinPath);
                 if (res.ok) {
                    const buffer = await res.arrayBuffer();
                    await fs.writeFile(destSkin, Buffer.from(buffer));
                 }
            } else {
                 if (fsOriginal.existsSync(skinPath)) {
                    await fs.copyFile(skinPath, destSkin);
                 }
            }
        }
        const destCape = path.join(capesDir, `${username}.png`);
        if (capeUrl) {
            if (capeUrl.startsWith('http')) {
                 const res = await fetch(capeUrl);
                 if(res.ok) {
                     const buffer = await res.arrayBuffer();
                     await fs.writeFile(destCape, Buffer.from(buffer));
                 }
            } else {
                 if (fsOriginal.existsSync(capeUrl)) {
                    await fs.copyFile(capeUrl, destCape);
                 }
            }
        } else {
            if (fsOriginal.existsSync(destCape)) {
                await fs.unlink(destCape);
                console.log("[CustomSkinLoader] Cape removed.");
            }
        }
        return { success: true };
    } catch (e) {
        console.error("CustomSkinLoader error:", e);
        return { success: false, message: e.message };
    }
});
async function getInstanceRoot() {
    const config = await loadConfig();
    let instanceFolderName = 'hg_studio_official';
    if (config.activeTheme) {
        const t = config.activeTheme.toLowerCase();
        if (t.includes('hardcore')) instanceFolderName = 'hg_studio_hardcore';
        else if (t.includes('cherry')) instanceFolderName = 'hg_studio_cherry';
        else if (t.includes('dragon')) instanceFolderName = 'hg_studio_dragon';
        else if (t.includes('autumn') || t.includes('autum')) instanceFolderName = 'hg_studio_autumn';
    }
    return path.join(app.getPath('appData'), '.hg_oo', 'instances', instanceFolderName); 
}
async function getFolderByType(type) {
    const root = await getInstanceRoot();
    if (type === 'schematics') return path.join(root, 'schematics');
    if (type === 'resourcepacks') return path.join(root, 'resourcepacks');
    if (type === 'shaderpacks') return path.join(root, 'shaderpacks');
    return null;
}
ipcMain.handle('get-preset-skins', async () => {
    const skinsDir = path.join(__dirname, 'assets', 'skins');
    const results = [];
    const addedNames = new Set(); 
    const dirs = [
        { name: 'slim', model: 'slim' },
        { name: 'wide', model: 'default' }
    ];
    for (const d of dirs) {
        const dirPath = path.join(skinsDir, d.name);
        try {
             if (fsOriginal.existsSync(dirPath)) { 
                 const files = await fs.readdir(dirPath);
                 files.filter(f => f.match(/\.(png|jpg|jpeg)$/i)).forEach(f => {
                     if (!addedNames.has(f)) {
                         results.push({
                             name: f,
                             path: path.join(dirPath, f),
                             url: `assets/skins/${d.name}/${f}`,
                             model: d.model
                         });
                         addedNames.add(f);
                     }
                 });
            }
        } catch (e) {
            console.error(`Error reading skins subfolder ${d.name}:`, e);
        }
    }
    try {
        const rootFiles = await fs.readdir(skinsDir);
        rootFiles.filter(f => f.match(/\.(png|jpg|jpeg)$/i)).forEach(f => {
             if (!addedNames.has(f)) {
                 results.push({
                     name: f,
                     path: path.join(skinsDir, f),
                     url: `assets/skins/${f}`,
                     model: 'default'
                 });
                 addedNames.add(f);
             }
        });
    } catch(e) {}
    return results;
});
ipcMain.handle('get-user-capes', async (event, username) => {
    if (!username) return {};
    let data = {};
    try {
        console.log(`[Main] Fetching capes for ${username}...`);
        const response = await fetch(`https://api.capes.dev/load/${username}`);
        if (response.ok) {
            data = await response.json();
        }
    } catch (error) {
        console.error('Cape fetch failed (capes.dev):', error);
    }
    try {
        if (!data.optifine) {
            const ofUrl = `http://s.optifine.net/capes/${username}.png`;
            const ofRes = await fetch(ofUrl, { method: 'HEAD' }); 
            if (ofRes.ok) {
                console.log(`[Main] Found Optifine cape manually for ${username}`);
                data.optifine = {
                    id: "optifine",
                    type: "optifine",
                    url: ofUrl
                };
            }
        }
    } catch (e) {
    }
    return data;
});
ipcMain.handle('fetch-image-base64', async (event, url) => {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch");
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (e) {
        console.error("Fetch Base64 Error:", e);
        return null;
    }
});
ipcMain.handle('set-account-skin', async (event, { uuid, type, skinPath }) => {
    console.log(`[Skin] Setting skin for ${uuid} (${type}) to ${skinPath}`);
    if (type === 'hg_studio' || type === 'offline') {
        return { success: true };
    } 
    return { success: false, message: "Le changement de skin n'est pas encore supporté pour ce type de compte." };
});
ipcMain.handle('get-instance-files', async (event, type) => {
    const targetDir = await getFolderByType(type);
    if (!targetDir) return [];
    try {
        await fs.mkdir(targetDir, { recursive: true });
        const files = await fs.readdir(targetDir);
        const fileStats = [];
        for (const file of files) {
            try {
                const stat = await fs.stat(path.join(targetDir, file));
                if (stat.isFile()) {
                    fileStats.push({
                        name: file,
                        size: stat.size,
                        date: stat.mtime
                    });
                }
            } catch (e) {}
        }
        return fileStats;
    } catch (e) {
        console.error(`Error reading ${type}:`, e);
        return [];
    }
});
ipcMain.handle('add-instance-file', async (event, { type, sourcePath }) => {
    const targetDir = await getFolderByType(type);
    if (!targetDir) return { success: false, message: "Invalid type" };
    try {
        await fs.mkdir(targetDir, { recursive: true });
        const fileName = path.basename(sourcePath);
        const destPath = path.join(targetDir, fileName);
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
    } catch (e) {
        console.error(`Error adding file to ${type}:`, e);
        return { success: false, message: e.message };
    }
});
ipcMain.handle('delete-instance-file', async (event, { type, fileName }) => {
    const targetDir = await getFolderByType(type);
    if (!targetDir) return { success: false, message: "Invalid type" };
    try {
        await fs.unlink(path.join(targetDir, fileName));
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
});
ipcMain.handle('open-instance-folder', async (event, type) => {
    const targetDir = await getFolderByType(type);
    if (targetDir) {
        await fs.mkdir(targetDir, { recursive: true });
        require('electron').shell.openPath(targetDir);
    }
});
async function enforceAntiCheat(installPath, mainWindow) {
    console.log("[Anti-Cheat] Starting verification...");
    if (mainWindow) mainWindow.webContents.send('log', "Anti-Cheat: Vérification des fichiers...");
    const forbiddenKeywords = ['xray', 'x-ray', 'killaura']; 
    const modsPath = path.join(installPath, 'mods');
    const resourcePacksPath = path.join(installPath, 'resourcepacks');
    const scanAndClean = async (dirPath) => {
        try {
            await fs.access(dirPath);
            const files = await fs.readdir(dirPath);
            let deletedCount = 0;
            for (const file of files) {
                const lowerName = file.toLowerCase();
                const isForbidden = forbiddenKeywords.some(keyword => lowerName.includes(keyword));
                if (isForbidden) {
                    console.warn(`[Anti-Cheat] Forbidden file found: ${file}. Deleting...`);
                    if (mainWindow) mainWindow.webContents.send('log', `Suppression fichier interdit: ${file}`);
                    try {
                        await fs.unlink(path.join(dirPath, file));
                        deletedCount++;
                    } catch (err) {
                        console.error(`Failed to delete ${file}`, err);
                    }
                }
            }
            return deletedCount;
        } catch (e) {
            return 0; 
        }
    };
    try {
        const deletedMods = await scanAndClean(modsPath);
        const deletedPacks = await scanAndClean(resourcePacksPath);
        if (deletedMods + deletedPacks > 0) {
             console.log(`[Anti-Cheat] Cleaned ${deletedMods + deletedPacks} forbidden items.`);
        } else {
             console.log("[Anti-Cheat] Status OK.");
        }
    } catch (e) {
        console.warn("[Anti-Cheat] Error during scan:", e.message);
    }
}
async function installMrPack(url, installPath, mainWindow) {
    const tempDir = path.join(app.getPath('temp'), 'hg-launcher-modpack');
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log("Temporary modpack folder cleared.");
    } catch (e) {
        console.warn("Could not clear temp dir (might be first run):", e.message);
    }
    const packPath = path.join(tempDir, 'modpack.mrpack');
    try {
        await fs.mkdir(tempDir, { recursive: true });
        if (mainWindow) mainWindow.webContents.send('log', `Nettoyage de l'instance avant mise à jour...`);
        const modsFolder = path.join(installPath, 'mods');
        try {
            await fs.rm(modsFolder, { recursive: true, force: true });
            console.log("Forced cleanup of mods folder.");
        } catch (e) {}
        const preserveList = [
            'options.txt', 
            'servers.dat', 
            'saves', 
            'screenshots', 
            'logs', 
            'Distant_Horizons_server_data',
            'resourcepacks', 
            'shaderpacks',
            'schematics',
            'config',
        ];
        try {
            const files = await fs.readdir(installPath);
            for (const file of files) {
                if (preserveList.includes(file)) continue;
                const fullPath = path.join(installPath, file);
                await fs.rm(fullPath, { recursive: true, force: true });
            }
            console.log("Instance cleaned.");
        } catch (e) {
            console.warn("Cleanup warning (first run?):", e.message);
        }
        if (mainWindow) mainWindow.webContents.send('log', `Téléchargement du modpack...`);
        console.log("Downloading modpack from", url);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download modpack: ${res.statusText}`);
        const fileStream = fsOriginal.createWriteStream(packPath);
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", resolve);
        });
        if (mainWindow) mainWindow.webContents.send('log', `Extraction du modpack...`);
        const zip = new AdmZip(packPath);
        zip.extractAllTo(tempDir, true);
        try {
            const overridesPath = path.join(tempDir, 'overrides');
            if (require('fs').existsSync(overridesPath)) {
                console.log("--- CONTENU DU DOSSIER OVERRIDES ---");
                const glob = require('glob'); 
                const getAllFiles = (dir) => {
                     let results = [];
                     const list = require('fs').readdirSync(dir);
                     list.forEach(file => {
                         file = path.join(dir, file);
                         const stat = require('fs').statSync(file);
                         if (stat && stat.isDirectory()) {
                             results = results.concat(getAllFiles(file));
                         } else {
                             results.push(file);
                         }
                     });
                     return results;
                }
                const allOverrides = getAllFiles(overridesPath);
                allOverrides.forEach(f => {
                    if (f.includes('twilight')) {
                        console.error("!!! COUPABLE TROUVÉ DANS OVERRIDES !!! ->", f);
                        if (mainWindow) mainWindow.webContents.send('log', `⚠️ COUPABLE TROUVÉ DANS OVERRIDES: ${path.basename(f)}`);
                    }
                });
                console.log("------------------------------------");
            }
        } catch (e) {
            console.log("Error checking overrides:", e);
        }
        const indexContent = await fs.readFile(path.join(tempDir, 'modrinth.index.json'), 'utf8');
        const index = JSON.parse(indexContent);
        console.log("--- MODS DANS LE JSON ---");
        index.files.forEach(f => {
             if (f.path.includes('twilight')) {
                 console.error("!!! COUPABLE TROUVÉ DANS INDEX.JSON !!! ->", f.path);
                 if (mainWindow) mainWindow.webContents.send('log', `⚠️ COUPABLE TROUVÉ DANS JSON: ${f.path}`);
             }
        });
        console.log("-------------------------");
        const gameVersion = index.dependencies.minecraft;
        let loader = null;
        if (index.dependencies['fabric-loader']) {
            loader = { type: 'fabric', version: index.dependencies['fabric-loader'] };
        } else if (index.dependencies['forge']) {
            loader = { type: 'forge', version: index.dependencies['forge'] };
        } else if (index.dependencies['neoforge']) {
            loader = { type: 'neoforge', version: index.dependencies['neoforge'] };
        } else if (index.dependencies['quilt-loader']) {
            loader = { type: 'quilt', version: index.dependencies['quilt-loader'] };
        }
        const files = index.files;
        const totalFiles = files.length;
        let downloaded = 0;
        if (mainWindow) mainWindow.webContents.send('log', `Vérification des ${totalFiles} mods...`);
        const allowedMods = [];
        for (const file of files) {
            const filePath = path.join(installPath, file.path);
            if (file.path.startsWith('mods/')) {
                allowedMods.push(path.basename(file.path));
            }
            const fileDir = path.dirname(filePath);
            await fs.mkdir(fileDir, { recursive: true });
            let fileExists = false;
            try {
                await fs.access(filePath);
                if (file.hashes && file.hashes.sha1) {
                    const fileBuffer = await fs.readFile(filePath);
                    const hashSum = crypto.createHash('sha1');
                    hashSum.update(fileBuffer);
                    const hex = hashSum.digest('hex');
                    if (hex === file.hashes.sha1) {
                        fileExists = true;
                    } else {
                        console.log(`Hash mismatch for ${file.path}. Expected ${file.hashes.sha1}, got ${hex}`);
                    }
                } else if (file.fileSize) {
                    const stats = await fs.stat(filePath);
                    if (stats.size === file.fileSize) {
                        fileExists = true;
                    }
                } else {
                    fileExists = true;
                }
            } catch (e) {}
            if (!fileExists) {
                const fileUrl = file.downloads[0];
                const fileRes = await fetch(fileUrl);
                if (!fileRes.ok) {
                    console.error(`Failed to download mod ${file.path}: ${fileRes.statusText}`);
                    continue; 
                }
                const dest = fsOriginal.createWriteStream(filePath);
                await new Promise((resolve, reject) => {
                    fileRes.body.pipe(dest);
                    fileRes.body.on("error", reject);
                    dest.on("finish", resolve);
                });
            }
            downloaded++;
            if (mainWindow && downloaded % 5 === 0) {
                 mainWindow.webContents.send('log', `Vérification/Installation: ${downloaded}/${totalFiles}`);
            }
        }
        try {
            const whitelistPath = path.join(installPath, 'whitelist.json');
            await fs.writeFile(whitelistPath, JSON.stringify(allowedMods, null, 2));
            console.log(`[Anti-Cheat] Whitelist saved with ${allowedMods.length} mods.`);
        } catch (e) {
            console.error("Failed to save whitelist:", e);
        }
        const overridesDir = path.join(tempDir, 'overrides');
        async function copyDir(src, dest) {
            const entries = await fs.readdir(src, { withFileTypes: true });
            await fs.mkdir(dest, { recursive: true });
            for (let entry of entries) {
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    await copyDir(srcPath, destPath);
                } else {
                    await fs.copyFile(srcPath, destPath);
                }
            }
        }
        try {
            await fs.access(overridesDir);
            if (mainWindow) mainWindow.webContents.send('log', `Installation des configurations...`);
            await copyDir(overridesDir, installPath);
        } catch (e) {
        }
        return { gameVersion, loader };
    } catch (err) {
        console.error("Modpack installation failed", err);
        throw err;
    }
}
