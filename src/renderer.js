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

// Check Maintenance on Startup
(async () => {

    // INTRO SCREEN LOGIC
    setTimeout(() => {
        const intro = document.getElementById('intro-screen');
        if (intro) {
            intro.style.opacity = '0';
            setTimeout(() => { 
                intro.remove(); 
            }, 500); // Wait for fade out transition (0.5s)
        }
    }, 1000); // Show for 1 second

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
const modpackNameStatus = document.getElementById('modpack-name');

if (verBase && verEnhanced) {
    const setVersion = (version) => {
        // Simple opacity fade for text transition
        launchBtn.style.color = 'transparent';
        
        setTimeout(() => {
            if (version === 'base') {
                verBase.classList.add('active');
                verEnhanced.classList.remove('active');
                
                // Restore Play Button
                launchBtn.classList.remove('coming-soon');
                launchBtn.innerHTML = 'JOUER';
                if (modpackNameStatus) modpackNameStatus.innerText = 'Prêt à jouer';
            } else if (version === 'enhanced') {
                verEnhanced.classList.add('active');
                verBase.classList.remove('active');
                
                // Set Coming Soon state
                launchBtn.classList.add('coming-soon');
                launchBtn.innerHTML = 'BIENTÔT DISPONIBLE';
                if (modpackNameStatus) modpackNameStatus.innerText = 'HG Studio Enhanced';
            }
            
            // Restore visibility after change
            launchBtn.style.color = '';
        }, 200); // Wait for fade out
    };

    verBase.addEventListener('click', () => setVersion('base'));
    verEnhanced.addEventListener('click', () => setVersion('enhanced'));
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

        const result = await window.api.launchGame();
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
    const accContainer = document.getElementById('account-list-container');
    accContainer.innerHTML = ''; // Clear
    
    // Check for Active User (HG Studio or Microsoft)
    let activeUser = null;
    
    // Priority to HG Studio Login
    if (localStorage.getItem('hg_user_data')) {
        try {
            activeUser = JSON.parse(localStorage.getItem('hg_user_data'));
            if (!activeUser.type) activeUser.type = 'hg_studio';
        } catch (e) {}
    } 
    // Fallback to Microsoft Login
    else if (localStorage.getItem('user_session')) {
        try {
            activeUser = JSON.parse(localStorage.getItem('user_session'));
            if (!activeUser.type) activeUser.type = 'microsoft';
        } catch (e) {}
    }

    if (activeUser) {
        const typeLabel = activeUser.type === 'hg_studio' ? 'HG.Studio' : 'Microsoft';
        const typeStyle = activeUser.type === 'hg_studio' ? 'color: #ff3377;' : 'color: #00a8fc;';
        
        // Avatar Logic
        let avatarUrl = `https://minotar.net/helm/${activeUser.username || 'steve'}/100.png`;
        if (activeUser.type === 'hg_studio') {
            if (activeUser.avatar_url) avatarUrl = activeUser.avatar_url;
            else if (activeUser.avatar) avatarUrl = activeUser.avatar;
            else if (activeUser.profile_picture) avatarUrl = activeUser.profile_picture;
        }

        const card = document.createElement('div');
        card.className = 'account-card selected';
        card.innerHTML = `
            <div class="acc-avatar" style="background-image: url('${avatarUrl}')"></div>
            <div class="acc-details">
                <span class="acc-name">${activeUser.username}</span>
                <span class="acc-uuid" style="font-size: 12px; display: flex; align-items: center; gap: 5px; margin-top: 2px; ${typeStyle}">
                    ${activeUser.type === 'hg_studio' ? '<i class="fas fa-cube"></i>' : '<i class="fab fa-microsoft"></i>'} 
                    ${typeLabel} Account
                </span>
                <span class="acc-status" style="color: #4CAF50; font-size: 11px; display: block; margin-top: 4px;">● Connecté</span>
            </div>
        `;
        accContainer.appendChild(card);
    } else {
        accContainer.innerHTML = '<p style="color:#888; text-align:center; padding: 20px;">Aucun compte connecté.</p>';
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
// JAVA PATH BROWSING
// =========================================

function setupJavaBrowse(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);

    if (btn && input) {
        btn.addEventListener('click', async () => {
            const path = await window.api.openFileDialog();
            if (path) {
                input.value = path;
            }
        });
    }
}

setupJavaBrowse('browse-java-17', 'java-path-17');
setupJavaBrowse('browse-java-8', 'java-path-8');


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
