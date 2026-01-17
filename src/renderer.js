document.getElementById('minimize-btn').addEventListener('click', () => {
    window.api.minimize();
});

document.getElementById('close-btn').addEventListener('click', () => {
    window.api.close();
});

// Check Maintenance on Startup
(async () => {
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
        console.error("Failed to check maintenance", e);
    }
})();

// Login Logic
const loginBtn = document.getElementById('login-btn');
const loginUser = document.getElementById('login-user');
const loginPass = document.getElementById('login-pass');
const loginError = document.getElementById('login-error');
const microsoftLoginBtn = document.getElementById('microsoft-login-btn');

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

    // Update Profile Info
    const userNameEl = document.getElementById('user-name');
    userNameEl.innerText = user.username;

    // Reset classes
    userNameEl.classList.remove('role-owner', 'role-moderator', 'role-member');

    // Add role class
    if (user.role === 'owner') {
        userNameEl.classList.add('role-owner');
    } else if (user.role === 'moderator') {
        userNameEl.classList.add('role-moderator');
    } else {
        userNameEl.classList.add('role-member');
    }

    // Use 'helm' for face + hat layer
    document.getElementById('user-avatar').style.backgroundImage = `url('https://minotar.net/helm/${user.username}/100.png')`;
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
    // localStorage.removeItem('savedIdentifier');

    // Hide Dashboard, Show Login
    document.getElementById('dashboard-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';

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

launchBtn.addEventListener('click', async () => {
    // Show Loading Overlay
    loadingOverlay.style.display = 'flex';
    loadingLog.innerText = "INITIALISATION...";

    try {
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

// Tab Switching Logic
tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all
        tabButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
    });
});

// Open Settings
settingsBtn.addEventListener('click', async () => {
    const settings = await window.api.getSettings();
    const sysInfo = await window.api.getSystemInfo();

    // System RAM
    const totalMemMB = Math.floor(sysInfo.totalMem / 1024 / 1024);
    sysRamTotal.innerText = totalMemMB;
    ramSlider.max = totalMemMB;

    // Populate fields
    // Handle legacy "4G" format vs new "4096" MB format
    let ramMB = 4096;
    if (settings.maxRam) {
        if (settings.maxRam.endsWith('G')) {
            ramMB = parseInt(settings.maxRam) * 1024;
        } else if (settings.maxRam.endsWith('M')) {
            ramMB = parseInt(settings.maxRam);
        } else {
            ramMB = parseInt(settings.maxRam);
        }
    }

    ramSlider.value = ramMB;
    ramValue.innerText = ramMB;

    // Java Paths
    javaPath17.value = settings.javaPath17 || settings.javaPath || '';
    javaPath8.value = settings.javaPath8 || '';
    javaPath21.value = settings.javaPath21 || '';

    jvmArgsInput.value = settings.jvmArgs || '';

    if (settings.resolution) {
        resWidthInput.value = settings.resolution.width || 1280;
        resHeightInput.value = settings.resolution.height || 720;
    }

    fullscreenToggle.checked = settings.fullscreen || false;
    closeLauncherToggle.checked = settings.closeLauncher !== false; // Default true
    debugConsoleToggle.checked = settings.debugConsole || false;

    // Switch Screens
    dashboardScreen.style.display = 'none';
    settingsScreen.style.display = 'block';
});

// Close Settings (Back to Dashboard)
closeSettingsBtn.addEventListener('click', () => {
    settingsScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
});

// RAM Slider Update
ramSlider.addEventListener('input', (e) => {
    ramValue.innerText = e.target.value;
});

// Save Settings
saveSettingsBtn.addEventListener('click', async () => {
    saveSettingsBtn.innerText = "SAUVEGARDE...";
    saveSettingsBtn.disabled = true;

    const newSettings = {
        minRam: '1024M',
        maxRam: `${ramSlider.value}M`,
        javaPath: javaPath17.value, // Main Java Path (1.20.1)
        javaPath17: javaPath17.value,
        javaPath8: javaPath8.value,
        javaPath21: javaPath21.value,
        jvmArgs: jvmArgsInput.value,
        resolution: {
            width: parseInt(resWidthInput.value) || 1280,
            height: parseInt(resHeightInput.value) || 720
        },
        fullscreen: fullscreenToggle.checked,
        closeLauncher: closeLauncherToggle.checked,
        debugConsole: debugConsoleToggle.checked
    };

    const result = await window.api.saveSettings(newSettings);

    if (result.success) {
        setTimeout(() => {
            // Return to dashboard on save
            settingsScreen.style.display = 'none';
            dashboardScreen.style.display = 'block';

            saveSettingsBtn.innerText = "ENREGISTRER";
            saveSettingsBtn.disabled = false;
        }, 500);
    } else {
        alert("Erreur lors de la sauvegarde !");
        saveSettingsBtn.innerText = "ENREGISTRER";
        saveSettingsBtn.disabled = false;
    }
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
setupJavaBrowse('browse-java-21', 'java-path-21');

// =========================================
// JAVA MANAGEMENT LOGIC
// =========================================

function setupJavaManagement(version, inputId) {
    const installBtn = document.getElementById(`install-java-${version}`);
    const detectBtn = document.getElementById(`detect-java-${version}`);
    const testBtn = document.getElementById(`test-java-${version}`);
    const input = document.getElementById(inputId);

    // Load saved path
    const savedPath = localStorage.getItem(`java-path-${version}`);
    if (savedPath && input) {
        input.value = savedPath;
    }

    // Save path helper
    const savePath = (path) => {
        if (input) input.value = path;
        localStorage.setItem(`java-path-${version}`, path);
    };

    // Install
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            // Show loading
            loadingOverlay.style.display = 'flex';
            loadingLog.innerText = `INSTALLATION JAVA ${version}...`;

            try {
                const result = await window.api.installJava(version);
                if (result.success) {
                    savePath(result.path);
                    alert(`Java ${version} installé avec succès !`);
                } else {
                    alert(`Erreur: ${result.error}`);
                }
            } catch (e) {
                alert("Erreur critique lors de l'installation.");
            } finally {
                loadingOverlay.style.display = 'none';
            }
        });
    }

    // Detect
    if (detectBtn) {
        detectBtn.addEventListener('click', async () => {
            const path = await window.api.detectJava(version);
            if (path) {
                savePath(path);
                detectBtn.innerHTML = '<i class="fas fa-check"></i> Found';
                setTimeout(() => detectBtn.innerHTML = '<i class="fas fa-search"></i> Detect', 2000);
            } else {
                alert("Aucune installation locale trouvée pour cette version.");
            }
        });
    }

    // Test
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const path = input.value;
            if (!path) {
                alert("Veuillez d'abord sélectionner un chemin Java.");
                return;
            }

            testBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            const result = await window.api.testJava(path);
            testBtn.innerHTML = '<i class="fas fa-play"></i> Test';

            if (result.success) {
                alert(`Succès !\n\n${result.version}`);
            } else {
                alert(`Échec du test :\n${result.error}`);
            }
        });
    }
}

setupJavaManagement(17, 'java-path-17');
setupJavaManagement(8, 'java-path-8');
setupJavaManagement(21, 'java-path-21');

// =========================================
// RAM SLIDER VISUALS
// =========================================

function updateRamSliderVisuals() {
    const min = parseInt(ramSlider.min);
    const max = parseInt(ramSlider.max);
    const val = parseInt(ramSlider.value);

    const percentage = ((val - min) / (max - min)) * 100;

    // Update the track background instead of the input
    const track = document.querySelector('.ram-track');
    if (track) {
        // Pink fill on the left, dark on the right
        track.style.background = `linear-gradient(to right, var(--primary-pink) 0%, var(--primary-pink) ${percentage}%, rgba(255,255,255,0.1) ${percentage}%, rgba(255,255,255,0.1) 100%)`;
    }
}

ramSlider.addEventListener('input', updateRamSliderVisuals);
// Init
updateRamSliderVisuals();
