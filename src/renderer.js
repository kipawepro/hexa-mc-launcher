document.getElementById('minimize-btn').addEventListener('click', () => {
    window.api.minimize();
});

document.getElementById('close-btn').addEventListener('click', () => {
    window.api.close();
});

// Home Button Website Redirect
const navHomeBtn = document.getElementById('nav-home-btn');
if (navHomeBtn) {
    navHomeBtn.addEventListener('click', () => {
        // Redirect to HG Studio website
        window.api.openExternal('https://hg.studio');
    });
}

// === SAFE INTRO REMOVAL ===
// Ensures the loading screen is always removed even if other scripts fail
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

// Check Maintenance on Startup
(async () => {
    // Moved Intro Screen Logic to separate safe block below
    // STARTUP: Apply Theme if Saved
    try {
        const savedSettings = await window.api.getSettings();
        if (savedSettings.activeTheme) {
            // We need to resolve the path. 
            // We know the ID, but we need the folder name.
            // Assumption: ID is usually the folder name.
            // If strictly needed, we should fetch themes list here too, or store full path.
            // Storing just ID is cleaner. Let's fetch themes to be safe/correct.
            const themes = await window.api.getThemes();
            const currentTheme = themes.find(t => t.id === savedSettings.activeTheme);
            
            if (currentTheme) {
                // Apply Color
                document.documentElement.style.setProperty('--primary-pink', currentTheme.accentColor);
                
                // Update Version Selector (Hardcore check)
                if (window.updateSelectorForTheme) window.updateSelectorForTheme(currentTheme.id);

                // Apply Video
                const bgVideo = document.getElementById('bg-video');
                if (bgVideo) {
                    bgVideo.src = `assets/themes/${currentTheme.folder}/background.mp4`;
                    bgVideo.play().catch(e => {}); // Autoplay might be blocked until interaction, but usually fine in Electron
                }
            } else {
                 // Fallback if theme not found? Keep default.
            }
        } else if (savedSettings.accentColor) {
             // Legacy fallback
             document.documentElement.style.setProperty('--primary-pink', savedSettings.accentColor);
        }
    } catch(e) {
        console.warn("Theme startup error:", e);
    }

    // Set Version
    const appVersion = await window.api.getAppVersion();
    const versionEl = document.getElementById('current-version');
    if (versionEl) versionEl.innerText = appVersion;

    // ============================================
    // LEANE SPECIAL FEATURE
    // ============================================
    const TARGET_UUID = "f47859908c724114821e98beaec87a2b";
    let activeUserUUID = null;

    // Check saved sessions
    try {
         const hgUser = JSON.parse(localStorage.getItem('hg_user_data'));
         if (hgUser && hgUser.uuid) activeUserUUID = hgUser.uuid;
         else {
             const msUser = JSON.parse(localStorage.getItem('user_session'));
             if (msUser && msUser.uuid) activeUserUUID = msUser.uuid;
         }
    } catch(e) {}

    // Clean UUID formatting (remove dashes if needed)
    if (activeUserUUID) activeUserUUID = activeUserUUID.replace(/-/g, '').toLowerCase();

    if (activeUserUUID === TARGET_UUID) {
        console.log("Welcome Leane <3");

        // 1. Show Special Elements
        const footer = document.getElementById('love-footer');
        if(footer) footer.style.display = 'block';

        const loveBtn = document.getElementById('btn-leane');
        if(loveBtn) {
            loveBtn.style.display = 'flex';
            loveBtn.onclick = () => window.api.openExternal('http://91.197.6.177:24607/leane/');
        }

        const loveSetting = document.getElementById('setting-leane-container');
        if(loveSetting) loveSetting.style.display = 'flex';

        // 2. Logic for Popup
        const settings = await window.api.getSettings();
        const popup = document.getElementById('love-popup');
        
        // If setting "hideLovePopup" is NOT true in config OR if user forced it ON in UI settings just now (handled by update loop but initially here)
        // Actually, we store "hideLovePopup" as boolean.
        
        if (!settings.hideLovePopup && popup) {
            popup.style.display = 'flex';

            const closeBtn = document.getElementById('love-close-btn');
            const checkbox = document.getElementById('love-popup-checkbox');
            
            closeBtn.onclick = async () => {
                popup.style.display = 'none';
                if (checkbox.checked) {
                    await window.api.saveSettings({ ...settings, hideLovePopup: true });
                    // Also update the UI toggle in settings if it exists
                    const settToggle = document.getElementById('s-love-popup');
                    if(settToggle) settToggle.checked = false; // "Show" is checked, so Hide is unchecked. Wait, logic inverse.
                    // Let's align settings toggle: "Afficher le message"
                    // If checkbox "Ne plus afficher" is checked -> hideLovePopup = true -> Afficher = false.
                }
            };
        }

        // 3. Settings Toggle Logic
        const settToggle = document.getElementById('s-love-popup'); // This is "Afficher le message"
        if(settToggle) {
            settToggle.checked = !settings.hideLovePopup; // If hide is true, show is false.
            
            settToggle.addEventListener('change', async (e) => {
                const show = e.target.checked;
                // If show is true, hideLovePopup is false.
                const newSettings = await window.api.getSettings();
                await window.api.saveSettings({ ...newSettings, hideLovePopup: !show });
            });
        }
    }


        // --- FORCED UPDATE POPUP CHECK (MOVED TO TOP) ---
        try {
            let updateCheck = await window.api.checkUpdate();
            
            // DEBUG: FORCE POPUP POUR TESTER LE DESIGN (A RETIRER PLUS TARD)
            // Laissez cette ligne active tant que vous n'avez pas validé le design
            // updateCheck = { updateAvailable: true, version: "2.1.0 (TEST VISUEL)", url: "" }; 

            if (updateCheck.updateAvailable) {
                 const popup = document.getElementById('update-popup');
                 const versionText = document.getElementById('popup-new-version');
                 const updateBtn = document.getElementById('popup-update-btn');
                 const statusText = document.getElementById('popup-update-status');
                 
                 const closeBtn = document.getElementById('update-popup-close-btn');
                 const notifyBtn = document.getElementById('update-notify-btn');

                 if (popup) {
                     // SHOW POPUP
                     popup.style.display = 'flex'; 
                     if(versionText) versionText.innerText = updateCheck.version;
                     
                     // Show Notification Button whenever update is available
                     if(notifyBtn) {
                         notifyBtn.style.display = 'block';
                         notifyBtn.addEventListener('click', () => {
                             popup.style.display = 'flex';
                         });
                     }

                     // Handle Close Logic
                     if(closeBtn) {
                         closeBtn.addEventListener('click', () => {
                             popup.style.display = 'none';
                         });
                     }
                     
                     // Progress Listener
                     window.api.on('update-progress', (progress) => {
                        updateBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${progress}%`;
                        statusText.innerText = `Téléchargement de la mise à jour : ${progress}%`;
                        
                        // Add visual bar if not exists
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
                            fill.style.background = 'var(--primary-pink)';
                            fill.style.transition = 'width 0.2s';
                            
                            bar.appendChild(fill);
                            statusText.parentNode.insertBefore(bar, statusText.nextSibling);
                        }
                        
                        const fill = document.getElementById('update-progress-fill');
                        if (fill) fill.style.width = `${progress}%`;
                     });

                     updateBtn.addEventListener('click', async () => {
                         updateBtn.disabled = true;
                         updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PREPARATION...';
                         statusText.innerText = "Démarrage du téléchargement...";
                         
                         try {
                             await window.api.installUpdate(updateCheck.url);
                         } catch (err) {
                             statusText.innerText = "Erreur: " + err;
                             updateBtn.disabled = false;
                             updateBtn.innerHTML = '<i class="fas fa-redo"></i> RÉESSAYER';
                         }
                     });
                     
                     // REMOVED: return; // STOP EVERYTHING ELSE
                     // Now we allow the user to close the popup and continue using the launcher
                 }
            }
        } catch (err) {
            console.error("Update check failed:", err);
        }

    // Hide header elements on Login Screen
    document.querySelector('.user-profile-btn').style.visibility = 'hidden';
    const gameNav = document.querySelector('.game-nav-container'); if(gameNav) gameNav.style.visibility = 'hidden';

    // Auto-Login Check
    const savedSession = localStorage.getItem('hg_session_token');
    const savedUser = localStorage.getItem('hg_user_data');
    
    if (savedSession && savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            const sessionDate = localStorage.getItem('hg_session_date');
            
            // Check expiry (e.g., 3 days)
            const MAX_AGE = 3 * 24 * 60 * 60 * 1000;
            if (sessionDate && (Date.now() - parseInt(sessionDate)) < MAX_AGE) {
                console.log("Auto-login triggered");
                // TODO: Verify token with backend if possible, for now assume valid if not expired
                // Ideally send to backend to verify: await window.api.verifySession(savedSession);
                
                // We need to restore the currentUser in main process too for launch to work
                // Since main process memory is cleared on restart, we need to re-send user data to it.
                // Or better: Let main process handle persistence. 
                // BUT, since we are doing renderer-side logic mostly, let's just push it to main.
                
                await window.api.restoreSession(userData);
                handleLoginSuccess(userData);
                return; // Skip maintenance check if already logged in? Or check anyway?
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
        
        // Update Modpack Name
        if (config && config.activeModpack && config.activeModpack.name) {
            const modpackNameEl = document.getElementById('modpack-name');
            if (modpackNameEl) {
                modpackNameEl.innerText = config.activeModpack.name;
            }
        }

        if (config && config.maintenance) {
            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('maintenance-screen').style.display = 'flex';
            return; // Stop execution
        }


    } catch (e) {
        console.error("Failed to check maintenance/update", e);
    }
})();

// Login Logic
const loginBtn = document.getElementById('login-btn');
const loginUser = document.getElementById('login-user');
const loginPass = document.getElementById('login-pass');
const loginError = document.getElementById('login-error');
const microsoftLoginBtn = document.getElementById('microsoft-login-btn');

// Toggle Stay Connected on text click
const stayConnectedContainer = document.querySelector('.login-checkbox-container');
const stayConnectedCheckbox = document.getElementById('stay-connected');
if (stayConnectedContainer && stayConnectedCheckbox) {
    stayConnectedContainer.addEventListener('click', (e) => {
        // If click is not on the switch itself (which has its own handler via label/input)
        if (!e.target.closest('.switch')) {
            stayConnectedCheckbox.checked = !stayConnectedCheckbox.checked;
        }
    });
}

// Load saved identifier
if (localStorage.getItem('savedIdentifier')) {
    loginUser.value = localStorage.getItem('savedIdentifier');
}

// Enter key to login
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
            
            // Stay Connected Logic
            const stayConnected = document.getElementById('stay-connected').checked;
            if (stayConnected) {
                // Generate a pseudo-token (identifier + timestamp base64) or just save user object
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

// Microsoft Login Logic
if (microsoftLoginBtn) {
    microsoftLoginBtn.addEventListener('click', () => {
        window.api.openExternal('https://hgstudio.strator.gg/auth/microsoft?source=launcher');
    });
}

// Handle Auth Success from Main Process
window.api.onAuthSuccess((user) => {
    handleLoginSuccess(user);
});

function handleLoginSuccess(user) {
    // Switch to Dashboard
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard-screen').style.display = 'block';

    // RPC Update
    window.api.updateRpc({
        details: 'Dans les menus',
        state: `Connecté: ${user.username}`,
        largeImageKey: 'logo', 
        largeImageText: 'HG Launcher'
    });

    // Show header elements
    document.querySelector('.user-profile-btn').style.visibility = 'visible';
    if(document.querySelector('.game-nav-container')) document.querySelector('.game-nav-container').style.visibility = 'visible';

    // Update Profile Info (Header)
    const userNameEl = document.getElementById('user-name-header');
    if (userNameEl) {
        userNameEl.innerText = user.username;
    }
    
    // Update Profile Info (Settings Sidebar)
    const settingUserNameEl = document.getElementById('setting-user-name');
    if (settingUserNameEl) {
        settingUserNameEl.innerText = user.username;
    }

    // Update Avatar (Header)
    const userAvatarEl = document.getElementById('user-avatar-header');
    if (userAvatarEl) {
        userAvatarEl.style.backgroundImage = `url('https://minotar.net/helm/${user.username}/100.png')`;
    }

    // Update Avatar (Settings Sidebar)
    const settingAvatarEl = document.getElementById('setting-user-avatar');
    if (settingAvatarEl) {
        settingAvatarEl.style.backgroundImage = `url('https://minotar.net/helm/${user.username}/100.png')`;
    }
}

// Profile Dropdown Logic
const profileTrigger = document.getElementById('profile-trigger');
const profileDropdown = document.getElementById('profile-dropdown');
const dropdownSettings = document.getElementById('dropdown-settings');
const dropdownLogout = document.getElementById('dropdown-logout');

// Toggle Dropdown
profileTrigger.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing immediately
    profileDropdown.classList.toggle('active');
});

// Close Dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!profileTrigger.contains(e.target)) {
        profileDropdown.classList.remove('active');
    }
});

// Dropdown Actions
dropdownSettings.addEventListener('click', () => {
    window.api.openExternal('http://91.197.6.177:24607/dashboard');
});

dropdownLogout.addEventListener('click', () => {
    // Clear saved data if needed (optional)
    localStorage.removeItem('hg_session_token');
    localStorage.removeItem('hg_user_data');
    
    // Also clear from main process
    window.api.restoreSession(null); 

    // Hide Dashboard, Show Login
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';

    // Hide header elements
    document.querySelector('.user-profile-btn').style.visibility = 'hidden';
    if(document.querySelector('.game-nav-container')) document.querySelector('.game-nav-container').style.visibility = 'hidden';
    profileDropdown.classList.remove('active');

    // Reset Login Button
    loginBtn.disabled = false;
    loginBtn.innerText = "Se connecter";
    loginPass.value = ""; // Clear password
});

// Social Media Links
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

// Launch Logic
const launchBtn = document.getElementById('launch-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingLog = document.getElementById('loading-log');

// =========================================
// VERSION SELECTOR LOGIC
// =========================================
const verBase = document.getElementById('ver-base');
const verEnhanced = document.getElementById('ver-enhanced');
const verHardcore = document.getElementById('ver-hardcore');
const modpackNameStatus = document.getElementById('modpack-name');

// GLOBAL Helper to update selector based on theme
window.updateSelectorForTheme = (themeId) => {
    if (!themeId) return;
    const t = themeId.toLowerCase();
    
    // We assume elements exist
    if (!verBase || !verEnhanced || !verHardcore) return;

    if (t.includes('hardcore')) {
        // HARDCORE MODE: Only 'hg.hardcore' visible
        verBase.style.display = 'none';
        verEnhanced.style.display = 'none';
        verHardcore.style.display = 'flex';
        
        // Force switch to hardcore
        verHardcore.click();
    } else {
        // NORMAL MODE: 'Base' and 'Enhanced' visible
        verBase.style.display = 'flex';
        verEnhanced.style.display = 'flex';
        verHardcore.style.display = 'none';
        
        // If we were on hardcore (now hidden), switch back to base
        if (verHardcore.classList.contains('active')) {
            verBase.click();
        }
    }
}

if (verBase && verEnhanced) {
    const setVersion = (version) => {
        // Simple opacity fade for text transition
        launchBtn.style.color = 'transparent';
        
        setTimeout(() => {
            // Reset actives
            verBase.classList.remove('active');
            verEnhanced.classList.remove('active');
            if (verHardcore) verHardcore.classList.remove('active');

            if (version === 'base') {
                verBase.classList.add('active');
                
                // Restore Play Button
                launchBtn.classList.remove('coming-soon');
                launchBtn.innerHTML = 'JOUER';
                if (modpackNameStatus) modpackNameStatus.innerText = 'Prêt à jouer';
            
            } else if (version === 'enhanced') {
                verEnhanced.classList.add('active');
                
                // Set Coming Soon state
                launchBtn.classList.add('coming-soon');
                launchBtn.innerHTML = 'BIENTÔT DISPONIBLE';
                if (modpackNameStatus) modpackNameStatus.innerText = 'HG Studio Enhanced';
            
            } else if (version === 'hardcore') {
                if (verHardcore) verHardcore.classList.add('active');
                
                // Restore Play Button (Hardcore is playable)
                launchBtn.classList.remove('coming-soon');
                launchBtn.innerHTML = 'JOUER (HC)';
                if (modpackNameStatus) modpackNameStatus.innerText = 'Mode Hardcore';
            }
            
            // Restore visibility after change
            launchBtn.style.color = '';
        }, 200); // Wait for fade out
    };

    verBase.addEventListener('click', () => setVersion('base'));
    verEnhanced.addEventListener('click', () => setVersion('enhanced'));
    if(verHardcore) verHardcore.addEventListener('click', () => setVersion('hardcore'));
}

launchBtn.addEventListener('click', async () => {
    // Prevent launch if Coming Soon (Double check in case CSS fails)
    if (launchBtn.classList.contains('coming-soon')) return;

    // Show Loading Overlay
    loadingOverlay.style.display = 'flex';
    loadingLog.innerText = "INITIALISATION...";

    try {
        // RPC Update
        window.api.updateRpc({
            details: 'Joue à Minecraft',
            state: 'HG Studio',
            startTimestamp: Date.now(),
            largeImageKey: 'logo',
            largeImageText: 'HG Studio'
        });

        const settings = await window.api.getSettings();
        
        // --- NEW MODPACK SELECTION LOGIC ---
        // 1. Get global config
        const config = await window.api.getLauncherConfig();
        
        // 2. Determine target modpack based on Theme
        let targetModpack = config.activeModpack; // Default
        
        const currentThemeId = settings.activeTheme || 'Autum'; // Default Autum
        
        // Map themes to config keys (Assuming backend provides modpack_autumn, modpack_cherry, modpack_dragon)
        // Adjust these keys to match exactly what your backend sends in the JSON "config" object
        if (currentThemeId === 'Cherry' && config.modpack_cherry) {
            targetModpack = config.modpack_cherry;
            console.log("Using Cherry Modpack");
        } else if (currentThemeId === 'Dragon' && config.modpack_dragon) {
            targetModpack = config.modpack_dragon;
            console.log("Using Dragon Modpack");
        } else if (currentThemeId === 'Autum' && config.modpack_autumn) {
            targetModpack = config.modpack_autumn;
            console.log("Using Autumn Modpack");
        } else {
             console.log("Using Default Active Modpack");
        }

        // 3. Launch with selected modpack (Pass it to main process via options)
        const result = await window.api.launchGame({
            ...settings,
            activeModpack: targetModpack 
        });

        console.log(result);
    } catch (error) {
        console.error(error);
        loadingOverlay.style.display = 'none'; // Hide on error
        alert("Erreur de lancement !");
    }
});

window.api.onLog((text) => {
    console.log("Launcher Log:", text);

    // Update Loading Log Text
    if (typeof text === 'string') {
        // Clean up progress text for display
        let displayText = text;
        if (text.startsWith('[Progress]')) {
            displayText = text.replace('[Progress] ', '');
        }
        loadingLog.innerText = displayText;
    }

    // Hide overlay when game closes
    if (text === 'Game closed.') {
        loadingOverlay.style.display = 'none';
    }
});

window.api.onStopLoading(() => {
    loadingOverlay.style.display = 'none';
    loadingLog.innerText = "";
});

// =========================================
// SETTINGS LOGIC
// =========================================

const settingsBtn = document.getElementById('settings-btn');
const settingsScreen = document.getElementById('settings-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Fields
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

// Tabs
const tabButtons = document.querySelectorAll('.settings-nav li');
const tabContents = document.querySelectorAll('.settings-tab');

// =========================================
// HELIOS-STYLE SETTINGS LOGIC
// =========================================

// Elements
const settingsNav = document.querySelectorAll('.nav-item');
const settingsTabs = document.querySelectorAll('.tab-content');
const doneBtn = document.getElementById('close-settings-btn'); // Renamed to "Done" in HTML but ID kept for compat

// Inputs
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

// Tab Switching
settingsNav.forEach(nav => {
    nav.addEventListener('click', () => {
        // Deactivate all
        settingsNav.forEach(n => n.classList.remove('active'));
        settingsTabs.forEach(t => t.classList.remove('active'));

        // Activate clicked
        nav.classList.add('active');
        const tabId = nav.getAttribute('data-tab');
        const content = document.getElementById(`tab-${tabId}`);
        if(content) content.classList.add('active');
    });
});

// RAM Slider Visuals
s_ramSlider.addEventListener('input', () => {
    const mb = parseInt(s_ramSlider.value);
    // Display in MB
    s_ramDisplay.innerText = mb;
    
    // Update gradient
    const min = parseInt(s_ramSlider.min);
    const max = parseInt(s_ramSlider.max);
    const percentage = ((mb - min) / (max - min)) * 100;
    
    // Look up the computed style for primary pink, or fallback
    // We can use var() directly in linear-gradient for modern browsers
    s_ramSlider.style.background = `linear-gradient(to right, var(--primary-pink) 0%, var(--primary-pink) ${percentage}%, #444 ${percentage}%, #444 100%)`;
});

// Open Settings
settingsBtn.addEventListener('click', async () => {
    // Add active class to body for hiding header elements
    document.body.classList.add('settings-active');

    const settings = await window.api.getSettings();
    const sysInfo = await window.api.getSystemInfo();
    const appVersion = await window.api.getAppVersion();

    // Update Version Display
    const verDisplay = document.getElementById('app-version-display');
    if (verDisplay) verDisplay.innerText = `v${appVersion}`;

    // System RAM Info
    const totalMemMB = Math.floor(sysInfo.totalMem / 1024 / 1024);
    const freeMemMB = Math.floor(sysInfo.freeMem / 1024 / 1024);
    
    if(s_sysTotal) s_sysTotal.innerText = (totalMemMB / 1024).toFixed(1);
    if(s_sysFree) s_sysFree.innerText = (freeMemMB / 1024).toFixed(1);
    
    s_ramSlider.max = totalMemMB;
    
    // Minecraft Tab
    if (settings.resolution) {
        s_gameWidth.value = settings.resolution.width || 1280;
        s_gameHeight.value = settings.resolution.height || 720;
    }
    s_fullscreen.checked = settings.fullscreen || false;
    s_autoconnect.checked = !!settings.autoConnectIP;
    s_detached.checked = settings.closeLauncher !== false; 

    // Java Tab
    let currentRam = 4096;
    if (settings.maxRam) {
        currentRam = parseInt(settings.maxRam);
    }
    s_ramSlider.value = currentRam;
    s_ramSlider.dispatchEvent(new Event('input')); // Update visual

    // New Java Logic - Populate Fields from Config
    // Assuming config has javaPath17, javaPath8 etc. If not, use standard 'javaPath' as fallback for priority one.
    const jp17 = document.getElementById('java-path-17');
    const jp8 = document.getElementById('java-path-8');
    const jp21 = document.getElementById('java-path-21');

    if (jp17) jp17.value = settings.javaPath17 || settings.javaPath || "";
    if (jp8) jp8.value = settings.javaPath8 || "";
    if (jp21) jp21.value = settings.javaPath21 || "";

    // Wire up Browse Buttons for the cards
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

    // Launcher Tab
    s_prerelease.checked = false; 
    s_dataDir.value = "Default (AppData/.hg_oo)";
    
    // ==========================================
    // THEME CAROUSEL LOGIC
    // ==========================================
    const carouselContainer = document.getElementById('theme-carousel-container');
    if (carouselContainer) {
        carouselContainer.innerHTML = '<div class="loading-themes"><i class="fas fa-circle-notch fa-spin"></i> Chargement...</div>';
        
        try {
            const themes = await window.api.getThemes();
            carouselContainer.innerHTML = ''; // Clear loading
            
            if (themes.length === 0) {
                carouselContainer.innerHTML = '<p style="color:#888;">Aucun thème trouvé (src/assets/themes).</p>';
            }

            themes.forEach(theme => {
                const card = document.createElement('div');
                card.className = 'theme-card';
                // Check if this is the active theme
                if (settings.activeTheme === theme.id) {
                    card.classList.add('active');
                }

                // Video Path (Relative to index.html)
                const videoSrc = `assets/themes/${theme.folder}/background.mp4`;

                card.innerHTML = `
                    <div class="theme-preview">
                        <video muted loop preload="metadata">
                            <source src="${videoSrc}" type="video/mp4">
                        </video>
                        <i class="fas fa-play preview-play-icon"></i>
                    </div>
                    <div class="theme-info">
                        <span class="theme-title" title="${theme.title}">${theme.title}</span>
                        <div class="theme-color-dot" style="background-color: ${theme.accentColor}"></div>
                    </div>
                `;

                // Hover Effects for Video
                const video = card.querySelector('video');
                card.addEventListener('mouseenter', () => { video.play().catch(e => {}); });
                card.addEventListener('mouseleave', () => { video.pause(); video.currentTime = 0; });

                // Click to Apply
                card.addEventListener('click', async () => {
                    // Update UI immediately (Real-time)
                    document.documentElement.style.setProperty('--primary-pink', theme.accentColor);
                    
                    // Update Version Selector (Hardcore check)
                    if (window.updateSelectorForTheme) window.updateSelectorForTheme(theme.id);

                    const bgVideo = document.getElementById('bg-video');
                    if (bgVideo) {
                        bgVideo.src = videoSrc;
                        bgVideo.play().catch(e => console.error(e));
                    }

                    // Update Active Class
                    document.querySelectorAll('.theme-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    // Save to Config (Merge with existing)
                    try {
                        const currentSettings = await window.api.getSettings();
                        await window.api.saveSettings({
                            ...currentSettings,
                            activeTheme: theme.id,
                            accentColor: theme.accentColor
                        });
                        
                        // Update local settings object if valid
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

    /* REMOVED OLD COLOR PICKER LOGIC
    const colorPicker = document.getElementById('accent-color-picker');
    if (colorPicker) { ... }
    */


    // Account Tab (Populate)
    // Start Multi-Account & Manager Refresh
    refreshAccountList();
    if (typeof managerTypes !== 'undefined') {
        managerTypes.forEach(t => refreshManagerList(t));
    }


    // Show Screen
    settingsScreen.style.display = 'flex';
});

// Browse Java
if (s_browseJava) {
    s_browseJava.addEventListener('click', async () => {
        const path = await window.api.openFileDialog();
        if (path) {
            s_javaPath.value = path;
        }
    });
}

// Done / Save
doneBtn.addEventListener('click', async () => {
    doneBtn.innerText = "Sauvegarde...";
    
    // Remove active settings class
    document.body.classList.remove('settings-active');

    const ramVal = s_ramSlider.value;
    const autoConnectIP = s_autoconnect.checked ? "play.hg.studio" : "";
    
    // Fetch current settings first to preserve Theme
    let currentSettings = {};
    try {
        currentSettings = await window.api.getSettings();
    } catch (e) { console.error("Could not fetch settings before save", e); }

    // Java Path Logic - Read from new inputs
    const jp17 = document.getElementById('java-path-17').value;
    const jp8 = document.getElementById('java-path-8').value;
    const jp21 = document.getElementById('java-path-21').value;

    const newSettings = {
        ...currentSettings, // MERGE EXISTING (Theme, etc)
        minRam: `${ramVal}M`,
        maxRam: `${ramVal}M`,
        javaPath: jp17, // Primary
        javaPath17: jp17,
        javaPath8: jp8, // New config
        javaPath21: jp21, // New config
        jvmArgs: s_javaArgs.value,
        resolution: {
            width: parseInt(s_gameWidth.value) || 1280,
            height: parseInt(s_gameHeight.value) || 720
        },
        fullscreen: s_fullscreen.checked,
        closeLauncher: s_detached.checked,
        autoConnectIP: autoConnectIP,
        // accentColor and activeTheme are preserved from currentSettings
        
        discordRPC: true 
    };
    
    await window.api.saveSettings(newSettings);
    
    doneBtn.innerText = "Terminé";
    settingsScreen.style.display = 'none';
});



// =========================================
// SERVER STATUS LOGIC
// =========================================

const playerCountEl = document.getElementById('player-count');
const serverStatusDot = document.getElementById('server-status-dot');

async function updateServerStatus() {
    try {
        const response = await fetch('https://api.mcsrvstat.us/2/play.hg.studio');
        const data = await response.json();

        if (data.online) {
            playerCountEl.innerText = `${data.players.online}/${data.players.max}`;
            serverStatusDot.style.backgroundColor = '#00ff88'; // Green for online
            serverStatusDot.style.boxShadow = '0 0 10px #00ff88';
        } else {
            playerCountEl.innerText = "OFFLINE";
            serverStatusDot.style.backgroundColor = '#ff0055'; // Red for offline
            serverStatusDot.style.boxShadow = '0 0 10px #ff0055';
        }
    } catch (error) {
        console.error("Failed to fetch server status:", error);
        playerCountEl.innerText = "ERROR";
        serverStatusDot.style.backgroundColor = '#ffaa00'; // Orange for error
    }
}

// Update immediately and then every 60 seconds
updateServerStatus();
setInterval(updateServerStatus, 60000);

// =========================================
// UPDATE CHECKER LOGIC
// =========================================

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

                // Change button to download
                checkUpdateBtn.innerHTML = '<i class="fas fa-download"></i> Installer';
                checkUpdateBtn.disabled = false;

                // Remove old listener and add download listener
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

// =========================================
// JAVA MANAGMENT LOGIC
// =========================================

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
    
    // Install
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
    
    // Detect
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
    
    // Browse
    if (browseBtn) {
        browseBtn.addEventListener('click', async () => {
            const path = await window.api.openFileDialog();
            if (path) {
                input.value = path;
            }
        });
    }
    
    // Test
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

// Init Java Controls
[21, 17, 8].forEach(v => setupJavaControls(v));


// =========================================
// MAP SYSTEM (LIVE MAP)
// =========================================
const mapBtn = document.getElementById('btn-map');
const mapScreen = document.getElementById('map-screen');
const closeMapBtn = document.getElementById('close-map-btn');
const mapIframe = document.getElementById('map-iframe');
const MAP_URL = "https://badlands.mystrator.com/s/ffb5be70-4184-4fb9-8d7d-deafd87abadf/#overworld:1661:0:1168:10835:-1.6:0:0:0:perspective";

if (mapBtn && mapScreen && closeMapBtn) {
    mapBtn.addEventListener('click', () => {
        mapScreen.style.display = 'flex';
        // Lazy load & GPU safety
        if (mapIframe && mapIframe.src !== MAP_URL) {
             mapIframe.src = MAP_URL;
        }
    });

    closeMapBtn.addEventListener('click', () => {
        mapScreen.style.display = 'none';
        // Clear iframe to free resources (RAM/GPU) for the game
        if(mapIframe) mapIframe.src = 'about:blank';
    });
}

// =========================================
// GAME FILES MANAGER (Schematic, RP, Shaders)
// =========================================

const managerTypes = ['schematics', 'resourcepacks', 'shaderpacks'];

async function refreshManagerList(type) {
    const listContainer = document.getElementById(`list-${type}`);
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align:center; color:#666; font-size:12px;">Chargement...</div>';

    try {
        const files = await window.api.getInstanceFiles(type);
        listContainer.innerHTML = ''; // Clear

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

            // Delete Action
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

// Setup Event Listeners for Managers
managerTypes.forEach(type => {
    // 1. Refresh on Tab Open (or just init)
    // refreshManagerList(type); // Call later on settings open

    // 2. Open Folder Button
    const openBtn = document.querySelector(`.open-folder-btn[data-type="${type}"]`);
    if(openBtn) {
        openBtn.addEventListener('click', () => {
            window.api.openInstanceFolder(type);
        });
    }

    // 3. Drop Zone
    const dropZone = document.getElementById(`drop-${type}`);
    if(dropZone) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
            document.body.addEventListener(eventName, preventDefaults, false);
        });
        
        // Highlight logic
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
        });

        // Handle Drop
        dropZone.addEventListener('drop', async (e) => {
            const files = e.dataTransfer.files;
            if(files.length > 0) {
                // Show loading state temporarily?
                for (let i = 0; i < files.length; i++) {
                   await window.api.addInstanceFile({ type, sourcePath: files[i].path });
                }
                refreshManagerList(type);
            }
        });
    }

    // 4. Browse Button inside Drop Zone
    const browseBtn = document.querySelector(`.browse-trigger[data-type="${type}"]`);
    if(browseBtn) {
        browseBtn.addEventListener('click', async () => {
            const path = await window.api.openFileDialog(); // We assume single file for now or reuse existing
            if(path) {
                await window.api.addInstanceFile({ type, sourcePath: path });
                refreshManagerList(type);
            }
        });
    }
});




// =========================================
// SKIN & MULTI-ACCOUNT MANAGER
// =========================================

const wardrobeModal = document.getElementById('skin-wardrobe-modal');
const closeWardrobeBtn = document.getElementById('close-wardrobe-btn');
const importSkinBtn = document.getElementById('import-skin-btn');
const saveSkinBtn = document.getElementById('save-skin-btn');
const skinPresetsGrid = document.getElementById('skin-presets-grid');
let skinViewer = null; // 3D instance
let currentEditingAccount = null; // { uuid, type }
let selectedSkinPath = null; // Path of file to upload/set

// 1. Render Account List (with Edit Skin Button)
async function refreshAccountList() {
    const accContainer = document.getElementById('account-list-container');
    accContainer.innerHTML = ''; 

    // Get Active User
    let activeUser = null;
    let accounts = [];

    // Try to get "Accounts List" (New Storage)
    // If not exists, migrate current single user to list
    const storedAccounts = localStorage.getItem('hg_accounts');
    if (storedAccounts) {
        accounts = JSON.parse(storedAccounts);
    } else {
        // Migration logic
        let legacyUser = null;
        if (localStorage.getItem('hg_user_data')) legacyUser = JSON.parse(localStorage.getItem('hg_user_data'));
        else if (localStorage.getItem('user_session')) legacyUser = JSON.parse(localStorage.getItem('user_session'));
        
        if (legacyUser) {
            accounts.push(legacyUser);
            localStorage.setItem('hg_accounts', JSON.stringify(accounts));
        }
    }

    // Determine currently active
    // We look at the session token owner
    // Simplify: We assume the first in list is active OR we store "active_uuid"
    // For now, let's use the object in `hg_user_data` as the "Active Session"
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
        
        // HG specific avatar
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

        // Bind Edit Skin
        const editBtn = row.querySelector(`#edit-skin-${acc.uuid}`);
        editBtn.addEventListener('click', () => openWardrobe(acc));
    });

    // Add New Account Button
    const addBtn = document.createElement('div');
    addBtn.className = 'account-card-row add-new';
    addBtn.style.justifyContent = 'center';
    addBtn.style.cursor = 'pointer';
    addBtn.style.borderStyle = 'dashed';
    addBtn.innerHTML = '<i class="fas fa-plus"></i> Ajouter un compte';
    addBtn.onclick = () => {
        // For now, redirect to login or simple info
        alert("Fonctionnalité d'ajout rapide en cours de développement. Veuillez utiliser la déconnexion pour changer de compte."); 
    };
    accContainer.appendChild(addBtn);
}
// Expose switchAccount helper logic would be complex w/o auth flow reset, skipping for now as per minimal prompt

// 2. Open Wardrobe Logic - REDIRECT TO SITE
async function openWardrobe(account) {
    // Redirect to the website for skin management via CustomSkinLoader API logic
    // TODO: Change this URL to your actual website profile/skin page
    const url = "https://votre-site.com/profil"; 
    window.api.openExternal(url);
}

/* 
   Old Wardrobe Logic Removed as requested.
   Functionality moved to Web.
*/
function unused_saveSkinToHistory(path, model, cape = null, silent = false) {
    try {
        let stored = localStorage.getItem('hg_saved_skins') ? JSON.parse(localStorage.getItem('hg_saved_skins')) : [];
        
        // Remove existing entry for this path to update it (avoid dupes + update model/date)
        stored = stored.filter(s => s.path !== path);
        
        stored.unshift({ path: path, model: model, cape: cape, date: Date.now() }); // Add to TOP
        
        // Limit history size to 20?
        if (stored.length > 20) stored = stored.slice(0, 20);

        localStorage.setItem('hg_saved_skins', JSON.stringify(stored));
        if(!silent) renderSavedSkinsAndPresets(); // Refresh list if UI is open
    } catch(e) {}
}

async function renderSavedSkinsAndPresets() {
    const presetGrid = document.getElementById('skin-presets-grid');
    const savedGrid = document.getElementById('saved-skins-grid');
    
    // Clear
    if(presetGrid) presetGrid.innerHTML = '';
    if(savedGrid) savedGrid.innerHTML = '';

    // 1. Saved Skins Section
    let savedSkins = [];
    try {
        const stored = localStorage.getItem('hg_saved_skins');
        if (stored) savedSkins = JSON.parse(stored);
    } catch(e) {}

    if (savedGrid) {
        if (savedSkins.length > 0) {
            savedSkins.forEach(skin => {
                 // Create element directly into savedGrid
                 // Pass true for isEditable
                 const item = createSkinElement(skin.path, skin.model || 'default', skin.cape || null, true);
                 savedGrid.appendChild(item);
            });
        } else {
            savedGrid.innerHTML = '<p class="empty-hint">Aucun skin récent.</p>';
        }
    }

    // 2. Presets
    const presets = await window.api.getPresetSkins();
    if (presetGrid) {
        presets.forEach(p => {
             const item = createSkinElement(p.url, p.model, null, false);
             presetGrid.appendChild(item);
        });
    }
}

function createSkinElement(imageSource, model, cape = null, isEditable = false) {
    const item = document.createElement('div');
    item.className = 'skin-preset-item';
    
    let cssUrl = imageSource;
    if (!imageSource.startsWith('assets') && !imageSource.startsWith('http')) {
        cssUrl = imageSource.replace(/\\/g, '/');
    }
    
    item.style.backgroundImage = `url('${cssUrl}')`; 
    item.title = model === 'slim' ? 'Modèle Slim' : 'Modèle Classique';

    item.onclick = () => {
        selectSkin(imageSource, model, cape);
        // Highlight logic
        document.querySelectorAll('.skin-preset-item').forEach(x => x.classList.remove('selected'));
        item.classList.add('selected');
    };

    // Add Edit Button for Saved Skins
    if (isEditable) {
        const editBtn = document.createElement('div');
        editBtn.className = 'skin-item-edit-btn';
        editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        editBtn.onclick = (e) => {
            e.stopPropagation(); // Don't select, just edit
            tempImportPath = imageSource;
            // Pre-select correct model in popup
            openImportModal(imageSource, model);
        };
        item.appendChild(editBtn);
    }

    return item;
}

function createSkinItem(imageSource, model, isSaved = false) {
    // Deprecated wrapper if called elsewhere, redirect to new element creator
    // Assuming this was used inside old loop, no issues.
    return createSkinElement(imageSource, model);
}


function loadCapes(account) {
    if (!skinViewer) return;
    
    // Clear current cape
    skinViewer.loadCape(null);
    selectedSkinCape = null; // Default to null

    // 1. Try Optifine (Community standard)
    // We try to load image. If success, we use it.
    const ofUrl = `http://s.optifine.net/capes/${account.username}.png`;
    
    // 2. Try Official Cape (if we had full auth info with textures property)
    // For now we simulate Optifine check
    skinViewer.loadCape(ofUrl).then(() => {
       // Success Optifine
       selectedSkinCape = ofUrl;
    }).catch(() => {
       // Fail Optifine, try Microsoft (only if we have URL, which we don't in this context usually w/o API call)
       // Fallback: If account has a stored cape url
       if (account.cape_url) {
           skinViewer.loadCape(account.cape_url);
           selectedSkinCape = account.cape_url;
       }
    });
}

function selectSkin(path, model = 'default', innerCape = null) {
    selectedSkinPath = path;
    selectedSkinModel = model;
    selectedSkinCape = innerCape;
    
    // Update legacy Radio Button if it still exists (it might not)
    const radio = document.querySelector(`input[name="skin-model"][value="${model}"]`);
    if(radio) radio.checked = true;

    if(skinViewer) {
        // Load skin
        skinViewer.loadSkin(path, { model: model });
        // Load Cape
        skinViewer.loadCape(innerCape);
    }
}

// 3. Import Button (Opens Popup)
let tempImportPath = null;
let importViewer = null;
let selectedImportCape = null;

// Global Selection State (for Wardrobe Save)
let selectedSkinModel = 'default';
let selectedSkinCape = null;

async function fetchUserCapes(username) {
    if(!username) return {};
    try {
        console.log("Fetching capes for", username);
        // Use Main Process to avoid CORS and networking issues in Renderer
        const data = await window.api.getUserCapes(username);
        return data || {}; 
    } catch (e) {
        console.warn("Cape fetch error:", e);
        return {};
    }
}

if (importSkinBtn) {
    importSkinBtn.addEventListener('click', async () => {
        const path = await window.api.openFileDialog([{ name: 'Images', extensions: ['png'] }]);
        if (path) {
            tempImportPath = path;
            openImportModal(path);
        }
    });
}

// Helper to generate a clean "Back View" of a cape from its texture
async function generateCapePreview(url) {
    return new Promise(async (resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        
        // Use Main Process to fetch image (Bypass CORS)
        const base64 = await window.api.fetchImageBase64(url);
        if (!base64) {
            resolve(url); // Fallback to raw URL
            return;
        }

        img.src = base64;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // Output size: 10x16 (Raw pixels of back face)
            // Can be scaled up for display, but let's keep it raw or scaled
            const scale = 4; // Higher res
            canvas.width = 10 * scale; 
            canvas.height = 16 * scale;
            
            // Disable smoothing for pixel art look
            ctx.imageSmoothingEnabled = false;
            
            // Setup crop source
            // Standard Cape: Back is at (12, 1) with size 10x16
            const srcX = 12;
            const srcY = 1;
            const srcW = 10;
            const srcH = 16;
            
            // Check aspect ratio for HD capes (e.g. Optifine)
            const ratio = img.width / 64; 
            
            // Draw cropped back
            ctx.drawImage(img, 
                srcX * ratio, srcY * ratio, srcW * ratio, srcH * ratio, // Source crop
                0, 0, canvas.width, canvas.height // Dest
            );
            
            resolve(canvas.toDataURL());
        };
        img.onerror = () => resolve(url);
    });
}

const importModal = document.getElementById('skin-import-popup');

// PRESET CAPES (Minecon, etc.)
const PRESET_CAPES = [
    { name: 'Minecon 2011', url: 'https://textures.minecraft.net/texture/953cac8b779fe41383e675ee2b86071a71658f2180f56fbce8ba315ea4056' },
    { name: 'Minecon 2012', url: 'https://textures.minecraft.net/texture/a2ca584e3a47da5b395a121da0c5417937397e505876352c286940d9089f64' },
    { name: 'Minecon 2013', url: 'https://textures.minecraft.net/texture/153b1a0dfcbae953cdeb1f256546c092437965156e8c72718e27c15e709' },
    { name: 'Minecon 2015', url: 'https://textures.minecraft.net/texture/414e0f49dcf460e65780a4005aa2b4642dd211bc9202a8335359288219463b' },
    { name: 'Minecon 2016', url: 'https://textures.minecraft.net/texture/e7dfea16dc83c97df01a12fabbd1216359c0cd0ea42f9999b6e97c584963e980' },
    { name: 'Migrator', url: 'https://textures.minecraft.net/texture/2340c0e03dd24a11b15a8b33c2a7e9e32abb2051b2481d0ba7defd635ca7a933' },
    { name: 'Mojang', url: 'https://textures.minecraft.net/texture/5786fe99be377dfb6e38aa102f31aa636f5613dcc5432617f6368d71e98b2' }
];

async function openImportModal(path, initialModel = 'default') {
    if(!importModal) return;
    importModal.style.display = 'flex';
    selectedImportCape = null; // Reset selection
    
    // Init Mini Viewer
    const canvas = document.getElementById('import-canvas');
    if (!importViewer && typeof skinview3d !== 'undefined') {
        importViewer = new skinview3d.SkinViewer({
            canvas: canvas,
            width: 200, 
            height: 300,
            skin: path,
            model: initialModel
        });
        importViewer.animation = new skinview3d.WalkingAnimation();
        importViewer.globalLight.intensity = 1.0; 
    } else if (importViewer) {
        importViewer.loadSkin(path, { model: initialModel });
        importViewer.loadCape(null); // Reset cape in viewer
    }
    
    if(importViewer) importViewer.camera.position.z = 60;

    // Set Checkbox to initialModel
    const radio = document.querySelector(`input[name="import-model"][value="${initialModel}"]`);
    if(radio) radio.checked = true;

    // --- Cape Logic ---
    const capeList = document.getElementById('cape-list');
    const capeGroup = document.getElementById('cape-selector-group');
    if(capeList && capeGroup) {
        capeList.innerHTML = '<div style="color:#aaa; font-size:12px;">Chargement des capes...</div>';
        capeGroup.style.display = 'block';

        const username = currentEditingAccount?.username || (typeof user !== 'undefined' ? user.username : null);
        
        let capes = {};
        if (username) {
            try {
                // Try fetching capes (will handle UUID or Username)
                capes = await fetchUserCapes(username);
                console.log("Capes loaded:", capes);
            } catch(e) { console.error(e) }
        }
            
        capeList.innerHTML = '';
        
        // "None" option
        const noneDiv = document.createElement('div');
        noneDiv.className = 'cape-item none-option'; // removed 'selected' default
        if (!selectedImportCape) noneDiv.classList.add('selected');
        
        noneDiv.innerHTML = '<i class="fas fa-ban"></i>';
        noneDiv.title = "Pas de cape";
        noneDiv.onclick = () => {
            importViewer.loadCape(null);
            selectedImportCape = null;
            document.querySelectorAll('.cape-item').forEach(c => c.classList.remove('selected'));
            noneDiv.classList.add('selected');
        };
        capeList.appendChild(noneDiv);

        // 1. User Capes (API)
        let hasCapes = false;
        
        // Helper to process capes - PURE CSS VERSION (No async blocking)
        const processCapeItem = async (label, url, isOwned) => {
             const cItem = document.createElement('div');
             cItem.className = 'cape-item';
             // Add loading indicator?
             capeList.appendChild(cItem); 

             // 1. Fetch via Main Process to bypass CORS/Network issues
             let visualUrl = url;
             try {
                 const base64 = await window.api.fetchImageBase64(url);
                 if (base64) visualUrl = base64;
             } catch(e) { console.error("Base64 fetch failed", e); }

             // Use visual URL (Base64) - CSS handles cropping
             cItem.style.backgroundImage = `url('${visualUrl}')`;
             cItem.title = label;
             
             if (isOwned) {
                 cItem.style.border = "2px solid #55ff55";
             }

             if (selectedImportCape === url) cItem.classList.add('selected');

             cItem.onclick = () => {
                 importViewer.loadCape(visualUrl); // Use Base64 for 3D viewer too
                 selectedImportCape = url; // Keep original URL for file saving
                 document.querySelectorAll('.cape-item').forEach(c => c.classList.remove('selected'));
                 cItem.classList.add('selected');
             };
        };

        const keys = Object.keys(capes);
        for(const key of keys) {
             const data = capes[key];
             if(data.url) {
                 hasCapes = true;
                 processCapeItem(key + " (Possédée)", data.url, true);
             }
        }

        // 2. Preset Capes (Minecon etc)
        for (const pCape of PRESET_CAPES) {
            processCapeItem(pCape.name, pCape.url, false);
        }
    }
}

// Bind Import Popup Controls
const closeImportBtn = document.getElementById('close-import-btn');
const cancelImportBtn = document.getElementById('cancel-import-btn');
const confirmImportBtn = document.getElementById('confirm-import-btn');

function closeImport() {
    if(importModal) importModal.style.display = 'none';
    if(importViewer) importViewer.animation.paused = true;
}

if(closeImportBtn) closeImportBtn.addEventListener('click', closeImport);
if(cancelImportBtn) cancelImportBtn.addEventListener('click', closeImport);

if(confirmImportBtn) {
    confirmImportBtn.addEventListener('click', () => {
        // Get selected model
        const modelEl = document.querySelector('input[name="import-model"]:checked');
        const model = modelEl ? modelEl.value : 'default';
        
        // Save to history & Select in Main Viewer
        saveSkinToHistory(tempImportPath, model, selectedImportCape);
        selectSkin(tempImportPath, model, selectedImportCape);
        
        closeImport();
    });
}

// Bind Import Model Radios
document.querySelectorAll('input[name="import-model"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (tempImportPath && importViewer) {
            importViewer.loadSkin(tempImportPath, { model: e.target.value });
        }
    });
});

// 4. Save Button
if (saveSkinBtn) {
    saveSkinBtn.addEventListener('click', async () => {
        if (!currentEditingAccount || !selectedSkinPath) {
            alert("Aucun skin sélectionné.");
            return;
        }

        saveSkinBtn.disabled = true;
        saveSkinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sauvegarde...';

        try {
            // Get selected model from State variable (as UI radios were removed)
            const finalModel = selectedSkinModel || 'default';
            
            // 1. API Upload (Traditional) - Keep existing call if backend exists
            /*
            const result = await window.api.setAccountSkin({
                uuid: currentEditingAccount.uuid,
                type: currentEditingAccount.type || 'hg_studio',
                skinPath: selectedSkinPath,
                model: finalModel 
            });
            */
           
            // 2. CustomSkinLoader (Local File Copy)
            // Use this instead per user request
            const result = await window.api.applyCustomSkin({
                username: currentEditingAccount.username,
                skinPath: selectedSkinPath,
                capeUrl: selectedSkinCape
            });

            if (result.success) {

                // Save to "Saved Skins" History with correct model and cape
                saveSkinToHistory(selectedSkinPath, finalModel, selectedSkinCape);

                alert("Skin (CustomSkinLoader) appliqué avec succès !\nRedémarrage du jeu requis.");
                wardrobeModal.style.display = 'none';
            } else {
                alert("Erreur: " + result.message);
            }
        } catch (e) {
            console.error(e);
            alert("Erreur critique: " + e.message);
        }
        
        saveSkinBtn.disabled = false;
        saveSkinBtn.innerHTML = '<i class="fas fa-save"></i> Sauvegarder';
    });
}

// Close
if (closeWardrobeBtn) {
    closeWardrobeBtn.addEventListener('click', () => {
        if(wardrobeModal) wardrobeModal.style.display = 'none';
        if(skinViewer && skinViewer.animation) skinViewer.animation.paused = true; // save GPU
    });
}

