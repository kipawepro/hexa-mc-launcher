const fetch = require('node-fetch');

async function check(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`${url} : ${res.status}`);
    } catch (e) {
        console.error(`Error`, e);
    }
}

// Check SecureJarHandler versions for NeoForge 1.21
// Common versions: 3.0.6, 3.0.8, etc.
check("https://maven.neoforged.net/releases/cpw/mods/securejarhandler/3.0.6/securejarhandler-3.0.6.jar");
check("https://maven.neoforged.net/releases/cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar");
check("https://maven.neoforged.net/releases/cpw/mods/securejarhandler/3.0.5/securejarhandler-3.0.5.jar");
