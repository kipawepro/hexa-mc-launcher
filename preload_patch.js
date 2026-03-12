const fs = require('fs');
let c = fs.readFileSync('src/preload.js', 'utf8');

c = c.replace(/fetchFriends: \(\) => ipcRenderer.invoke\('fetch-friends'\),/, `fetchFriends: () => ipcRenderer.invoke('fetch-friends'),
    acceptFriend: (friendId) => ipcRenderer.invoke('accept-friend', friendId),
    rejectFriend: (friendId) => ipcRenderer.invoke('reject-friend', friendId),
    getMessages: (friendId) => ipcRenderer.invoke('get-messages', friendId),
    sendMessage: (friendId, message) => ipcRenderer.invoke('send-message', {friendId, message}),`);

fs.writeFileSync('src/preload.js', c);
