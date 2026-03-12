const fs = require('fs');
let b = fs.readFileSync('modpack_installer.js', 'utf8');

// I am adding very aggressive logging to see where it freezes.
b = b.replace('async function downloadFile(url, dest) {', 'async function downloadFile(url, dest) {\n    console.log("-> downloadFile START:", url, dest);');
b = b.replace('const res = await fetch(url);', 'console.log("-> fetching...");\n    const res = await fetch(url);\n    console.log("-> fetch status:", res.status);');
b = b.replace('await streamPipeline(res.body, fs.createWriteStream(dest));', 'console.log("-> streaming...");\n    await streamPipeline(res.body, require("fs").createWriteStream(dest));\n    console.log("-> stream DONE");');

b = b.replace('async function installModrinthPack(packUrl, instancePath, progressCallback) {', 'async function installModrinthPack(packUrl, instancePath, progressCallback) {\n    console.log("-> installModrinthPack START", packUrl, instancePath);');

fs.writeFileSync('modpack_installer.js', b);
console.log('Injected debug logs into modpack_installer.js');
