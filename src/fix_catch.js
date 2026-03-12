const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

b = b.replace('}).then(res => {', '}).then(res => { console.log(\'[FRONTEND] BACKEND RESPONDED:\', res); ');
b = b.replace('});\n                      } else {', '}).catch(e => console.error(\'[FRONTEND] BACKEND IPC ERROR:\', e));\n                      } else {');

fs.writeFileSync('renderer.js', b);
console.log('Added catch.');
