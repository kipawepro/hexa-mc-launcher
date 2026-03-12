const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

// Replace the modpack if block with a direct call to bypass the modal for testing
const search = "if(type === 'modpack') {";
const replacement = \if(type === 'modpack') {
    console.log('[FRONTEND] Bypassing Create Instance Modal! Direct Install.');
    this.installModpack(project, project.title);
    return;
\;

b = b.replace(search, replacement);
fs.writeFileSync('renderer.js', b);
console.log('Injected bypass.');
