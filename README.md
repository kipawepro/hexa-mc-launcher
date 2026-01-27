<p align="center">
  <img src="src/assets/logo.svg" width="150px" height="150px" alt="HG Studio Logo">
</p>

<h1 align="center">HG Studio Launcher</h1>

<p align="center">
  <strong>Le launcher officiel pour les serveurs HG Studio.</strong><br>
  Une expérience Minecraft moddée fluide, moderne et entièrement personnalisée.
</p>

<p align="center">
  <a href="#-fonctionnalités">Fonctionnalités</a> •
  <a href="#-installation">Installation</a> •
  <a href="#-développement">Développement</a> •
  <a href="#-téléchargement">Téléchargement</a>
</p>

---

## 📸 Aperçu

<p align="center">
  <img src="https://i.imgur.com/vnOdbzB.png" alt="Page d'accueil" width="45%">
  <img src="https://i.imgur.com/3WOthuI.png" alt="Paramètres & Gestionnaire" width="45%">
</p>

## ✨ Fonctionnalités

### 🎮 Expérience de Jeu Optimisée
- **Gestionnaire de Fichiers Intégré** : Glissez-déposez vos **Resource Packs**, **Shaders** et **Schematics** directement dans le launcher. Plus besoin de fouiller dans `%appdata%`.
- **Thèmes Dynamiques** : Choisissez votre ambiance (Cherry, Dragon, Autumn). Le launcher adapte non seulement l'interface, mais sélectionne aussi automatiquement le modpack correspondant sur le serveur.
- **Carte en Direct** : Accès direct à la dynmap/bluemap depuis l'interface sans ouvrir de navigateur.

### 🛠️ Gestion Technique Avancée
- **Auto-Installation Java** : Installation automatique et silencieuse des versions Java requises (Java 8, 17, 21) sans quitter le launcher.
- **Diagnostic Java** : Outils intégrés pour détecter, tester et valider votre installation Java.
- **Optimisation** : Gestion fine de l'allocation RAM et des arguments JVM.

### 💻 Interface Moderne (UI/UX)
- Design "Glassmorphism" épuré et animations fluides.
- Mode sombre natif avec scrollbars personnalisées.
- Système de mise à jour automatique.
- Authentification Microsoft Sécurisée.

## 🚀 Installation (Utilisateurs)

Téléchargez la dernière version du launcher depuis l'onglet [Releases](https://github.com/votre-pseudo/hg.launcher/releases).
Décompressez l'archive et lancez l'exécutable.

## 💻 Développement

Si vous souhaitez modifier le code source :

1. **Prérequis** :
   - Node.js (v16+)
   - Git

2. **Installation** :
   ```bash
   git clone https://github.com/votre-pseudo/hg.launcher.git
   cd hg.launcher
   npm install
   ```

3. **Lancement en mode dev** :
   ```bash
   npm start
   ```

4. **Construction (Build)** :
   ```bash
   npm run dist
   ```

## 📂 Structure du Projet

- `src/` : Code source principal
  - `index.html` : Interface principale
  - `main.js` : Processus principal Electron (Backend)
  - `renderer.js` : Logique frontend et UI
  - `preload.js` : Pont sécurisé API (ContextBridge)
  - `assets/` : Images, logos et ressources graphiques

## 📝 Crédits

Développé avec ❤️ par l'équipe **HG Studio**.
Basé sur Electron et Node.js.

---
<p align="center">Copyright © 2025 HG Studio - Tous droits réservés.</p>
