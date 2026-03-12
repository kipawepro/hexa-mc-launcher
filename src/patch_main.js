const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');
content = content.replace("ipcMain.handle('install-modpack', async (event, data) => {", "ipcMain.handle('install-modpack', async (event, data) => {\n require('electron').dialog.showMessageBoxSync({ message: 'MAIN_JS_RECEIVED_IPC' });\n");
fs.writeFileSync('main.js', content, 'utf8');
console.log('Successfully added alert in main.js');