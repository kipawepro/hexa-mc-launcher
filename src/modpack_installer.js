const path      = require('path');
const fs        = require('fs/promises');
const fsSync    = require('fs');
const AdmZip    = require('adm-zip');
const crypto    = require('crypto');
const fetch     = require('node-fetch');

/**
 * Install a Modrinth .mrpack file into instancePath.
 * @param {string}   packPath   - Path to the .mrpack file
 * @param {string}   instancePath - Destination instance folder
 * @param {Function} onProgress  - (percent, message) callback
 * @returns {{ gameVersion, loader }}
 */
async function installModrinthPack(packPath, instancePath, onProgress = () => {}) {
    const tempDir = path.join(instancePath, '_mrpack_tmp');
    await fs.mkdir(tempDir, { recursive: true });

    try {
        onProgress(5, 'Extracting modpack…');
        const zip = new AdmZip(packPath);
        zip.extractAllTo(tempDir, true);

        const indexRaw = await fs.readFile(path.join(tempDir, 'modrinth.index.json'), 'utf8');
        const index    = JSON.parse(indexRaw);

        const gameVersion = index.dependencies?.minecraft;
        let loader = null;
        if      (index.dependencies?.['fabric-loader'])  loader = { type: 'fabric',   version: index.dependencies['fabric-loader']  };
        else if (index.dependencies?.['forge'])           loader = { type: 'forge',    version: index.dependencies['forge']           };
        else if (index.dependencies?.['neoforge'])        loader = { type: 'neoforge', version: index.dependencies['neoforge']        };
        else if (index.dependencies?.['quilt-loader'])    loader = { type: 'quilt',    version: index.dependencies['quilt-loader']    };

        const files      = index.files || [];
        const total      = files.length;
        let   done       = 0;
        const allowedMods = [];

        for (const file of files) {
            const dest = path.join(instancePath, file.path);
            await fs.mkdir(path.dirname(dest), { recursive: true });

            if (file.path.startsWith('mods/')) allowedMods.push(path.basename(file.path));

            // Skip if already correct
            let exists = false;
            try {
                await fs.access(dest);
                if (file.hashes?.sha1) {
                    const buf  = await fs.readFile(dest);
                    const hash = crypto.createHash('sha1').update(buf).digest('hex');
                    exists = hash === file.hashes.sha1;
                } else {
                    exists = true;
                }
            } catch {}

            if (!exists && file.downloads?.[0]) {
                const r = await fetch(file.downloads[0], { headers: { 'User-Agent': 'HexaLauncher/1.0' } });
                if (r.ok) {
                    const out = fsSync.createWriteStream(dest);
                    await new Promise((res, rej) => { r.body.pipe(out); r.body.on('error', rej); out.on('finish', res); });
                }
            }

            done++;
            const pct = 10 + Math.round((done / total) * 70);
            if (done % 5 === 0 || done === total) onProgress(pct, `Downloading files ${done}/${total}…`);
        }

        // Copy overrides
        const overridesDir = path.join(tempDir, 'overrides');
        if (fsSync.existsSync(overridesDir)) {
            onProgress(85, 'Applying overrides…');
            await copyDir(overridesDir, instancePath);
        }

        // Save allowed mods list (hexa_modlist.json — NOT whitelist.json which Minecraft uses for player whitelisting)
        await fs.writeFile(path.join(instancePath, 'hexa_modlist.json'), JSON.stringify(allowedMods, null, 2));

        onProgress(100, 'Done');
        return { gameVersion, loader };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

/**
 * Install a CurseForge .zip modpack into instancePath.
 * @param {string}   packPath
 * @param {string}   instancePath
 * @param {Function} onProgress
 */
async function installCurseForgePack(packPath, instancePath, onProgress = () => {}) {
    const tempDir = path.join(instancePath, '_cf_tmp');
    await fs.mkdir(tempDir, { recursive: true });

    try {
        onProgress(5, 'Extracting CurseForge pack…');
        const zip = new AdmZip(packPath);
        zip.extractAllTo(tempDir, true);

        const manifestPath = path.join(tempDir, 'manifest.json');
        const manifestRaw  = await fs.readFile(manifestPath, 'utf8');
        const manifest     = JSON.parse(manifestRaw);

        const gameVersion  = manifest.minecraft?.version;
        const loaderArr    = manifest.minecraft?.modLoaders || [];
        const primaryLoader = loaderArr.find(l => l.primary) || loaderArr[0];
        const loaderStr    = primaryLoader?.id || '';           // e.g. "forge-47.2.0"
        const [loaderType, loaderVer] = loaderStr.split('-');
        const loader = loaderType ? { type: loaderType, version: loaderVer } : null;

        const files = manifest.files || [];
        const total = files.length;
        let   done  = 0;

        onProgress(10, `Downloading ${total} mods via CurseForge API…`);

        for (const file of files) {
            try {
                const url = `https://www.curseforge.com/api/v1/mods/${file.projectID}/files/${file.fileID}/download`;
                const r   = await fetch(url, { headers: { 'User-Agent': 'HexaLauncher/1.0' }, redirect: 'follow' });
                if (!r.ok) { done++; continue; }

                const cd  = r.headers.get('content-disposition') || '';
                const match = cd.match(/filename="?([^";]+)"?/);
                const fname = match ? match[1] : `${file.projectID}-${file.fileID}.jar`;
                const dest  = path.join(instancePath, 'mods', fname);
                await fs.mkdir(path.dirname(dest), { recursive: true });
                const out = fsSync.createWriteStream(dest);
                await new Promise((res, rej) => { r.body.pipe(out); r.body.on('error', rej); out.on('finish', res); });
            } catch {}

            done++;
            const pct = 10 + Math.round((done / total) * 70);
            if (done % 5 === 0 || done === total) onProgress(pct, `Mods ${done}/${total}…`);
        }

        // Copy overrides
        const overridesDir = path.join(tempDir, 'overrides');
        if (fsSync.existsSync(overridesDir)) {
            onProgress(85, 'Applying overrides…');
            await copyDir(overridesDir, instancePath);
        }

        onProgress(100, 'Done');
        return { gameVersion, loader };
    } finally {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
}

async function copyDir(src, dest) {
    const entries = await fs.readdir(src, { withFileTypes: true });
    await fs.mkdir(dest, { recursive: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) await copyDir(s, d);
        else await fs.copyFile(s, d);
    }
}

module.exports = { installModrinthPack, installCurseForgePack };
