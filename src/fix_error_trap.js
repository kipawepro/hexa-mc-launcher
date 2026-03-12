const fs = require('fs');
let b = fs.readFileSync('renderer.js', 'utf8');

const errTrap = \
window.addEventListener('error', function(e) {
    uiLog('[UNCAUGHT ERROR] ' + e.message + ' at ' + e.filename + ':' + e.lineno, 'red');
});
window.addEventListener('unhandledrejection', function(e) {
    uiLog('[UNHANDLED PROMISE] ' + (e.reason ? e.reason.stack || e.reason.message || e.reason : 'Unknown'), 'red');
});
\;

if (!b.includes('[UNCAUGHT ERROR]')) {
    b = b.replace('function uiLog', errTrap + 'function uiLog');
}

// And let's fix the potential 'this.state.type' bug directly!
// From: const type = this.state.type || project.project_type;
// To: const type = (this.state && this.state.type) ? this.state.type : project.project_type;
b = b.replace('const type = this.state.type || project.project_type;', 'const type = (this && this.state && this.state.type) ? this.state.type : project.project_type;');

fs.writeFileSync('renderer.js', b);
console.log("Added error trapping and potential fix.");
