# 📘 Documentation Technique & Prompt Système (HexaMC/Leane)

> **Dernière Mise à Jour** : 08/03/2026
> **URL de Production** : `http://91.197.6.177:24607/`

Ce document sert de référence technique (Prompt) pour l'IA et les développeurs. Il décrit l'architecture actuelle du projet, le schéma de base de données, la gestion des skins/capes, et les APIs utilisées par le launcher.

---

## 1. 🏗️ Architecture Globale

Le projet est une application **Node.js (Express)** monolithique servant deux sous-systèmes :
*   **HexaMC** : Backend pour un serveur Minecraft (Auth, Skins, Launcher).
*   **Leane** : Site vitrine pour services de beauté.

### Technologies
*   **Backend** : Node.js, Express.
*   **Base de Données** : MySQL (Table unique `hexa_users`).
*   **Authentification** :
    *   Web : Session Express + Cookie.
    *   Launcher : Implémentation Yggdrasil-like (RSA Key Pair).
*   **Vues** : EJS.

---

## 2. 🗄️ Base de Données (MySQL)

Une seule table principale gère les utilisateurs HexaMC.

### Table : `hexa_users`
| Colonne | Type | Description |
| :--- | :--- | :--- |
| `id` | INT (PK) | Auto-incrément. |
| `username` | VARCHAR(50) | Pseudo Minecraft (Unique). |
| `email` | VARCHAR(100) | Email utilisateur (Unique). |
| `password_hash` | VARCHAR(255) | Hash Bcrypt du mot de passe. |
| `uuid` | VARCHAR(36) | UUID Minecraft (format avec tirets) ou généré. |
| `skin_url` | VARCHAR(255) | Nom du fichier (ex: `Steve.png` ou `Pseudo.png`). |
| `skin_model` | ENUM | `'classic'` (Steve) ou `'slim'` (Alex). |
| `cape_url` | VARCHAR(255) | Nom du fichier de cape (ex: `Minecon2011.png` ou `Pseudo.png`). |
| `created_at` | TIMESTAMP | Date d'inscription. |

**Note importante** : Lors de l'inscription, un skin et une cape sont attribués **aléatoirement** depuis le dossier `src/data/presets/`.

---

## 3. 🎨 Gestion des Skins & Capes

Le système stocke les fichiers localement et les sert via des routes express.

### Stockage Physique
*   **Skins** : `storage/hexa/skins/`
*   **Capes** : `storage/hexa/capes/`
*   **Presets** : `src/data/presets/skins/` et `src/data/presets/capes/` (Sources pour l'aléatoire).

### Logique d'Upload
*   Les fichiers sont renommés en `{username}.png` pour simplifier le lien.
*   L'upload écrase le fichier précédent.

### Routes Web & API Skins
*   **Profil Utilisateur (CustomSkinLoader)** :
    *   `GET /api/users/{username}.json`
    *   Renvoie un JSON complet avec textures (Base64 ou URL) pour les mods de skins.
*   **Textures Directes** :
    *   `GET /api/textures/skins/{filename}`
    *   `GET /api/textures/capes/{filename}`

---

## 4. 🚀 APIs pour le Launcher (Yggdrasil & Config)

Le launcher communique avec ces endpoints pour l'authentification et les mises à jour.

### 🔐 Authentification (Yggdrasil-like)
Namespace : `/yggdrasil` ou monté sur `/` selon config Nginx, ici géré via `src/app.js` et `src/routes/yggdrasilRoutes.js`.

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `POST` | `/authserver/authenticate` | Connexion (Login/Mdp). Retourne `accessToken`, `clientToken`, `selectedProfile`. |
| `POST` | `/authserver/refresh` | Rafraîchir un token valide. |
| `POST` | `/authserver/validate` | Vérifier si un token est toujours valide. |
| `POST` | `/authserver/invalidate` | Déconnexion (révoque le token). |
| `POST` | `/authserver/signout` | Déconnexion complète (toutes sessions). |
| `POST` | `/sessionserver/session/minecraft/join` | Server-side join (Client -> Session Server). |
| `GET` | `/sessionserver/session/minecraft/hasJoined` | Server-side check (Server -> Session Server). |
| `GET` | `/sessionserver/session/minecraft/profile/{uuid}` | Récupère le profil (Skin/Cape) par UUID. |

### ⚙️ Configuration Launcher
Namespace : `/api`

| Méthode | Route | Description |
| :--- | :--- | :--- |
| `GET` | `/api/launcher/config` | Renvoie la configuration JSON du launcher (version, liens de téléchargement, maintenance). |

---

## 5. 📂 Structure du Projet (Nettoyée)

```
c:\Users\hugob\Documents\GitHub\hg.studio
├── public/               # Fichiers statiques (CSS, JS front, Images)
│   ├── hexa/             # Assets spécifiques HexaMC
│   └── leane/            # Assets spécifiques Leane
├── src/
│   ├── app.js            # Point d'entrée, montage des routes
│   ├── config/           # Config DB (db.js)
│   ├── controllers/      # Logique métier (Auth, Hexa, Leane, Yggdrasil)
│   ├── data/             # Données statiques & Presets (skins/capes initiaux)
│   ├── models/           # Modèles BDD (hexaUserModel.js)
│   ├── routes/           # Définitions des routes Express
│   ├── utils/            # Utilitaires (Crypto, Yggdrasil Keys)
│   └── views/            # Templates EJS
└── storage/              # Données persistantes (NON-GITHUB)
    ├── hexa/             # Skins et Capes utilisateurs
    └── keys/             # Clés RSA privées/publiques pour Yggdrasil
```

## 6. ⚠️ Instructions pour Développement Futur

1.  **Ne jamais récréer** les dossiers supprimés (`php_bridge`, anciens dossiers `storage`).
2.  **HexaMC est prioritaire** : Les modifications sur l'auth ou les skins ne doivent pas casser la compatibilité Launcher.
3.  **Propreté** : Tout nouveau feature doit être modulaire (Controller + Route séparés) et ne pas polluer `app.js`.
