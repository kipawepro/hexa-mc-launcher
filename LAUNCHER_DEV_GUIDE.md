# 🎮 Launcher Integration Guide (HexaMC)

**Status:** Updated for Production (08/03/2026)
**Base URL:** `http://91.197.6.177:24607/`

This document serves as the **primary prompt** for the AI developing the HexaMC Launcher. It details the API endpoints for authentication, skin/cape retrieval, and game launch configuration.

---

## 1. 🔐 Authentication (Yggdrasil API)

The launcher must use the Yggdrasil-compatible API for login.

**Base Auth URL:** `http://91.197.6.177:24607/api/yggdrasil`
_Configure your Authlib Injector or Custom Launcher to use this base URL._

### Endpoints
| Method | Endpoint | Description | Payload (JSON) |
| :--- | :--- | :--- | :--- |
| `POST` | `/authserver/authenticate` | Login | `{ "agent": { "name": "Minecraft", "version": 1 }, "username": "EMAIL", "password": "PASSWORD" }` |
| `POST` | `/authserver/refresh` | Refresh Token | `{ "accessToken": "TOKEN", "clientToken": "CLIENT_TOKEN" }` |
| `POST` | `/authserver/validate` | Check Token | `{ "accessToken": "TOKEN" }` |
| `POST` | `/authserver/invalidate` | Logout | `{ "accessToken": "TOKEN", "clientToken": "CLIENT_TOKEN" }` |
| `POST` | `/sessionserver/session/minecraft/join` | Server Join | `{ "accessToken": "TOKEN", "selectedProfile": "UUID", "serverId": "HASH" }` |

**Response Format (Authenticate)**:
```json
{
  "accessToken": "hexamc_token_...",
  "clientToken": "client_token_...",
  "selectedProfile": {
    "id": "uuid_without_dashes",
    "name": "PlayerName"
  }
}
```

---

## 2. 🎨 Skin & Cape Management

The launcher should fetch textures from these endpoints.

### 🖼️ Texture Retrieval
Use these URLs to display the skin in the launcher preview or inject into the game.

*   **Skin (PNG)**: `http://91.197.6.177:24607/api/textures/skins/{username}.png`
*   **Cape (PNG)**: `http://91.197.6.177:24607/api/textures/capes/{username}.png`
*   **Legacy/Generic**: `http://91.197.6.177:24607/api/textures/{filename}`

### 👤 Full Profile (CustomSkinLoader)
To get all textures in one JSON (compatible with CustomSkinLoader mod):
*   **URL**: `http://91.197.6.177:24607/api/users/{username}.json`

---

## 3. 📤 Uploading Skins/Capes (Launcher Feature)

If the launcher allows changing skins directly:

*   **Endpoint**: `POST /api/skin/upload` (for skins) | `POST /api/cape/upload` (for capes)
*   **Auth**: Requires valid session cookie (currently Web-based) or update backend to accept Bearer Token.
*   **Current State**: Use the website (`/profile`) for uploads. The API exists but is session-protected.

---

## 4. 🚀 Game Launch Parameters

When starting Minecraft, use these arguments derived from the Auth response:

*   `--username`: `${selectedProfile.name}`
*   `--uuid`: `${selectedProfile.id}`
*   `--accessToken`: `${accessToken}`
*   `--userType`: `mojang` (or `legacy`)
*   `--versionType`: `HexaMC`
*   `--assetIndex`: `1.19` (or relevant version)

---

## 5. 🛠️ Launcher Developer Prompt (Copy/Paste this for AI)

```text
You are developing the custom launcher for HexaMC.
Here are the critical integration details:

1. AUTHENTICATION:
   - Use the Yggdrasil API at: http://91.197.6.177:24607/api/yggdrasil
   - The endpoints follow standard Yggdrasil spec (/authserver/authenticate, etc.).
   - Use the returned 'accessToken' and 'selectedProfile.id' (UUID) for game launch args.

2. SKINS & CAPES:
   - To preview the user's skin: Load from http://91.197.6.177:24607/api/textures/skins/{username}.png
   - To preview the cape: Load from http://91.197.6.177:24607/api/textures/capes/{username}.png
   - If using CustomSkinLoader mod, configure it to fetch: http://91.197.6.177:24607/api/users/{username}.json

3. GAME LAUNCH:
   - Pass the UUID and Access Token correctly to the Minecraft process.
   - Ensure the 'userType' argument is set to 'mojang' or 'legacy' to avoid demo mode.
   
4. DATABASE:
   - Do NOT access the MySQL database directly from the launcher client.
   - Always use the API endpoints provided above.

5. ERROR HANDLING:
   - If skin texture returns 404, display a default Steve/Alex skin.
   - Setup automatic token refresh on launcher start using /authserver/validate and /authserver/refresh.
```
