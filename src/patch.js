const fs = require('fs'); let r = fs.readFileSync('modpack_installer.js', 'utf8'); r = r.replace(/^[ \t]*console\.log\(\x22->.*?\);\r?\n/gm, ''); fs.writeFileSync('modpack_installer.js', r);
