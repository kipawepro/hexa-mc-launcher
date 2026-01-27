const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    login: (credentials) => ipcRenderer.invoke('login-user', credentials),
    launchGame: (options) => ipcRenderer.invoke('launch-game', options),
    minimize: () => ipcRenderer.send('minimize-window'),
    close: () => ipcRenderer.send('close-window'),
    onLog: (callback) => ipcRenderer.on('log', (event, text) => callback(text)),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    openExternal: (url) => ipcRenderer.send('open-external', url),
    onAuthSuccess: (callback) => ipcRenderer.on('auth-success', (event, user) => callback(user)),
    onStopLoading: (callback) => ipcRenderer.on('stop-loading', () => callback()),
    on: (channel, callback) => ipcRenderer.on(channel, (event, data) => callback(data)), // Adding generic ON for update-progress
    checkUpdate: () => ipcRenderer.invoke('check-update'),
    installUpdate: (url) => ipcRenderer.invoke('install-update', url),
    getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    installJava: (version) => ipcRenderer.invoke('install-java', version),
    testJava: (path) => ipcRenderer.invoke('test-java', path),
    detectJava: (version) => ipcRenderer.invoke('detect-java', version),
    getLauncherConfig: () => ipcRenderer.invoke('get-launcher-config'),
    restoreSession: (user) => ipcRenderer.invoke('restore-session', user),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getThemes: () => ipcRenderer.invoke('get-themes'),
    updateRpc: (activity) => ipcRenderer.send('update-rpc', activity)
});
