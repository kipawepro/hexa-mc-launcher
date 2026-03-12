const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

const sIdx = b.indexOf('async installModpack(project, name)');
if (sIdx === -1) { console.log('Start not found'); process.exit(1); }

const destStr = 'window.electron.installModpack({';
const eIdx = b.indexOf(destStr, sIdx);
if (eIdx === -1) { console.log('End not found'); process.exit(1); }

const originalEnd = b.substring(eIdx);

const correctHeader = 'async installModpack(project, name) { \n' +
'    try { \n' +
'        console.log(\'[FRONTEND] Triggered installModpack. Project:\', project.slug, \'Name:\', name); \n' +
'        const res = await fetch("https://api.modrinth.com/v2/project/" + project.slug + "/version"); \n' +
'        const versions = await res.json(); \n' +
'        if(!versions || versions.length === 0) throw new Error("No versions found"); \n' +
'        const best = versions[0]; \n' +
'        const loader = (best.loaders && best.loaders.length > 0) ? best.loaders[0] : null; \n' +
'        const gameVer = (best.game_versions && best.game_versions.length > 0) ? best.game_versions[0] : "1.21.1"; \n' +
'        \n' +
'        if(typeof LibraryManager !== "undefined") { \n' +
'            const icon = project.icon_url || "assets/logo_no_bc.png"; \n' +
'            console.log(\'[FRONTEND] Attempting to add instance to LibraryManager...\', name, gameVer, loader); \n' +
'            const newInst = await LibraryManager.add(name, gameVer, loader, icon, false); \n' +
'            console.log(\'[FRONTEND] LibraryManager returned:\', newInst ? newInst.folder : "null"); \n' +
'            \n' +
'            newInst.status = "Installing 0%"; \n' +
'            LibraryManager.save(); \n' +
'            LibraryManager.render(); \n' +
'            \n' +
'            if(window.electron) { \n' +
'                let downloadUrl = null; \n' +
'                const primaryFile = best.files.find(f => f.primary); \n' +
'                if (primaryFile) downloadUrl = primaryFile.url; \n' +
'                else if (best.files.length > 0) downloadUrl = best.files[0].url; \n' +
'                \n' +
'                if (downloadUrl) { \n' +
'                    LibraryManager.showToast("Started installation of " + name, 0); \n' +
'                    console.log(\'[FRONTEND] Passing backend install-modpack IPC with URL:\', downloadUrl, \'Folder:\', newInst.folder); \n' +
'                    ';

b = b.substring(0, sIdx) + correctHeader + originalEnd;
fs.writeFileSync('renderer.js', b);
console.log('Fixed renderer.js FOREVER.');
