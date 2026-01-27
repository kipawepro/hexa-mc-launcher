# Changelog v3.0.0

## ✨ Nouvelles Fonctionnalités

### 📂 Gestionnaire de Fichiers de Jeu
- **Intégré dans l'onglet Jeu** : Gérez facilement vos ressources directement depuis le launcher.
- **Support complet** :
  - **Resource Packs** (.zip)
  - **Shaders** (.zip)
  - **Schematics** (.schematic / .litematic)
- **Drag & Drop** : Glissez-déposez simplement vos fichiers dans les zones dédiées pour les installer.
- **Gestion** : Visualisez la liste des fichiers installés, leur taille, et supprimez-les en un clic.
- **Accès rapide** : Bouton pour ouvrir directement le dossier correspondant dans l'explorateur.

### ☕ Gestion Avancée de Java
- **Installation Automatique** : Le bouton "Install Recommended" télécharge et installe désormais Java (versions 8, 17, 21) directement dans le launcher sans rediriger vers un site web.
- **Outils de diagnostic** :
  - **Détecter** : Trouve automatiquement les installations Java standards.
  - **Tester** : Vérifie si le chemin Java sélectionné est valide et fonctionnel.
  - **Parcourir** : Sélection manuelle de l'exécutable `java.exe`.

### 🎨 Thèmes & Modpacks
- **Connexion Thème/Jeu** : Le choix du thème (Cherry, Dragon, Autumn) influence désormais le modpack chargé au lancement via l'API.

## 💄 Interface Utilisateur (UI/UX)
- **Refonte des Paramètres** :
  - Déplacement des gestionnaires de fichiers vers la catégorie "Jeu" pour plus de cohérence.
  - Correction de la navigation par onglets (Java, Launcher, Mise à jour).
- **Design "Dark"** :
  - Nouvelles barres de défilement (Scrollbars) personnalisées, plus fines et sombres.
  - Ajustement des transparences sur le menu des paramètres.
- **Démarrage** : Ajout d'un écran d'introduction avec le logo.
- **Correctifs visuels** : Harmonisation des couleurs (utilisation des variables CSS) et correction des états de survol.

## 🐛 Corrections de Bugs
- **Onglets Paramètres** : Correction d'un bug où les onglets "Launcher" et "Mise à jour" étaient invisibles car imbriqués par erreur dans l'onglet Java.
- **Erreurs API** : Résolution des problèmes "texte rouge" dans les gestionnaires de fichiers (fonctions manquantes dans `preload.js`).
- **Sauvegarde** : Le bouton "Terminé" sauvegarde désormais correctement les préférences sans écraser le thème actif.

---
*HG.Studio Launcher - v3.0.0*
