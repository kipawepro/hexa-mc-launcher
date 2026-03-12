const fs = require('fs-extra');
const path = require('path');
const fetch = require('node-fetch');
const AdmZip = require('adm-zip');
const { pipeline } = require('stream');
const { promisify } = require('util');
const fsNative = require('fs');
const streamPipeline = promisify(pipeline);

async function downloadFile(url, dest) {
    const res = await fetch(url, { headers: { "User-Agent": "HexaLauncher/1.0 (contact@strator.gg)" } });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
    await fs.ensureDir(path.dirname(dest));
    await streamPipeline(res.body, fsNative.createWriteStream(dest));
}

/**
 * Install a Modrinth .mrpack — URL or local file path.
 * @param {string} packSource — HTTPS URL or absolute file path
 * @param {string} instancePath
 * @param {Function} progressCallback — (percent, message)
 * @param {boolean} isLocalFile
 */
async function installModrinthPack(packSource, instancePath, progressCallback, isLocalFile = false) {
    try {
        await fs.ensureDir(instancePath);
        const tempPackPath = path.join(instancePath, '_temp_pack.mrpack');

        if (isLocalFile) {
            progressCallback(5, "Reading local pack file...");
            await fs.copy(packSource, tempPackPath, { overwrite: true });
        } else {
            progressCallback(0, "Downloading modpack...");
            await downloadFile(packSource, tempPackPath);
        }

        progressCallback(20, "Extracting modpack...");

        const zip = new AdmZip(tempPackPath);
        const zipEntries = zip.getEntries();

        const indexEntry = zipEntries.find(e => e.entryName === 'modrinth.index.json');
        if (!indexEntry) throw new Error("Invalid modpack: missing modrinth.index.json");

        const indexData = JSON.parse(zip.readAsText(indexEntry));
        const files = indexData.files || [];
        const totalFiles = files.length;

        progressCallback(30, "Applying config overrides...");
        zip.extractAllTo(instancePath, true);

        for (const folder of ['overrides', 'client-overrides']) {
            const overridesPath = path.join(instancePath, folder);
            if (await fs.pathExists(overridesPath)) {
                await fs.copy(overridesPath, instancePath, { overwrite: true });
                await fs.remove(overridesPath);
            }
        }

        await fs.remove(tempPackPath);

        for (const d of ['mods', 'resourcepacks', 'screenshots', 'config', 'shaderpacks']) {
            await fs.ensureDir(path.join(instancePath, d));
        }

        if (totalFiles === 0) {
            progressCallback(100, "Installation complete!");
            return indexData;
        }

        progressCallback(40, "Downloading mods...");
        const parallelLimit = 5;
        let completed = 0;

        const downloadMod = async (file) => {
            const destPath = path.join(instancePath, file.path);
            await fs.ensureDir(path.dirname(destPath));
            const downloadUrl = file.downloads && file.downloads[0];
            if (!downloadUrl) return;
            try { await downloadFile(downloadUrl, destPath); }
            catch(e) { console.warn(`[installModrinthPack] Failed: ${file.path}: ${e.message}`); }
        };

        for (let i = 0; i < files.length; i += parallelLimit) {
            const chunk = files.slice(i, i + parallelLimit);
            await Promise.all(chunk.map(f => downloadMod(f)));
            completed += chunk.length;
            const percent = 40 + Math.floor((completed / totalFiles) * 58);
            progressCallback(percent, `Downloading mods (${completed}/${totalFiles})`);
        }

        progressCallback(100, "Installation complete!");
        return indexData;

    } catch (error) {
        console.error("Modpack installation failed:", error);
        progressCallback(-1, "Error: " + error.message);
        throw error;
    }
}

/**
 * Install a CurseForge .zip modpack (extracts overrides; mods need CurseForge API to download).
 * @returns {{ name, version, mcVersion, loader, loaderVersion, modsCount, author }}
 */
async function installCurseForgePack(filePath, instancePath, progressCallback) {
    try {
        await fs.ensureDir(instancePath);
        progressCallback(5, "Reading CurseForge pack...");

        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();

        const manifestEntry = zipEntries.find(e => e.entryName === 'manifest.json');
        if (!manifestEntry) throw new Error("Invalid CurseForge pack: missing manifest.json");

        const manifest = JSON.parse(zip.readAsText(manifestEntry));
        const mcVersion = manifest.minecraft && manifest.minecraft.version ? manifest.minecraft.version : '1.20.1';

        let loader = 'vanilla';
        let loaderVersion = '';
        if (manifest.minecraft && manifest.minecraft.modLoaders && manifest.minecraft.modLoaders.length > 0) {
            const primary = manifest.minecraft.modLoaders.find(l => l.primary) || manifest.minecraft.modLoaders[0];
            const parts = primary.id.split('-'); // "forge-40.1.0"
            loader = parts[0].toLowerCase();
            loaderVersion = parts.slice(1).join('-');
        }

        progressCallback(20, "Extracting config overrides...");

        const overridePrefix = 'overrides/';
        for (const entry of zipEntries) {
            if (entry.entryName.startsWith(overridePrefix) && !entry.isDirectory) {
                const relPath = entry.entryName.slice(overridePrefix.length);
                const destPath = path.join(instancePath, relPath);
                await fs.ensureDir(path.dirname(destPath));
                fsNative.writeFileSync(destPath, entry.getData());
            }
        }

        progressCallback(70, "Creating standard folders...");
        for (const d of ['mods', 'resourcepacks', 'screenshots', 'config', 'shaderpacks']) {
            await fs.ensureDir(path.join(instancePath, d));
        }

        await fs.writeJson(path.join(instancePath, 'curseforge_manifest.json'), manifest, { spaces: 2 });

        progressCallback(100, "Extraction complete!");

        return {
            name:          manifest.name        || 'CurseForge Pack',
            version:       manifest.version     || '1.0',
            mcVersion,
            loader,
            loaderVersion,
            modsCount:     manifest.files ? manifest.files.length : 0,
            author:        manifest.author      || ''
        };
    } catch(error) {
        console.error("CurseForge pack install failed:", error);
        progressCallback(-1, "Error: " + error.message);
        throw error;
    }
}

module.exports = { installModrinthPack, installCurseForgePack };
