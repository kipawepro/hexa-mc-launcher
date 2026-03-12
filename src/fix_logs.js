const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

// The mangled logs right now in the file are probably:
// console.log([INSTALL START] name= slug=);
// let's just make it robust by matching what is there and replacing.

// Find the whole async installModpack(project, name) function and rewrite the start of it.
const searchStr = "async installModpack(project, name) { try {";
const replaceStr = "async installModpack(project, name) { try { console.log('[FRONTEND] Triggered installModpack. Project:', project.slug, 'Name:', name);";

b = b.replace(searchStr, replaceStr);

// Now for the library part:
b = b.replace('const newInst = await LibraryManager.add(name, gameVer, loader, icon, false);', 
    'console.log("[FRONTEND] Attempting to add instance to LibraryManager...");\nconst newInst = await LibraryManager.add(name, gameVer, loader, icon, false);\nconsole.log("[FRONTEND] LibraryManager returned:", newInst ? newInst.folder : "null");');

// And for the backend part (we search for 'if(window.electron) { let downloadUrl = null;'):
b = b.replace('if (downloadUrl) {',
    'if (downloadUrl) {\nconsole.log("[FRONTEND] Passing to backend install-modpack IPC with URL:", downloadUrl, "Folder:", newInst.folder);\n');

fs.writeFileSync('renderer.js', b);
console.log("Fixed logs.");
