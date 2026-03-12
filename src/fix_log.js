const fs = require('fs');
let b = fs.readFileSync('modpack_installer.js', 'utf8');
b = b.replace('progressCallback(100, "Installation complete!");', 'progressCallback(100, "Installation complete!");\nconsole.log("-> FINISHED ENTIRE LOOP");');
fs.writeFileSync('modpack_installer.js', b);
