const https = require('https');

const options = {
  hostname: 'api.github.com',
  path: '/repos/ZekerZhayard/ForgeWrapper/releases/latest',
  method: 'GET',
  headers: { 'User-Agent': 'node.js' }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
        const json = JSON.parse(data);
        console.log("LATEST_TAG:", json.tag_name);
        console.log("ASSETS:", json.assets.map(a => a.name));
    } catch (e) { console.error(e.message); }
  });
});

req.on('error', (e) => {
  console.error(e);
});
req.end();