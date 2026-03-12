const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

const targetStr = "const cancelBtn = document.getElementById('cancel-inst-name');";
const injectStr = "console.log('DOM check -> Modal:', !!modal, 'Input:', !!input, 'Confirm:', !!confirmBtn, 'Cancel:', !!cancelBtn); \nif (modal) { modal.style.zIndex = '99999'; console.log('Forced modal z-index to 99999'); }";

b = b.replace(targetStr, targetStr + '\n' + injectStr);

fs.writeFileSync('renderer.js', b);
console.log('Injected modal diagnostics.');
