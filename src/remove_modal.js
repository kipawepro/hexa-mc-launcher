const fs = require('fs');
let content = fs.readFileSync('main.js', 'utf8');
content = content.replace("require('electron').dialog.showMessageBoxSync({ message: 'MAIN_JS_RECEIVED_IPC' });", "");
fs.writeFileSync('main.js', content, 'utf8');
console.log('Removed modal code');
