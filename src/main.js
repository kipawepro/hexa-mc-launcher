const nbt = require('prismarine-nbt');
const zlib = require('zlib');
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
const { autoUpdater } = require('electron-updater');
const { launch } = require('./launcher');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const AUTH_API_URL = 'https://hgstudio.strator.gg/auth_api.php';  
const launcherConfigUrl = 'https://hgstudio.strator.gg/api/launcher/config';

// --- AUTO UPDATER CONFIG ---
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ---------------------------

const rpcClientId = '1462409497116016682';

// IPC Handlers for Updater
ipcMain.handle('check-update', async () => {
    try {
        console.log("Checking for updates...");
        const result = await autoUpdater.checkForUpdates();
        if (result && result.updateInfo) {
            return {
                available: true,
                version: result.updateInfo.version,
                notes: result.updateInfo.releaseNotes
            };
        }
        return { available: false };
    } catch (e) {
        console.error("Update check failed:", e);
        return { available: false, error: e.message };
    }
});

ipcMain.handle('download-update', async () => {
    await autoUpdater.downloadUpdate();
    return true;
});

// Forward updater events to window
autoUpdater.on('update-available', (info) => {
    if(mainWindow) mainWindow.webContents.send('update-available', info);
});
autoUpdater.on('download-progress', (progressObj) => {
    if(mainWindow) mainWindow.webContents.send('update-progress', progressObj.percent.toFixed(0));
});
autoUpdater.on('update-downloaded', () => {
    if(mainWindow) mainWindow.webContents.send('update-downloaded');
    // Prompt to restart? Or just wait for quit?
    // autoUpdater.quitAndInstall(); // Optional: force
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Install and restart now?',
        buttons: ['Yes', 'Later']
    }).then((buttonIndex) => {
        if (buttonIndex.response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    });
});

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
            details: 'In menus',
            state: 'Hexa Launcher',
            largeImageKey: 'logo',
            largeImageText: 'Hexa Launcher',
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
            largeImageText: activity.largeImageText || 'Hexa Launcher',
            smallImageKey: activity.smallImageKey,
            smallImageText: activity.smallImageText,
            instance: false,
            ...activity
        });
    } catch (e) {
        console.error("RPC Set Activity Failed", e);
    }
}

async function getLatestLoaderVersion(type, mcVer) {
    try {
        if(type === 'fabric') {
            const r = await fetch('https://meta.fabricmc.net/v2/versions/loader/' + mcVer);
            const j = await r.json();
            return j[0].loader.version;
        } else if (type === 'forge') {
            const r = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
            const j = await r.json();
            return j.promos[mcVer + '-latest'] || j.promos[mcVer + '-recommended'] || '47.2.0';
        } else if (type === 'neoforge') {
            const r = await fetch('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
            const j = await r.json();
            const prefix = mcVer.startsWith('1.') ? mcVer.slice(2) : mcVer;
            // Filter only stable releases (no beta, alpha, rc)
            const matching = j.versions.filter(v => 
                v.startsWith(prefix + '.') && 
                !v.includes('-beta') && 
                !v.includes('-alpha') && 
                !v.includes('rc') &&
                !v.includes('client') &&
                !v.includes('installer') // exclude installer jars if listed
            );
            // Default fallback logic: if no stable found, try finding ANY matching, else hard fallback
            if (matching.length > 0) return matching.pop();
            
            // If strict filtering failed, maybe try to find the "latest" non-snapshot?
            // Some versions only have betas for new MC versions.
            // But user specifically asked for RELEASE.
            // If no release, maybe return a known stable?
            // For 1.21.1, known stable is 21.1.60 or similar.
            if (mcVer === '1.21.1') return '21.1.72'; // Updated known stable
            
            return '21.1.60';
        } else if (type === 'quilt' || type === 'quiltmc') {
            const r = await fetch('https://meta.quiltmc.org/v3/versions/loader/' + mcVer);
            const j = await r.json();
            return j[0].loader.version;
        }
    } catch(e) { 
        console.warn("Failed to get latest loader for", type, e.message);
    }
    if(type === 'fabric') return "0.18.4";
    if(type === 'quilt' || type === 'quiltmc') return "0.30.0";
    if(type === 'forge') return "47.2.0";
    if(type === 'neoforge') return "21.1.60";
    return null;
}

let currentUser = null;
const configPath = path.join(app.getPath('userData'), 'config.json');
let mainWindow;
let tray = null;
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('hexa-launcher', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('hexa-launcher');
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
        const url = commandLine.find(arg => arg.startsWith('hexa-launcher://'));
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
        tray.setToolTip('Hexa Launcher');
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
    mainWindow.webContents.openDevTools({ mode: 'detach' });  
    
    // Show window only when ready
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => { console.log('[Browser] ' + message); });
      setTimeout(() => { mainWindow.webContents.executeJavaScript("document.getElementById('wardrobe-track') ? document.getElementById('wardrobe-track').children.length : -1").then(r => console.log('CHILDREN COUNT: ', r)); }, 8000);
      mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
// Database fetch users hook for Friends Network
ipcMain.handle('fetch-users', async () => {
    try {
        const { fetchUsers } = require('./database.js');
        const result = await fetchUsers();
        return result;
    } catch (e) {
        console.log(e);
        return { success: false, message: e.message };
    }
});

// Friends API Handlers
ipcMain.handle('add-friend', async (event, friendUsername) => {
    if (!currentUser) {
        return { success: false, message: "Vous devez être connecté pour ajouter un ami." };
    }
    try {
        const { addFriend } = require('./database.js');
        const { getUserId } = require("./database.js"); if (!currentUser.id) currentUser.id = await getUserId(currentUser.username); const result = await addFriend(currentUser.id, friendUsername);
        return result;
    } catch (e) {
        console.log(e);
        return { success: false, message: e.message };
    }
});


ipcMain.handle('accept-friend', async (event, friendId) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { acceptFriend } = require('./database.js');
        return await acceptFriend(currentUser.id, friendId);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('reject-friend', async (event, friendId) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { rejectFriend } = require('./database.js');
        return await rejectFriend(currentUser.id, friendId);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('get-messages', async (event, friendId) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { getMessages } = require('./database.js');
        return await getMessages(currentUser.id, friendId);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('send-message', async (event, {friendId, message}) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { sendMessage } = require('./database.js');
        return await sendMessage(currentUser.id, friendId, message);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('edit-message', async (event, {msgId, newContent}) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { editMessage } = require('./database.js');
        return await editMessage(msgId, newContent, currentUser.id);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('delete-message', async (event, msgId) => {
    if (!currentUser || !currentUser.id) return { success: false, message: "Non connecté" };
    try {
        const { deleteMessage } = require('./database.js');
        return await deleteMessage(msgId, currentUser.id);
    } catch (e) { return { success: false, message: e.message }; }
});

ipcMain.handle('fetch-friends', async () => {
    if (!currentUser) {
        return { success: false, message: "Non connecté" };
    }
    try {
        const { fetchFriends } = require('./database.js');
        const { getUserId } = require('./database.js'); if(!currentUser.id) currentUser.id = await getUserId(currentUser.username); const result = await fetchFriends(currentUser.id);
        return result;
    } catch (e) {
        console.log(e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('login-user', async (event, credentials) => {
    // Revert to EXACTLY the same logic as hg.launcher for safety.
    // If renderer sends username, use it. If identifier, use it.
    const identifier = credentials.username || credentials.identifier;
    const password = credentials.password;
    try {
        console.log('Authenticating via API:', AUTH_API_URL, 'User:', identifier);
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
            currentUser = data.user; console.log("CURRENT USER KEYS:", Object.keys(currentUser)); if(data.user.skin) console.log("SKIN:", data.user.skin); if(data.user.cape) console.log("CAPE:", data.user.cape);
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
    // Correction : assetsRoot doit �tre dans le dossier de l'instance
    const assetsRoot = path.join(globalRoot, 'instances', mainWindow.instanceFolder, 'assets');
    const objects = assetIndexObj.objects;
    const msgh = [];
    const entries = Object.entries(objects);
    console.log(`[Assets] Scanning ${entries.length} objects from index ${assetIndexObj.id || 'unknown'}...`);
    if(mainWindow) mainWindow.webContents.send('log', `V�rification ${entries.length} assets (Audio/Textures)...`);
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
        if(mainWindow) mainWindow.webContents.send('log', `R�cup�ration de ${msgh.length} assets manquants...`);
        const BATCH_SIZE = 50; 
        for (let i = 0; i < msgh.length; i += BATCH_SIZE) {
            const batch = msgh.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(item => downloadFile(item.url, item.path).catch(e => console.error(`Failed ${item.hash}`, e))));
            if (mainWindow) {
                const pct = Math.round(((i + batch.length) / msgh.length) * 100);
                mainWindow.webContents.send('log', `T�l�chargement Assets: ${pct}%`);
            }
        }
        if(mainWindow) mainWindow.webContents.send('log', `Assets complets !`);
    } else {
        console.log("[Assets] All assets verified present.");
        if(mainWindow) mainWindow.webContents.send('log', `Assets int�gres.`);
    }
}
async function fixAssetIndex(globalRoot, assetIndexId, assetIndexContent) {
    // Correction : indexesDir doit �tre dans le dossier de l'instance
    const indexesDir = path.join(globalRoot, 'instances', mainWindow.instanceFolder, 'assets', 'indexes');
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

async function ensureAuthlibInjector(rootDir) {
    const injectorPath = path.join(rootDir, 'authlib-injector.jar');
    try {
        await fs.access(injectorPath);
        return injectorPath; // Already exists
    } catch {
        try {
            console.log('Downloading authlib-injector...');
            const response = await fetch('https://authlib-injector.yushi.moe/artifact/latest.json');
            if (!response.ok) throw new Error('Failed to get authlib-injector json');
            const data = await response.json();
            const downloadUrl = data.download_url;
            
            const jarRes = await fetch(downloadUrl);
            if (!jarRes.ok) throw new Error('Failed to download jar');
            const buffer = await jarRes.buffer();
            await fs.writeFile(injectorPath, buffer);
            console.log('authlib-injector downloaded successfully.');
            return injectorPath;
        } catch (e) {
            console.error('Missing authlib-injector and failed to download:', e);
            return null;
        }
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
    const rootPath = path.join(app.getPath('appData'), '.hexa');
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
    const rootPath = path.join(app.getPath('appData'), '.hexa');
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

async function refreshSession(mainWindow) {
    console.log("-> Entering refreshSession: user type is ", currentUser ? currentUser.type : "null");
    if (!currentUser) return { success: false, message: "You must be logged in." };

    if (currentUser.type === 'offline' || currentUser.type === 'hexa') {
        console.log("-> Bypassing refresh for offline/hexa");
        return { success: true };
    }

    if (currentUser.refreshToken) {
        try {
            if (mainWindow) mainWindow.webContents.send('log', "Rafra�chissement du token Microsoft (Via API Secure)...");
            console.log("Refreshing Microsoft Token via Auth API...");
            
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
            const msToken = refreshData.access_token;
            const newRefreshToken = refreshData.refresh_token; 
            currentUser.refreshToken = newRefreshToken; 

            // Xbox Live Auth
            console.log("Authenticating with Xbox Live...");
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
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
            });

            if (!rxboxlive.ok) throw new Error(`Xbox Live Auth Failed: ${rxboxlive.status}`);
            const xblToken = await rxboxlive.json();

            // MSMC Setup
            const dummyAuth = { emit: () => {} };
            const msTokenObj = { access_token: msToken, refresh_token: newRefreshToken };
            const xboxAuth = new msmc.Xbox(dummyAuth, msTokenObj, xblToken);
            
            let mwAuth = await xboxAuth.getMinecraft();
            
            // Normalize User Object
            const tokenHeader = mwAuth.getToken(true);
            if (tokenHeader.profile) {
                currentUser.accessToken = tokenHeader.mcToken;
                currentUser.uuid = tokenHeader.profile.id;
                currentUser.username = tokenHeader.profile.name;
            } else {
                currentUser.accessToken = mwAuth.mcToken || mwAuth.access_token;
                currentUser.uuid = mwAuth.uuid || mwAuth.id;
                currentUser.username = mwAuth.name || mwAuth.username;
            }
            currentUser.type = 'microsoft';
            
            return { success: true };

        } catch (e) {
            console.error("Token Refresh Failed:", e);
            if(mainWindow) mainWindow.webContents.send('log', typeof e === 'string' ? e : e.message);
            return { success: false, message: "Authentication error: " + (e.message || "Erreur inconnue") };
        }
    }
    
    if (currentUser.type === 'offline' || currentUser.type === 'hexa') {
        return { success: true };
    }

    if (currentUser.type !== 'microsoft' || !currentUser.accessToken) {
        return { success: false, message: "Session invalide/expir�e." };
    }
    
    return { success: true };
}

ipcMain.handle('launch-game', async (event, options) => {
    try {
        console.log("Launch Game requested (Clean Logic)!");
        
        // 1. Authentication
        console.log("Starting refreshSession...");
        console.log("Auth bypassed for Hexa Crack version!");
        if(!currentUser) currentUser = { username: 'Player', uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff', accessToken: '0', type: 'offline' };
        currentUser.type = 'offline';

        // 2. Configuration & Paths
    console.log("Loading config...");
    const config = await loadConfig();
    const globalRoot = path.join(app.getPath('appData'), '.hexa');
    let rootPath = globalRoot;
    let instanceFolderName = 'hexa_official';
    let gameVersion = "1.20.1";
    let loaderConfig = { type: 'vanilla', version: null };
    let isCustom = false;
    let customInstanceData = null;
    let activeModpack = null;

    // Determine Mode (Custom vs Official)
    // Supports both old format (options.isCustom + options.instance)
    // and new format (options.instanceFolder + !options.isOfficial)
    const _instData = (!options.isOfficial && options.instanceFolder)
        ? options                       // new format: instance props spread directly
        : (options && options.isCustom && options.instance ? options.instance : null);

    if (_instData) {
        isCustom = true;
        customInstanceData = _instData;
        gameVersion = _instData.version || gameVersion;
        instanceFolderName = _instData.instanceFolder || _instData.folder || _instData.id || instanceFolderName;

        if (_instData.loader && _instData.loader.toLowerCase() !== 'vanilla') {
            const lType = _instData.loader.toLowerCase();
            let lVer = _instData.loaderVersion || null;
            if (!lVer) {
                try {
                    if (lType === 'fabric') {
                        const r = await fetch('https://meta.fabricmc.net/v2/versions/loader');
                        const ls = await r.json();
                        lVer = (ls.find(l => l.stable) || ls[0]).version;
                    } else if (lType === 'forge') {
                        const r = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                        const d = await r.json();
                        lVer = d.promos[`${gameVersion}-recommended`] || d.promos[`${gameVersion}-latest`];
                    } else if (lType === 'neoforge') {
                        const r = await fetch('https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml');
                        const txt = await r.text();
                        const m = txt.match(/<latest>(.*?)<\/latest>/);
                        lVer = m ? m[1] : '21.1.120';
                    } else if (lType === 'quilt') {
                        const r = await fetch('https://meta.quiltmc.org/v3/versions/loader');
                        const ls = await r.json();
                        lVer = ls[0].version;
                    }
                } catch (e) {
                    console.warn(`[Instance] Could not resolve ${lType} version:`, e.message);
                    if (lType === 'fabric') lVer = '0.16.10';
                }
            }
            loaderConfig = { type: lType, version: lVer };
        } else {
            loaderConfig = { type: 'vanilla', version: null };
        }
        if (mainWindow) mainWindow.webContents.send('log', `Instance: ${_instData.name || instanceFolderName} (${gameVersion}, ${_instData.loader || 'Vanilla'})`);
    } else {
        // Fetch Server Config for Official Packs
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(launcherConfigUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (response.ok) {
                const data = await response.json();
                if (data.config) {
                    gameVersion = data.config.gameVersion || gameVersion;
                    if (data.config.activeModpack) activeModpack = data.config.activeModpack;
                }
            }
        } catch (e) {
             console.warn("Offline mode or Config Fetch Failed");
        }

        // FIX: Respect folder from renderer even for official/offline modes
        if (options.folder) instanceFolderName = options.folder;
        
        // Theme mapping
        if(config.activeTheme) {
            const t = config.activeTheme.toLowerCase();
            if (t.includes('hardcore')) instanceFolderName = 'hexa_hardcore';
            else if (t.includes('atm10')) instanceFolderName = 'hexa_atm10';
             // Add others if needed
        }
    }

    // Correction : rootPath = dossier de l'instance
    rootPath = path.join(globalRoot, 'instances', instanceFolderName);

    // Ensure instance folder structure exists (important for custom instances)
    if (isCustom) {
        for (const dir of ['mods', 'resourcepacks', 'screenshots', 'config', 'shaderpacks']) {
            await fs.mkdir(path.join(rootPath, dir), { recursive: true });
        }
    }

    // 3. Modpack Installation (If Official)
    // NOTE: Requires 'installMrPack' to be available in scope or moved to launcher.js
    // Assuming installMrPack is still in main.js. It is.
    if (activeModpack && !isCustom) {
        try {
            if (mainWindow) mainWindow.webContents.send('log', `Mise � jour Modpack: ${activeModpack.name}`);
            let modpackUrl = activeModpack.url.startsWith('/') ? `https://hgstudio.strator.gg${activeModpack.url}` : activeModpack.url;
            const installRes = await installMrPack(modpackUrl, rootPath, mainWindow);
            if (installRes) {
                 gameVersion = installRes.gameVersion;
                 loaderConfig = installRes.loader;
            }
        } catch (e) {
            return { success: false, message: "Erreur Modpack: " + e.message };
        }
    } else if (isCustom && mainWindow) {
        mainWindow.webContents.send('log', `Lancement personnalis�: ${customInstanceData.name}`);
    }

    // 4. Java Setup
    let targetJava = 17;
    const vParts = gameVersion.split('.').map(Number);
    if (vParts[1] > 20 || (vParts[1] === 20 && vParts.length > 2 && vParts[2] >= 5)) targetJava = 21; // 1.20.5+ and 1.21+
    
    if (isCustom && customInstanceData) {
        if (customInstanceData.memory) {
            config.maxRam = customInstanceData.memory;
            config.minRam = customInstanceData.memory;
        }
        if (customInstanceData.resolution) {
            config.resolution = customInstanceData.resolution;
        }
        if (customInstanceData.jvmArgs) {
            config.jvmArgs = customInstanceData.jvmArgs;
        }
    }

    let javaPath = config[`javaPath${targetJava}`] || config.javaPath;
    if (isCustom && customInstanceData && customInstanceData.javaVersion === 'custom' && customInstanceData.javaPath) {
        javaPath = customInstanceData.javaPath;
    }

    if (!javaPath) {
        try {
            javaPath = await ensureJava(globalRoot, mainWindow, targetJava);
        } catch (e) {
            return { success: false, message: "Erreur Java: " + e.message };
        }
    }

    // 5. Build Launch Options
    try {
        const formatUuid = (uuid) => (uuid && uuid.length === 32) ? uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : uuid;
        
        const generateOfflineUuid = (username) => {
            const hash = require('crypto').createHash('md5').update('OfflinePlayer:' + username).digest();
            hash[6] = (hash[6] & 0x0f) | 0x30;
            hash[8] = (hash[8] & 0x3f) | 0x80;
            return formatUuid(hash.toString('hex'));
        };
        const isOffline = currentUser.type === 'offline' || currentUser.type === 'hexa' || (currentUser.uuid && currentUser.uuid.includes('ffffffff'));
        const finalUuid = isOffline ? generateOfflineUuid(currentUser.username) : formatUuid(currentUser.uuid);

        const authorization = {
            access_token: isOffline ? '0' : currentUser.accessToken,
            client_token: finalUuid, 
            uuid: finalUuid,
            name: currentUser.username,
            user_properties: {},
            meta: { type: "mojang" } // Always use 'mojang' or 'legacy' to avoid demo mode and load authlib correctly
        };

        // --- AUTHLIB INJECTOR (CUSTOM SKINS) ---
        const authlibPath = await ensureAuthlibInjector(globalRoot);
        const customJvmArgs = config.jvmArgs ? config.jvmArgs.split(' ') : [];
        if (authlibPath) {
            const yggdrasilUrl = "http://91.197.6.177:24607/api/yggdrasil";
            customJvmArgs.push(`-javaagent:${authlibPath}=${yggdrasilUrl}`);
            // Force IPv4 to prevent connection issues on some networks
            customJvmArgs.push('-Djava.net.preferIPv4Stack=true');
            if (mainWindow) mainWindow.webContents.send('log', `Authlib-Injector activé: ${yggdrasilUrl}`);
        }

        const launchOptions = {
            authorization,
            root: globalRoot, // Use shared .hexa root for versions/assets/libraries
            gameDirectory: rootPath, // Use instance folder for saves/mods/configs
            version: { number: gameVersion, type: "release" }, // Will be overridden inside launcher.js if custom
            loader: loaderConfig,
            javaPath,
            // Removed libraryRoot/assetRoot overrides to use shared defaults
            customArgs: customJvmArgs
        };
        
        // Auto-Connect (if applicable)
        const isATM10 = instanceFolderName.includes('atm10');
        if (config.autoConnectIP && !isATM10) {
             const [ip, port] = config.autoConnectIP.split(':');
             launchOptions.customArgs.push('--server', ip);
             if (port) launchOptions.customArgs.push('--port', port);
        } else if (config.autoConnectIP && isATM10) {
             if (mainWindow) mainWindow.webContents.send('log', "Auto-Connect d�sactiv� pour ATM10.");
        }

// --- APPLY CRACK SKIN BEFORE LAUNCH ---
        try {
            const skinUrl = currentUser.skin || `http://91.197.6.177:24607/api/textures/${currentUser.username}.png`;
            const capeUrl = currentUser.cape || null;
            if (mainWindow) mainWindow.webContents.send('log', `Application du skin pour ${currentUser.username}...`);
            // Write to the INSTANCE path so CustomSkinLoader finds it in the game's working dir
            const skinBaseDir = path.join(rootPath, 'CustomSkinLoader', 'LocalSkin');
            const skinsDir = path.join(skinBaseDir, 'skins');
            const capesDir = path.join(skinBaseDir, 'capes');
            await fs.mkdir(skinsDir, { recursive: true });
            await fs.mkdir(capesDir, { recursive: true });
            // Write CustomSkinLoader.json to the correct config/ directory
            const cslConfigDir = path.join(rootPath, 'config');
            await fs.mkdir(cslConfigDir, { recursive: true });
            const cslCfgPath = path.join(cslConfigDir, 'CustomSkinLoader.json');
            const cslExists = await fs.access(cslCfgPath).then(() => true).catch(() => false);
            if (!cslExists) {
                await fs.writeFile(cslCfgPath, JSON.stringify({ loadlist: [{ type: 'LocalSkin', name: 'LocalSkin', checkPNG: false }] }, null, 4));
                if (mainWindow) mainWindow.webContents.send('log', `CustomSkinLoader.json créé: ${cslCfgPath}`);
            }
            const destSkin = path.join(skinsDir, `${currentUser.username}.png`);
            if (skinUrl.startsWith('http')) {
                const res = await fetch(skinUrl).catch(() => null);
                if (res && res.ok) {
                    const buf = await res.arrayBuffer();
                    await fs.writeFile(destSkin, Buffer.from(buf));
                    if (mainWindow) mainWindow.webContents.send('log', `Skin téléchargé: ${destSkin}`);
                }
            } else if (fsOriginal.existsSync(skinUrl)) {
                await fs.copyFile(skinUrl, destSkin);
            }
            const destCape = path.join(capesDir, `${currentUser.username}.png`);
            if (capeUrl) {
                const res = await fetch(capeUrl).catch(() => null);
                if (res && res.ok) {
                    const buf = await res.arrayBuffer();
                    await fs.writeFile(destCape, Buffer.from(buf));
                }
            } else {
                if (fsOriginal.existsSync(destCape)) await fs.unlink(destCape).catch(() => {});
            }
        } catch (skinErr) {
            console.warn('[SkinApply] Failed to apply skin:', skinErr.message);
        }

        // Call Launcher Module
        await launch(launchOptions, config, currentUser, mainWindow);
        
        // Keep launcher open during game (requested by user)
        // if (config.closeLauncher) mainWindow.hide();
        return { success: true };

    } catch (error) {
        console.error("Launch Error:", error);
        return { success: false, message: error.stack || error.message };
    }
} catch (globalError) {
    console.error("Global Launch Error:", globalError);
    return { success: false, message: globalError.stack || globalError.message };
}
});

// LEGACY HANDLER
ipcMain.handle('launch-game-legacy', async (event, options) => {
    console.log('Launch Game requested!');
    if (mainWindow) mainWindow.webContents.send('log', 'Pr�paration du lancement...');
    if (!currentUser) {
        return { success: false, message: "You must be logged in." };
    }
    if (currentUser.refreshToken) {
        try {
            if (mainWindow) mainWindow.webContents.send('log', "Rafra�chissement du token Microsoft (Via API Secure)...");
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
                 if (mainWindow) mainWindow.webContents.send('log', "Erreur rafra�chissement: " + err.message);
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
            if (mainWindow) mainWindow.webContents.send('log', "Authentication error (Refresh): " + errorMessage);
            if (JSON.stringify(e).includes("invalid_client")) {
                 console.error("HINT: The Refresh Token was likely generated with a different Azure Client ID.");
                 console.error("Please ensure AZURE_CLIENT_ID in .env matches the one from your website.");
            }
            return { success: false, message: "Failed to refresh Microsoft session. V�rifiez votre configuration (.env)." };
        }
    } else {
        if (currentUser.type === 'offline' || currentUser.type === 'hexa') {
            // Bypass
        } else if (currentUser.type !== 'microsoft' || !currentUser.accessToken) {
            console.error("No refresh token and no valid session found.");
            if (mainWindow) mainWindow.webContents.send('log', "No valid token found.");
            return { success: false, message: "Erreur d'authentification: Session invalide/expir�e." };
        }
    }
    let gameVersion = "1.20.1";
    let loaderConfig = null;
    let activeModpack = null;
    let isCustom = false;
    let customInstanceData = null;

    if (options && options.isCustom && options.instance) {
        // Custom Instance Mode
        isCustom = true;
        customInstanceData = options.instance;
        gameVersion = customInstanceData.version;
        if(customInstanceData.loader && customInstanceData.loader !== 'vanilla') {
             // Fallback versions if not specified or dynamically fetched
             const lType = customInstanceData.loader.toLowerCase();
             let lVer = customInstanceData.loaderVersion;
             if (!lVer) {
                 lVer = await getLatestLoaderVersion(lType, gameVersion);
             }

             loaderConfig = { type: lType, version: lVer };
        }
    } else {
        // Modpack / Server Mode
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
            if (mainWindow) mainWindow.webContents.send('log', "Impossible de r�cup�rer la config serveur, mode hors ligne...");
        }
    }

    const config = await loadConfig();
    const globalRoot = path.join(app.getPath('appData'), '.hexa');
    let rootPath = globalRoot; 
    let instanceFolderName = 'hexa_official';
    
    if(!isCustom && config.activeTheme) {
        const t = config.activeTheme.toLowerCase();
        if (t.includes('hardcore')) instanceFolderName = 'hexa_hardcore';
        else if (t.includes('cherry')) instanceFolderName = 'hexa_cherry';
        else if (t.includes('dragon')) instanceFolderName = 'hexa_dragon';
        else if (t.includes('atm10')) instanceFolderName = 'hexa_atm10';
        else if (t.includes('autumn') || t.includes('autum')) instanceFolderName = 'hexa_autumn';
    } else if (isCustom) {
        instanceFolderName = customInstanceData.folder || customInstanceData.id;
    }

    // Correction : rootPath = dossier de l'instance
    rootPath = path.join(globalRoot, 'instances', instanceFolderName);
    if (activeModpack && !isCustom) {
        try {
            console.log("Active Modpack found:", activeModpack.name);
            if (mainWindow) mainWindow.webContents.send('log', `Modpack d�tect�: ${activeModpack.name}`);
            let modpackUrl = activeModpack.url;
            if (modpackUrl.startsWith('/')) {
                modpackUrl = `https://hgstudio.strator.gg${modpackUrl}`;
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
    } else if (isCustom) {
         await fs.mkdir(rootPath, { recursive: true });
         if (mainWindow) mainWindow.webContents.send('log', `Lancement personnalis�: ${customInstanceData.name}`);
    }
    let targetJavaVersion = 17;

    // Detect required Java version
    if (gameVersion) {
        const parts = gameVersion.split('.').map(Number);
        if (parts.length >= 2) {
             const minor = parts[1];
             const patch = parts[2] || 0;
             // 1.20.5+ requires Java 21
             if (minor > 20 || (minor === 20 && patch >= 5)) {
                 targetJavaVersion = 21;
             } else if (minor < 17) {
                 // 1.16 and below typically use Java 8, but 1.18+ needs 17.
                 // Let's stick to 17 for 1.18-1.19. For extremely old (1.12), maybe 8?
                 // Current Modpacks are usually modern. 
                 // If the user needs Java 8 for 1.12, add logic here.
                 if (minor <= 16) targetJavaVersion = 8;
             }
        }
    }

    let javaPath = config[`javaPath${targetJavaVersion}`] || config.javaPath;
    if (!javaPath) {
        try {
            javaPath = await ensureJava(globalRoot, mainWindow, targetJavaVersion);
        } catch (error) {
            console.error('Java Setup Error:', error);
            if (mainWindow) mainWindow.webContents.send('log', `Java Error: ${error.message}`);
            return { success: false, message: "Erreur lors de l'installation de Java." };
        }
    }
    let authorization;
    if (!currentUser.accessToken) {
        console.error("Launch aborted: No access token available for user", currentUser.username);
        if (mainWindow) mainWindow.webContents.send('log', "Erreur fatale: Token d'acc�s manquant.");
        return { success: false, message: "Impossible de lancer le jeu : Session invalide (Token manquant)." };
    }
    const formatUuid = (uuid) => {
        if (uuid && uuid.length === 32) {
            return uuid.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
        }
        return uuid;
    };
    
    const generateOfflineUuid = (username) => {
        const hash = require('crypto').createHash('md5').update('OfflinePlayer:' + username).digest();
        hash[6] = (hash[6] & 0x0f) | 0x30;
        hash[8] = (hash[8] & 0x3f) | 0x80;
        return formatUuid(hash.toString('hex'));
    };
    const isOffline = currentUser.type === 'offline' || currentUser.type === 'hexa' || (currentUser.uuid && currentUser.uuid.includes('ffffffff'));
    const finalUuid = isOffline ? generateOfflineUuid(currentUser.username) : formatUuid(currentUser.uuid);

    authorization = {
        access_token: isOffline ? '0' : currentUser.accessToken,
        client_token: finalUuid,
        uuid: finalUuid,
        name: currentUser.username,
        user_properties: {},
        meta: {
            type: isOffline ? "mojang" : "msa",
            demo: false
        }
    };

    // --- AUTHLIB INJECTOR (CUSTOM SKINS) ---
    const authlibPath = await ensureAuthlibInjector(globalRoot);
    const customJvmArgs = config.jvmArgs ? config.jvmArgs.split(' ') : [];
    
    if (authlibPath) {
        // Point to your Yggdrasil API Server
        const yggdrasilUrl = "http://91.197.6.177:24607/api/yggdrasil";       
        if (mainWindow) mainWindow.webContents.send('log', "Authlib-Injector charg� pour les skins !");
    }

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
            '-Dminecraft.launcher.brand=hexa',
            '-Dminecraft.launcher.version=1.0.0',
            ...customJvmArgs
        ],
        customLaunchArgs: [
            // Removed --assetsDir and --assetIndex as they might be duplicated by MCLC
            // Only keeping arguments not automatically handled if necessary
            // If MCLC 6.0.54 handles assets, we should let it do so.
        ],
        checkFiles: false,  // SPEED BOOST: Ne pas v�rifier l'int�grit� de tous les fichiers/assets
        ignoreMissingAssets: false,
        overrides: {
            assetRoot: path.join(rootPath, 'assets'), 
            libraryRoot: path.join(rootPath, 'libraries') 
        },
        window: {
            width: config.resolution ? config.resolution.width : 1280,
            height: config.resolution ? config.resolution.height : 720,
            fullscreen: config.fullscreen || false
        }
    };
    // Auto-Connect logic
    // Disable auto-connect for ATM10 or other heavy modpacks if the server IP is likely for the main server
    // For now, we only allow Auto-Connect on 'hexa_official' or 'hexa_hardcore' (if applicable)
    // or explicitly block it for atm10.
    const isATM10 = instanceFolderName.includes('atm10') || (loaderConfig && loaderConfig.type === 'neoforge');

    if (config.autoConnectIP && !isATM10) {
        const parts = config.autoConnectIP.split(':');
        const ip = parts[0];
        const port = parts[1] || '25565';
        console.log(`[Feature] Auto-Connect enabled for ${ip}:${port}`);
        if (mainWindow) mainWindow.webContents.send('log', `Auto-Connect activ�: ${ip}:${port}`);
        opts.customArgs.push('--server', ip);
        opts.customArgs.push('--port', port);
    } else if (config.autoConnectIP && isATM10) {
        console.log(`[Feature] Auto-Connect skipped for ATM10 (Prevent Registry Sync Crash)`);
        if (mainWindow) mainWindow.webContents.send('log', `Auto-Connect d�sactiv� pour ATM10 (Compatibilit�).`);
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
        // Ensure resourcepacks and shaderpacks are always per-instance
        // Remove any global .hexa resourcepacks logic
        // All open-folder logic must use instanceDirPath
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
                if (mainWindow) mainWindow.webContents.send('log', `R�solution des d�pendances Vanilla...`);
                const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                const manifest = await manifestRes.json();
                const versionInfo = manifest.versions.find(v => v.id === gameVersion);
                if (!versionInfo) throw new Error(`Vanilla version ${gameVersion} not found.`);
                const vanillaRes = await fetch(versionInfo.url);
                const vanillaJson = await vanillaRes.json();
                const assetIndexId = vanillaJson.assetIndex.id;
                const assetIndexUrl = vanillaJson.assetIndex.url;
                const assetsDir = path.join(globalRoot, 'assets');
                const indexesDir = path.join(assetsDir, 'indexes');
                const indexesPath = path.join(indexesDir, `${assetIndexId}.json`);
                await fs.mkdir(indexesDir, { recursive: true });
                if (mainWindow) mainWindow.webContents.send('log', `V�rification index assets ${assetIndexId}...`);
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
                if (mainWindow) mainWindow.webContents.send('log', `Pr�paration profil Fabric...`);
                const fabricRes = await fetch(fabricUrl);
                if (!fabricRes.ok) throw new Error("Failed to download Fabric profile.");
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
                if (mainWindow) mainWindow.webContents.send('log', `Profil Fabric install�.`);
            } catch (err) {
                console.error("Critical verification error:", err);
                if (mainWindow) mainWindow.webContents.send('log', `ERREUR CRITIQUE: ${err.message}`);
            }
            opts.version.number = versionId;
            opts.version.custom = versionId;
        } else if (loaderConfig.type === 'forge' || loaderConfig.type === 'neoforge') {
            const isNeo = loaderConfig.type === 'neoforge';
            const modLoaderVersion = loaderConfig.version;
            const fullVersionName = `${gameVersion}-${modLoaderVersion}`;
            const versionId = `${loaderConfig.type}-${fullVersionName}`;
            
            // 1. Download/Ensure Vanilla JSON exists (Critical for Inheritance)
            try {
                if (mainWindow) mainWindow.webContents.send('log', `V�rification Vanilla ${gameVersion}...`);
                const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                const manifest = await manifestRes.json();
                const versionInfo = manifest.versions.find(v => v.id === gameVersion);
                if (!versionInfo) throw new Error(`Vanilla version ${gameVersion} not found.`);
                
                const vanillaVersionDir = path.join(rootPath, 'versions', gameVersion);
                await fs.mkdir(vanillaVersionDir, { recursive: true });
                const vanillaJsonPath = path.join(vanillaVersionDir, `${gameVersion}.json`);
                
                try {
                    await fs.access(vanillaJsonPath);
                } catch {
                     const vanillaRes = await fetch(versionInfo.url);
                     const vanillaJson = await vanillaRes.json();
                     await fs.writeFile(vanillaJsonPath, JSON.stringify(vanillaJson, null, 2));
                }
            } catch (vErr) {
                console.error("Vanilla JSON check failed:", vErr);
            }

            // 2. Download Installer
            const installerUrl = isNeo 
                ? `https://maven.neoforged.net/releases/net/neoforged/neoforge/${modLoaderVersion}/neoforge-${modLoaderVersion}-installer.jar`
                : `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersionName}/forge-${fullVersionName}-installer.jar`;
            
            const installerPath = path.join(rootPath, 'installers', `${loaderConfig.type}-${modLoaderVersion}-installer.jar`);
            await fs.mkdir(path.dirname(installerPath), { recursive: true });

            try {
                // Always download to ensure freshness or missing file
                if (mainWindow) mainWindow.webContents.send('log', `T�l�chargement ${loaderConfig.type} installer...`);
                /* Check if exists, maybe skip verify? For now, simple check. */
                try { await fs.access(installerPath); } catch {
                    const res = await fetch(installerUrl);
                    if (!res.ok) throw new Error(`Failed to download installer: ${res.statusText}`);
                     const dest = fsOriginal.createWriteStream(installerPath);
                     await new Promise((resolve, reject) => {
                         res.body.pipe(dest);
                         res.body.on("error", reject);
                         dest.on("finish", resolve);
                     });
                }

                // 3. Extract and Patch version.json
                if (mainWindow) mainWindow.webContents.send('log', `Patching ${loaderConfig.type}...`);
                const zip = new AdmZip(installerPath);
                const versionEntry = zip.getEntry('version.json');
                if (!versionEntry) throw new Error("version.json not found in installer!");
                
                const versionJson = JSON.parse(versionEntry.getData().toString('utf8'));
                
                // FORCE INHERITANCE
                versionJson.id = versionId;
                versionJson.inheritsFrom = gameVersion;
                
                // ADD FORGEWRAPPER
                const forgeWrapperVersion = "1.6.0";
                const wrapperLib = {
                    name: `io.github.zekerzhayard:ForgeWrapper:${forgeWrapperVersion}`,
                    downloads: {
                        artifact: {
                            url: `https://github.com/ZekerZhayard/ForgeWrapper/releases/download/${forgeWrapperVersion}/ForgeWrapper-${forgeWrapperVersion}.jar`,
                            path: `io/github/zekerzhayard/ForgeWrapper/${forgeWrapperVersion}/ForgeWrapper-${forgeWrapperVersion}.jar`,
                            size: 34369 // Approximate size, optional but good
                        }
                    }
                };
                
                // Avoid duplicates
                if (!versionJson.libraries.find(l => l.name.includes("ForgeWrapper"))) {
                    versionJson.libraries.push(wrapperLib);
                }

                // FIX MAIN CLASS
                versionJson.mainClass = "io.github.zekerzhayard.forgewrapper.installer.Main";
                
                // SAVE CUSTOM JSON
                const customVersionDir = path.join(rootPath, 'versions', versionId);
                await fs.mkdir(customVersionDir, { recursive: true });
                await fs.writeFile(path.join(customVersionDir, `${versionId}.json`), JSON.stringify(versionJson, null, 2));
                
                // 4. Set Launch Options
                opts.version.number = versionId;
                opts.version.custom = versionJson; // Pass object directly to avoid MCLC lookup issues

                // Force Main Class Override
                if (!opts.launch) opts.launch = {}; // separate launch object just in case MCLC uses it
                // But specifically for MCLC launch opts logic:
                // We rely on the custom versionJson having the correct mainClass.
                // However, let's also try to enforce it via JVM args if needed, or rely on MCLC using the custom object.
                
                // JVM ARGS for ForgeWrapper
                // We append them to customArgs. 
                // Note: MCLC might duplicate some, but these are specific system properties.
                const libraryDir = path.join(globalRoot, 'libraries'); // Use global libs
                const vanillaPath = path.join(rootPath, 'versions', gameVersion, `${gameVersion}.jar`);
                
                opts.customArgs.push(`-Dforgewrapper.librariesDir=${libraryDir}`);
                opts.customArgs.push(`-Dforgewrapper.installer=${installerPath}`);
                opts.customArgs.push(`-Dforgewrapper.minecraft=${vanillaPath}`);

                console.log(`[Patch] Applied ForgeWrapper manual fix for ${versionId}`);

            } catch (e) {
                console.error("Error preparing ModLoader:", e);
                if (mainWindow) mainWindow.webContents.send('log', `Erreur ${loaderConfig.type}: ${e.message}`);
                // Fallback (might crash but better than nothing?)
                // opts.forge = installerPath;
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
        if (mainWindow) mainWindow.webContents.send('log', `V�rification int�grit� biblioth�ques...`);
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
            mainWindow.webContents.send('game-exit', e);
            mainWindow.show();
            mainWindow.focus();
        }
    });
    try {
        // Revert ModernFix Workaround (User Request - caused Timeouts)
        try {
            const mFixPath = path.join(rootPath, 'config', 'modernfix-mixins.properties');
            let mFixContent = '';
            try {
                mFixContent = await fs.readFile(mFixPath, 'utf8');
            } catch {}
            
            if (mFixContent.includes('mixin.perf.reduce_blockstate_cache_rebuilds=false')) {
                console.log("[Fix] Removing ModernFix workaround...");
                if (mainWindow) mainWindow.webContents.send('log', "annulation correctif ModernFix...");
                const newContent = mFixContent.replace(/[\r\n]+mixin\.perf\.reduce_blockstate_cache_rebuilds=false/g, '');
                await fs.writeFile(mFixPath, newContent);
            }
        } catch (fixErr) {
            console.warn("[Fix] Failed to revert ModernFix workaround:", fixErr);
        }

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
    return { success: true, message: "Launching the game..." };
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
        return { success: false, message: "Error saving settings." };
    }
});
ipcMain.on('update-rpc', (event, activity) => {
    setRPCActivity(activity);
});
ipcMain.on('minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.minimize();
});
ipcMain.on('maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win.isMaximized()) {
        win.unmaximize();
    } else {
        win.maximize();
    }
});
ipcMain.on('close', (event) => {
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
                 const apiBase = 'https://hgstudio.strator.gg';
                 downloadUrl = `${apiBase}/storage/launcher/setup.exe`;
            } else if (downloadUrl.startsWith('/')) {
                 const apiBase = 'https://hgstudio.strator.gg';
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
        if (mainWindow) mainWindow.webContents.send('log', "T�l�chargement de la mise � jour...");
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
                    
                    let bgType = null;
                    let bgFile = null;
                    let logoFile = null;
                    
                    const videoPath = path.join(themePath, 'background.mp4');
                    const pngPath = path.join(themePath, 'background.png');
                    const jpgPath = path.join(themePath, 'background.jpg');
                    const logoPath = path.join(themePath, 'logo.png');

                    try {
                        await fs.access(logoPath);
                        logoFile = 'logo.png';
                    } catch {}
                    
                    try {
                        await fs.access(videoPath);
                        bgType = 'video';
                        bgFile = 'background.mp4';
                    } catch {
                        try {
                             await fs.access(pngPath);
                             bgType = 'image';
                             bgFile = 'background.png';
                        } catch {
                            try {
                                 await fs.access(jpgPath);
                                 bgType = 'image';
                                 bgFile = 'background.jpg';
                            } catch {}
                        }
                    }

                    if (bgType) {
                        themes.push({
                            id: item.name,
                            folder: item.name, 
                            title: config.title || item.name,
                            accentColor: config.accentColor || '#ff0055',
                            bgType: bgType,
                            bgFile: bgFile,
                            logoFile: logoFile 
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

// Import / Duplicate Instance Handler
ipcMain.handle('import-launcher-instance', async (event, { sourcePath, instanceName }) => {
    try {
        const globalRoot = path.join(app.getPath('appData'), '.hexa');
        const instancesDir = path.join(globalRoot, 'instances');
        
        // Resolve Source Path if relative (folder name only)
        if (sourcePath && !path.isAbsolute(sourcePath)) {
            sourcePath = path.join(instancesDir, sourcePath);
        }

        // Sanitize name
        let folderName = instanceName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
        if (!folderName) folderName = 'instance_copy';
        
        let targetPath = path.join(instancesDir, folderName);
        let counter = 1;
        
        // Check for collision
        while (true) {
            try {
                await fs.access(targetPath);
                // Exists, increment
                targetPath = path.join(instancesDir, `${folderName}_${counter}`);
                counter++;
            } catch {
                // Doesn't exist, safe to use
                folderName = path.basename(targetPath);
                break;
            }
        }
        
        console.log(`[Instance] Duplicating ${sourcePath} -> ${targetPath}`);
        
        // Copy Recursive
        // Node 16.7.0+ supports fs.cp
        if (fs.cp) {
             await fs.cp(sourcePath, targetPath, { recursive: true });
        } else {
             // Fallback for older electron
             const ncp = require('ncp').ncp; // Assuming ncp is installed? Probably not.
             // Manual recursive copy
             const copyRecursive = async (src, dest) => {
                 const stats = await fs.stat(src);
                 if (stats.isDirectory()) {
                     await fs.mkdir(dest, { recursive: true });
                     const files = await fs.readdir(src);
                     await Promise.all(files.map(child => copyRecursive(path.join(src, child), path.join(dest, child))));
                 } else {
                     await fs.copyFile(src, dest);
                 }
             };
             await copyRecursive(sourcePath, targetPath);
        }

        return folderName;
    } catch (e) {
        console.error("Import/Duplicate Instance Error:", e);
        return null;
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
    let instanceFolderName = 'hexa_official';
    if (config.activeTheme) {
        const t = config.activeTheme.toLowerCase();
        if (t.includes('hardcore')) instanceFolderName = 'hexa_hardcore';
        else if (t.includes('cherry')) instanceFolderName = 'hexa_cherry';
        else if (t.includes('dragon')) instanceFolderName = 'hexa_dragon';
        else if (t.includes('atm10')) instanceFolderName = 'hexa_atm10';
        else if (t.includes('autumn') || t.includes('autum')) instanceFolderName = 'hexa_autumn';
    }
    return path.join(app.getPath('appData'), '.hexa', 'instances', instanceFolderName); 
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
    if (type === 'hexa' || type === 'offline') {
        return { success: true };
    } 
    return { success: false, message: "Le changement de skin n'est pas encore support� pour ce type de compte." };
});
async function parseModMetadata(jarPath, fileName) {
    let modInfo = {
        name: fileName,
        version: '-',
        author: '-',
        icon: null,
        fileName: fileName // Keep track of the original file
    };
    try {
        const zip = new AdmZip(jarPath);
        let iconPath = null;

        let entry = zip.getEntry('fabric.mod.json') || zip.getEntry('quilt.mod.json');
        if (entry) {
            const data = JSON.parse(zip.readAsText(entry));
            if (data.name) modInfo.name = data.name;
            if (data.version) modInfo.version = data.version;
            if (data.authors) {
                if (Array.isArray(data.authors)) {
                    modInfo.author = data.authors.map(a => typeof a === 'string' ? a : (a.name || '')).join(', ');
                } else if (typeof data.authors === 'string') {
                    modInfo.author = data.authors;
                }
            }
            if (data.icon) iconPath = data.icon;
        } else {
            entry = zip.getEntry('META-INF/mods.toml') || zip.getEntry('META-INF/neoforge.mods.toml');
            if (entry) {
                const text = zip.readAsText(entry);
                const nameMatch = text.match(/displayName\s*=\s*(?:"|')([^"']+)(?:"|')/);
                const valMatch = text.match(/version\s*=\s*(?:"|')([^"']+)(?:"|')/);
                const authMatch = text.match(/authors\s*=\s*(?:"|')([^"']+)(?:"|')/);
                const logoMatch = text.match(/logoFile\s*=\s*(?:"|')([^"']+)(?:"|')/);
                
                if (nameMatch) modInfo.name = nameMatch[1];
                if (valMatch && valMatch[1] !== '${file.jarVersion}') modInfo.version = valMatch[1];
                if (authMatch) modInfo.author = authMatch[1];
                if (logoMatch) iconPath = logoMatch[1];
            }
        }

        if (iconPath) {
            if (typeof iconPath === 'object') {
                const sizes = Object.keys(iconPath);
                if(sizes.length > 0) iconPath = iconPath[sizes[sizes.length - 1]];
            }
            if (typeof iconPath === 'string') {
                const cleanIconPath = iconPath.replace(/^\//, '');
                const iconEntry = zip.getEntry(cleanIconPath) || zip.getEntry(cleanIconPath.replace(/\\/g, '/'));
                if (iconEntry) {
                    const buffer = iconEntry.getData();
                    const ext = String(iconPath).split('.').pop().toLowerCase();
                    const mime = ext === 'png' ? 'image/png' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png');
                    modInfo.icon = `data:${mime};base64,${buffer.toString('base64')}`;
                }
            }
        }
    } catch(e) { } // Ignore read errors, will return fallback info
    return modInfo;
}


// ── NBT helpers for level.dat ──────────────────────────────────────────────────
async function readLevelDat(worldPath) {
    const lvlPath = path.join(worldPath, 'level.dat');
    const rawBuf = fsOriginal.readFileSync(lvlPath);
    const unzipped = zlib.gunzipSync(rawBuf);
    const { parsed } = await nbt.parse(unzipped);
    return parsed;
}
function writeLevelDat(worldPath, parsed) {
    const lvlPath = path.join(worldPath, 'level.dat');
    const outBuf   = nbt.writeUncompressed(parsed, 'big');
    const compressed = zlib.gzipSync(outBuf);
    fsOriginal.writeFileSync(lvlPath, compressed);
}
function getDat(parsed) { return parsed.value.Data.value; }
// ─────────────────────────────────────────────────────────────────────────────

// ── Minecraft Server Ping ────────────────────────────────────────────────────
function _mkVarInt(val) {
    const buf = [];
    val = val >>> 0; // treat as unsigned 32-bit
    do {
        let byte = val & 0x7f;
        val >>>= 7;
        if (val !== 0) byte |= 0x80;
        buf.push(byte);
    } while (val !== 0);
    return Buffer.from(buf);
}
function _readVarInt(buf, off) {
    let num = 0, shift = 0, byte;
    do {
        if (off >= buf.length) return null;
        byte = buf[off++];
        num |= (byte & 0x7f) << shift;
        shift += 7;
    } while (byte & 0x80);
    return { value: num, offset: off };
}
function _mcExtractMotd(desc) {
    if (!desc) return '';
    if (typeof desc === 'string') return desc.replace(/§[0-9a-fklmnorA-FKLMNOR]/g, '').trim();
    let text = desc.text || '';
    if (desc.extra) desc.extra.forEach(e => { text += _mcExtractMotd(e); });
    return text.replace(/§[0-9a-fklmnorA-FKLMNOR]/g, '').trim();
}
async function pingMinecraftServer(host, portInput, timeoutMs = 4000) {
    const net = require('net');
    const port = parseInt(portInput) || 25565;
    return new Promise(resolve => {
        const socket = new net.Socket();
        let done = false;
        let buf = Buffer.alloc(0);
        const finish = (result) => {
            if (!done) { done = true; clearTimeout(timer); socket.destroy(); resolve(result); }
        };
        const timer = setTimeout(() => finish({ online: false }), timeoutMs);
        socket.connect(port, host, () => {
            const hostBuf = Buffer.from(host, 'utf8');
            const handshakeBody = Buffer.concat([
                _mkVarInt(0x00),
                _mkVarInt(0x3FF),
                _mkVarInt(hostBuf.length), hostBuf,
                Buffer.from([port >> 8, port & 0xff]),
                _mkVarInt(1)
            ]);
            socket.write(Buffer.concat([_mkVarInt(handshakeBody.length), handshakeBody]));
            const statusBody = _mkVarInt(0x00);
            socket.write(Buffer.concat([_mkVarInt(statusBody.length), statusBody]));
        });
        socket.on('data', chunk => {
            buf = Buffer.concat([buf, chunk]);
            try {
                let off = 0;
                const pktLen = _readVarInt(buf, off);
                if (!pktLen || buf.length < pktLen.offset + pktLen.value) return;
                off = pktLen.offset;
                const pktId = _readVarInt(buf, off);
                if (!pktId || pktId.value !== 0x00) return;
                off = pktId.offset;
                const strLen = _readVarInt(buf, off);
                if (!strLen) return;
                off = strLen.offset;
                if (buf.length < off + strLen.value) return;
                const json = JSON.parse(buf.slice(off, off + strLen.value).toString('utf8'));
                finish({
                    online: true,
                    version: json.version?.name || '?',
                    players: { online: json.players?.online ?? 0, max: json.players?.max ?? 0 },
                    motd: _mcExtractMotd(json.description),
                    favicon: json.favicon || null
                });
            } catch (_) { /* wait for more data */ }
        });
        socket.on('error', () => finish({ online: false }));
        socket.on('close', () => finish({ online: false }));
    });
}
// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('get-worlds', async (event, instPath) => {
    try {
        let worldsFolder = instPath;
        if (!path.isAbsolute(instPath)) {
            worldsFolder = path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        }
        worldsFolder = path.join(worldsFolder, 'saves');

        if (!fsOriginal.existsSync(worldsFolder)) {
            return [];
        }

        const items = await fs.readdir(worldsFolder, { withFileTypes: true });
        const worlds = [];
        for (const item of items) {
            if (!item.isDirectory()) continue;
            const worldPath = path.join(worldsFolder, item.name);

            // ── Icon ──────────────────────────────────────────────
            let iconData = null;
            const iconPath = path.join(worldPath, 'icon.png');
            if (fsOriginal.existsSync(iconPath)) {
                iconData = 'data:image/png;base64,' + fsOriginal.readFileSync(iconPath).toString('base64');
            }

            // ── level.dat ──────────────────────────────────────────
            let levelName   = item.name;
            let allowCmds   = 0;
            let gameType    = 0;
            let difficulty  = 2;
            let lastPlayedMs = 0;
            let isHardcore  = 0;
            const lvlPath = path.join(worldPath, 'level.dat');
            if (fsOriginal.existsSync(lvlPath)) {
                try {
                    const parsed = await readLevelDat(worldPath);
                    const dat    = getDat(parsed);
                    levelName   = dat.LevelName     ? dat.LevelName.value       : item.name;
                    allowCmds   = dat.allowCommands ? dat.allowCommands.value   : 0;
                    gameType    = dat.GameType      ? dat.GameType.value        : 0;
                    difficulty  = dat.Difficulty    ? dat.Difficulty.value      : 2;
                    lastPlayedMs = dat.LastPlayed   ? Number(dat.LastPlayed.value) : 0;
                    isHardcore  = dat.hardcore      ? dat.hardcore.value        : 0;
                } catch(e) { /* corrupt level.dat — skip */ }
            }
            if (!lastPlayedMs) {
                const statsInfo = await fs.stat(worldPath);
                lastPlayedMs = statsInfo.mtimeMs;
            }

            // ── Advancements ──────────────────────────────────────
            let advCount = 0;
            const advPath = path.join(worldPath, 'advancements');
            if (fsOriginal.existsSync(advPath)) {
                try {
                    const advs = await fs.readdir(advPath);
                    const jsonAdvs = advs.filter(a => a.endsWith('.json'));
                    for (const f of jsonAdvs) {
                        const obj = JSON.parse(fsOriginal.readFileSync(path.join(advPath, f), 'utf-8'));
                        advCount += Object.keys(obj).filter(k => k !== 'DataVersion' && obj[k].done).length;
                    }
                } catch(e) {}
            }

            // ── Playtime (sum all player stats) ──────────────────
            let playtimeTicks = 0;
            const statsPath = path.join(worldPath, 'stats');
            if (fsOriginal.existsSync(statsPath)) {
                try {
                    const statsFiles = (await fs.readdir(statsPath)).filter(f => f.endsWith('.json'));
                    for (const sf of statsFiles) {
                        const sd = JSON.parse(fsOriginal.readFileSync(path.join(statsPath, sf), 'utf-8'));
                        const custom = sd.stats && sd.stats["minecraft:custom"];
                        if (custom) {
                            playtimeTicks += custom["minecraft:play_time"] || custom["minecraft:play_one_minute"] || 0;
                        } else if (sd.stat_playOneMinute) {
                            playtimeTicks += sd.stat_playOneMinute;
                        }
                    }
                } catch(e) {}
            }
            const playtimeSecs  = Math.floor(playtimeTicks / 20);
            const playtimeMins  = Math.floor(playtimeSecs  / 60);

            worlds.push({
                folder:      item.name,
                name:        levelName,
                lastPlayed:  lastPlayedMs,
                icon:        iconData,
                advancements: advCount,
                playtimeSecs,
                playtimeMins,
                allowCommands: allowCmds,
                gameType,
                difficulty,
                hardcore:    isHardcore,
                path: worldPath
            });
        }
        
        worlds.sort((a,b) => b.lastPlayed - a.lastPlayed);
        return worlds;
    } catch (e) { console.error("Worlds loading error:", e); return []; }
});

ipcMain.handle('get-servers', async (event, instPath) => {
    try {
        const absPath = path.isAbsolute(instPath) ? instPath : path.join(app.getPath('appData'), '.hexa', 'instances', instPath);
        const datPath = path.join(absPath, 'servers.dat');
        if (!fsOriginal.existsSync(datPath)) return [];
        const buf = await fs.readFile(datPath);
        const { parsed } = await nbt.parse(buf);
        const list = parsed.value.servers;
        if (!list || !list.value || !list.value.value) return [];
        return list.value.value.map(s => ({
            name: s.name?.value || 'Unknown',
            ip:   s.ip?.value   || '',
            icon: s.icon?.value || null,
            hidden: !!(s.hidden?.value)
        }));
    } catch(e) {
        console.error('get-servers error:', e);
        return [];
    }
});

ipcMain.handle('ping-server', async (event, { host, port }) => {
    try {
        return await pingMinecraftServer(host, port);
    } catch(e) {
        return { online: false };
    }
});

ipcMain.handle('save-world-settings', async (event, worldPath, settings) => {
    try {
        if (!fsOriginal.existsSync(path.join(worldPath, 'level.dat'))) {
            return { success: false, message: 'level.dat not found' };
        }
        const parsed = await readLevelDat(worldPath);
        const dat    = getDat(parsed);

        if (settings.name !== undefined && dat.LevelName)
            dat.LevelName.value = String(settings.name);

        if (settings.allowCommands !== undefined && dat.allowCommands)
            dat.allowCommands.value = settings.allowCommands ? 1 : 0;
        else if (settings.allowCommands !== undefined)
            dat.allowCommands = { type: 'byte', value: settings.allowCommands ? 1 : 0 };

        if (settings.gameType !== undefined && dat.GameType)
            dat.GameType.value = parseInt(settings.gameType);

        if (settings.difficulty !== undefined && dat.Difficulty)
            dat.Difficulty.value = parseInt(settings.difficulty);

        writeLevelDat(worldPath, parsed);

        // Rename folder if folder name should change (optional)
        if (settings.folderName && settings.folderName !== path.basename(worldPath)) {
            const newPath = path.join(path.dirname(worldPath), settings.folderName);
            await fs.rename(worldPath, newPath);
            return { success: true, newPath };
        }

        return { success: true };
    } catch(e) {
        console.error('[save-world-settings]', e);
        return { success: false, message: String(e.message) };
    }
});

ipcMain.handle('get-screenshots', async (event, instPath) => {
    try {
        let screensFolder = instPath;
        if (!path.isAbsolute(instPath)) {
            screensFolder = path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        }
        screensFolder = path.join(screensFolder, 'screenshots');
        
        if (!fsOriginal.existsSync(screensFolder)) return [];
        const files = await fs.readdir(screensFolder);
        const images = files.filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.jpeg'));
        
        const output = [];
        for (const img of images) {
            const buffer = await fs.readFile(path.join(screensFolder, img));
            output.push({
                name: img,
                data: `data:image/png;base64,${buffer.toString('base64')}`
            });
        }
        return output;
    } catch(e) {
        console.error('Error fetching screenshots:', e);
        return [];
    }
});

ipcMain.handle('save-screenshot', async (event, instPath, fileName, base64Data) => {
    try {
        let screensFolder = instPath;
        if (!path.isAbsolute(instPath)) {
            screensFolder = path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        }
        screensFolder = path.join(screensFolder, 'screenshots');
        
        if (!fsOriginal.existsSync(screensFolder)) {
            await fs.mkdir(screensFolder, { recursive: true });
        }
        
        // Remove data URI prefix if present
        const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Content, 'base64');
        
        await fs.writeFile(path.join(screensFolder, fileName), buffer);
        return { success: true };
    } catch (e) {
        console.error('Error saving screenshot:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('delete-screenshot', async (event, instPath, fileName) => {
    try {
        let screensFolder = instPath;
        if (!path.isAbsolute(instPath)) {
            screensFolder = path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        }
        screensFolder = path.join(screensFolder, 'screenshots');
        
        await fs.unlink(path.join(screensFolder, fileName));
        return { success: true };
    } catch (e) {
        console.error('Error deleting screenshot:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('get-instance-mods', async (event, instPath) => {
    try {
        let modsFolder = instPath;
        if (!path.isAbsolute(instPath)) {
            modsFolder = path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        }
        modsFolder = path.join(modsFolder, 'mods');
        
        if (!fsOriginal.existsSync(modsFolder)) return [];
        const files = await fs.readdir(modsFolder);
        const jars = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
        
        const modMetadataList = [];
        for (let i = 0; i < jars.length; i++) {
            if (i % 5 === 0) await new Promise(r => setImmediate(r));
            const jar = jars[i];
            const isEnabled = !jar.endsWith('.disabled');
            const meta = await parseModMetadata(path.join(modsFolder, jar), jar);
            meta.isEnabled = isEnabled;
            if (meta.name === jar) {
                meta.name = jar.replace('.disabled', '');
            }
            modMetadataList.push(meta);
        }
        
        return modMetadataList;
    } catch(e) {
        console.error(e);
        return [];
    }
});

ipcMain.handle('get-instance-content', async (event, instPath) => {
    try {
        const absPath = path.isAbsolute(instPath) ? instPath : path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        const result = { mods: [], resourcepacks: [], shaders: [] };

        // Mods with metadata, yielding every 5 to avoid blocking
        const modsDir = path.join(absPath, 'mods');
        if (fsOriginal.existsSync(modsDir)) {
            const files = await fs.readdir(modsDir);
            const jars = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));
            for (let i = 0; i < jars.length; i++) {
                if (i % 5 === 0) await new Promise(r => setImmediate(r));
                const jar = jars[i];
                const meta = await parseModMetadata(path.join(modsDir, jar), jar);
                meta.isEnabled = !jar.endsWith('.disabled');
                meta.subDir = 'mods';
                if (meta.name === jar) meta.name = jar.replace(/\.disabled$/, '');
                result.mods.push(meta);
            }
        }

        // Resource packs (no icon metadata, just filename)
        const rpDir = path.join(absPath, 'resourcepacks');
        if (fsOriginal.existsSync(rpDir)) {
            const files = await fs.readdir(rpDir);
            result.resourcepacks = files
                .filter(f => f.endsWith('.zip') || f.endsWith('.zip.disabled'))
                .map(f => ({
                    name: f.replace(/\.disabled$/, ''),
                    jar: f,
                    version: '',
                    author: '',
                    icon: null,
                    isEnabled: !f.endsWith('.disabled'),
                    subDir: 'resourcepacks'
                }));
        }

        // Shaders
        const shDir = path.join(absPath, 'shaderpacks');
        if (fsOriginal.existsSync(shDir)) {
            const files = await fs.readdir(shDir);
            result.shaders = files
                .filter(f => f.endsWith('.zip') || f.endsWith('.zip.disabled') || f.endsWith('.txt'))
                .map(f => ({
                    name: f.replace(/\.disabled$/, ''),
                    jar: f,
                    version: '',
                    author: '',
                    icon: null,
                    isEnabled: !f.endsWith('.disabled'),
                    subDir: 'shaderpacks'
                }));
        }

        return result;
    } catch(e) {
        console.error(e);
        return { mods: [], resourcepacks: [], shaders: [] };
    }
});

ipcMain.handle('delete-content-file', async (event, { instPath, subDir, fileName }) => {
    try {
        const absPath = path.isAbsolute(instPath) ? instPath : path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        const filePath = path.join(absPath, subDir, fileName);
        await fs.rm(filePath, { force: true });
        return { success: true };
    } catch(e) {
        console.error('delete-content-file error:', e);
        return { success: false, message: e.message };
    }
});

ipcMain.handle('toggle-mod', async (event, instPath, fileName, enable, subDir) => {
    try {
        let baseFolder = path.isAbsolute(instPath) ? instPath : path.join(app.getPath("appData"), ".hexa", "instances", instPath);
        const folder = path.join(baseFolder, subDir || 'mods');

        const currentPath = path.join(folder, fileName);
        let newFileName = fileName;

        if (enable && fileName.endsWith('.disabled')) {
            newFileName = fileName.replace(/\.disabled$/, '');
        } else if (!enable && !fileName.endsWith('.disabled')) {
            newFileName = fileName + '.disabled';
        }

        const newPath = path.join(folder, newFileName);

        if (currentPath !== newPath) {
            await fs.rename(currentPath, newPath);
        }
        return { success: true, newFileName };
    } catch (e) {
        console.error('Toggle mod error:', e);
        return { success: false, message: e.message };
    }
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
    if (mainWindow) mainWindow.webContents.send('log', "Anti-Cheat: V�rification des fichiers...");
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
    const tempDir = path.join(app.getPath('temp'), 'hexa-launcher-modpack');
    try {
        await fs.rm(tempDir, { recursive: true, force: true });
        console.log("Temporary modpack folder cleared.");
    } catch (e) {
        console.warn("Could not clear temp dir (might be first run):", e.message);
    }
    const packPath = path.join(tempDir, 'modpack.mrpack');
    try {
        await fs.mkdir(tempDir, { recursive: true });
        if (mainWindow) mainWindow.webContents.send('log', `Nettoyage de l'instance avant mise � jour...`);
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
        if (mainWindow) mainWindow.webContents.send('log', `T�l�chargement du modpack...`);
        console.log("Downloading modpack from", url);
        const res = await fetch(url, { headers: { "User-Agent": "HexaLauncher/1.0 (contact@strator.gg)" } });
        if (!res.ok) throw new Error(`Failed to download modpack: ${res.statusText}`);
        const fileStream = fsOriginal.createWriteStream(packPath);
        await new Promise((resolve, reject) => {
            res.body.pipe(fileStream);
            res.body.on("error", reject);
            fileStream.on("finish", resolve);
        });
        if (mainWindow) mainWindow.webContents.send('log', `Extracting modpack...`);
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
                        console.error("!!! COUPABLE TROUV� DANS OVERRIDES !!! ->", f);
                        if (mainWindow) mainWindow.webContents.send('log', `?? COUPABLE TROUV� DANS OVERRIDES: ${path.basename(f)}`);
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
                 console.error("!!! COUPABLE TROUV� DANS INDEX.JSON !!! ->", f.path);
                 if (mainWindow) mainWindow.webContents.send('log', `?? COUPABLE TROUV� DANS JSON: ${f.path}`);
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
        if (mainWindow) mainWindow.webContents.send('log', `V�rification des ${totalFiles} mods...`);
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
                const fileRes = await fetch(fileUrl, { headers: { "User-Agent": "HexaLauncher/1.0 (contact@strator.gg)" } });
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
                 mainWindow.webContents.send('log', `V�rification/Installation: ${downloaded}/${totalFiles}`);
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
            if (mainWindow) mainWindow.webContents.send('log', `Installation des configurations (Overrides)...`);
            console.log("Copying overrides from:", overridesDir);
            await copyDir(overridesDir, installPath);
        } catch (e) {
            console.error("Overrides copy failed or empty:", e);
            if (mainWindow) mainWindow.webContents.send('log', `Note: No overrides or copy error (${e.message})`);
        }
        return { gameVersion, loader };
    } catch (err) {
        console.error("Modpack installation failed", err);
        throw err;
    }
}

// --- LOADER INSTALLER HELPER (Ported from Hexa) ---
const { exec } = require('child_process');

async function installLoader(loaderType, mcVer, javaExec, mainWindow) {
    const launcherRoot = path.join(app.getPath('appData'), '.hexa');
    const loadersDir = path.join(launcherRoot, 'loaders');
    await fs.mkdir(loadersDir, { recursive: true });

    console.log(`[HG] Request to install ${loaderType} for ${mcVer}`);

    // Determine URLs and Files
    let downloadUrl = "";
    let installerPath = "";
    let targetId = "";

    if (loaderType === 'neoforge') {
        let neoVer = (mcVer === '1.21.1') ? "21.1.42" : 
                     (mcVer === '1.20.4') ? "20.4.237" :
                     (mcVer === '1.20.1') ? "47.1.106" : ""; 
        
        if (!neoVer) {
             try {
                const res = await fetch(`https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`);
                if(res.ok) {
                    const data = await res.json();
                    const prefix = mcVer.split('.')[1]; 
                    const candidates = data.versions.filter(v => v.startsWith(prefix));
                    if (candidates.length > 0) neoVer = candidates[candidates.length - 1];
                }
             } catch(e) {}
        }
        if (!neoVer) throw new Error(`Could not determine NeoForge for ${mcVer}`);

        downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVer}/neoforge-${neoVer}-installer.jar`;
        installerPath = path.join(loadersDir, `neoforge-${mcVer}-${neoVer}-installer.jar`);
    } else if (loaderType === 'forge') {
        let forgeVer = (mcVer === '1.20.1') ? "47.2.0" :
                       (mcVer === '1.19.2') ? "43.3.0" :
                       (mcVer === '1.18.2') ? "40.2.0" :
                       (mcVer === '1.16.5') ? "36.2.34" :
                       (mcVer === '1.12.2') ? "14.23.5.2860" : ""; 
        
        if (!forgeVer) {
             try {
                  const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                  const promos = await promoRes.json();
                  forgeVer = promos.promos[`${mcVer}-recommended`] || promos.promos[`${mcVer}-latest`];
             } catch(e){}
        }
        if (!forgeVer) throw new Error(`Could not determine Forge for ${mcVer}`);

        downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVer}-${forgeVer}/forge-${mcVer}-${forgeVer}-installer.jar`;
        installerPath = path.join(loadersDir, `forge-${mcVer}-${forgeVer}-installer.jar`);
    } else {
        return null; // Fabric/Quilt handled by MCLC
    }

    // Download
    try {
        await fs.access(installerPath);
    } catch {
        if(mainWindow) mainWindow.webContents.send('log', `Downloading ${loaderType} installer...`);
        const dl = await fetch(downloadUrl);
        if (!dl.ok) throw new Error("Download failed: " + dl.statusText);
        const buffer = await dl.arrayBuffer();
        await fs.writeFile(installerPath, Buffer.from(buffer));
    }

    // Install
    const zip = new AdmZip(installerPath);
    const versionEntry = zip.getEntry('version.json');
    if (!versionEntry) throw new Error("Invalid Installer JAR");
    
    const versionJson = JSON.parse(zip.readAsText(versionEntry));
    targetId = versionJson.id;
    
    const targetVersionFile = path.join(launcherRoot, 'versions', targetId, `${targetId}.json`);
    
    try {
        await fs.access(targetVersionFile);
        console.log(`[HG] ${targetId} already installed.`);
        return targetId;
    } catch {}

    if(mainWindow) mainWindow.webContents.send('log', `Installing ${targetId}...`);

    // Profile Check
    const profilesPath = path.join(launcherRoot, 'launcher_profiles.json');
    try { await fs.access(profilesPath); } catch { await fs.writeFile(profilesPath, JSON.stringify({ profiles: {} })); }

    // Execute
    const installCmd = `"${javaExec}" -jar "${installerPath}" --installClient "${launcherRoot}"`;
    console.log(`[HG] Executing: ${installCmd}`);
    
    await new Promise((resolve, reject) => {
        exec(installCmd, (error, stdout, stderr) => {
            console.log(stdout); 
            if(error) {
                console.error(stderr);
                // NeoForge installer can be weird with exit codes, but usually 0 is success.
                // We check file existence later anyway.
                if (stderr.includes("Error")) reject(error);
                else resolve();
            } else resolve();
        });
    });

    try {
        await fs.access(targetVersionFile);
    } catch {
         throw new Error("Installation verification failed. Version JSON not found.");
    }
    
    return targetId;
}

// Generate a unique folder name for an instance (avoids timestamp suffixes)
function getUniqueInstanceFolder(name) {
    const instDir = path.join(app.getPath('appData'), '.hexa', 'instances');
    const safe = ((name || 'instance').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').toLowerCase()) || 'instance';
    let candidate = safe;
    let counter = 1;
    while (fsOriginal.existsSync(path.join(instDir, candidate))) {
        candidate = `${safe}_(${counter})`;
        counter++;
    }
    return candidate;
}

ipcMain.handle('create-instance', async (event, data) => {
    const { name, version, loader, cloudSync } = data;
    console.log('Create Instance Request:', data);

    const folder = getUniqueInstanceFolder(name);
    const rootPath = path.join(app.getPath('appData'), '.hexa');
    const instancePath = path.join(rootPath, 'instances', folder);

    try {
        // 1. Create Folder + standard subdirectories
        await fs.mkdir(instancePath, { recursive: true });
        for (const sub of ['mods', 'resourcepacks', 'screenshots', 'config', 'shaderpacks']) {
            await fs.mkdir(path.join(instancePath, sub), { recursive: true });
        }
        console.log(`[Instance] Created: ${instancePath} (${version}, ${loader})`);
        if (mainWindow) mainWindow.webContents.send('log', `Instance "${name}" created (${version}, ${loader})`);
        return { success: true, path: instancePath, folder };
    } catch (e) {
        console.error('Create Instance Failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('delete-instance', async (event, folderName) => {
    try {
        if (!folderName) return { success: false, error: 'No folder name specified' };
        const instPath = path.join(app.getPath('appData'), '.hexa', 'instances', folderName);
        await fs.rm(instPath, { recursive: true, force: true });
        console.log(`[delete-instance] Deleted: ${instPath}`);
        return { success: true };
    } catch (e) {
        console.error('[delete-instance]', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('stop-game', async () => {
    try {
        const { launcher: lc } = require('./launcher');
        const proc = lc && lc.childProcess;
        if (proc && proc.pid) {
            if (process.platform === 'win32') {
                require('child_process').exec(`taskkill /pid ${proc.pid} /T /F`, (err) => {
                    if (err) console.error('[StopGame] taskkill error:', err.message);
                    else console.log(`[StopGame] taskkill /T /F → PID ${proc.pid}`);
                });
            } else {
                proc.kill('SIGTERM');
            }
        } else {
            console.warn('[StopGame] No active child process found.');
        }
    } catch (e) { console.error('[StopGame]', e); }
    return { success: true };
});

ipcMain.handle('open-folder', async (event, folderPath) => {
    try {
        let targetPath = folderPath;
        if (!path.isAbsolute(folderPath)) {
            targetPath = path.join(app.getPath('appData'), '.hexa', 'instances', folderPath);
        }
        await fs.mkdir(targetPath, { recursive: true });
        require('electron').shell.openPath(targetPath);
    } catch (e) { console.error('[OpenFolder]', e); }
});


const { installModrinthPack, installCurseForgePack } = require('./modpack_installer');

ipcMain.handle('install-local-mrpack', async (event, data) => {
    try {
        const { filePath, instanceName } = data;
        const folderName = getUniqueInstanceFolder(instanceName || 'modpack');
        const rootPath = path.join(app.getPath('appData'), '.hexa');
        const instancePath = path.join(rootPath, 'instances', folderName);
        await fs.mkdir(instancePath, { recursive: true });

        // Copy the .mrpack to instance folder then process
        const tempPack = path.join(instancePath, '_local_pack.mrpack');
        await fs.copyFile(filePath, tempPack);

        const indexData = await installModrinthPack(tempPack, instancePath, (pct, msg) => {
            if (mainWindow) {
                event.sender.send('log', pct + '%: ' + msg);
                event.sender.send('install-progress', { instance: folderName, percent: pct, msg });
            }
        }, true /* isLocalFile */);

        return { success: true, path: instancePath, folder: folderName, indexData };
    } catch(e) {
        console.error('[install-local-mrpack]', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('install-local-curseforge', async (event, data) => {
    try {
        const { filePath, instanceName } = data;
        const folderName = getUniqueInstanceFolder(instanceName || 'modpack');
        const rootPath = path.join(app.getPath('appData'), '.hexa');
        const instancePath = path.join(rootPath, 'instances', folderName);
        await fs.mkdir(instancePath, { recursive: true });

        const result = await installCurseForgePack(filePath, instancePath, (pct, msg) => {
            if (mainWindow) {
                event.sender.send('log', pct + '%: ' + msg);
                event.sender.send('install-progress', { instance: folderName, percent: pct, msg });
            }
        });

        return { success: true, path: instancePath, folder: folderName, meta: result };
    } catch(e) {
        console.error('[install-local-curseforge]', e);
        return { success: false, error: e.message };
    }
});

// ── Scan instances from external launcher ───────────────────────────────────────
ipcMain.handle('scan-launcher-instances', async (event, { launcher }) => {
    const home = os.homedir();
    const curPaths = {
        curseforge: [
            path.join(home, 'curseforge', 'minecraft', 'Instances'),
            path.join(app.getPath('appData'), '..', 'Local', 'CurseForge', 'minecraft', 'Instances'),
        ],
        modrinth: [
            path.join(app.getPath('appData'), 'com.modrinth.theseus', 'profiles'),
            path.join(app.getPath('appData'), 'ModrinthApp', 'profiles'),
            path.join(os.homedir(), 'AppData', 'Roaming', 'com.modrinth.theseus', 'profiles'),
        ],
    };
    const paths = curPaths[launcher] || [];
    for (const searchPath of paths) {
        if (!fsOriginal.existsSync(searchPath)) continue;
        try {
            const entries = await fs.readdir(searchPath, { withFileTypes: true });
            const instances = [];
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const instPath = path.join(searchPath, entry.name);
                try {
                    let instData = null;
                    if (launcher === 'curseforge') {
                        const metaPath = path.join(instPath, 'minecraftinstance.json');
                        if (fsOriginal.existsSync(metaPath)) {
                            const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                            const loaderFull = meta.baseModLoader?.name || '';
                            instData = { name: meta.name || entry.name, version: meta.gameVersion || '', loader: loaderFull.split('-')[0] || 'vanilla', instancePath: instPath, iconBase64: null };
                            // Try multiple thumbnail locations/extensions
                            const thumbCandidates = [
                                path.join(instPath, 'thumbnail.png'),
                                path.join(instPath, 'thumbnail.jpg'),
                                path.join(instPath, 'thumbnail.jpeg'),
                                path.join(instPath, 'thumbnail.webp'),
                                path.join(instPath, 'icon.png'),
                                path.join(instPath, 'icon.jpg'),
                            ];
                            for (const tp of thumbCandidates) {
                                if (fsOriginal.existsSync(tp)) {
                                    const buf = await fs.readFile(tp);
                                    const ext = path.extname(tp).slice(1).replace('jpg', 'jpeg');
                                    instData.iconBase64 = `data:image/${ext};base64,` + buf.toString('base64');
                                    break;
                                }
                            }
                            // Also try icon URL from minecraftinstance.json
                            if (!instData.iconBase64) {
                                const iconUrl =
                                    meta.installedModpack?.thumbnailUrl ||
                                    meta.installedModpack?.thumbnailURL ||
                                    meta.installedAddons?.[0]?.installedFile?.thumbnailUrl ||
                                    meta.installedAddons?.[0]?.installedFile?.thumbnailURL ||
                                    meta.installedAddons?.[0]?.thumbnailUrl;
                                if (iconUrl) instData.iconBase64 = iconUrl; // use as src directly
                            }
                        }
                    } else if (launcher === 'modrinth') {
                        const metaPath = path.join(instPath, 'profile.json');
                        if (fsOriginal.existsSync(metaPath)) {
                            const meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
                            // loader can be a string ("fabric") or an object ({type:"fabric"})
                            const loaderVal = typeof meta.loader === 'string'
                                ? meta.loader
                                : (meta.loader?.type || 'vanilla');
                            instData = { name: meta.name || entry.name, version: meta.game_version || '', loader: loaderVal, instancePath: instPath, iconBase64: null };
                            if (meta.icon) {
                                const iconPath = path.isAbsolute(meta.icon) ? meta.icon : path.join(instPath, meta.icon);
                                if (fsOriginal.existsSync(iconPath)) {
                                    const buf = await fs.readFile(iconPath);
                                    instData.iconBase64 = 'data:image/png;base64,' + buf.toString('base64');
                                }
                            }
                        }
                    }
                    if (instData) instances.push(instData);
                } catch (e) { /* skip bad instance */ }
            }
            if (instances.length > 0) return { success: true, instances };
        } catch (e) { /* try next path */ }
    }
    return { success: false, error: `${launcher} not found or no instances on this machine.` };
});

// ── Install .hexa backup file ───────────────────────────────────────────────────
ipcMain.handle('install-hexa-instance', async (event, { filePath: hexaPath, instanceName }) => {
    try {
        const folderName = getUniqueInstanceFolder(instanceName || 'restored');
        const rootPath = path.join(app.getPath('appData'), '.hexa');
        const destPath = path.join(rootPath, 'instances', folderName);
        await fs.mkdir(destPath, { recursive: true });
        if (mainWindow) mainWindow.webContents.send('install-progress', { instance: folderName, percent: 5, msg: 'Reading .hexa backup…' });
        const zip = new AdmZip(hexaPath);
        const metaEntry = zip.getEntry('instance.json');
        if (!metaEntry) throw new Error('Invalid .hexa file: instance.json is missing');
        const meta = JSON.parse(metaEntry.getData().toString('utf8'));
        if (mainWindow) mainWindow.webContents.send('install-progress', { instance: folderName, percent: 20, msg: 'Extracting files…' });
        const entries = zip.getEntries().filter(e => e.entryName.startsWith('files/') && !e.isDirectory);
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const rel = entry.entryName.slice('files/'.length);
            if (!rel) continue;
            const dest = path.join(destPath, rel);
            await fs.mkdir(path.dirname(dest), { recursive: true });
            zip.extractEntryTo(entry, path.dirname(dest), false, true);
            if (i % 10 === 0) {
                const percent = 20 + Math.round((i / entries.length) * 78);
                if (mainWindow) mainWindow.webContents.send('install-progress', { instance: folderName, percent, msg: `Extracting ${i + 1}/${entries.length}…` });
            }
        }
        if (mainWindow) mainWindow.webContents.send('install-progress', { instance: folderName, percent: 100, msg: 'Restore complete!' });
        return { success: true, path: destPath, folder: folderName, meta };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('install-content', async (event, data) => {
    try {
        const { url, fileName, folderName, type } = data;
        const rootPath = require('path').join(require('electron').app.getPath('appData'), '.hexa');
        let subDir = 'mods';
        if (type === 'shader') subDir = 'shaderpacks';
        if (type === 'resourcepack') subDir = 'resourcepacks';
        const destDir = require('path').join(rootPath, 'instances', folderName, subDir);
        const dest = require('path').join(destDir, fileName);
        
        // Ensure folder exists
        const fs = require('fs/promises');
        await fs.mkdir(destDir, { recursive: true });

        await downloadFile(url, dest);
        return { success: true, path: dest };
    } catch (e) {
        console.error('Install Content Failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('install-modpack', async (event, data) => {

    try {
        const { url, name, folderName } = data;
        const rootPath = require('path').join(require('electron').app.getPath('appData'), '.hexa');
        const instancePath = require('path').join(rootPath, 'instances', folderName);

        await installModrinthPack(url, instancePath, (progress, message) => {
            if (mainWindow) {
                event.sender.send('log', progress + '%: ' + message);
                event.sender.send('install-progress', { instance: folderName, percent: progress, msg: message });
            }
        });

        return { success: true, path: instancePath };
    } catch (e) {
        console.error('Install Modpack Failed:', e);
        return { success: false, error: e.message };
    }
});





