document.getElementById('minimize-btn').addEventListener('click', () => {
    window.api.minimize();
});
document.getElementById('close-btn').addEventListener('click', () => {
    window.api.close();
});
const navHomeBtn = document.getElementById('nav-home-btn');
if (navHomeBtn) {
    navHomeBtn.addEventListener('click', () => {
        window.api.openExternal('https://hg.studio');
    });
}
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const intro = document.getElementById('intro-screen');
        if (intro) {
            intro.style.transition = "opacity 0.5s ease";
            intro.style.opacity = '0';
            setTimeout(() => intro.remove(), 600);
        }
    }, 1000);
});
(async () => {
    try {
        const savedSettings = await window.api.getSettings();
        if (savedSettings.activeTheme) {
            const themes = await window.api.getThemes();
            const currentTheme = themes.find(t => t.id === savedSettings.activeTheme);
            if (currentTheme) {
                document.documentElement.style.setProperty('--primary-pink', currentTheme.accentColor);
                if (window.updateSelectorForTheme) window.updateSelectorForTheme(currentTheme.id);
                
                const bgVideo = document.getElementById('bg-video');
                const bgImage = document.getElementById('bg-image');
                
                if (currentTheme.bgType === 'image') {
                     if (bgVideo) {
                         bgVideo.style.display = 'none';
                         bgVideo.pause();
                     }
                     if (bgImage) {
                         bgImage.style.display = 'block';
                         bgImage.src = `assets/themes/${currentTheme.folder}/${currentTheme.bgFile}`;
                     }
                } else {
                     if (bgImage) bgImage.style.display = 'none';
                     if (bgVideo) {
                         bgVideo.style.display = 'block';
                         bgVideo.src = `assets/themes/${currentTheme.folder}/${currentTheme.bgFile || 'background.mp4'}`;
                         bgVideo.play().catch(e => {}); 
                     }
                }
            } else {
            }
        } else if (savedSettings.accentColor) {
             document.documentElement.style.setProperty('--primary-pink', savedSettings.accentColor);
        }
    } catch(e) {
        console.warn("Theme startup error:", e);
    }
    const appVersion = await window.api.getAppVersion();
    const versionEl = document.getElementById('current-version');
    if (versionEl) versionEl.innerText = appVersion;
    const TARGET_UUID = "f47859908c724114821e98beaec87a2b";
    let activeUserUUID = null;
    try {
         const hgUser = JSON.parse(localStorage.getItem('hg_user_data'));
         if (hgUser && hgUser.uuid) activeUserUUID = hgUser.uuid;
         else {
             const msUser = JSON.parse(localStorage.getItem('user_session'));
             if (msUser && msUser.uuid) activeUserUUID = msUser.uuid;
         }
    } catch(e) {}
    if (activeUserUUID) activeUserUUID = activeUserUUID.replace(/-/g, '').toLowerCase();
    if (activeUserUUID === TARGET_UUID) {
        console.log("Welcome Leane <3");
        const footer = document.getElementById('love-footer');
        if(footer) footer.style.display = 'block';
        const loveBtn = document.getElementById('btn-leane');
        if(loveBtn) {
            loveBtn.style.display = 'flex';
            loveBtn.onclick = () => window.api.openExternal('http://91.197.6.177:24607/leane/');
        }
        const loveSetting = document.getElementById('setting-leane-container');
        if(loveSetting) loveSetting.style.display = 'flex';
        const settings = await window.api.getSettings();
        const popup = document.getElementById('love-popup');
        if (!settings.hideLovePopup && popup) {
            popup.style.display = 'flex';
            const closeBtn = document.getElementById('love-close-btn');
            const checkbox = document.getElementById('love-popup-checkbox');
            closeBtn.onclick = async () => {
                popup.style.display = 'none';
                if (checkbox.checked) {
                    await window.api.saveSettings({ ...settings, hideLovePopup: true });
                    const settToggle = document.getElementById('s-love-popup');
                    if(settToggle) settToggle.checked = false; 
                }
            };
        }
        const settToggle = document.getElementById('s-love-popup'); 
        if(settToggle) {
            settToggle.checked = !settings.hideLovePopup; 
            settToggle.addEventListener('change', async (e) => {
                const show = e.target.checked;
                const newSettings = await window.api.getSettings();
                await window.api.saveSettings({ ...newSettings, hideLovePopup: !show });
            });
        }
    }
        try {
            let updateCheck = await window.api.checkUpdate();
            if (updateCheck.updateAvailable) {
                 const popup = document.getElementById('update-popup');
                 const versionText = document.getElementById('popup-new-version');
                 const updateBtn = document.getElementById('popup-update-btn');
                 const statusText = document.getElementById('popup-update-status');
                 const closeBtn = document.getElementById('update-popup-close-btn');
                 const notifyBtn = document.getElementById('update-notify-btn');
                 if (popup) {
                     popup.style.display = 'flex'; 
                     if(versionText) versionText.innerText = updateCheck.version;
                     if(notifyBtn) {
                         notifyBtn.style.display = 'block';
                         notifyBtn.addEventListener('click', () => {
                             popup.style.display = 'flex';
                         });
                     }
                     if(closeBtn) {
                         closeBtn.addEventListener('click', () => {
                             popup.style.display = 'none';
                         });
                     }
                     window.api.on('update-progress', (progress) => {
                        // AUTO-UPDATE UI
                        if(updateBtn) updateBtn.style.display = 'none'; 
                        statusText.innerText = `Mise à jour en cours : ${progress}%`;
                        
                        let bar = document.getElementById('update-progress-bar');
                        if (!bar) {
                            bar = document.createElement('div');
                            bar.id = 'update-progress-bar';
                            bar.style.width = '100%';
                            bar.style.height = '6px';
                            bar.style.background = '#333';
                            bar.style.borderRadius = '3px';
                            bar.style.marginTop = '10px';
                            bar.style.overflow = 'hidden';
                            const fill = document.createElement('div');
                            fill.id = 'update-progress-fill';
                            fill.style.width = '0%';
                            fill.style.height = '100%';
                            fill.style.background = 'var(--primary-pink)'; // Using theme color
                            fill.style.transition = 'width 0.2s';
                            bar.appendChild(fill);
                            statusText.parentNode.insertBefore(bar, statusText.nextSibling);
                        }
                        const fill = document.getElementById('update-progress-fill');
                        if (fill) fill.style.width = `${progress}%`;
                     });
                     
                     // AUTO-START FUNCTION
                     const startAutoUpdate = async () => {
                         if(updateBtn) {
                             updateBtn.style.display = 'none';
                             updateBtn.disabled = true;
                         }
                         statusText.innerText = "Démarrage automatique du téléchargement...";
                         try {
                             await window.api.installUpdate(updateCheck.url);
                         } catch (err) {
                             statusText.innerText = "Erreur: " + err;
                             if(updateBtn) {
                                  updateBtn.style.display = 'block';
                                  updateBtn.disabled = false;
                                  updateBtn.innerHTML = "Réessayer";
                             }
                         }
                     };

                     updateBtn.addEventListener('click', startAutoUpdate);
                     
                     // Trigger immediately
                     startAutoUpdate();
                 }
            }
        } catch (err) {
            console.error("Update check failed:", err);
        }
    document.querySelector('.user-profile-btn').style.visibility = 'hidden';
    const gameNav = document.querySelector('.game-nav-container'); if(gameNav) gameNav.style.visibility = 'hidden';
    const savedSession = localStorage.getItem('hg_session_token');
    const savedUser = localStorage.getItem('hg_user_data');
    if (savedSession && savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            const sessionDate = localStorage.getItem('hg_session_date');
            const MAX_AGE = 3 * 24 * 60 * 60 * 1000;
            if (sessionDate && (Date.now() - parseInt(sessionDate)) < MAX_AGE) {
                console.log("Auto-login triggered");
                await window.api.restoreSession(userData);
                handleLoginSuccess(userData);
                return; 
            } else {
                console.log("Session expired");
                localStorage.removeItem('hg_session_token');
                localStorage.removeItem('hg_user_data');
            }
        } catch (e) {
            console.error("Auto-login failed", e);
        }
    }
    try {
        const config = await window.api.getLauncherConfig();
        if (config && config.activeModpack && config.activeModpack.name) {
            const modpackNameEl = document.getElementById('modpack-name');
            if (modpackNameEl) {
                modpackNameEl.innerText = config.activeModpack.name;
            }
        }
        if (config && config.maintenance) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('maintenance-screen').style.display = 'flex';
            return; 
        }
    } catch (e) {
        console.error("Failed to check maintenance/update", e);
    }
})();
const loginBtn = document.getElementById('login-btn');
const loginUser = document.getElementById('login-user');
const loginPass = document.getElementById('login-pass');
const loginError = document.getElementById('login-error');
const microsoftLoginBtn = document.getElementById('microsoft-login-btn');
const stayConnectedContainer = document.querySelector('.login-checkbox-container');
const stayConnectedCheckbox = document.getElementById('stay-connected');
if (stayConnectedContainer && stayConnectedCheckbox) {
    stayConnectedContainer.addEventListener('click', (e) => {
        if (!e.target.closest('.switch')) {
            stayConnectedCheckbox.checked = !stayConnectedCheckbox.checked;
        }
    });
}
if (localStorage.getItem('savedIdentifier')) {
    loginUser.value = localStorage.getItem('savedIdentifier');
}
loginPass.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        loginBtn.click();
    }
});
loginBtn.addEventListener('click', async () => {
    const identifier = loginUser.value;
    const password = loginPass.value;
    if (!identifier || !password) {
        loginError.innerText = "Veuillez remplir tous les champs.";
        return;
    }
    loginBtn.disabled = true;
    loginBtn.innerText = "Connexion...";
    loginError.innerText = "";
    try {
        const result = await window.api.login({ identifier, password });
        if (result.success) {
            localStorage.setItem('savedIdentifier', identifier);
            const stayConnected = document.getElementById('stay-connected').checked;
            if (stayConnected) {
                const token = btoa(identifier + Date.now());
                localStorage.setItem('hg_session_token', token);
                localStorage.setItem('hg_user_data', JSON.stringify(result.user));
                localStorage.setItem('hg_session_date', Date.now().toString());
            } else {
                localStorage.removeItem('hg_session_token');
                localStorage.removeItem('hg_user_data');
            }
            handleLoginSuccess(result.user);
        } else {
            loginError.innerText = result.message;
            loginBtn.disabled = false;
            loginBtn.innerText = "Se connecter";
        }
    } catch (error) {
        loginError.innerText = "Erreur de connexion.";
        loginBtn.disabled = false;
        loginBtn.innerText = "Se connecter";
    }
});
if (microsoftLoginBtn) {
    microsoftLoginBtn.addEventListener('click', () => {
        window.api.openExternal('https://hgstudio.strator.gg/auth/microsoft?source=launcher');
    });
}
window.api.onAuthSuccess((user) => {
    handleLoginSuccess(user);
});
function handleLoginSuccess(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';
    window.api.updateRpc({
        details: 'Dans les menus',
        state: `Connecté: ${user.username}`,
        largeImageKey: 'logo', 
        largeImageText: 'HG Launcher'
    });
    document.querySelector('.user-profile-btn').style.visibility = 'visible';
    if(document.querySelector('.game-nav-container')) document.querySelector('.game-nav-container').style.visibility = 'visible';
    const userNameEl = document.getElementById('user-name-header');
    if (userNameEl) {
        userNameEl.innerText = user.username;
    }
    const settingUserNameEl = document.getElementById('setting-user-name');
    if (settingUserNameEl) {
        settingUserNameEl.innerText = user.username;
    }
    const userAvatarEl = document.getElementById('user-avatar-header');
    if (userAvatarEl) {
        userAvatarEl.style.backgroundImage = `url('https://minotar.net/helm/${user.username}/100.png')`;
    }
    const settingAvatarEl = document.getElementById('setting-user-avatar');
    if (settingAvatarEl) {
        settingAvatarEl.style.backgroundImage = `url('https://minotar.net/helm/${user.username}/100.png')`;
    }
}
const profileTrigger = document.getElementById('profile-trigger');
const profileDropdown = document.getElementById('profile-dropdown');
const dropdownSettings = document.getElementById('dropdown-settings');
const dropdownLogout = document.getElementById('dropdown-logout');
profileTrigger.addEventListener('click', (e) => {
    e.stopPropagation(); 
    profileDropdown.classList.toggle('active');
});
document.addEventListener('click', (e) => {
    if (!profileTrigger.contains(e.target)) {
        profileDropdown.classList.remove('active');
    }
});
dropdownSettings.addEventListener('click', () => {
    window.api.openExternal('http://91.197.6.177:24607/dashboard');
});
dropdownLogout.addEventListener('click', () => {
    localStorage.removeItem('hg_session_token');
    localStorage.removeItem('hg_user_data');
    window.api.restoreSession(null); 
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    document.querySelector('.user-profile-btn').style.visibility = 'hidden';
    if(document.querySelector('.game-nav-container')) document.querySelector('.game-nav-container').style.visibility = 'hidden';
    profileDropdown.classList.remove('active');
    loginBtn.disabled = false;
    loginBtn.innerText = "Se connecter";
    loginPass.value = ""; 
});
const btnInstagram = document.getElementById('btn-instagram');
const btnTiktok = document.getElementById('btn-tiktok');
const btnDiscord = document.getElementById('btn-discord');
if (btnInstagram) {
    btnInstagram.addEventListener('click', () => {
        window.api.openExternal('https://www.instagram.com/hg.oo_pv');
    });
}
if (btnTiktok) {
    btnTiktok.addEventListener('click', () => {
        window.api.openExternal('https://www.tiktok.com/@hg.oo.prv');
    });
}
if (btnDiscord) {
    btnDiscord.addEventListener('click', () => {
        window.api.openExternal('https://discord.com/invite/VDhFQH5vtf');
    });
}
const launchBtn = document.getElementById('launch-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingLog = document.getElementById('loading-log');
const verBase = document.getElementById('ver-base');
const verEnhanced = document.getElementById('ver-enhanced');
const verAtm10 = document.getElementById('ver-atm10');
const verHardcore = document.getElementById('ver-hardcore');
const modpackNameStatus = document.getElementById('modpack-name');

window.updateSelectorForTheme = (themeId) => {
    if (!themeId) return;
    const t = themeId.toLowerCase();
    
    // Hide all first? Or manage explicitly.
    // ATM10 Case
    if (t.includes('atm10')) {
        if(verBase) verBase.style.display = 'none';
        if(verEnhanced) verEnhanced.style.display = 'none';
        if(verHardcore) verHardcore.style.display = 'none';
        if(verAtm10) {
            verAtm10.style.display = 'flex';
            verAtm10.click(); 
        }
    } 
    // Hardcore Case
    else if (t.includes('hardcore')) {
        if(verBase) verBase.style.display = 'none';
        if(verEnhanced) verEnhanced.style.display = 'none';
        if(verAtm10) verAtm10.style.display = 'none';
        if(verHardcore) {
            verHardcore.style.display = 'flex';
            verHardcore.click();
        }
    } 
    // Default Case (HG S1 / Enhanced)
    else {
        if(verAtm10) verAtm10.style.display = 'none';
        if(verHardcore) verHardcore.style.display = 'none';
        
        if(verBase) verBase.style.display = 'flex';
        if(verEnhanced) verEnhanced.style.display = 'flex';
        
        // Return to base if we were in another mode
        const isAtmActive = verAtm10 && verAtm10.classList.contains('active');
        const isHcActive = verHardcore && verHardcore.classList.contains('active');
        
        if (isAtmActive || isHcActive || (!verBase.classList.contains('active') && !verEnhanced.classList.contains('active'))) {
            verBase.click();
        }
    }
}

// Unified Version Logic
const setVersion = (version) => {
    launchBtn.style.color = 'transparent';
    
    setTimeout(() => {
        // Reset classes
        if(verBase) verBase.classList.remove('active');
        if(verEnhanced) verEnhanced.classList.remove('active');
        if(verAtm10) verAtm10.classList.remove('active');
        if(verHardcore) verHardcore.classList.remove('active');

        if (version === 'base') {
            if(verBase) verBase.classList.add('active');
            launchBtn.classList.remove('coming-soon');
            launchBtn.innerHTML = 'JOUER';
            if (modpackNameStatus) modpackNameStatus.innerText = 'Prêt à jouer';
        } else if (version === 'enhanced') {
            if(verEnhanced) verEnhanced.classList.add('active');
            launchBtn.classList.add('coming-soon');
            launchBtn.innerHTML = 'BIENTÔT DISPONIBLE';
            if (modpackNameStatus) modpackNameStatus.innerText = 'HG Studio Enhanced';
        } else if (version === 'atm10') {
            if(verAtm10) verAtm10.classList.add('active');
            launchBtn.classList.remove('coming-soon');
            launchBtn.innerHTML = 'JOUER';
            if (modpackNameStatus) modpackNameStatus.innerText = 'All The Mods 10-5.5';
        } else if (version === 'hardcore') {
            if (verHardcore) verHardcore.classList.add('active');
            launchBtn.classList.remove('coming-soon');
            launchBtn.innerHTML = 'JOUER (HC)';
            if (modpackNameStatus) modpackNameStatus.innerText = 'Mode Hardcore';
        }
        
        launchBtn.style.color = '';
    }, 200); 
};

if(verBase) verBase.addEventListener('click', () => setVersion('base'));
if(verEnhanced) verEnhanced.addEventListener('click', () => setVersion('enhanced'));
if(verAtm10) verAtm10.addEventListener('click', () => setVersion('atm10'));
if(verHardcore) verHardcore.addEventListener('click', () => setVersion('hardcore'));
launchBtn.addEventListener('click', async () => {
    if (launchBtn.classList.contains('coming-soon')) return;
    loadingOverlay.style.display = 'flex';
    loadingLog.innerText = "INITIALISATION...";
    try {
        window.api.updateRpc({
            details: 'Joue à Minecraft',
            state: 'HG Studio',
            startTimestamp: Date.now(),
            largeImageKey: 'logo',
            largeImageText: 'HG Studio'
        });
        const settings = await window.api.getSettings();
        const config = await window.api.getLauncherConfig();
        let targetModpack = config.activeModpack; 
        const currentThemeId = settings.activeTheme || 'Autum'; 
        if (currentThemeId === 'Cherry' && config.modpack_cherry) {
            targetModpack = config.modpack_cherry;
            console.log("Using Cherry Modpack");
        } else if (currentThemeId === 'Atm10' && config.modpack_atm10) {
            targetModpack = config.modpack_atm10;
            console.log("Using Atm10 Modpack");
        } else if (currentThemeId === 'Autum' && config.modpack_autumn) {
            targetModpack = config.modpack_autumn;
            console.log("Using Autumn Modpack");
        } else {
             console.log("Using Default Active Modpack");
        }
        const result = await window.api.launchGame({
            ...settings,
            activeModpack: targetModpack 
        });
        console.log(result);
    } catch (error) {
        console.error(error);
        loadingOverlay.style.display = 'none'; 
        alert("Erreur de lancement !");
    }
});
window.api.onLog((text) => {
    console.log("Launcher Log:", text);
    if (typeof text === 'string') {
        let displayText = text;
        if (text.startsWith('[Progress]')) {
            displayText = text.replace('[Progress] ', '');
        }
        loadingLog.innerText = displayText;
    }
    if (text === 'Game closed.') {
        loadingOverlay.style.display = 'none';
    }
});
window.api.onStopLoading(() => {
    loadingOverlay.style.display = 'none';
    loadingLog.innerText = "";
});
const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const ramSlider = document.getElementById('ram-slider');
const ramValue = document.getElementById('ram-value');
const sysRamTotal = document.getElementById('sys-ram-total');
const javaPath17 = document.getElementById('java-path-17');
const javaPath8 = document.getElementById('java-path-8');
const javaPath21 = document.getElementById('java-path-21');
const jvmArgsInput = document.getElementById('jvm-args');
const resWidthInput = document.getElementById('res-width');
const resHeightInput = document.getElementById('res-height');
const fullscreenToggle = document.getElementById('fullscreen-toggle');
const closeLauncherToggle = document.getElementById('close-launcher-toggle');
const debugConsoleToggle = document.getElementById('debug-console-toggle');
const tabButtons = document.querySelectorAll('.settings-nav li');
const tabContents = document.querySelectorAll('.settings-tab');
const settingsNav = document.querySelectorAll('.nav-item');
const settingsTabs = document.querySelectorAll('.tab-content');
const doneBtn = document.getElementById('close-settings-btn'); 
const s_gameWidth = document.getElementById('game-width');
const s_gameHeight = document.getElementById('game-height');
const s_fullscreen = document.getElementById('s-fullscreen');
const s_autoconnect = document.getElementById('s-autoconnect');
const s_detached = document.getElementById('s-detached');
const s_ramSlider = document.getElementById('java-ram-slider');
const s_ramDisplay = document.getElementById('ram-display-val');
const s_sysFree = document.getElementById('sys-ram-free');
const s_sysTotal = document.getElementById('sys-ram-total');
const s_javaPath = document.getElementById('java-path-input');
const s_javaArgs = document.getElementById('java-args-input');
const s_browseJava = document.getElementById('browse-java-btn');
const s_prerelease = document.getElementById('s-prerelease');
const s_dataDir = document.getElementById('data-dir-input');
const s_openDataDir = document.getElementById('open-data-dir-btn');
settingsNav.forEach(nav => {
    nav.addEventListener('click', () => {
        settingsNav.forEach(n => n.classList.remove('active'));
        settingsTabs.forEach(t => t.classList.remove('active'));
        nav.classList.add('active');
        const tabId = nav.getAttribute('data-tab');
        const content = document.getElementById(`tab-${tabId}`);
        if(content) content.classList.add('active');
    });
});
s_ramSlider.addEventListener('input', () => {
    const mb = parseInt(s_ramSlider.value);
    s_ramDisplay.innerText = mb;
    const min = parseInt(s_ramSlider.min);
    const max = parseInt(s_ramSlider.max);
    const percentage = ((mb - min) / (max - min)) * 100;
    s_ramSlider.style.background = `linear-gradient(to right, var(--primary-pink) 0%, var(--primary-pink) ${percentage}%, #444 ${percentage}%, #444 100%)`;
});
settingsBtn.addEventListener('click', async () => {
    document.body.classList.add('settings-active');
    const settings = await window.api.getSettings();
    const sysInfo = await window.api.getSystemInfo();
    const appVersion = await window.api.getAppVersion();
    const verDisplay = document.getElementById('app-version-display');
    if (verDisplay) verDisplay.innerText = `v${appVersion}`;
    const totalMemMB = Math.floor(sysInfo.totalMem / 1024 / 1024);
    const freeMemMB = Math.floor(sysInfo.freeMem / 1024 / 1024);
    if(s_sysTotal) s_sysTotal.innerText = (totalMemMB / 1024).toFixed(1);
    if(s_sysFree) s_sysFree.innerText = (freeMemMB / 1024).toFixed(1);
    s_ramSlider.max = totalMemMB;
    if (settings.resolution) {
        s_gameWidth.value = settings.resolution.width || 1280;
        s_gameHeight.value = settings.resolution.height || 720;
    }
    s_fullscreen.checked = settings.fullscreen || false;
    s_autoconnect.checked = !!settings.autoConnectIP;
    s_detached.checked = settings.closeLauncher !== false; 
    let currentRam = 4096;
    if (settings.maxRam) {
        currentRam = parseInt(settings.maxRam);
    }
    s_ramSlider.value = currentRam;
    s_ramSlider.dispatchEvent(new Event('input')); 
    const jp17 = document.getElementById('java-path-17');
    const jp8 = document.getElementById('java-path-8');
    const jp21 = document.getElementById('java-path-21');
    if (jp17) jp17.value = settings.javaPath17 || settings.javaPath || "";
    if (jp8) jp8.value = settings.javaPath8 || "";
    if (jp21) jp21.value = settings.javaPath21 || "";
    const bindBrowse = (browseId, inputId) => {
        const fileInput = document.getElementById(browseId);
        if(fileInput) {
            fileInput.onchange = (e) => {
                if(e.target.files[0]) {
                     document.getElementById(inputId).value = e.target.files[0].path;
                }
            };
        }
    };
    bindBrowse('browse-17', 'java-path-17');
    bindBrowse('browse-8', 'java-path-8');
    bindBrowse('browse-21', 'java-path-21');
    s_javaArgs.value = settings.jvmArgs || "";
    s_prerelease.checked = false; 
    s_dataDir.value = "Default (AppData/.hg_oo)";
    const carouselContainer = document.getElementById('theme-carousel-container');
    if (carouselContainer) {
        carouselContainer.innerHTML = '<div class="loading-themes"><i class="fas fa-circle-notch fa-spin"></i> Chargement...</div>';
        try {
            const themes = await window.api.getThemes();
            carouselContainer.innerHTML = ''; 
            if (themes.length === 0) {
                carouselContainer.innerHTML = '<p style="color:#888;">Aucun thème trouvé (src/assets/themes).</p>';
            }
            themes.forEach(theme => {
                const card = document.createElement('div');
                card.className = 'theme-card';
                if (settings.activeTheme === theme.id) {
                    card.classList.add('active');
                }
                
                let previewHtml;
                if (theme.bgType === 'image') {
                    const imgSrc = `assets/themes/${theme.folder}/${theme.logoFile || theme.bgFile}`;
                    previewHtml = `
                    <div class="theme-preview">
                        <img src="${imgSrc}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>`;
                } else {
                     const videoSrc = `assets/themes/${theme.folder}/${theme.bgFile || 'background.mp4'}`;
                     previewHtml = `
                    <div class="theme-preview">
                        <video muted loop preload="metadata">
                            <source src="${videoSrc}" type="video/mp4">
                        </video>
                        <i class="fas fa-play preview-play-icon"></i>
                    </div>`;
                }
                
                card.innerHTML = `
                    ${previewHtml}
                    <div class="theme-info">
                        <span class="theme-title" title="${theme.title}">${theme.title}</span>
                        <div class="theme-color-dot" style="background-color: ${theme.accentColor}"></div>
                    </div>
                `;

                if (theme.bgType !== 'image') {
                    const video = card.querySelector('video');
                    card.addEventListener('mouseenter', () => { video.play().catch(e => {}); });
                    card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });
                }

                card.addEventListener('click', async () => {
                    document.documentElement.style.setProperty('--primary-pink', theme.accentColor);
                    if (window.updateSelectorForTheme) window.updateSelectorForTheme(theme.id);
                    
                     const bgVideo = document.getElementById('bg-video');
                     const bgImage = document.getElementById('bg-image');
                     
                     if (theme.bgType === 'image') {
                         if (bgVideo) { bgVideo.style.display = 'none'; bgVideo.pause(); }
                         if (bgImage) {
                             bgImage.style.display = 'block';
                             bgImage.src = `assets/themes/${theme.folder}/${theme.bgFile}`;
                         }
                     } else {
                         if (bgImage) bgImage.style.display = 'none';
                         if (bgVideo) {
                             bgVideo.style.display = 'block';
                             bgVideo.src = `assets/themes/${theme.folder}/${theme.bgFile}`;
                             bgVideo.play().catch(e => console.error(e));
                         }
                     }

                    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    
                    try {
                        const currentSettings = await window.api.getSettings();
                        await window.api.saveSettings({
                            ...currentSettings,
                            activeTheme: theme.id,
                            accentColor: theme.accentColor
                        });
                        if (typeof settings !== 'undefined') {
                            settings.activeTheme = theme.id;
                            settings.accentColor = theme.accentColor;
                        }
                    } catch (err) {
                        console.error("Error saving theme:", err);
                    }
                });
                carouselContainer.appendChild(card);
            });
        } catch (e) {
            console.error("Failed to load themes:", e);
            carouselContainer.innerHTML = '<p style="color:#f55;">Erreur de chargement des thèmes.</p>';
        }
    }
    refreshAccountList();
    if (typeof managerTypes !== 'undefined') {
        managerTypes.forEach(t => refreshManagerList(t));
    }
    settingsScreen.style.display = 'flex';
});
if (s_browseJava) {
    s_browseJava.addEventListener('click', async () => {
        const path = await window.api.openFileDialog();
        if (path) {
            s_javaPath.value = path;
        }
    });
}
doneBtn.addEventListener('click', async () => {
    doneBtn.innerText = "Sauvegarde...";
    document.body.classList.remove('settings-active');
    const ramVal = s_ramSlider.value;
    const autoConnectIP = s_autoconnect.checked ? "play.hg.studio" : "";
    let currentSettings = {};
    try {
        currentSettings = await window.api.getSettings();
    } catch (e) { console.error("Could not fetch settings before save", e); }
    const jp17 = document.getElementById('java-path-17').value;
    const jp8 = document.getElementById('java-path-8').value;
    const jp21 = document.getElementById('java-path-21').value;
    const newSettings = {
        ...currentSettings, 
        minRam: `${ramVal}M`,
        maxRam: `${ramVal}M`,
        javaPath: jp17, 
        javaPath17: jp17,
        javaPath8: jp8, 
        javaPath21: jp21, 
        jvmArgs: s_javaArgs.value,
        resolution: {
            width: parseInt(s_gameWidth.value) || 1280,
            height: parseInt(s_gameHeight.value) || 720
        },
        fullscreen: s_fullscreen.checked,
        closeLauncher: s_detached.checked,
        autoConnectIP: autoConnectIP,
        discordRPC: true 
    };
    await window.api.saveSettings(newSettings);
    doneBtn.innerText = "Terminé";
    settingsScreen.style.display = 'none';
});
const playerCountEl = document.getElementById('player-count');
const serverStatusDot = document.getElementById('server-status-dot');
async function updateServerStatus() {
    try {
        const response = await fetch('https://api.mcsrvstat.us/2/play.hg.studio');
        const data = await response.json();
        if (data.online) {
            playerCountEl.innerText = `${data.players.online}/${data.players.max}`;
            serverStatusDot.style.backgroundColor = '#00ff88'; 
            serverStatusDot.style.boxShadow = '0 0 10px #00ff88';
        } else {
            playerCountEl.innerText = "OFFLINE";
            serverStatusDot.style.backgroundColor = '#ff0055'; 
            serverStatusDot.style.boxShadow = '0 0 10px #ff0055';
        }
    } catch (error) {
        console.error("Failed to fetch server status:", error);
        playerCountEl.innerText = "ERROR";
        serverStatusDot.style.backgroundColor = '#ffaa00'; 
    }
}
updateServerStatus();
setInterval(updateServerStatus, 60000);
const checkUpdateBtn = document.getElementById('check-update-btn');
const updateStatus = document.getElementById('update-status');
if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', async () => {
        checkUpdateBtn.disabled = true;
        checkUpdateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Vérification...';
        updateStatus.innerText = "";
        updateStatus.className = "status-msg";
        try {
            const result = await window.api.checkUpdate();
            if (result.error) {
                updateStatus.innerText = "Erreur: " + result.error;
                updateStatus.classList.add('error');
                checkUpdateBtn.disabled = false;
                checkUpdateBtn.innerHTML = '<i class="fas fa-search"></i> Réessayer';
            } else if (result.updateAvailable) {
                updateStatus.innerText = 'Nouvelle version disponible : ' + result.version;
                updateStatus.classList.add('success');
                checkUpdateBtn.innerHTML = '<i class="fas fa-download"></i> Installer';
                checkUpdateBtn.disabled = false;
                const newBtn = checkUpdateBtn.cloneNode(true);
                checkUpdateBtn.parentNode.replaceChild(newBtn, checkUpdateBtn);
                newBtn.addEventListener('click', async () => {
                    newBtn.disabled = true;
                    newBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Téléchargement...';
                    try {
                        await window.api.installUpdate(result.url);
                    } catch (e) {
                        alert("Erreur lors de la mise à jour : " + e);
                        newBtn.disabled = false;
                        newBtn.innerHTML = '<i class="fas fa-download"></i> Installer';
                    }
                });
            } else {
                updateStatus.innerText = "Le launcher est à jour.";
                updateStatus.classList.add('info');
                checkUpdateBtn.innerHTML = '<i class="fas fa-check"></i> À jour';
                setTimeout(() => {
                    checkUpdateBtn.disabled = false;
                    checkUpdateBtn.innerHTML = '<i class="fas fa-search"></i> Vérifier les mises à jour';
                }, 2000);
            }
        } catch (error) {
            console.error(error);
            updateStatus.innerText = "Erreur de connexion.";
            updateStatus.classList.add('error');
            checkUpdateBtn.disabled = false;
            checkUpdateBtn.innerHTML = '<i class="fas fa-search"></i> Réessayer';
        }
    });
}
function setupJavaControls(version) {
    const inputId = `java-path-${version}`;
    const installBtnId = `btn-install-${version}`;
    const detectBtnId = `btn-detect-${version}`;
    const browseBtnId = `btn-browse-${version}`;
    const testBtnId = `btn-test-${version}`;
    const input = document.getElementById(inputId);
    const installBtn = document.getElementById(installBtnId);
    const detectBtn = document.getElementById(detectBtnId);
    const browseBtn = document.getElementById(browseBtnId);
    const testBtn = document.getElementById(testBtnId);
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
             const originalContent = installBtn.innerHTML;
             installBtn.disabled = true;
             installBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Installation...`;
             try {
                 const result = await window.api.installJava(version);
                 if (result.success && result.path) {
                     input.value = result.path;
                     installBtn.innerHTML = `<i class="fas fa-check"></i> Installé !`;
                     setTimeout(() => {
                        installBtn.innerHTML = originalContent;
                        installBtn.disabled = false;
                     }, 3000);
                 } else {
                     alert("Erreur d'installation: " + (result.error || "Inconnue"));
                     installBtn.innerHTML = `<i class="fas fa-times"></i> Erreur`;
                     setTimeout(() => { installBtn.innerHTML = originalContent; installBtn.disabled = false; }, 3000);
                 }
             } catch (e) {
                 console.error(e);
                 alert("Erreur critique: " + e);
                 installBtn.innerHTML = originalContent;
                 installBtn.disabled = false;
             }
        });
    }
    if (detectBtn) {
        detectBtn.addEventListener('click', async () => {
             detectBtn.disabled = true;
             detectBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
             const path = await window.api.detectJava(version);
             if (path) {
                 input.value = path;
             } else {
                 alert(`Java ${version} non trouvé automatiquement.`);
             }
             detectBtn.innerHTML = `<i class="fas fa-search"></i> Detect`;
             detectBtn.disabled = false;
        });
    }
    if (browseBtn) {
        browseBtn.addEventListener('click', async () => {
            const path = await window.api.openFileDialog();
            if (path) {
                input.value = path;
            }
        });
    }
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
             const path = input.value;
             if (!path) return alert("Veuillez d'abord sélectionner un chemin Java.");
             testBtn.disabled = true;
             testBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
             const result = await window.api.testJava(path);
             alert(result.success ? "Test Réussi :\n" + result.output : "Echec du test :\n" + result.output);
             testBtn.innerHTML = `<i class="fas fa-play"></i> Test`;
             testBtn.disabled = false;
        });
    }
}
[21, 17, 8].forEach(v => setupJavaControls(v));
const mapBtn = document.getElementById('btn-map');
const mapScreen = document.getElementById('map-screen');
const closeMapBtn = document.getElementById('close-map-btn');
const mapIframe = document.getElementById('map-iframe');
const MAP_URL = "https://badlands.mystrator.com/s/ffb5be70-4184-4fb9-8d7d-deafd87abadf/#overworld:1661:0:1168:10835:-1.6:0:0:0:perspective";
if (mapBtn && mapScreen && closeMapBtn) {
    mapBtn.addEventListener('click', () => {
        mapScreen.style.display = 'flex';
        if (mapIframe && mapIframe.src !== MAP_URL) {
             mapIframe.src = MAP_URL;
        }
    });
    closeMapBtn.addEventListener('click', () => {
        mapScreen.style.display = 'none';
        if(mapIframe) mapIframe.src = 'about:blank';
    });
}
const managerTypes = ['schematics', 'resourcepacks', 'shaderpacks'];
async function refreshManagerList(type) {
    const listContainer = document.getElementById(`list-${type}`);
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="text-align:center; color:#666; font-size:12px;">Chargement...</div>';
    try {
        const files = await window.api.getInstanceFiles(type);
        listContainer.innerHTML = ''; 
        if (files.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; color:#666; font-size:12px; margin-top:5px;">Aucun fichier</div>';
            return;
        }
        files.forEach(file => {
            const item = document.createElement('div');
            item.className = 'file-item';
            const sizeStr = (file.size / 1024 / 1024).toFixed(2) + ' MB';
            item.innerHTML = `
                <span title="${file.name}">${file.name} <small style="color:#666;">(${sizeStr})</small></span>
                <div class="file-actions">
                    <button class="btn-del" title="Supprimer"><i class="fas fa-trash"></i></button>
                </div>
            `;
            item.querySelector('.btn-del').addEventListener('click', async (e) => {
                e.stopPropagation();
                if(confirm(`Supprimer ${file.name} ?`)) {
                    await window.api.deleteInstanceFile({ type, fileName: file.name });
                    refreshManagerList(type);
                }
            });
            listContainer.appendChild(item);
        });
    } catch (e) {
        console.error("Manager error:", e);
        listContainer.innerHTML = `<div style="color:#d55;">Erreur</div>`;
    }
}
function preventDefaults (e) { e.preventDefault(); e.stopPropagation(); }
managerTypes.forEach(type => {
    const openBtn = document.querySelector(`.open-folder-btn[data-type="${type}"]`);
    if(openBtn) {
        openBtn.addEventListener('click', () => {
            window.api.openInstanceFolder(type);
        });
    }
    const dropZone = document.getElementById(`drop-${type}`);
    if(dropZone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });
        dropZone.addEventListener('drop', async (e) => {
            const files = e.dataTransfer.files;
            if(files.length > 0) {
                for (let i = 0; i < files.length; i++) {
                   await window.api.addInstanceFile({ type, sourcePath: files[i].path });
                }
                refreshManagerList(type);
            }
        });
    }
    const browseBtn = document.querySelector(`.browse-trigger[data-type="${type}"]`);
    if(browseBtn) {
        browseBtn.addEventListener('click', async () => {
            const path = await window.api.openFileDialog(); 
            if(path) {
                await window.api.addInstanceFile({ type, sourcePath: path });
                refreshManagerList(type);
            }
        });
    }
});
const wardrobeModal = document.getElementById('skin-wardrobe-modal');
const closeWardrobeBtn = document.getElementById('close-wardrobe-btn');
const importSkinBtn = document.getElementById('import-skin-btn');
const saveSkinBtn = document.getElementById('save-skin-btn');
const skinPresetsGrid = document.getElementById('skin-presets-grid');
let currentEditingAccount = null;
async function refreshAccountList() {
    const accContainer = document.getElementById('account-list-container');
    accContainer.innerHTML = ''; 
    let activeUser = null;
    let accounts = [];
    const storedAccounts = localStorage.getItem('hg_accounts');
    if (storedAccounts) {
        accounts = JSON.parse(storedAccounts);
    } else {
        let legacyUser = null;
        if (localStorage.getItem('hg_user_data')) legacyUser = JSON.parse(localStorage.getItem('hg_user_data'));
        else if (localStorage.getItem('user_session')) legacyUser = JSON.parse(localStorage.getItem('user_session'));
        if (legacyUser) {
            accounts.push(legacyUser);
            localStorage.setItem('hg_accounts', JSON.stringify(accounts));
        }
    }
    if (localStorage.getItem('hg_user_data')) {
        try {
            activeUser = JSON.parse(localStorage.getItem('hg_user_data'));
        } catch(e){}
    }
    if (accounts.length === 0) {
        accContainer.innerHTML = '<p style="color:#888; text-align:center;">Aucun compte.</p>';
        return;
    }
    accounts.forEach(acc => {
        const isActive = activeUser && activeUser.uuid === acc.uuid;
        const typeLabel = acc.type === 'hg_studio' ? 'HG Studio' : 'Microsoft';
        let avatarUrl = `https://minotar.net/helm/${acc.username}/100.png`;
        if (acc.type === 'hg_studio' && (acc.avatar_url || acc.avatar)) {
            avatarUrl = acc.avatar_url || acc.avatar;
        }
        const row = document.createElement('div');
        row.className = `account-card-row ${isActive ? 'active-acc' : ''}`;
        row.innerHTML = `
            <div class="acc-row-avatar" style="background-image: url('${avatarUrl}')"></div>
            <div class="acc-row-info">
                <span class="acc-row-name">${acc.username}</span>
                <span class="acc-row-type">${typeLabel} ${isActive ? '● Connecté' : ''}</span>
            </div>
            <div class="acc-row-actions">
                ${!isActive ? `<button class="btn-skin-edit" onclick="switchAccount('${acc.uuid}')">Connecter</button>` : ''}
                <button class="btn-skin-edit" id="edit-skin-${acc.uuid}"><i class="fas fa-tshirt"></i> Modifier Skin</button>
            </div>
        `;
        accContainer.appendChild(row);
        const editBtn = row.querySelector(`#edit-skin-${acc.uuid}`);
        editBtn.addEventListener('click', () => openWardrobe(acc));
    });
    const addBtn = document.createElement('div');
    addBtn.className = 'account-card-row add-new';
    addBtn.style.justifyContent = 'center';
    addBtn.style.cursor = 'pointer';
    addBtn.style.borderStyle = 'dashed';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Ajouter un compte';
    addBtn.onclick = () => {
        alert("Fonctionnalité d'ajout rapide en cours de développement. Veuillez utiliser la déconnexion pour changer de compte."); 
    };
    accContainer.appendChild(addBtn);
}
async function openWardrobe(account) {
    const url = "http://91.197.6.177:24607/skin"; 
    window.api.openExternal(url);
}
