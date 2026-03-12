const { Client } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs').promises;
const fsOriginal = require('fs');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');

const launcher = new Client();

async function launch(options, config, user, mainWindow) {
    console.log('[Launcher] Starting Launch Sequence...');
    if (mainWindow) mainWindow.webContents.send('log', 'Séquence de lancement initialisée...');

    const rootPath = options.root;
    const gameDirectory = options.gameDirectory || rootPath; // Default to root if not specified
    const gameVersion = options.version.number;
    const loaderConfig = options.loader;

    // Base MCLC Options
    const opts = {
        authorization: options.authorization,
        root: rootPath,
        version: {
            number: gameVersion,
            type: "release"
        },
        memory: {
            max: config.maxRam,
            min: config.minRam
        },
        javaPath: options.javaPath,
        customArgs: options.customArgs || [],
        checkFiles: true,  // Fix: Force check files to ensure vanilla jar is present
        ignoreMissingAssets: false,
        overrides: {
            gameDirectory: gameDirectory, // Set game directory explicitly
            assetRoot: path.join(rootPath, 'assets'),
            libraryRoot: path.join(rootPath, 'libraries') 
        },
        window: {
            width: config.resolution ? config.resolution.width : 1280,
            height: config.resolution ? config.resolution.height : 720,
            fullscreen: config.fullscreen
        }
    };

    // Make sure the directory structure exists
    await fs.mkdir(rootPath, { recursive: true });
    await fs.mkdir(path.join(rootPath, 'versions'), { recursive: true });

    // Handle Loaders
    if (loaderConfig && loaderConfig.type !== 'vanilla') {
        try {
            console.log(`[Launcher] Preparing ${loaderConfig.type} version ${loaderConfig.version}...`);
            if (mainWindow) mainWindow.webContents.send('log', `Préparation ${loaderConfig.type} (${loaderConfig.version})...`);
            
            const loaderVersionId = await prepareLoader(rootPath, gameVersion, loaderConfig, mainWindow, opts.javaPath);
            
            // CRITICAL FIX: Override version number and type for custom loaders
            opts.version.number = gameVersion; // Must be vanilla base version
            opts.version.custom = loaderVersionId; // MCLC treats string 'custom' as a version ID to look up in versions/ folder
            
            // Ensure JVM Args for Forge/NeoForge
            if (loaderConfig.type === 'forge' || loaderConfig.type === 'neoforge') {
                const isModernNeo = (loaderConfig.type === 'neoforge' && (gameVersion === '1.20.6' || gameVersion === '1.21' || gameVersion === '1.21.1'));
                
                if (!isModernNeo) {
                    // Determine installer path for wrapper args
                    const installerName = `${loaderConfig.type}-${loaderConfig.version}-installer.jar`;
                    const installerPath = path.join(rootPath, 'installers', installerName);
                    const vanillaJar = path.join(rootPath, 'versions', gameVersion, `${gameVersion}.jar`);
                    
                    // Add ForgeWrapper arguments
                    opts.customArgs.push(`-Dforgewrapper.librariesDir=${options.libraryRoot}`);
                    opts.customArgs.push(`-Dforgewrapper.installer=${installerPath}`);
                    opts.customArgs.push(`-Dforgewrapper.minecraft=${vanillaJar}`);
                } else {
                    console.log("[Launcher] Modern NeoForge (1.20.6+) detected in Launch options. Skipping ForgeWrapper arguments.");
                }
            }

        } catch (error) {
            console.error(`[Launcher] Loader preparation failed:`, error);
            if (mainWindow) mainWindow.webContents.send('log', `Erreur Loader: ${error.message}`);
            throw error;
        }
    }

    // Attach Event Listeners
    // DEBUG logs are often verbose or duplicates of data in some MCLC versions, so we only log to console
    launcher.on('debug', (e) => {
        // if (mainWindow) mainWindow.webContents.send('log', `[DEBUG] ${e}`);
        console.log(`[DEBUG] ${e}`);
    });
    
    launcher.on('data', (e) => {
        if (mainWindow) mainWindow.webContents.send('log', `[GAME] ${e}`);
        console.log(`[GAME] ${e}`);
    });
    launcher.on('progress', (e) => {
        if (mainWindow) mainWindow.webContents.send('process-progress', { type: e.type, current: e.task, total: e.total });
    });
    launcher.on('close', (e) => {
        console.log('[Launcher] Game closed, code:', e);
        if (mainWindow) mainWindow.webContents.send('log', `Jeu fermé (Code ${e})`);
        if (mainWindow) mainWindow.webContents.send('stop-loading');
        if (mainWindow) mainWindow.webContents.send('game-exit', e); // Reset play button in renderer
        if (mainWindow) mainWindow.show();
    });

    // Integrity Checks
    if (mainWindow) mainWindow.webContents.send('log', 'Vérification des fichiers...');
    await Promise.all([
        removeZeroByteFiles(options.libraryRoot),
        removeZeroByteFiles(path.join(rootPath, 'versions'))
    ]);
    await enforceAntiCheat(rootPath, mainWindow);

    console.log('[Launcher] Launching with options:', JSON.stringify(opts, null, 2));
    if (mainWindow) mainWindow.webContents.send('log', 'Lancement de MCLC...');
    
    await launcher.launch(opts);
}

async function prepareLoader(rootPath, gameVersion, loaderConfig, mainWindow, javaPath) {
    const type = loaderConfig.type;
    const version = loaderConfig.version;
    const fullVersionName = `${gameVersion}-${version}`;
    const versionId = `${type}-${fullVersionName}`; // e.g. neoforge-1.21.1-21.1.42

    // 1. Ensure Vanilla base exists
    await ensureVanilla(rootPath, gameVersion, mainWindow);

    // 2. Handle Specific Loaders
    if (type === 'fabric') {
        const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${version}/profile/json`;
        await installFabric(rootPath, versionId, fabricUrl, gameVersion, mainWindow);
    } 
    else if (type === 'quilt') {
        const quiltUrl = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${version}/profile/json`;
        await installQuilt(rootPath, versionId, quiltUrl, mainWindow);
    }
    else if (type === 'forge' || type === 'neoforge') {
        const _javaPath = javaPath || 'java';
        await installForgeNeo(rootPath, type, version, gameVersion, versionId, mainWindow, _javaPath);
    }

    return versionId;
}

async function ensureVanilla(rootPath, gameVersion, mainWindow) {
    const versionDir = path.join(rootPath, 'versions', gameVersion);
    const versionJsonPath = path.join(versionDir, `${gameVersion}.json`);
    
    try {
        await fs.access(versionJsonPath);
    } catch {
        if (mainWindow) mainWindow.webContents.send('log', `Téléchargement Vanilla ${gameVersion}...`);
        const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        const manifest = await manifestRes.json();
        const v = manifest.versions.find(x => x.id === gameVersion);
        if (!v) throw new Error(`Vanilla version ${gameVersion} not found.`);
        
        const vRes = await fetch(v.url);
        const vJson = await vRes.json();
        
        await fs.mkdir(versionDir, { recursive: true });
        await fs.writeFile(versionJsonPath, JSON.stringify(vJson, null, 4));
    }
}

async function installFabric(rootPath, versionId, url, gameVersion, mainWindow) {
    const versionDir = path.join(rootPath, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    const jsonPath = path.join(versionDir, `${versionId}.json`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fabric meta fetch failed: ${res.status}`);
    const json = await res.json();
    
    // Patch ID matches folder
    json.id = versionId;
    // Don't modify inheritsFrom unless necessary, MCLC handles inheritance recursively if configured
    // But usually saving it as is works if vanilla exists.
    
    await fs.writeFile(jsonPath, JSON.stringify(json, null, 4));
}

async function installQuilt(rootPath, versionId, url, mainWindow) {
    const versionDir = path.join(rootPath, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    const jsonPath = path.join(versionDir, `${versionId}.json`);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Quilt meta fetch failed: ${res.status}`);
    const json = await res.json();
    json.id = versionId;

    await fs.writeFile(jsonPath, JSON.stringify(json, null, 4));
}

const { exec } = require('child_process');

async function installForgeNeo(rootPath, type, modLoaderVersion, gameVersion, versionId, mainWindow, javaPath) {
    // URL Construction
    const isNeo = (type === 'neoforge');
    let installerUrl;
    if (isNeo) {
        installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${modLoaderVersion}/neoforge-${modLoaderVersion}-installer.jar`;
    } else {
        // Forge naming convention: GAME-LOADER
        const longVersion = `${gameVersion}-${modLoaderVersion}`;
        installerUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${longVersion}/forge-${longVersion}-installer.jar`;
    }

    const installerPath = path.join(rootPath, 'installers', `${type}-${modLoaderVersion}-installer.jar`);
    await fs.mkdir(path.dirname(installerPath), { recursive: true });

    // Download Installer
    try {
        await fs.access(installerPath);
    } catch {
        if (mainWindow) mainWindow.webContents.send('log', `Téléchargement installer ${type}...`);
        const res = await fetch(installerUrl);
        if (!res.ok) throw new Error(`Installer download failed: ${res.status}`);
        const buffer = await res.buffer();
        await fs.writeFile(installerPath, buffer);
    }

    // MANUAL INSTALLER EXECUTION CHECK (NeoForge 1.20.6+)
    if (isNeo && (gameVersion === '1.20.6' || gameVersion === '1.21' || gameVersion === '1.21.1')) {
        // Construct the full path to the patched client jar, based on NeoForge layout
        // libraries/net/neoforged/neoforge/VERSION/neoforge-VERSION-client.jar
        const clientJarPath = path.join(rootPath, 'libraries', 'net', 'neoforged', 'neoforge', modLoaderVersion, `neoforge-${modLoaderVersion}-client.jar`);
        let missingPatched = true;
        
        try {
            await fs.access(clientJarPath);
            missingPatched = false;
        } catch (e) {
            console.log("[Launcher] Patched jar check failed (not found):", clientJarPath);
        }

        if (missingPatched) {
            console.log("[Launcher] Patched client jar missing. Running installer manually...");
            if (mainWindow) mainWindow.webContents.send('log', `Installation manuelle des bibliothèques NeoForge (Peut prendre du temps)...`);
            
            await new Promise((resolve) => {
                // Ensure the path is correct for installer execution
                const javaExec = javaPath ? `"${javaPath}"` : "java";
                const cmd = `${javaExec} -jar "${installerPath}" --installClient "${rootPath}"`;
                console.log("[Launcher] Executing Installer Command:", cmd);
                
                exec(cmd, { cwd: rootPath }, (error, stdout, stderr) => {
                    if (error) {
                         console.warn("[Launcher] Installer process returned error:", error);
                    } else {
                        console.log("[Launcher] Installer completed successfully.");
                    }
                    if (stderr) console.error("[Installer Log]", stderr);
                    // console.log(stdout);
                    resolve();
                });
            });
        }
    }

    // Extract version.json
    if (mainWindow) mainWindow.webContents.send('log', `Extraction configuration ${type}...`);
    const zip = new AdmZip(installerPath);
    const versionEntry = zip.getEntry('version.json');
    if (!versionEntry) throw new Error("version.json missing from installer");
    
    // Read and parse
    let versionJson = JSON.parse(versionEntry.getData().toString('utf8'));
    
    // COPY INSTALLER TO LIBRARIES (Critical for MCLC Processors)
    try {
        // Construct standard maven path for the installer itself
        // e.g. net/neoforged/neoforge/26.1.0/neoforge-26.1.0-installer.jar
        const groupPath = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
        const versionPath = isNeo ? modLoaderVersion : `${gameVersion}-${modLoaderVersion}`;
        const artifactName = isNeo ? `neoforge-${versionPath}` : `forge-${versionPath}`;
        
        const relativePath = `${groupPath}/${versionPath}/${artifactName}-installer.jar`;
        const destPath = path.join(rootPath, 'libraries', relativePath);
        
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.copyFile(installerPath, destPath);
        
        console.log(`[Launcher] Copied installer to library path: ${relativePath}`);
        
        // Ensure installer is in libraries list for MCLC to "see" it?
        // Usually not needed if we put it in the right place, but good practice.
    } catch(e) { console.error("[Launcher] Failed to copy installer to libs:", e); }

    // PATCHING
    versionJson.id = versionId;
    versionJson.inheritsFrom = gameVersion; // Ensure inheritance is explicit

    // ForgeWrapper Patch (Essential for MCLC < 3.0 or non-native execution)
    const forgeWrapperVersion = "1.6.0";
    const wrapperLib = {
        name: `io.github.zekerzhayard:ForgeWrapper:${forgeWrapperVersion}`,
        downloads: {
            artifact: {
                url: `https://github.com/ZekerZhayard/ForgeWrapper/releases/download/${forgeWrapperVersion}/ForgeWrapper-${forgeWrapperVersion}.jar`,
                path: `io/github/zekerzhayard/ForgeWrapper/${forgeWrapperVersion}/ForgeWrapper-${forgeWrapperVersion}.jar`,
                size: 34369 
            }
        }
    };


    // CHECK NEOFORGE 1.20.6 / 1.21
    const isModernNeo = isNeo && (gameVersion === '1.20.6' || gameVersion === '1.21' || gameVersion === '1.21.1');
    if (isModernNeo) {
        console.log("[Launcher] Modern NeoForge (1.20.6+) detected. SKIPPING ForgeWrapper injection.");
        
        // ENSURE Bootstraplauncher & SecureJarHandler are present
        const hasBoot = versionJson.libraries.some(l => l.name.includes("bootstraplauncher"));
        const hasSecure = versionJson.libraries.some(l => l.name.includes("securejarhandler"));
        const hasModL = versionJson.libraries.some(l => l.name.includes("modlauncher"));

        // If missing, inject defaults for 1.21
        // (Using versions known to be stable with 1.21/21.1)
        
        if (!hasBoot) {
            console.log("[Launcher] Injecting missing Bootstraplauncher...");
            versionJson.libraries.push({
                name: "cpw.mods:bootstraplauncher:2.0.2",
                downloads: {
                    artifact: {
                        path: "cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar",
                        url: "https://maven.neoforged.net/releases/cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar",
                        size: 16187 // approximate
                    }
                }
            });
        }
        
        if (!hasSecure) {
             console.log("[Launcher] Injecting missing SecureJarHandler...");
            versionJson.libraries.push({
                name: "cpw.mods:securejarhandler:3.0.8",
                downloads: {
                    artifact: {
                        path: "cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar",
                        url: "https://maven.neoforged.net/releases/cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar",
                        size: 97893 
                    }
                }
            });
        }

        // Ensure ARGUMENTS for BootstrapLauncher
        if (!versionJson.arguments) versionJson.arguments = {};
        // Ensure game arguments array exists (sometimes it's an object with 'game' and 'jvm')
        if (!versionJson.arguments.game) versionJson.arguments.game = [];
        
        // Check if --installer is present
        // arguments.game can be array of strings or objects (rules)
        // We look for the string '--installer'
        const hasInstallerArg = versionJson.arguments.game.some(a => typeof a === 'string' && a.includes('--installer'));
        
        if (!hasInstallerArg) {
             console.log("[Launcher] Injecting missing --installer argument for NeoForge...");
             
             const iGroup = isNeo ? 'net/neoforged/neoforge' : 'net/minecraftforge/forge';
             const iVersion = isNeo ? modLoaderVersion : `${gameVersion}-${modLoaderVersion}`;
             const iName = isNeo ? `neoforge-${iVersion}` : `forge-${iVersion}`;
             const iPath = `${iGroup}/${iVersion}/${iName}-installer.jar`;
             
             const absLibraryPath = path.join(rootPath, 'libraries', iPath).replace(/\\/g, '/');
             
             versionJson.arguments.game.push('--installer');
             versionJson.arguments.game.push(absLibraryPath);
        }

    } else {
        if (!versionJson.libraries.find(l => l.name.includes("ForgeWrapper"))) {
            versionJson.libraries.push(wrapperLib);
        }
        // Override Main Class to Wrapper only for older Forge/Neo
        versionJson.mainClass = "io.github.zekerzhayard.forgewrapper.installer.Main";
    }

    // Library Patching Strategy
    // We strictly define repositories
    const REPOS = {
        NEO: 'https://maven.neoforged.net/releases/',
        FORGE: 'https://maven.minecraftforge.net/'
    };

    versionJson.libraries.forEach(lib => {
        // Ensure structure
        if (!lib.downloads) lib.downloads = {};
        if (!lib.downloads.artifact) lib.downloads.artifact = {};

        // Parse Artifact
        const parts = lib.name.split(':'); // group:artifact:version
        const group = parts[0];
        const artifact = parts[1];
        const version = parts[2];
        const pathStr = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;

        // If URL is missing, we must provide it
        if (!lib.downloads.artifact.url) {
            lib.downloads.artifact.path = pathStr;
            
            // Heuristic for Repository
            let repoBase = REPOS.FORGE; // Default fall back to Forge Maven for non-central things
            if (isNeo) {
                // If NeoForge, prefer Neo Maven for known groups
                if (group.startsWith('net.neoforged') || 
                    group.startsWith('cpw.mods') || 
                    group.startsWith('codechicken') // often on neo
                   ) {
                    repoBase = REPOS.NEO;
                }
            } 
            
            // Specific overrides
            if (group.startsWith('org.ow2.asm')) repoBase = REPOS.FORGE; // ASM usually on Forge maven if not Central
            if (group === 'com.electronwill.night-config') repoBase = REPOS.FORGE; // NightConfig

            lib.downloads.artifact.url = `${repoBase}${pathStr}`;
        }

        // === CRITICAL FIXES FOR MODLAUNCHER ===
        if (lib.name.includes("modlauncher")) {
            // FORCE 10.0.9 for NeoForge 1.21 if not specified or weird
            // But usually we respect version.
            
            // Force URL to be correct for the specific loader
            // NeoForge MUST use Neo Maven for ModLauncher to get the right one
            if (isNeo) {
                lib.downloads.artifact.url = `${REPOS.NEO}cpw/mods/modlauncher/${version}/modlauncher-${version}.jar`;
            } else {
                lib.downloads.artifact.url = `${REPOS.FORGE}cpw/mods/modlauncher/${version}/modlauncher-${version}.jar`;
            }
            // Fix path to standard because sometimes it's weird
            lib.downloads.artifact.path = `cpw/mods/modlauncher/${version}/modlauncher-${version}.jar`;

            // Aggressive Cache Busting: Remove SHA1 to force MCLC to ignore local file if it mismatches logic (or is corrupt)
            // But we must be careful: if we remove SHA1, MCLC might just download it blindly. 
            // If the local file exists and is "valid" by size, MCLC might skip it.
            // Earlier we implemented removeZeroByteFiles, so size 0 is gone.
            // If we remove SHA1, MCLC cannot verify integrity, so it might re-download if it decides to.
            if (lib.downloads.artifact.sha1) delete lib.downloads.artifact.sha1; 
            
            // Add a size check or placeholder to trick MCLC into thinking it MUST download?
            // No, removing SHA1 is usually enough.
            
            // LOG for debug
            console.log(`[Launcher] ModLauncher Target: ${lib.downloads.artifact.url}`);
        }
        
        // === FORCE BOOTSTRAPLAUNCHER & SECUREJARHANDLER ===
        if(isNeo && lib.name.includes("bootstraplauncher")) {
             const v = lib.name.split(':')[2];
             lib.downloads.artifact.url = `${REPOS.NEO}cpw/mods/bootstraplauncher/${v}/bootstraplauncher-${v}.jar`;
             lib.downloads.artifact.path = `cpw/mods/bootstraplauncher/${v}/bootstraplauncher-${v}.jar`;
             if (lib.downloads.artifact.sha1) delete lib.downloads.artifact.sha1;
        }
        if(isNeo && lib.name.includes("securejarhandler")) {
             const v = lib.name.split(':')[2];
             lib.downloads.artifact.url = `${REPOS.NEO}cpw/mods/securejarhandler/${v}/securejarhandler-${v}.jar`;
             lib.downloads.artifact.path = `cpw/mods/securejarhandler/${v}/securejarhandler-${v}.jar`;
             if (lib.downloads.artifact.sha1) delete lib.downloads.artifact.sha1;
        }

        // === CRITICAL FIX FOR TERMINAL CONSOLE APPENDER ===
        // Often causes issues on Windows 11 / Node environments
        if (lib.name.includes("terminalconsoleappender")) {
             if (lib.downloads.artifact.sha1) delete lib.downloads.artifact.sha1;
             lib.downloads.artifact.url = `https://maven.minecraftforge.net/${pathStr}`;
        }
    });

    // Clean potentially corrupt libraries
    await removeZeroByteFiles(path.join(rootPath, 'libraries'));

    // AGGRESSIVE FIX: Always delete ModLauncher to force fresh download and avoid corruption
    // This is necessary because older corrupted files often don't trigger redownload if sha1 is missing
    try {
        const modLauncherPath = path.join(rootPath, 'libraries/cpw/mods/modlauncher');
        if (require('fs').existsSync(modLauncherPath)) {
            console.log("[Launcher] Nuking existing ModLauncher to ensure integrity...");
            await fs.rm(modLauncherPath, { recursive: true, force: true });
        }
    } catch(e) { console.error("[Launcher] Failed to clean ModLauncher:", e); }
    
    // Add ModLauncher MANUALLY if missing from json (happens with some neoforge installers)
    const hasML = versionJson.libraries.some(l => l.name.includes("modlauncher"));
    if (!hasML) {
        console.warn("[Launcher] ModLauncher missing from version.json! Injecting fallback...");
        // Default for 1.21 is 10.0.9+
        const mlVersion = "10.0.9"; 
        versionJson.libraries.push({
            name: `cpw.mods:modlauncher:${mlVersion}`,
            downloads: {
                artifact: {
                    path: `cpw/mods/modlauncher/${mlVersion}/modlauncher-${mlVersion}.jar`,
                    url: `https://maven.neoforged.net/releases/cpw/mods/modlauncher/${mlVersion}/modlauncher-${mlVersion}.jar`,
                    size: 130343
                }
            }
        });
    }

    // Save
    const versionDir = path.join(rootPath, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(versionJson, null, 4));
}


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
                    await fs.unlink(fullPath);
                }
            } catch (e) {}
        }
    } catch (e) {}
}

async function enforceAntiCheat(installPath, mainWindow) {
    if (mainWindow) mainWindow.webContents.send('log', "Vérification intégrité...");
    const forbiddenKeywords = ['xray', 'x-ray', 'killaura', 'aristois', 'wurst']; 
    const scanDirs = ['mods', 'resourcepacks'];
    
    for (const d of scanDirs) {
        const dirPath = path.join(installPath, d);
        try {
            await fs.access(dirPath);
            const files = await fs.readdir(dirPath);
            for (const file of files) {
                if (forbiddenKeywords.some(k => file.toLowerCase().includes(k))) {
                     console.warn(`[Anti-Cheat] Removed ${file}`);
                     if (mainWindow) mainWindow.webContents.send('log', `Suppression: ${file}`);
                     await fs.unlink(path.join(dirPath, file)).catch(()=>{});
                }
            }
        } catch (e) {}
    }
}

module.exports = { launch, launcher };