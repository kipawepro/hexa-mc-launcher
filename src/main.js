const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsOriginal = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const msmc = require("msmc");
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');
const os = require('os');
const crypto = require('crypto');
require('dotenv').config();

const launcherConfigUrl = 'http://91.197.6.177:24607/api/launcher/config';

let currentUser = null;
const configPath = path.join(app.getPath('userData'), 'config.json');
let mainWindow;
let tray = null;

// Register Custom Protocol
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

    app.whenReady().then(() => {
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
    try {
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return {
            minRam: '2G',
            maxRam: '4G',
            javaPath: '',
            jvmArgs: '',
            resolution: { width: 854, height: 480 },
            fullscreen: false,
            closeLauncher: true
        };
    }
}

async function saveConfig(config) {
    await fs.writeFile(configPath, JSON.stringify(config, null, 4));
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 650,
        frame: false,
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
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

ipcMain.handle('login-user', async (event, credentials) => {
    const { identifier, password } = credentials;

    try {
        console.log('Login attempt for:', identifier);
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ? OR minecraft_name = ?',
            [identifier, identifier]
        );
        console.log('User found:', rows.length > 0);

        if (rows.length === 0) {
            return { success: false, message: 'Utilisateur inconnu.' };
        }

        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return { success: false, message: 'Mot de passe incorrect.' };
        }

        currentUser = {
            id: user.id,
            username: user.minecraft_name,
            uuid: user.minecraft_uuid,
            email: user.email,
            role: user.role,
            refreshToken: user.microsoft_refresh_token,
            type: 'microsoft'
        };

        return { success: true, user: currentUser };

    } catch (error) {
        console.error('Login Error:', error);
        return { success: false, message: "Erreur de connexion à la base de données." };
    }
});

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
            if (mainWindow) mainWindow.webContents.send('log', "Rafraîchissement du token Microsoft...");
            console.log("Refreshing Microsoft Token...");
            
            const clientId = process.env.AZURE_CLIENT_ID || "00000000402b5328";
            const clientSecret = process.env.AZURE_CLIENT_SECRET;
            
            console.log("Using Client ID for refresh:", clientId === "00000000402b5328" ? "Default (MSMC)" : "Custom (From .env)");
            if (clientSecret) console.log("Using Client Secret for refresh (Web App Flow)");

            let msToken = null;
            let newRefreshToken = null;

            if (clientSecret) {
                try {
                    const params = new URLSearchParams();
                    params.append('client_id', clientId);
                    params.append('client_secret', clientSecret);
                    params.append('refresh_token', currentUser.refreshToken);
                    params.append('grant_type', 'refresh_token');

                    console.log("Attempting manual refresh via Microsoft Graph...");
                    const refreshRes = await fetch('https://login.live.com/oauth20_token.srf', {
                        method: 'POST',
                        body: params,
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });

                    if (!refreshRes.ok) {
                        const errText = await refreshRes.text();
                        throw new Error(`Microsoft Refresh Error: ${refreshRes.status} ${refreshRes.statusText} - ${errText}`);
                    }

                    const refreshData = await refreshRes.json();
                    msToken = refreshData.access_token;
                    newRefreshToken = refreshData.refresh_token; 
                    
                    currentUser.refreshToken = newRefreshToken; 
                    
                } catch (manualErr) {
                    console.error("Manual Refresh Failed, falling back to MSMC...", manualErr);
                    throw manualErr;
                }
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
                 const msmcUser = await xboxAuth.getMinecraft();
                 mwAuth = msmcUser;
                 
            } else {
                const msmcConfig = { client_id: clientId, prompt: "select_profile" };
                const authManager = new msmc.Auth(msmcConfig);
                const result = await authManager.refresh(currentUser.refreshToken);
                mwAuth = result.getMinecraft();
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
                if (data.config.activeModpack) {
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

    if (activeModpack) {
        try {
            console.log("Active Modpack found:", activeModpack.name);
            if (mainWindow) mainWindow.webContents.send('log', `Modpack détecté: ${activeModpack.name}`);

            const safeName = activeModpack.name.replace(/[^a-zA-Z0-9\-_]/g, '_');
            rootPath = path.join(globalRoot, 'instances', safeName);
            await fs.mkdir(rootPath, { recursive: true });

            let modpackUrl = activeModpack.url;
            if (modpackUrl.startsWith('/')) {
                modpackUrl = `http://91.197.6.177:24607${modpackUrl}`;
            }
            
            modpackUrl = encodeURI(modpackUrl);
            
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
            '--userType', 'msa'
        ],
        window: {
            width: config.resolution ? config.resolution.width : 1280,
            height: config.resolution ? config.resolution.height : 720,
            fullscreen: config.fullscreen || false
        }
    };
    
    console.log("FINAL LAUNCH AUTH:", JSON.stringify(opts.authorization, null, 2));

    if (loaderConfig) {
        if (loaderConfig.type === 'fabric') {
            const fabricVersion = loaderConfig.version;
            const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${fabricVersion}/profile/json`;
            const versionId = `fabric-loader-${fabricVersion}-${gameVersion}`;
            const versionDir = path.join(rootPath, 'versions', versionId);
            const versionJsonPath = path.join(versionDir, `${versionId}.json`);

            try {
                await fs.mkdir(versionDir, { recursive: true });
                try {
                    await fs.access(versionJsonPath);
                } catch {
                    if (mainWindow) mainWindow.webContents.send('log', `Installation de Fabric Loader...`);
                    const res = await fetch(fabricUrl);
                    if (res.ok) {
                        let fabricJson = await res.json();

                        try {
                            if (mainWindow) mainWindow.webContents.send('log', `Récupération des métadonnées Vanilla pour ${gameVersion}...`);
                            const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                            const manifest = await manifestRes.json();
                            const versionInfo = manifest.versions.find(v => v.id === gameVersion);
                            if (versionInfo) {
                                const vanillaRes = await fetch(versionInfo.url);
                                const vanillaJson = await vanillaRes.json();
                                
                                if (!fabricJson.downloads) fabricJson.downloads = vanillaJson.downloads;
                                if (!fabricJson.assetIndex) fabricJson.assetIndex = vanillaJson.assetIndex;
                                if (!fabricJson.assets) fabricJson.assets = vanillaJson.assets;
                                if (!fabricJson.type) fabricJson.type = vanillaJson.type;

                                if (vanillaJson.libraries) {
                                    fabricJson.libraries = (fabricJson.libraries || []).concat(vanillaJson.libraries);
                                }
                            }
                        } catch (err) {
                            console.error("Failed to merge vanilla json", err);
                            if (mainWindow) mainWindow.webContents.send('log', `Warning: Failed to merge vanilla JSON: ${err.message}`);
                        }

                        await fs.writeFile(versionJsonPath, JSON.stringify(fabricJson, null, 2));
                    } else {
                        console.error("Failed to fetch Fabric JSON", res.statusText);
                    }
                }
            } catch (e) {
                console.error("Error installing Fabric", e);
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
        return { success: true };
    } catch (error) {
        console.error('Failed to save settings:', error);
        return { success: false, message: "Erreur lors de la sauvegarde." };
    }
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
    const currentVersion = '1.0.0';

    try {
        const response = await fetch(launcherConfigUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        if (data.success && data.config) {
            const latestVersion = data.config.launcherVersion;
            const downloadUrl = data.config.launcherDownloadUrl;

            if (latestVersion && latestVersion !== currentVersion) {
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
    const tempPath = path.join(app.getPath('temp'), 'launcher-setup.exe');
    
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download update: ${response.statusText}`);
        
        const fileStream = require('fs').createWriteStream(tempPath);
        await new Promise((resolve, reject) => {
            response.body.pipe(fileStream);
            response.body.on('error', reject);
            fileStream.on('finish', resolve);
        });
        
        require('electron').shell.openPath(tempPath);
        
        setTimeout(() => app.quit(), 1000);
        
        return { success: true };
    } catch (error) {
        console.error('Update install failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-system-info', () => {
    return {
        totalMem: os.totalmem(),
        freeMem: os.freemem()
    };
});

ipcMain.handle('open-file-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Executables', extensions: ['exe', 'bin'] }]
    });

    if (result.canceled) {
        return null;
    } else {
        return result.filePaths[0];
    }
});

async function installMrPack(url, installPath, mainWindow) {
    const tempDir = path.join(app.getPath('temp'), 'hg-launcher-modpack');
    const packPath = path.join(tempDir, 'modpack.mrpack');
    
    try {
        await fs.mkdir(tempDir, { recursive: true });
        
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

        const indexContent = await fs.readFile(path.join(tempDir, 'modrinth.index.json'), 'utf8');
        const index = JSON.parse(indexContent);
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

        for (const file of files) {
            const filePath = path.join(installPath, file.path);
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
