const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
if (!html.includes('id="debug-logger"')) {
    html = html.replace('</body>', '<div id="debug-logger" style="position:fixed; bottom:0; padding:10px; background:rgba(0,0,0,0.8); color: lime; width:100%; height: 250px; overflow-y:scroll; font-family:monospace; z-index:999999; pointer-events: none;"><b>[DEBUG LOGS]</b><br></div></body>');
    fs.writeFileSync('index.html', html);
}

let renderer = fs.readFileSync('renderer.js', 'utf8');
if (!renderer.includes('// LOGGER INJECTED')) {
    const loggerCode = '// LOGGER INJECTED\nconst oldLog = console.log;\nconst oldErr = console.error;\nconst oldAlert = window.alert;\nfunction uiLog(msg, color="lime") {\nconst logger = document.getElementById("debug-logger");\nif (logger) {\nconst span = document.createElement("div");\nspan.style.color = color;\nspan.innerText = msg;\nlogger.appendChild(span);\nlogger.scrollTop = logger.scrollHeight;\n}\n}\nconsole.log = function(...args) {\noldLog(...args);\nuiLog("[LOG] " + args.join(" "));\n};\nconsole.error = function(...args) {\noldErr(...args);\nuiLog("[ERR] " + args.join(" "), "red");\n};\nwindow.alert = function(msg) {\nuiLog("[ALERT] " + msg, "orange");\n};\n';
    fs.writeFileSync('renderer.js', loggerCode + renderer);
}

let main = fs.readFileSync('main.js', 'utf8');
if (!main.includes('console.log("main.js: install-modpack args:", data)')) {
    main = main.replace("ipcMain.handle('install-modpack', async (event, data) => {", "ipcMain.handle('install-modpack', async (event, data) => {\nconsole.log('main.js: install-modpack args:', data);\nif (mainWindow) mainWindow.webContents.send('log', 'BACKEND RECEIVED INSTALL: ' + JSON.stringify(data));\n");
    fs.writeFileSync('main.js', main);
}

console.log("Logger injected successfully.");
