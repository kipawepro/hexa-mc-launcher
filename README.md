# 🎮 HEXA Launcher

> **Limitless Gaming Experience**  
> A next-generation Minecraft Launcher built with Electron, featuring integrated social tools, modpack management, and seamless updates.

![Hexa Launcher Banner](src/assets/logo.png)

## ✨ Key Features

### 🚀 Modern Modding Support
- **Multi-Loader Support**: Native handling for **Vanilla**, **Forge**, **NeoForge**, **Fabric**, and **Quilt**.
- **Smart Version Logic**: Automatically filters stable releases for complex loaders like NeoForge to ensure stability.
- **Modpack Browser**: Browse, download, and install modpacks directly from Modrinth or custom repositories.

### 👥 Social Hub
- **Friends System**: Add friends, see who is online, and join their games instantly.
- **Integrated Chat**: Real-time messaging with your friends directly in the launcher.
- **Party System**: Invite friends to your modded server with a single click.

### 👕 Wardrobe
- **3D Skin Preview**: View and rotate your character in real-time.
- **Skin Manager**: Upload and change your Minecraft skin instantly without leaving the app.

### 🛠️ Advanced Tools
- **Instance Isolation**: Each instance has its own mods, config, and resource packs.
- **Auto-Updater**: The launcher keeps itself up-to-date automatically (via GitHub Releases).
- **RAM Management**: Easy slider to allocate memory to Java.

---

## 📦 Installation (For Developers)

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **Git**

### Setup
1. Clone the repository:
   ```bash
   git clone <YOUR_REPO_URL>
   cd <YOUR_PROJECT_NAME>
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development build:
   ```bash
   npm start
   ```

---

## 🏗️ Building for Production

To create the executable installer (`.exe`) for Windows:

```bash
npm run dist
```

 This will generate the installer in the `dist/` folder using `electron-builder`.

---

## 🌐 API & Backend

The launcher communicates with a PHP/Node.js backend for authentication and updates.
Please refer to [API_GUIDE.md](API_GUIDE.md) for documentation on setting up the update server and version endpoints.

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## 📜 License

[ISC](https://opensource.org/licenses/ISC) © <YOUR_NAME>
