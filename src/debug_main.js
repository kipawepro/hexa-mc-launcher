const fs = require('fs');
let b = fs.readFileSync('main.js', 'utf8');

// We are going to replace the start of install-modpack handler with a dialog.showMessageBox to be 100% sure it fires
const target = "ipcMain.handle('install-modpack', async (event, data) => {";
const replacement = \ipcMain.handle('install-modpack', async (event, data) => {
    require('electron').dialog.showMessageBoxSync({ message: 'IPC HIT! Data: ' + JSON.stringify(data) });
\;

b = b.replace(target, replacement);
fs.writeFileSync('main.js', b);
console.log('Injected dialog into main.js');
