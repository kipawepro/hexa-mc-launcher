# Hexa Launcher API Documentation

This document describes the API endpoints required by the new Hexa Launcher update system.
You need to host these endpoints on your web server (e.g., `launcher.hg.studio`).

## 1. Version Check Endpoint

The launcher will call this endpoint to check if a new version is available.
**Note:** For now, use HTTP if HTTPS is not yet ready.

- **URL**: `http://hgstudio.strator.gg/api/launcher/version` (Ensure this matches your config)
- **Method**: `GET`
- **Response Format** (JSON):

```json
{
    "version": "1.0.1",
    "url": "https://github.com/hg-studio/hexa-launcher/releases/download/v1.0.1/HexaLauncher-Setup-1.0.1.exe",
    "notes": "Added auto-updater and fixed bugs.",
    "force": false
}
```

### JSON Fields:
- `version`: The latest version string (must be comparable, e.g., "1.0.1").
- `url`: Direct link to download the `.exe` installer (Set to your GitHub Release URL).
- `notes` (Optional): Changelog text to display.
- `force` (Optional): If `true`, the launcher might force the update.

## 2. PHP Example

Here is a simple PHP script you can use to serve this JSON:

```php
<?php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *"); // Important!

// Config
$latestVersion = "1.0.1";
// Use the GitHub Releases URL
$downloadUrl = "https://github.com/hg-studio/hexa-launcher/releases/download/v" . $latestVersion . "/HexaLauncher-Setup-" . $latestVersion . ".exe";

echo json_encode([
    "version" => $latestVersion,
    "url" => $downloadUrl,
    "notes" => "Critical security update and UI fixes."
]);
?>
```

## 3. Node.js (Express) Example

```javascript
app.get('/api/launcher/version', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({
        version: "1.0.1",
        url: "https://github.com/hg-studio/hexa-launcher/releases/download/v1.0.1/HexaLauncher-Setup-1.0.1.exe",
        notes: "New features!"
    });
});
```
