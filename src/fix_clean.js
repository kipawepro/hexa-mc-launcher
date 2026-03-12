const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

const sIdx = b.indexOf('async installModpack(project, name)');
if (sIdx === -1) { console.log('Start not found'); process.exit(1); }

// Find where window.electron.installModpack begins
const destStr = 'window.electron.installModpack({';
const eIdx = b.indexOf(destStr, sIdx);
if (eIdx === -1) { console.log('End not found'); process.exit(1); }

const originalEnd = b.substring(eIdx);

const correctHeader = \sync installModpack(project, name) { 
    try { 
        console.log('[FRONTEND] Triggered installModpack. Project:', project.slug, 'Name:', name); 
        const res = await fetch(\\\https://api.modrinth.com/v2/project/\\\/version\\\); 
        const versions = await res.json(); 
        if(!versions || versions.length === 0) throw new Error("No versions found"); 
        const best = versions[0]; 
        const loader = (best.loaders && best.loaders.length > 0) ? best.loaders[0] : null; 
        const gameVer = (best.game_versions && best.game_versions.length > 0) ? best.game_versions[0] : "1.21.1"; 
        
        if(typeof LibraryManager !== 'undefined') { 
            const icon = project.icon_url || 'assets/logo_no_bc.png'; 
            console.log('[FRONTEND] Attempting to add instance to LibraryManager...', name, gameVer, loader); 
            const newInst = await LibraryManager.add(name, gameVer, loader, icon, false); 
            console.log('[FRONTEND] LibraryManager returned:', newInst ? newInst.folder : 'null'); 
            
            newInst.status = "Installing 0%"; 
            LibraryManager.save(); 
            LibraryManager.render(); 
            
            if(window.electron) { 
                let downloadUrl = null; 
                const primaryFile = best.files.find(f => f.primary);      
                if (primaryFile) downloadUrl = primaryFile.url; 
                else if (best.files.length > 0) downloadUrl = best.files[0].url; 
                
                if (downloadUrl) { 
                    LibraryManager.showToast(\\\Started installation of \\\\\\, 0); 
                    console.log('[FRONTEND] Passing backend install-modpack IPC with URL:', downloadUrl, 'Folder:', newInst.folder); 
                    \;

b = b.substring(0, sIdx) + correctHeader + originalEnd;
fs.writeFileSync('renderer.js', b);
console.log('Fixed renderer.js again.');
