const { Client } = require('minecraft-launcher-core');
const { exec }   = require('child_process');
const path       = require('path');
const fs         = require('fs').promises;
const fetch      = require('node-fetch');
const AdmZip     = require('adm-zip');

const launcher = new Client();

const REPOS = {
    NEO:   'https://maven.neoforged.net/releases/',
    FORGE: 'https://maven.minecraftforge.net/',
};

// ─── LAUNCH ──────────────────────────────────────────────────────────────────

async function launch(options, config, mainWindow) {
    const log = msg => { console.log(msg); mainWindow?.webContents.send('log', msg); };
    const sessionStart = Date.now();
    log('Séquence de lancement initialisée...');

    const rootPath    = options.root;
    const gameDir     = options.gameDirectory || rootPath;
    const gameVersion = options.version.number;
    const loaderCfg   = options.loader;

    await fs.mkdir(gameDir, { recursive: true });

    const opts = {
        authorization:      options.authorization,
        root:               rootPath,
        version:            { number: gameVersion, type: 'release' },
        memory:             { max: config.maxRam, min: config.minRam },
        javaPath:           options.javaPath,
        customArgs:         [...(options.customArgs || [])],
        checkFiles:         false,
        ignoreMissingAssets: false,
        overrides: {
            gameDirectory: gameDir,
            cwd:           gameDir,
            assetRoot:     path.join(rootPath, 'assets'),
            libraryRoot:   path.join(rootPath, 'libraries'),
        },
        window: {
            width:      config.resolution?.width  ?? 1280,
            height:     config.resolution?.height ?? 720,
            fullscreen: config.fullscreen ?? false,
        },
    };

    await fs.mkdir(path.join(rootPath, 'versions'), { recursive: true });

    if (loaderCfg?.type && loaderCfg.type !== 'vanilla') {
        const { versionId, jvmArgs } = await prepareLoader(rootPath, gameVersion, loaderCfg, mainWindow, opts.javaPath);
        opts.version.custom = versionId;
        if (jvmArgs?.length) opts.customArgs.push(...jvmArgs);

        if (loaderCfg.type === 'neoforge') {
            if (!opts.customArgs.includes('--enable-native-access=ALL-UNNAMED')) {
                opts.customArgs.push('--enable-native-access=ALL-UNNAMED');
            }
        } else if (loaderCfg.type === 'forge') {
            const installerPath = path.join(rootPath, 'installers', `forge-${loaderCfg.version}-installer.jar`);
            const vanillaJar    = path.join(rootPath, 'versions', gameVersion, `${gameVersion}.jar`);
            opts.customArgs.push(
                `-Dforgewrapper.librariesDir=${path.join(rootPath, 'libraries')}`,
                `-Dforgewrapper.installer=${installerPath}`,
                `-Dforgewrapper.minecraft=${vanillaJar}`,
            );
        }
    }

    launcher.removeAllListeners('debug');
    launcher.removeAllListeners('data');
    launcher.removeAllListeners('progress');
    launcher.removeAllListeners('close');
    launcher.on('debug',    e => console.log(`[DEBUG] ${e}`));
    launcher.on('data',     e => log(`[GAME] ${e}`));
    launcher.on('progress', e => mainWindow?.webContents.send('process-progress', { type: e.type, current: e.task, total: e.total }));
    launcher.on('close',    async code => {
        console.log('[Launcher] Game closed, code:', code);

        // ── Report playtime ──────────────────────────────────────────────────
        const minutes = Math.floor((Date.now() - sessionStart) / 60000);
        if (minutes > 0 && options.accessToken) {
            try {
                const body = { minutes };
                if (options.instanceFolder) body.instanceFolder = options.instanceFolder;
                await fetch('https://hexa-mc.fr/hexa/api/profile/playtime', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${options.accessToken}` },
                    body:    JSON.stringify(body),
                });
                console.log(`[Playtime] +${minutes} min reported (instance: ${options.instanceFolder || 'global only'})`);
                if (options.instanceFolder) {
                    mainWindow?.webContents.send('instance-playtime-refresh', options.instanceFolder);
                }
            } catch (e) {
                console.warn('[Playtime] Failed to report:', e.message);
            }
        }

        if (mainWindow) {
            mainWindow.webContents.send('log', `Jeu fermé (Code ${code})`);
            mainWindow.webContents.send('stop-loading');
            mainWindow.webContents.send('game-exit', code);
            mainWindow.show();
        }
    });

    log('Vérification des fichiers...');
    await Promise.all([
        removeZeroByteFiles(path.join(rootPath, 'libraries')),
        removeZeroByteFiles(path.join(rootPath, 'versions')),
    ]);
    await enforceAntiCheat(gameDir, mainWindow);

    console.log('[Launcher] Launch opts:', JSON.stringify(opts, null, 2));
    log('Lancement de MCLC...');
    await launcher.launch(opts);
}

// ─── PREPARE LOADER ──────────────────────────────────────────────────────────

async function prepareLoader(rootPath, gameVersion, loaderCfg, mainWindow, javaPath, onProgress) {
    const log = msg => { console.log(msg); mainWindow?.webContents.send('log', msg); };
    const { type, version } = loaderCfg;
    const versionId       = `${type}-${gameVersion}-${version}`;
    const versionJsonPath = path.join(rootPath, 'versions', versionId, `${versionId}.json`);

    if (await exists(versionJsonPath)) {
        try {
            const json = JSON.parse(await fs.readFile(versionJsonPath, 'utf8'));
            if (!hasUnresolvedTemplates(json)) {
                console.log(`[Launcher] ${type} ${version} already installed, skipping.`);
                onProgress?.(100, `${type} ${version} déjà installé`);
                return { versionId, jvmArgs: await loadCachedJvmArgs(versionJsonPath) };
            }
            console.log(`[Launcher] ${type} ${version}: unresolved templates detected, reinstalling...`);
        } catch {
            console.warn(`[Launcher] Corrupt JSON for ${versionId}, reinstalling...`);
        }
        await fs.rm(path.join(rootPath, 'versions', versionId), { recursive: true, force: true });
    }

    log(`Installation ${type} ${version} pour MC ${gameVersion}...`);
    await ensureVanilla(rootPath, gameVersion, mainWindow, onProgress);

    let jvmArgs = [];
    switch (type) {
        case 'fabric': {
            const url = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${version}/profile/json`;
            await installMetaLoader(rootPath, versionId, url, 'Fabric', mainWindow, onProgress);
            break;
        }
        case 'quilt': {
            const url = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${version}/profile/json`;
            await installMetaLoader(rootPath, versionId, url, 'Quilt', mainWindow, onProgress);
            break;
        }
        case 'forge':
        case 'neoforge':
            jvmArgs = await installForgeNeo(rootPath, type, version, gameVersion, versionId, mainWindow, javaPath || 'java', onProgress);
            break;
        default:
            throw new Error(`Loader inconnu: ${type}`);
    }

    log(`${type} ${version} installé.`);
    return { versionId, jvmArgs };
}

// ─── VANILLA ─────────────────────────────────────────────────────────────────

// onProgress(percent, label) — called throughout download, 0-100 relative to vanilla phase
async function ensureVanilla(rootPath, gameVersion, mainWindow, onProgress) {
    const log  = msg => { console.log(msg); mainWindow?.webContents.send('log', msg); };
    const prog = (pct, label) => { log(label); onProgress?.(pct, label); };

    const versionDir = path.join(rootPath, 'versions', gameVersion);
    const jsonPath   = path.join(versionDir, `${gameVersion}.json`);
    const jarPath    = path.join(versionDir, `${gameVersion}.jar`);

    prog(0, `Vanilla ${gameVersion} — vérification...`);

    let versionJson;
    if (!await exists(jsonPath)) {
        prog(5, `Téléchargement manifest Vanilla...`);
        const manifest = await fetchJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        const entry    = manifest.versions.find(v => v.id === gameVersion);
        if (!entry) throw new Error(`Version Vanilla ${gameVersion} introuvable dans le manifest`);
        prog(10, `Téléchargement JSON Vanilla ${gameVersion}...`);
        versionJson = await fetchJson(entry.url);
        await fs.mkdir(versionDir, { recursive: true });
        await fs.writeFile(jsonPath, JSON.stringify(versionJson, null, 4));
    } else {
        versionJson = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    }

    if (!await exists(jarPath)) {
        prog(15, `Téléchargement client.jar Vanilla ${gameVersion}...`);
        await downloadFile(versionJson.downloads.client.url, jarPath);
    }

    // Download only missing vanilla libraries with per-file progress
    const missing = (versionJson.libraries || [])
        .filter(lib => lib.downloads?.artifact)
        .map(lib => ({
            dest: path.join(rootPath, 'libraries', ...lib.downloads.artifact.path.split('/')),
            url:  lib.downloads.artifact.url,
        }))
        .filter(({ dest }) => !existsSync(dest));

    if (missing.length) {
        prog(20, `Téléchargement de ${missing.length} librairie(s) Vanilla...`);
        for (let i = 0; i < missing.length; i++) {
            await downloadFile(missing[i].url, missing[i].dest);
            // 20% → 60% over libraries
            const pct = 20 + Math.round((i + 1) / missing.length * 40);
            onProgress?.(pct, `Librairies Vanilla (${i + 1}/${missing.length})`);
        }
    }

    prog(60, `Vanilla ${gameVersion} — OK`);
}

// ─── FABRIC / QUILT ──────────────────────────────────────────────────────────

async function installMetaLoader(rootPath, versionId, url, name, mainWindow, onProgress) {
    onProgress?.(65, `Téléchargement profil ${name}...`);
    mainWindow?.webContents.send('log', `Téléchargement profil ${name}...`);
    const versionDir = path.join(rootPath, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    const json = await fetchJson(url);
    json.id = versionId;
    await fs.writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(json, null, 4));
    onProgress?.(100, `${name} installé !`);
}

// ─── FORGE / NEOFORGE ────────────────────────────────────────────────────────

async function installForgeNeo(rootPath, type, modLoaderVersion, gameVersion, versionId, mainWindow, javaPath, onProgress) {
    const log  = msg => { console.log(msg); mainWindow?.webContents.send('log', msg); };
    const prog = (pct, label) => { log(label); onProgress?.(pct, label); };
    const isNeo = type === 'neoforge';

    const installerUrl = isNeo
        ? `${REPOS.NEO}net/neoforged/neoforge/${modLoaderVersion}/neoforge-${modLoaderVersion}-installer.jar`
        : `${REPOS.FORGE}net/minecraftforge/forge/${gameVersion}-${modLoaderVersion}/forge-${gameVersion}-${modLoaderVersion}-installer.jar`;

    const installerPath = path.join(rootPath, 'installers', `${type}-${modLoaderVersion}-installer.jar`);
    await fs.mkdir(path.dirname(installerPath), { recursive: true });

    if (!await exists(installerPath)) {
        prog(62, `Téléchargement installer ${type} ${modLoaderVersion}...`);
        await downloadFile(installerUrl, installerPath);
    }

    // NeoForge: run the installer to generate the patched client jar and resolve all deps.
    // The output path changed between NeoForge versions:
    //   26.x → libraries/net/neoforged/minecraft-client-patched/<ver>/minecraft-client-patched-<ver>.jar
    //   21.x → libraries/net/neoforged/neoforge/<ver>/neoforge-<ver>-client.jar
    if (isNeo) {
        const candidateJars = [
            path.join(rootPath, 'libraries', 'net', 'neoforged', 'minecraft-client-patched',
                modLoaderVersion, `minecraft-client-patched-${modLoaderVersion}.jar`),
            path.join(rootPath, 'libraries', 'net', 'neoforged', 'neoforge',
                modLoaderVersion, `neoforge-${modLoaderVersion}-client.jar`),
        ];
        const alreadyInstalled = await Promise.any(
            candidateJars.map(p => fs.access(p).then(() => true))
        ).catch(() => false);

        if (!alreadyInstalled) {
            const profilesPath = path.join(rootPath, 'launcher_profiles.json');
            if (!await exists(profilesPath)) {
                await fs.writeFile(profilesPath, JSON.stringify({ profiles: {}, selectedProfile: null }));
            }
            prog(65, `Exécution installer NeoForge (peut prendre quelques minutes)...`);
            await execAsync(`"${javaPath}" -jar "${installerPath}" --installClient "${rootPath}"`, rootPath);

            const nowInstalled = await Promise.any(
                candidateJars.map(p => fs.access(p).then(() => true))
            ).catch(() => false);
            if (!nowInstalled) {
                throw new Error(
                    `NeoForge: aucun jar patché trouvé après installation.\n` +
                    `Chemins vérifiés:\n${candidateJars.join('\n')}\n` +
                    `Vérifiez Java ${javaPath} et les droits d'écriture sur ${rootPath}`,
                );
            }
        }
    }

    prog(85, `Configuration ${type}...`);

    const libRelPath = isNeo
        ? `net/neoforged/neoforge/${modLoaderVersion}/neoforge-${modLoaderVersion}-installer.jar`
        : `net/minecraftforge/forge/${gameVersion}-${modLoaderVersion}/forge-${gameVersion}-${modLoaderVersion}-installer.jar`;
    const libDest = path.join(rootPath, 'libraries', libRelPath);
    await fs.mkdir(path.dirname(libDest), { recursive: true });
    await fs.copyFile(installerPath, libDest).catch(() => {});

    let versionJson = null;

    if (isNeo) {
        const neoId       = `neoforge-${modLoaderVersion}`;
        const neoJsonPath = path.join(rootPath, 'versions', neoId, `${neoId}.json`);
        if (await exists(neoJsonPath)) {
            versionJson = JSON.parse(await fs.readFile(neoJsonPath, 'utf8'));
        }
    }

    if (!versionJson) {
        const zip   = new AdmZip(installerPath);
        const entry = zip.getEntry('version.json');
        if (!entry) throw new Error(`version.json manquant dans le ZIP de l'installer`);
        versionJson = JSON.parse(entry.getData().toString('utf8'));
    }

    versionJson.id           = versionId;
    versionJson.inheritsFrom = gameVersion;

    const librariesDir = path.join(rootPath, 'libraries').replace(/\\/g, '/');
    const sep = process.platform === 'win32' ? ';' : ':';
    versionJson = resolveTemplates(versionJson, {
        library_directory:    librariesDir,
        libraries_directory:  librariesDir,
        version_name:         versionId,
        classpath_separator:  sep,
    });

    if (!isNeo) {
        const fwVer = '1.6.0';
        if (!versionJson.libraries?.some(l => l.name.includes('ForgeWrapper'))) {
            versionJson.libraries = versionJson.libraries || [];
            versionJson.libraries.push({
                name: `io.github.zekerzhayard:ForgeWrapper:${fwVer}`,
                downloads: { artifact: {
                    url:  `https://github.com/ZekerZhayard/ForgeWrapper/releases/download/${fwVer}/ForgeWrapper-${fwVer}.jar`,
                    path: `io/github/zekerzhayard/ForgeWrapper/${fwVer}/ForgeWrapper-${fwVer}.jar`,
                    size: 34369,
                }},
            });
        }
        versionJson.mainClass = 'io.github.zekerzhayard.forgewrapper.installer.Main';
    }

    versionJson.libraries = patchLibraries(versionJson.libraries || [], isNeo);

    const manualJvmArgs = [];

    if (Array.isArray(versionJson.arguments?.jvm)) {

        // MCLC does not reliably forward any string args from custom version JSONs.
        // Extract ALL of them (including -p, --add-modules, --add-opens, -D*, etc.)
        // and pass via customArgs instead. Strip them from the JSON to prevent
        // any partial/duplicate application by MCLC.
        const jvmStrings = versionJson.arguments.jvm.filter(a => typeof a === 'string');
        for (const arg of jvmStrings) manualJvmArgs.push(arg);

        versionJson.arguments.jvm = versionJson.arguments.jvm.filter(a => typeof a !== 'string');
    }

    const versionDir = path.join(rootPath, 'versions', versionId);
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(versionJson, null, 4));
    await fs.writeFile(path.join(versionDir, `${versionId}.jvmargs.json`), JSON.stringify(manualJvmArgs));

    prog(95, `Nettoyage des librairies...`);
    await removeZeroByteFiles(path.join(rootPath, 'libraries'));
    prog(100, `${type} ${modLoaderVersion} installé !`);
    return manualJvmArgs;
}

// ─── LIBRARY PATCHER ─────────────────────────────────────────────────────────

function patchLibraries(libraries, isNeo) {
    const repo = isNeo ? REPOS.NEO : REPOS.FORGE;

    return libraries.map(lib => {
        if (!lib.downloads)          lib = { ...lib, downloads: {} };
        if (!lib.downloads.artifact) lib = { ...lib, downloads: { ...lib.downloads, artifact: {} } };

        const art = { ...lib.downloads.artifact };
        const [group, artifact, version] = lib.name.split(':');

        if (!art.url) {
            const mavenPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
            const neoGroups = ['net.neoforged', 'cpw.mods', 'codechicken'];
            art.path = mavenPath;
            art.url  = (isNeo && neoGroups.some(g => group.startsWith(g)))
                ? `${REPOS.NEO}${mavenPath}`
                : `${REPOS.FORGE}${mavenPath}`;
        }

        // Fix known mis-resolved artifacts
        if (artifact === 'modlauncher') {
            art.url  = `${repo}cpw/mods/modlauncher/${version}/modlauncher-${version}.jar`;
            art.path = `cpw/mods/modlauncher/${version}/modlauncher-${version}.jar`;
            delete art.sha1;
        }
        if (isNeo && artifact === 'bootstraplauncher') {
            art.url  = `${REPOS.NEO}cpw/mods/bootstraplauncher/${version}/bootstraplauncher-${version}.jar`;
            art.path = `cpw/mods/bootstraplauncher/${version}/bootstraplauncher-${version}.jar`;
            delete art.sha1;
        }
        if (isNeo && artifact === 'securejarhandler') {
            art.url  = `${REPOS.NEO}cpw/mods/securejarhandler/${version}/securejarhandler-${version}.jar`;
            art.path = `cpw/mods/securejarhandler/${version}/securejarhandler-${version}.jar`;
            delete art.sha1;
        }
        if (artifact === 'terminalconsoleappender') {
            const mavenPath = `${group.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`;
            art.url = `${REPOS.FORGE}${mavenPath}`;
            delete art.sha1;
        }

        return { ...lib, downloads: { ...lib.downloads, artifact: art } };
    });
}

// ─── ANTI-CHEAT ──────────────────────────────────────────────────────────────

async function enforceAntiCheat(gameDir, mainWindow) {
    mainWindow?.webContents.send('log', 'Vérification intégrité...');
    const forbidden = ['xray', 'x-ray', 'killaura', 'aristois', 'wurst'];
    for (const dir of ['mods', 'resourcepacks']) {
        const dirPath = path.join(gameDir, dir);
        try {
            for (const file of await fs.readdir(dirPath)) {
                if (forbidden.some(k => file.toLowerCase().includes(k))) {
                    await fs.unlink(path.join(dirPath, file)).catch(() => {});
                    mainWindow?.webContents.send('log', `Suppression: ${file}`);
                }
            }
        } catch { /* dir doesn't exist, skip */ }
    }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function exists(p) {
    return fs.access(p).then(() => true).catch(() => false);
}

function existsSync(p) {
    return require('fs').existsSync(p);
}

async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
}

async function downloadFile(url, dest) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, await res.buffer());
}

async function execAsync(cmd, cwd) {
    return new Promise((resolve) => {
        exec(cmd, { cwd, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
            // Filter out the .class file listing spam the NeoForge installer prints
            const clean = str => (str || '')
                .split('\n')
                .filter(l => !l.trim().match(/^\s*(net\/|com\/|org\/|META-INF\/).*\.class\s*$/))
                .join('\n')
                .trim();
            const out = clean(stdout);
            const err2 = clean(stderr);
            if (out)  console.log('[Installer]', out);
            if (err2) console.log('[Installer]', err2);
            resolve({ stdout, stderr });
        });
    });
}

async function removeZeroByteFiles(dir) {
    try {
        for (const item of await fs.readdir(dir)) {
            const p = path.join(dir, item);
            try {
                const stat = await fs.stat(p);
                if (stat.isDirectory()) await removeZeroByteFiles(p);
                else if (stat.size === 0) await fs.unlink(p);
            } catch { /* ignore access errors */ }
        }
    } catch { /* dir doesn't exist */ }
}

// Load jvmArgs saved alongside the version JSON during installation.
async function loadCachedJvmArgs(versionJsonPath) {
    try {
        return JSON.parse(await fs.readFile(versionJsonPath.replace(/\.json$/, '.jvmargs.json'), 'utf8'));
    } catch { return []; }
}

// Check if any argument string still contains ${...} template placeholders we can't resolve locally
// (${classpath_separator} is handled by extractStringJvmArgs, so don't flag it)
function hasUnresolvedTemplates(versionJson) {
    const check = a => typeof a === 'string' && /\$\{(?!classpath_separator)[^}]+\}/.test(a);
    const jvm  = versionJson.arguments?.jvm  || [];
    const game = versionJson.arguments?.game || [];
    return [...jvm, ...game].some(check);
}

// Replace ${key} placeholders in all string arguments
function resolveTemplates(versionJson, vars) {
    const replace = str => {
        if (typeof str !== 'string') return str;
        return str.replace(/\$\{([^}]+)\}/g, (_, k) => vars[k] ?? `\${${k}}`);
    };

    const clone = JSON.parse(JSON.stringify(versionJson));
    if (Array.isArray(clone.arguments?.jvm))  clone.arguments.jvm  = clone.arguments.jvm.map(replace);
    if (Array.isArray(clone.arguments?.game)) clone.arguments.game = clone.arguments.game.map(replace);
    return clone;
}

// ─── INSTALL INSTANCE (called at creation time, not at launch) ───────────────
// onProgress({ phase, percent, label })
//   phase: 'vanilla' | 'loader'
//   percent: 0-100 within that phase
async function installInstance({ gameVersion, loader, loaderVersion, rootPath, javaPath }, onProgress) {
    const loaderType = loader && loader !== 'vanilla' ? loader.toLowerCase() : null;
    const loaderCfg  = loaderType ? { type: loaderType, version: loaderVersion } : null;

    const vanillaProg = (pct, label) => onProgress?.({ phase: 'vanilla', percent: pct, label });
    const loaderProg  = (pct, label) => onProgress?.({ phase: 'loader',  percent: pct, label });

    // Phase 1 — Vanilla
    await ensureVanilla(rootPath, gameVersion, null, vanillaProg);
    vanillaProg(100, `Minecraft ${gameVersion} prêt !`);

    // Phase 2 — Modloader (if any)
    if (loaderCfg) {
        const versionId       = `${loaderType}-${gameVersion}-${loaderVersion}`;
        const versionJsonPath = path.join(rootPath, 'versions', versionId, `${versionId}.json`);

        if (await exists(versionJsonPath)) {
            try {
                const json = JSON.parse(await fs.readFile(versionJsonPath, 'utf8'));
                if (!hasUnresolvedTemplates(json)) {
                    loaderProg(100, `${loaderType} déjà installé`);
                    return { versionId, jvmArgs: await loadCachedJvmArgs(versionJsonPath) };
                }
            } catch { /* corrupt, reinstall */ }
            await fs.rm(path.join(rootPath, 'versions', versionId), { recursive: true, force: true });
        }

        switch (loaderType) {
            case 'fabric': {
                const url = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${loaderVersion}/profile/json`;
                await installMetaLoader(rootPath, versionId, url, 'Fabric', null, loaderProg);
                break;
            }
            case 'quilt': {
                const url = `https://meta.quiltmc.org/v3/versions/loader/${gameVersion}/${loaderVersion}/profile/json`;
                await installMetaLoader(rootPath, versionId, url, 'Quilt', null, loaderProg);
                break;
            }
            case 'forge':
            case 'neoforge':
                await installForgeNeo(rootPath, loaderType, loaderVersion, gameVersion, versionId, null, javaPath || 'java', loaderProg);
                break;
            default:
                throw new Error(`Loader inconnu: ${loaderType}`);
        }
    }
}

module.exports = { launch, launcher, installInstance };
