const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');
const regex = /if\s*\(\s*type\s*===\s*'modpack'\s*\)\s*\{/;
const rep = \if(type === 'modpack') {
    console.log('[FRONTEND] Bypassing Create Instance Modal! Direct Install.');
    this.installModpack(project, project.title);
    return;
\;
b = b.replace(regex, rep);
fs.writeFileSync('renderer.js', b);
console.log('Injected bypass:', b.includes('Bypassing'));
