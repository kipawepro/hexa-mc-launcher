window.HexaAlert = function(title, message) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '999999';
    overlay.innerHTML = `
        <div class="modal-box" style="background:#202225; padding: 25px; border-radius: 8px; color: white; text-align: center; border: 1px solid #444; width: 300px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
            <h3 style="margin-top:0; font-family: Montserrat;">${title}</h3>
            <p style="font-family: Montserrat; font-size:14px; margin-bottom: 20px;">${message}</p>
            <button onclick="this.closest('.modal-overlay').remove()" style="padding: 10px 20px; background: #DA0037; border: none; color: white; border-radius: 4px; cursor: pointer; font-family: Montserrat; font-weight: bold; width: 100%;">Fermer</button>
        </div>
    `;
    document.body.appendChild(overlay);
};

// Global Auth State
let currentUser = null;
let skinViewer = null;

// GLOBAL EVENT LISTENERS
if(window.electron) {
    window.electron.onGameExit((code) => {
        console.log("Game Exited with code", code);
        
        // Reset play button — always rebuild from stored instance so we never
        // get stuck in STOP state regardless of _originalOnClick state
        const playBtn = document.getElementById('inst-play-btn');

        // Restore correct handler for current instance
        if (playBtn && window._currentInstanceDetails) {
            playBtn.disabled = false;
            playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
            playBtn.style.background = '';
            
            // Re-attach listener cleanly
            const newBtn = playBtn.cloneNode(true);
            playBtn.parentNode.replaceChild(newBtn, playBtn);
            
            const instId = window._currentInstanceDetails.id;
            newBtn.onclick = async () => {
                const off = OFFICIAL_INSTANCES.find(i => i.id === instId);
                if (off) {
                    LibraryManager.launchOfficial(instId);
                } else {
                    LibraryManager.launch(instId);
                }
            };
        }
        
        // 2. Persistent Crash Notification
        if (code !== 0) {
             const container = document.getElementById('progress-container');
             if(container) {
                 const toast = document.createElement('div');
                 toast.className = 'error-toast';
                 // Styling handled by CSS (.error-toast)
                 toast.innerHTML = `
                     <i class="fas fa-exclamation-triangle" style="font-size: 20px;"></i>
                     <div>
                         <div style="font-weight: 700;">GAME CRASHED</div>
                         <div style="font-size: 11px;">Exit Code: ${code} - Click to dismiss</div>
                     </div>
                 `;
                 
                 toast.onclick = () => { 
                     if(toast.parentNode) toast.parentNode.removeChild(toast); 
                 };
                 
                 container.appendChild(toast);
             }
        }
    });
}

// CONFIGURATION
const API_BASE_URL = "http://91.197.6.177:24607";

// OFFICIAL INSTANCES (Hidden from Library, Visible in Fast Launch)
const OFFICIAL_INSTANCES = [
    { id: 'off_1', name: 'HEXA OPTIMIZED 1.21.1', version: '1.21.1', type: 'release', loader: 'Fabric', isOfficial: true, folder: 'official_hexa_opt' },
    { id: 'off_2', name: 'MODDED FORGE 1.20.1', version: '1.20.1', type: 'release', loader: 'Forge', isOfficial: true, folder: 'official_forge_1.20' },
    { id: 'off_3', name: 'COMPETITIVE 1.8.9', version: '1.8.9', type: 'release', loader: 'Vanilla', isOfficial: true, folder: 'official_pvp_1.8' }
];

// Load Overrides for Official Instances
try {
    OFFICIAL_INSTANCES.forEach(inst => {
        const stored = localStorage.getItem('inst-override-' + inst.id);
        if (stored) {
            try {
                const overrides = JSON.parse(stored);
                // Safe merge
                if (overrides.memory) inst.memory = overrides.memory;
                if (overrides.javaVersion) inst.javaVersion = overrides.javaVersion;
                if (overrides.javaPath) inst.javaPath = overrides.javaPath;
                if (overrides.jvmArgs) inst.jvmArgs = overrides.jvmArgs;
                if (overrides.resolution) inst.resolution = overrides.resolution;
                if (overrides.preLaunchCommand) inst.preLaunchCommand = overrides.preLaunchCommand;
                if (overrides.wrapperCommand) inst.wrapperCommand = overrides.wrapperCommand;
                if (overrides.postExitCommand) inst.postExitCommand = overrides.postExitCommand;
            } catch(e) {}
        }
    });
} catch(e) { console.error("Failed to load official overrides", e); }

// Initialize Skin Viewer
function initSkinViewer(retries = 5) {
    // Disabled skin viewer
    return;
    const canvas = document.getElementById("skin-container");
    // Ensure container has size
    if (!canvas) return;

    try {
        if (typeof skinview3d === 'undefined') {
            console.warn("SkinView3D lib not loaded yet. Retrying...");
            if (retries > 0) {
                setTimeout(() => initSkinViewer(retries - 1), 1000);
            }
            return;
        }

        // Determine size from container
        const container = canvas.parentElement;
        const width = container.clientWidth || 400;
        const height = container.clientHeight || 500;

        // Dispose existing viewer before creating a new one (prevents doublon on retry)
        if (skinViewer) {
            try { skinViewer.dispose(); } catch(e) {}
            skinViewer = null;
        }

        const b64Steve = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAFVBMVEUAAAA7OztBQUGEhoOVl5TIyMjOzs4e8R79AAAAAXRSTlMAQObYZgAAAM9JREFUSMftleENhCAMhZnBDXQFei7QhgUuuMAh+49wVAT0pBqT84eJj9hE88mjpq1KBdEsJQm1Br7uDeymST8StxdtbgEcpqlU18XHxhnng9JrGWgbnDY2n96N1g6TMSBsAa3rQLYgqll0s4gYCDGcZHXgtokLgS1C9N6xQTbZANaKwPtVA9IZEDgDBG+trwLjwECM5wAEIr7ZAeK6EEif1S90OA4ePSpNLJZKGgOr1j8FHFiUOSEUbOnyRcn/Fyhz4jIgzYkdYL0uAKT/xhcR3cKTnTiPTAAAAABJRU5ErkJggg==';

        // Load local Steve — refreshSkinDisplay() replaces it after login.
        skinViewer = new skinview3d.SkinViewer({
            canvas: canvas,
            width: width,
            height: height,
        });
        skinViewer.loadSkin(b64Steve).catch(() => {});

        // Set camera
        skinViewer.camera.position.x = 20;
        skinViewer.camera.position.y = 10;
        skinViewer.camera.position.z = 50;
        skinViewer.zoom = 0.9;
        
        // Animation
        skinViewer.animation = new skinview3d.WalkingAnimation();
        skinViewer.animation.speed = 0.5;
        
        // Controls
        try {
              if (skinview3d.createOrbitControls) {
                  let control = skinview3d.createOrbitControls(skinViewer);
                  control.enableRotate = true; control.enableZoom = false; control.enablePan = false;
              } else if (skinview3d.OrbitControls) {
                  let control = new skinview3d.OrbitControls(skinViewer);
                  control.enableRotate = true; control.enableZoom = false; control.enablePan = false;
              } else if (skinview3d.Viewer) {
                  // V3+ native controls
              }
          } catch(e) { console.warn("Controls init bypassed"); }

        // Resize observer setup
        const resizeObserver = new ResizeObserver(entries => {
            for (let entry of entries) {
                if (entry.target === container && skinViewer) {
                    skinViewer.width = entry.contentRect.width;
                    skinViewer.height = entry.contentRect.height;
                }
            }
        });
        resizeObserver.observe(container);

    } catch (e) {
        console.error("Skin viewer init failed", e);
    }
}


// === INSTANCE SETTINGS MANAGER ===
window.InstanceSettings = {
    currentId: null,

    open(id) {
        console.log("Opening Instance Settings for ID:", id);
        try {
            this.currentId = id;
            let inst = LibraryManager.instances.find(i => i.id === id);
            let isOfficial = false;
            
            if (!inst) {
                inst = OFFICIAL_INSTANCES.find(i => i.id === id);
                if (inst) isOfficial = true;
            }

            if (!inst) {
                console.error("Instance not found:", id);
                return;
            }

            // Hide Delete Button For Official Instances
            const deleteBtn = document.querySelector('#instance-settings-modal button[onclick*="InstanceSettings.delete"]');
            if (deleteBtn) {
                deleteBtn.style.display = isOfficial ? 'none' : 'inline-block';
                deleteBtn.style.opacity = isOfficial ? '0' : '1'; 
                deleteBtn.style.pointerEvents = isOfficial ? 'none' : 'auto'; 
            }

            // Reset & Populate Form
            const nameInput = document.getElementById('inst-set-name');
            if(nameInput) nameInput.value = inst.name || '';
            
            const loaderInput = document.getElementById('inst-set-loader');
            if(loaderInput) loaderInput.value = inst.loader ? inst.loader.toLowerCase() : 'vanilla';
            
            const versionInput = document.getElementById('inst-set-version');
            if(versionInput) versionInput.value = inst.version || '';
            
            // Java Logic
            const javaSelect = document.getElementById('inst-set-java');
            const javaPathInput = document.getElementById('inst-set-java-path');
            
            if(javaSelect) {
                if (inst.javaVersion) {
                    javaSelect.value = inst.javaVersion; 
                } else {
                     javaSelect.value = 'auto';
                }

                if (inst.javaPath && inst.javaVersion === 'custom' && javaPathInput) {
                    javaPathInput.value = inst.javaPath;
                    javaPathInput.style.display = 'block';
                } else if(javaPathInput) {
                    javaPathInput.value = '';
                    javaPathInput.style.display = 'none';
                }

                javaSelect.onchange = () => {
                    if (javaSelect.value === 'custom' && javaPathInput) {
                        javaPathInput.style.display = 'block';
                    } else if(javaPathInput) {
                        javaPathInput.style.display = 'none';
                    }
                };
            }

            // RAM Logic
            const ramSlider = document.getElementById('inst-set-ram');
            const ramLabel = document.getElementById('inst-set-ram-val');
            
            if(ramSlider && ramLabel) {
                let currentRam = 4096; // Default 4GB
                if (inst.memory) {
                    if (typeof inst.memory === 'string' && inst.memory.endsWith('G')) currentRam = parseInt(inst.memory) * 1024;
                    else if (typeof inst.memory === 'string' && inst.memory.endsWith('M')) currentRam = parseInt(inst.memory);
                    else if (typeof inst.memory === 'number') currentRam = inst.memory;
                } else {
                     const globalRam = localStorage.getItem('hexa-ram');
                     if (globalRam) currentRam = parseInt(globalRam);
                }
                ramSlider.value = currentRam;
                ramLabel.innerText = (currentRam / 1024).toFixed(1) + " GB";

                ramSlider.oninput = () => {
                    ramLabel.innerText = (ramSlider.value / 1024).toFixed(1) + " GB";
                };
            }

            // Resolution
            const widthInput = document.getElementById('inst-set-width');
            const heightInput = document.getElementById('inst-set-height');
            if(widthInput && heightInput) {
                if (inst.resolution) {
                    widthInput.value = inst.resolution.width;
                    heightInput.value = inst.resolution.height;
                } else {
                    const globalW = localStorage.getItem('hexa-width') || '854';
                    const globalH = localStorage.getItem('hexa-height') || '480';
                    widthInput.value = parseInt(globalW);
                    heightInput.value = parseInt(globalH);
                }
            }

            // JVM Args
            const jvmInput = document.getElementById('inst-set-jvm');
            if(jvmInput) {
                if (inst.jvmArgs) {
                    jvmInput.value = inst.jvmArgs;
                } else {
                    const globalJvm = localStorage.getItem('hexa-jvm') || '';
                    jvmInput.value = globalJvm;
                }
            }

            // Show Modal
            const modal = document.getElementById('instance-settings-modal');
            if(modal) {
                modal.style.display = 'flex';
                modal.classList.add('open'); // Just in case CSS uses .open
            } else {
                console.error("Modal definition #instance-settings-modal not found!");
            }

            // Load Launch Hooks
            const preHook = document.getElementById('inst-set-hook-pre');
            if(preHook) preHook.value = inst.preLaunchCommand || '';
            const wrapHook = document.getElementById('inst-set-hook-wrapper');
            if(wrapHook) wrapHook.value = inst.wrapperCommand || '';
            const postHook = document.getElementById('inst-set-hook-post');
            if(postHook) postHook.value = inst.postExitCommand || '';

        } catch(e) {
            console.error("Critical error in InstanceSettings.open:", e);
            alert("Error opening settings: " + e.message);
        }
    },

    close() {
        document.getElementById('instance-settings-modal').style.display = 'none';
        this.currentId = null;
    },
    
    delete() {
        if(!this.currentId) return;
        
        // Check official
        if (OFFICIAL_INSTANCES.some(i => i.id === this.currentId)) {
             window.HexaAlert("Error", "Official instances cannot be deleted.");
             return;
        }

        if(confirm("Are you sure you want to delete this instance? This action cannot be undone.")) {
            LibraryManager.delete(this.currentId);
            this.close();
            // Close details view if open
            document.getElementById('instance-details-view').style.display = 'none';
        }
    },
    
    duplicate() {
        if(!this.currentId) return;
        LibraryManager.duplicate(this.currentId);
        this.close();
    },

    delete() {
        if(!this.currentId) return;
        // Settings modal is open, but we show confirm modal on top
        if(LibraryManager && LibraryManager.confirmDelete) {
            LibraryManager.confirmDelete(this.currentId);
        } else {
             if(confirm("Delete this instance?")) {
                 LibraryManager.delete(this.currentId);
                 this.close();
             }
        }
    },

    save() {
        if (!this.currentId) return;
        
        let inst = LibraryManager.instances.find(i => i.id === this.currentId);
        let isOfficial = false;
        
        if (!inst) {
            inst = OFFICIAL_INSTANCES.find(i => i.id === this.currentId);
            if (inst) isOfficial = true;
        }

        if (!inst) {
            this.close();
            return;
        }

        // Gather Data
        const newData = {
             name: document.getElementById('inst-set-name').value,
             javaVersion: document.getElementById('inst-set-java').value,
             // Handle 'custom' path
             javaPath: (document.getElementById('inst-set-java').value === 'custom') ? document.getElementById('inst-set-java-path').value : undefined,
             memory: Math.round(document.getElementById('inst-set-ram').value / 1024) + "G",
             resolution: {
                width: parseInt(document.getElementById('inst-set-width').value),
                height: parseInt(document.getElementById('inst-set-height').value)
            },
            jvmArgs: document.getElementById('inst-set-jvm').value,
            preLaunchCommand: document.getElementById('inst-set-hook-pre').value,
            wrapperCommand: document.getElementById('inst-set-hook-wrapper').value,
            postExitCommand: document.getElementById('inst-set-hook-post').value
        };

        // Apply changes to memory object
        Object.assign(inst, newData);
        if (!newData.javaPath) delete inst.javaPath;

        // Save Logic
        if (isOfficial) {
             const overrides = { ...newData };
             localStorage.setItem('inst-override-' + inst.id, JSON.stringify(overrides));
             window.HexaAlert("Success", "Configuration saved (Local Override).");
        } else {
             LibraryManager.save();
             window.HexaAlert("Success", "Configuration saved.");
        }
        
        LibraryManager.render();
        
        // Refresh detail view if open
        if (window._currentInstanceDetails && window._currentInstanceDetails.id === inst.id) {
             document.getElementById('inst-name-lg').innerText = inst.name;
        }
        
        this.close();
    }
};

// Global Click for Context Menu
window.addEventListener('click', (e) => {
    const ctx = document.getElementById('inst-context-menu');
    if(ctx) ctx.style.display = 'none';
});

// === LIBRARY SYSTEM MANAGER ===
const LibraryManager = {
    instances: [],

    init() {
        console.log("Initializing LibraryManager...");
        // Load from local storage or defaults
        const saved = localStorage.getItem('hexa_instances');
        if (saved) {
            try {
                this.instances = JSON.parse(saved);
            } catch(e) {
                console.error("Corrupt library found, resetting.");
                this.instances = [];
            }
        } 
        
        if (this.instances.length === 0) {
            // Default Instance
            this.instances = [
                { id: 'def_1', name: 'Hexa Optimized', version: '1.21.1', loader: 'Fabric', icon: 'assets/logo.png', status: 'Ready', folder: 'hexa_optimized' }
            ];
            this.save();
        }
        
        this.render();
        this.setupEventListeners();
    },

    save() {
        localStorage.setItem('hexa_instances', JSON.stringify(this.instances));
    },

    render() {
        const grid = document.getElementById('library-grid');
        
        // Update Fast Launch Selector
        const selector = document.getElementById('version-selector');
        if (selector) {
            selector.innerHTML = '';
            
            // 1. Add Official Instances
            const grpOfficial = document.createElement('optgroup');
            grpOfficial.label = "Official Configurations";
            OFFICIAL_INSTANCES.forEach(inst => {
                const opt = document.createElement('option');
                opt.value = inst.id;
                opt.innerText = inst.name;
                grpOfficial.appendChild(opt);
            });
            selector.appendChild(grpOfficial);

            // 2. Add User Instances
            if (this.instances.length > 0) {
                const grpUser = document.createElement('optgroup');
                grpUser.label = "My Library";
                this.instances.forEach(inst => {
                    const opt = document.createElement('option');
                    opt.value = inst.id;
                    opt.innerText = `${inst.name} (${inst.version})`;
                    grpUser.appendChild(opt);
                });
                selector.appendChild(grpUser);
            }

            // 3. Restore Selection (Last Launched)
            const lastId = localStorage.getItem('hexa_last_launched');
            if (lastId) {
                // Check if valid
                const exists = OFFICIAL_INSTANCES.find(i=>i.id===lastId) || this.instances.find(i=>i.id===lastId);
                if(exists) selector.value = lastId;
                else selector.selectedIndex = 0;
            } else {
                selector.selectedIndex = 0;
            }
            
            // Re-bind change event to update play button text
            selector.onchange = () => {
                const btn = document.getElementById('play-btn');
                if(!btn) return;
                const selId = selector.value;
                const inst = OFFICIAL_INSTANCES.find(i=>i.id===selId) || this.instances.find(i=>i.id===selId);
                if(inst) {
                    btn.innerHTML = `LAUNCH ${inst.name.toUpperCase()}`;
                    if(inst.status && inst.status !== 'Ready') {
                         btn.innerHTML = inst.status.toUpperCase();
                         btn.disabled = true;
                    } else {
                         btn.disabled = false;
                    }
                }
            };
            // Initial trigger
            selector.onchange();
        }

        if (!grid) return;
        grid.innerHTML = '';

        this.instances.forEach(inst => {
            const card = document.createElement('div');
            card.className = 'instance-card';
            // Default icon if specific one fails or is missing
            const iconUrl = inst.icon || 'assets/logo.png';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <img src="${iconUrl}" class="instance-icon" onerror="this.src='assets/logo.png'">
                    <span style="font-size:10px; background:#eee; padding:2px 6px; height:fit-content; border-radius:4px;">${inst.loader}</span>
                </div>
                <div class="instance-info">
                    <h3>${inst.name}</h3>
                    <div class="instance-meta">
                        <span>${inst.version}</span>
                        <span>•</span>
                        <span>${inst.status || 'Ready'}</span>
                    </div>
                </div>
                <div class="play-overlay">
                    <button class="mini-play-btn" data-id="${inst.id}">PLAY</button>
                    <button class="mini-play-btn" style="border:none; font-size:10px; margin-left:5px; background:rgba(255,0,0,0.4);" onclick="event.stopPropagation(); LibraryManager.confirmDelete('${inst.id}')">✕</button>
                </div>
            `;
            
            if(inst.status && inst.status.includes('Installing')) {
                const btn = card.querySelector('.mini-play-btn');
                if(btn) {
                    btn.disabled = true;
                    btn.innerText = '...';
                }
            }

            // Click to Play logic
            const miniPlay = card.querySelector('.mini-play-btn');
            if(miniPlay) {
                miniPlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Select specifically in the dropdown too
                    if(selector) {
                        selector.value = inst.id;
                        selector.dispatchEvent(new Event('change')); // Update main button text
                    }
                    // Switch to Home Tab
                    document.querySelector('.nav-item[data-tab="home"]').click();
                    // Auto-click Launch (Optional, maybe user just wants to select)
                    // document.getElementById('play-btn').click();
                });
            }
            
            // Click Card to Open Details
            card.addEventListener('click', () => {
                this.openDetails(inst);
            });

            grid.appendChild(card);
        });
        
        // Add "Add New" Card
        const addCard = document.createElement('div');
        addCard.className = 'instance-card add-card';
        addCard.style.cssText = "display: flex; justify-content: center; align-items: center; border: 2px dashed #444; background: transparent; cursor: pointer;";
        addCard.innerHTML = `
            <div style="text-align: center; color: #888;">
                <i class="fas fa-plus" style="font-size: 32px; margin-bottom: 10px;"></i>
                <div style="font-weight: 600;">CREATE NEW</div>
            </div>
        `;
        addCard.onclick = () => {
            document.getElementById('btn-create-inst').click();
        };
        grid.appendChild(addCard);
    },

    openDetails(inst, pushToHistory = true) {
        const view = document.getElementById('instance-details-view');
        if(!view) return;
        
        // Show View (Full Screen Overlay)
        view.classList.add('active');
        view.style.display = 'block';

        // Push History State
        if (typeof NavSystem !== 'undefined' && pushToHistory) {
            NavSystem.pushState({ tab: 'library', type: 'instance-detail', instanceId: inst.id });
        }

        // Populate Header
        document.getElementById('inst-name-lg').innerText = inst.name;
        document.getElementById('inst-version-tag').innerText = inst.version;
        document.getElementById('inst-loader-tag').innerText = inst.loader;
        document.getElementById('inst-icon-lg').src = inst.icon || 'assets/logo.png';
        
        // Setup Settings Button
        const setBtn = document.getElementById('inst-settings-btn');
        if (setBtn) {
             // Clone node to remove old listeners properly
             const newSetBtn = setBtn.cloneNode(true);
             if (setBtn.parentNode) {
                 setBtn.parentNode.replaceChild(newSetBtn, setBtn);
                 newSetBtn.addEventListener('click', (e) => {
                     e.preventDefault(); 
                     e.stopPropagation();
                     console.log("Settings Button Clicked for ID:", inst.id);
                     if (typeof InstanceSettings !== 'undefined' && InstanceSettings.open) {
                         try {
                             InstanceSettings.open(inst.id);
                         } catch(err) {
                             console.error("InstanceSettings.open failed:", err);
                             if(window.HexaAlert) window.HexaAlert("Error", "Could not open settings: " + err.message);
                         }
                     } else {
                         console.error("InstanceSettings is not defined!");
                         if(window.HexaAlert) window.HexaAlert("Error", "Module Settings manquant (InstanceSettings undefined).");
                     }
                 });
             } else {
                 console.error("Settings button parent not found in DOM");
             }
        } else {
             console.error("Settings button (inst-settings-btn) NOT FOUND in DOM");
        }
        
        // Setup "..." Context Menu
        const moreBtn = document.getElementById('inst-more-btn');
        if (moreBtn) {
            const newBtn = moreBtn.cloneNode(true);
            moreBtn.parentNode.replaceChild(newBtn, moreBtn);
            
            newBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ctx = document.getElementById('inst-context-menu');
                if(!ctx) return;
                
                const rect = newBtn.getBoundingClientRect();
                ctx.style.top = (rect.bottom + 10) + 'px';
                ctx.style.left = (rect.right - 190) + 'px';
                ctx.style.display = 'block';
                
                // Actions
                const openFolderBtn = document.getElementById('ctx-open-folder');
                if(openFolderBtn) {
                    // Remove old listeners
                    const cleanBtn = openFolderBtn.cloneNode(true);
                    openFolderBtn.parentNode.replaceChild(cleanBtn, openFolderBtn);
                    cleanBtn.onclick = () => {
                        if(window.electron) window.electron.openFolder(inst.folder);
                        ctx.style.display = 'none';
                    };
                }

                const exportBtn = document.getElementById('ctx-export-pack');
                if (exportBtn) {
                    const cleanBtn = exportBtn.cloneNode(true);
                    exportBtn.parentNode.replaceChild(cleanBtn, exportBtn);
                    cleanBtn.onclick = () => {
                         // Export logic (TODO)
                         window.HexaAlert("Info", "Export feature coming soon.");
                         ctx.style.display = 'none';
                    };
                }

                const dupBtn = document.getElementById('ctx-duplicate');
                if (dupBtn) {
                    const cleanBtn = dupBtn.cloneNode(true);
                    dupBtn.parentNode.replaceChild(cleanBtn, dupBtn);
                    cleanBtn.onclick = () => {
                         LibraryManager.duplicate(inst.id);
                         ctx.style.display = 'none';
                    };
                }

                const delBtn = document.getElementById('ctx-delete');
                if (delBtn) {
                    const cleanBtn = delBtn.cloneNode(true);
                    delBtn.parentNode.replaceChild(cleanBtn, delBtn);
                    cleanBtn.onclick = () => {
                         if(confirm("Delete this instance?")) {
                             LibraryManager.delete(inst.id);
                             document.getElementById('instance-details-view').style.display = 'none';
                         }
                         ctx.style.display = 'none';
                    };
                }
            });
        }
        
        // Play Button Action
        const playBtn = document.getElementById('inst-play-btn');
        playBtn.onclick = async () => {
             if(playBtn.disabled) return;
             
             // 1. Switch to Logs Tab
             const logTab = document.querySelector('.inst-tab[data-target="inst-logs"]');
             if(logTab) logTab.click();
             
             // 2. Clear previous logs
             const logContainer = document.getElementById('inst-logs-container');
             if(logContainer) logContainer.innerHTML = '';

             // 3. UI Updates
             playBtn.disabled = true;
             playBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LAUNCHING...';
             
             try {
                // Ensure UUID is valid for Offline Mode
                let userUUID = '00000000-0000-0000-0000-000000000000';
                if (currentUser && currentUser.uuid) {
                    userUUID = currentUser.uuid;
                } else {
                    // Generate offline UUID
                    userUUID = '88888888-8888-8888-8888-888888888888'; 
                }

                const launchOptions = {
                    ...inst,
                    username: currentUser ? currentUser.username : 'Player',
                    uuid: userUUID,
                    accessToken: currentUser ? currentUser.accessToken : '0000',
                    isOfficial: inst.isOfficial || false
                };
                
                // Add instanceFolder fallback if missing (for legacy instances)
                if (!launchOptions.instanceFolder && launchOptions.folder) {
                    launchOptions.instanceFolder = launchOptions.folder;
                }
                
                await window.electron.launch(launchOptions);
                
                // Transition to STOP state
                playBtn.disabled = false;
                playBtn.innerHTML = '<i class="fas fa-stop"></i> STOP';
                playBtn.style.background = "#d00"; // Red color
                
                // Temporarily override click handler for Stop action
                const originalOnClick = playBtn.onclick;
                playBtn.onclick = async () => {
                    if (window.electron && window.electron.stopGame) {
                        playBtn.disabled = true;
                        playBtn.innerText = "STOPPING...";
                        await window.electron.stopGame();
                        // State resets on 'game-exit' event
                    }
                };
                
                // Store original reference to restore later if needed
                playBtn._originalOnClick = originalOnClick;

            } catch (e) {
                console.error("Launch Error", e);
                window.HexaAlert("Information", "Launch failed: " + e.message);
                playBtn.disabled = false;
                playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
            }
        };
        
        // Close Button
        const closeBtn = document.getElementById('inst-close-btn');
        if (closeBtn) closeBtn.onclick = () => {
             if (typeof NavSystem !== 'undefined') NavSystem.goBack();
             else {
                 view.classList.remove('active');
                 view.style.display = '';
             }
        };

        // Reset Tabs
        document.querySelectorAll('.inst-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.inst-tab-pane').forEach(p => p.style.display = 'none');
        
        // Default Tab
        document.querySelector('.inst-tab[data-target="inst-content"]').classList.add('active');
        document.getElementById('inst-content').style.display = 'block';
        
        // Store current instance for tab lazy-loading
        window._currentInstanceDetails = inst;

        // Load Mods
        this.loadInstanceMods(inst);

        // Activate Tab View (Hide others)
        document.querySelectorAll('.tab-section').forEach(s => {
            s.classList.remove('active');
            s.style.display = ''; // Clear legacy inline styles
        });
        view.classList.add('active');
    },

    async loadInstanceMods(inst) {
        const list = document.getElementById('inst-mods-list');
        const pagBar = document.getElementById('inst-mods-pagination');
        list.innerHTML = '<div style="padding:40px; text-align:center; color:#999;"><i class="fas fa-spinner fa-spin"></i> Loading content...</div>';
        if (pagBar) pagBar.style.display = 'none';

        // Remove any existing filter bar immediately (before async work)
        const oldBar = document.getElementById('content-filter-bar');
        if (oldBar) oldBar.remove();

        // Race-condition guard: cancel stale async completions
        const loadId = Date.now() + Math.random();
        this._contentLoadId = loadId;

        // Wire up + Install Content button everytime we open an instance
        const installBtn = document.getElementById('inst-install-content-btn');
        if (installBtn) {
            const newInstallBtn = installBtn.cloneNode(true);
            installBtn.parentNode.replaceChild(newInstallBtn, installBtn);
            newInstallBtn.addEventListener('click', () => {
                // Navigate to Browser Tab (Page)
                if (typeof NavSystem !== 'undefined') {
                    const contentBtn = document.querySelector('.nav-item[data-tab="content"]');
                    if(contentBtn) contentBtn.click();
                }

                if (typeof ContentBrowser !== 'undefined') {
                    // Remember which instance to install into
                    ContentBrowser._targetInstance = inst;

                    // Switch browser to show mods filtered by this instance's version/loader
                    ContentBrowser.state.type = 'mod';
                    ContentBrowser.state.version = inst.version || '';
                    ContentBrowser.state.loader = (inst.loader || '').toLowerCase();
                    ContentBrowser.state.offset = 0;

                    // Sync nav-tab-btn UI
                    const modTabBtn = document.querySelector('.nav-tab-btn[data-type="mod"]');
                    if (modTabBtn) {
                        document.querySelectorAll('.nav-tab-btn').forEach(b => {
                            b.classList.remove('active');
                            b.style.color = '#999';
                        });
                        modTabBtn.classList.add('active');
                        modTabBtn.style.color = '#000';
                    }

                    ContentBrowser.search();
                }
            });
        }

        try {
            let instPath = inst.path;
            if (!instPath && inst.folder) instPath = inst.folder;

            const content = await window.electron.getInstanceContent(instPath);

            // Abort if another loadInstanceMods() started after us
            if (this._contentLoadId !== loadId) return;

            // Remove any filter bar that a concurrent call may have inserted while we were awaiting
            const staleBar = document.getElementById('content-filter-bar');
            if (staleBar) staleBar.remove();

            this._contentAll = [
                ...content.mods,
                ...content.resourcepacks,
                ...content.shaders
            ];
            this._contentFilter = 'all';
            this._contentPage = 1;
            this._contentPerPage = 15;

            const renderContentPage = (page) => {
                let items = this._contentAll;
                if (this._contentFilter === 'mods') items = content.mods;
                else if (this._contentFilter === 'resourcepacks') items = content.resourcepacks;
                else if (this._contentFilter === 'shaders') items = content.shaders;

                const totalPages = Math.max(1, Math.ceil(items.length / this._contentPerPage));
                page = Math.max(1, Math.min(page, totalPages));
                this._contentPage = page;
                const start = (page - 1) * this._contentPerPage;
                const slice = items.slice(start, start + this._contentPerPage);

                list.innerHTML = '';

                if (items.length === 0) {
                    list.innerHTML = '<div style="padding:30px; text-align:center; color:#999;">No content found.</div>';
                    if (pagBar) pagBar.style.display = 'none';
                    return;
                }

                slice.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'mod-row';
                    row.style.cssText = 'display:flex; align-items:center; padding:10px 20px; border-bottom:1px solid #eee; gap:12px; cursor:pointer; transition:background 0.1s;';
                    row.addEventListener('mouseover', () => { row.style.background = '#f9f9f9'; });
                    row.addEventListener('mouseout', () => { row.style.background = ''; });

                    const iconSrc = item.icon || 'assets/logo.png';
                    const dimmed = item.isEnabled ? '' : 'opacity:0.45;';

                    row.innerHTML = `
                        <img src="${iconSrc}" style="width:32px; height:32px; border-radius:4px; object-fit:contain; background:#f5f5f5; flex-shrink:0; ${dimmed}" onerror="this.src='assets/logo.png'">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:600; font-size:13px; color:${item.isEnabled ? '#222' : '#bbb'}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                            <div style="font-size:11px; color:#aaa;">${item.author || ''}</div>
                        </div>
                        <div style="width:100px; font-size:12px; color:#888; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex-shrink:0;">${item.version || '—'}</div>
                        <div style="display:flex; gap:6px; flex-shrink:0;" onclick="event.stopPropagation()">
                            <button class="icon-onyl-btn content-toggle-btn" style="width:28px; height:28px; font-size:13px; color:${item.isEnabled ? '#27ae60' : '#bbb'};" title="${item.isEnabled ? 'Disable' : 'Enable'}" data-jar="${item.jar}" data-enabled="${item.isEnabled}" data-subdir="${item.subDir}">
                                <i class="fas fa-${item.isEnabled ? 'toggle-on' : 'toggle-off'}"></i>
                            </button>
                            <button class="icon-onyl-btn content-delete-btn" style="width:28px; height:28px; font-size:12px; color:#e74c3c;" title="Delete" data-jar="${item.jar}" data-subdir="${item.subDir}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `;

                    // Click row → open Modrinth page for mods only
                    if (item.subDir === 'mods') {
                        row.addEventListener('click', async () => {
                            try {
                                const searchName = encodeURIComponent(item.name);
                                const res = await fetch(`https://api.modrinth.com/v2/search?query=${searchName}&limit=1&facets=${encodeURIComponent(JSON.stringify([['project_type:mod']]))}`);
                                const data = await res.json();
                                if (data.hits && data.hits.length > 0) {
                                    // Navigate to content tab + open project details
                                    const navTab = document.querySelector('.nav-item[data-tab="content"]');
                                    if (navTab) navTab.click();
                                    setTimeout(() => ContentBrowser.openProjectDetails(data.hits[0]), 100);
                                }
                            } catch(e) { console.error('Modrinth search error', e); }
                        });
                    }

                    // Toggle button
                    const toggleBtn = row.querySelector('.content-toggle-btn');
                    toggleBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const jar = toggleBtn.dataset.jar;
                        const isEnabled = toggleBtn.dataset.enabled === 'true';
                        const sub = toggleBtn.dataset.subdir;
                        const res = await window.electron.toggleMod(instPath, jar, !isEnabled, sub);
                        if (res && res.success) {
                            const arr = sub === 'mods' ? content.mods : sub === 'resourcepacks' ? content.resourcepacks : content.shaders;
                            const idx = arr.findIndex(m => m.jar === jar);
                            if (idx !== -1) {
                                arr[idx].isEnabled = !isEnabled;
                                arr[idx].jar = res.newFileName;
                            }
                            // Rebuild combined
                            this._contentAll = [...content.mods, ...content.resourcepacks, ...content.shaders];
                            renderContentPage(this._contentPage);
                        }
                    });

                    // Delete button
                    const deleteBtn = row.querySelector('.content-delete-btn');
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const jar = deleteBtn.dataset.jar;
                        const sub = deleteBtn.dataset.subdir;
                        if (!confirm(`Delete "${jar}"?`)) return;
                        const res = await window.electron.deleteContentFile({ instPath, subDir: sub, fileName: jar });
                        if (res && res.success) {
                            const arr = sub === 'mods' ? content.mods : sub === 'resourcepacks' ? content.resourcepacks : content.shaders;
                            const idx = arr.findIndex(m => m.jar === jar);
                            if (idx !== -1) arr.splice(idx, 1);
                            this._contentAll = [...content.mods, ...content.resourcepacks, ...content.shaders];
                            renderContentPage(this._contentPage);
                        }
                    });

                    list.appendChild(row);
                });

                // Pagination
                const pageInfo = document.getElementById('mods-page-info');
                const prevBtn = document.getElementById('mods-prev-btn');
                const nextBtn = document.getElementById('mods-next-btn');
                if (pagBar) pagBar.style.display = totalPages > 1 ? 'flex' : 'none';
                if (pageInfo) pageInfo.textContent = `Page ${page} of ${totalPages}  (${items.length} items)`;
                if (prevBtn) prevBtn.disabled = page === 1;
                if (nextBtn) nextBtn.disabled = page === totalPages;
            };

            // Filter bar — built AFTER renderContentPage is defined so closures work
            const filterBar = document.createElement('div');
            filterBar.id = 'content-filter-bar';
            filterBar.style.cssText = 'display:flex; gap:8px; padding:10px 20px; border-bottom:1px solid #eee; background:#fafafa;';
            const filters = [
                { key: 'all', label: 'All' },
                { key: 'mods', label: 'Mods' },
                { key: 'resourcepacks', label: 'Resource Packs' },
                { key: 'shaders', label: 'Shaders' }
            ];
            filters.forEach(f => {
                const btn = document.createElement('button');
                btn.textContent = f.label;
                btn.dataset.filter = f.key;
                btn.style.cssText = 'padding:5px 14px; border-radius:20px; border:1px solid #ddd; background:#fff; font-size:12px; font-weight:600; cursor:pointer; transition:all 0.15s;';
                if (f.key === 'all') {
                    btn.style.background = '#111';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#111';
                }
                btn.addEventListener('click', () => {
                    filterBar.querySelectorAll('button').forEach(b => {
                        b.style.background = '#fff';
                        b.style.color = '#555';
                        b.style.borderColor = '#ddd';
                    });
                    btn.style.background = '#111';
                    btn.style.color = '#fff';
                    btn.style.borderColor = '#111';
                    this._contentFilter = f.key;
                    renderContentPage(1);
                });
                filterBar.appendChild(btn);
            });
            list.parentNode.insertBefore(filterBar, list);

            this._modsPagePrev = () => renderContentPage(this._contentPage - 1);
            this._modsPageNext = () => renderContentPage(this._contentPage + 1);

            renderContentPage(1);

        } catch(e) {
            console.error(e);
            list.innerHTML = '<div style="padding:20px; color:#d00;">Error loading content: ' + e.message + '</div>';
        }
    },

    async loadScreenshots(inst) {
        const grid = document.getElementById('inst-screenshots-grid');
        if (!grid) return;
        grid.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:#999;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:10px;">Loading screenshots...</p></div>';

        try {
            const instPath = inst.folder || inst.path;
            const screenshots = await window.electron.getScreenshots(instPath);
            grid.innerHTML = '';

            if (!screenshots || screenshots.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:#999;"><i class="fas fa-images" style="font-size:36px; display:block; margin-bottom:12px;"></i><p>No screenshots found.</p><small>Play the game to capture some!</small></div>';
                return;
            }

            screenshots.forEach(shot => {
                const wrap = document.createElement('div');
                wrap.style.cssText = 'position:relative; overflow:hidden; border-radius:8px; cursor:pointer; background:#000; aspect-ratio:16/9;';

                const img = document.createElement('img');
                img.src = shot.data;
                img.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block; transition:transform 0.2s, opacity 0.2s; border-radius:8px;';
                img.title = shot.name;

                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.7)); padding:8px; opacity:0; transition:opacity 0.2s; border-radius:0 0 8px 8px;';
                overlay.innerHTML = `<span style="color:#fff; font-size:11px; font-weight:500;">${shot.name}</span>`;

                wrap.addEventListener('mouseenter', () => { img.style.transform = 'scale(1.04)'; img.style.opacity = '0.85'; overlay.style.opacity = '1'; });
                wrap.addEventListener('mouseleave', () => { img.style.transform = 'scale(1)'; img.style.opacity = '1'; overlay.style.opacity = '0'; });
                wrap.addEventListener('click', () => this.openPhotoEditor(inst, shot));

                wrap.appendChild(img);
                wrap.appendChild(overlay);
                grid.appendChild(wrap);
            });
        } catch(e) {
            console.error('Screenshots load error:', e);
            grid.innerHTML = '<div style="grid-column:1/-1; padding:20px; color:#d00; text-align:center;">Error loading screenshots.</div>';
        }
    },

    _fmtPlaytime(secs) {
        if (!secs || secs <= 0) return '—';
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    },

    async loadWorlds(inst) {
        const list = document.getElementById('inst-worlds-list');
        if (!list) return;
        list.innerHTML = '<div style="padding:40px; text-align:center; color:#999;"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:10px;">Loading worlds...</p></div>';

        try {
            const instPath = inst.folder || inst.path;
            const worlds = await window.electron.getWorlds(instPath);
            list.innerHTML = '';

            if (!worlds || worlds.length === 0) {
                list.innerHTML = '<div style="padding:40px; text-align:center; color:#999;"><i class="fas fa-globe" style="font-size:36px; display:block; margin-bottom:12px;"></i><p>No worlds found.</p><small>Create a world in Minecraft first.</small></div>';
                return;
            }

            const GAME_MODES = ['Survival', 'Creative', 'Adventure', 'Spectator'];
            const DIFFICULTIES = ['Peaceful', 'Easy', 'Normal', 'Hard'];
            const DIFF_COLORS = ['#4caf50', '#8bc34a', '#ff9800', '#f44336'];

            worlds.forEach(w => {
                const card = document.createElement('div');
                card.style.cssText = 'display:flex; align-items:center; padding:14px 18px; border-bottom:1px solid #f0f0f0; gap:16px; transition:background 0.15s; border-radius:6px;';
                card.addEventListener('mouseenter', () => card.style.background = '#f8f8f8');
                card.addEventListener('mouseleave', () => card.style.background = 'transparent');

                const lastPlayed = w.lastPlayed ? new Date(w.lastPlayed) : null;
                const dateStr = lastPlayed
                    ? lastPlayed.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) +
                      ' at ' + lastPlayed.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
                    : 'Unknown';

                const playtimeStr = this._fmtPlaytime(w.playtimeSecs || 0);
                const modeLabel = GAME_MODES[w.gameType] || 'Survival';
                const diffLabel = DIFFICULTIES[w.difficulty] || 'Normal';
                const diffColor = DIFF_COLORS[w.difficulty] || '#ff9800';
                const cheatsLabel = w.allowCommands ? '⚡ Cheats ON' : 'Cheats OFF';
                const isHardcore = !!(w.hardcore);

                // Icon: pixelated for the Minecraft look
                const iconEl = document.createElement('img');
                iconEl.style.cssText = 'width:80px; height:80px; border-radius:6px; object-fit:cover; image-rendering:pixelated; background:#aaa; border:2px solid #ddd; flex-shrink:0;';
                iconEl.src = w.icon || 'assets/logo.png';

                // Info column
                const info = document.createElement('div');
                info.style.cssText = 'flex:1; min-width:0;';
                info.innerHTML = `
                    <div style="font-weight:700; font-size:15px; color:#1a1a1a; margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${w.name}">${w.name}</div>
                    <div style="font-size:11px; color:#999; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${w.folder}">${w.folder}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:5px;">
                        ${isHardcore ? `<span style="background:#c0392b; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:800; color:#fff; display:inline-flex; align-items:center; gap:4px; letter-spacing:0.3px;">&#x2620; HARDCORE</span>` : ''}
                        <span style="background:#f0f0f0; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:#555;">${modeLabel}</span>
                        <span style="background:${diffColor}22; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:${diffColor};">${diffLabel}</span>
                        <span style="background:${w.allowCommands ? '#fff8e1' : '#f5f5f5'}; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:${w.allowCommands ? '#f59e0b' : '#999'};">${cheatsLabel}</span>
                    </div>
                    <div style="font-size:11px; color:#aaa;">
                        <i class="fas fa-clock" style="width:13px;"></i> ${dateStr} &nbsp;·&nbsp;
                        <i class="fas fa-gamepad" style="width:13px;"></i> ${playtimeStr} &nbsp;·&nbsp;
                        <i class="fas fa-trophy" style="width:13px;"></i> ${w.advancements} advancements
                    </div>
                `;

                // Buttons
                const btns = document.createElement('div');
                btns.style.cssText = 'display:flex; flex-direction:column; gap:8px; flex-shrink:0;';

                const gearBtn = document.createElement('button');
                gearBtn.className = 'secondary-btn small';
                gearBtn.title = isHardcore ? 'Cannot edit a Hardcore world' : 'Edit world settings';
                gearBtn.style.cssText = 'display:flex; align-items:center; gap:6px; justify-content:center; width:120px;';
                gearBtn.innerHTML = '<i class="fas fa-cog"></i> Edit';
                if (isHardcore) {
                    gearBtn.disabled = true;
                    gearBtn.style.opacity = '0.4';
                    gearBtn.style.cursor = 'not-allowed';
                } else {
                    gearBtn.addEventListener('click', () => this.openWorldEditor(inst, w));
                }

                const folderBtn = document.createElement('button');
                folderBtn.className = 'secondary-btn small';
                folderBtn.style.cssText = 'display:flex; align-items:center; gap:6px; justify-content:center; width:120px;';
                folderBtn.innerHTML = '<i class="fas fa-folder-open"></i> Folder';
                folderBtn.addEventListener('click', () => window.electron.openFolder(w.path));

                btns.appendChild(gearBtn);
                btns.appendChild(folderBtn);

                card.appendChild(iconEl);
                card.appendChild(info);
                card.appendChild(btns);
                list.appendChild(card);
            });
        } catch(e) {
            console.error('Worlds load error:', e);
            list.innerHTML = '<div style="padding:20px; color:#d00; text-align:center;">Error loading worlds.</div>';
        }
    },

    async loadServers(inst) {
        const list = document.getElementById('inst-servers-list');
        if (!list) return;
        const instPath = inst.folder || inst.path;

        list.innerHTML = '<div style="padding:16px; text-align:center; color:#bbb;"><i class="fas fa-spinner fa-spin"></i> Loading servers...</div>';
        try {
            const servers = await window.electron.getServers(instPath);
            list.innerHTML = '';

            const visible = servers.filter(s => !s.hidden);
            if (visible.length === 0) {
                list.innerHTML = '<div style="padding:24px; text-align:center; color:#ccc;"><i class="fas fa-server" style="font-size:26px; display:block; margin-bottom:10px;"></i>No servers saved.<br><small>Add servers in Minecraft first.</small></div>';
                return;
            }

            for (const srv of visible) {
                const card = document.createElement('div');
                card.style.cssText = 'display:flex; align-items:center; padding:14px 18px; border-bottom:1px solid #f0f0f0; gap:16px; transition:background 0.15s; border-radius:6px;';
                card.addEventListener('mouseenter', () => card.style.background = '#f8f8f8');
                card.addEventListener('mouseleave', () => card.style.background = 'transparent');

                const iconEl = document.createElement('img');
                iconEl.style.cssText = 'width:52px; height:52px; border-radius:6px; object-fit:cover; border:1px solid #eee; flex-shrink:0; image-rendering:pixelated; background:#f5f5f5;';
                iconEl.src = srv.icon || 'assets/logo.png';
                iconEl.onerror = () => { iconEl.src = 'assets/logo.png'; };

                // Parse host:port
                const colonIdx = (srv.ip || '').lastIndexOf(':');
                const host = colonIdx > 0 ? srv.ip.slice(0, colonIdx) : (srv.ip || '');
                const portStr = colonIdx > 0 ? srv.ip.slice(colonIdx + 1) : '25565';

                const statusBadge = document.createElement('span');
                statusBadge.style.cssText = 'display:inline-flex; align-items:center; gap:4px; padding:2px 9px; border-radius:4px; font-size:11px; font-weight:700; background:#f5f5f5; color:#bbb;';
                statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Checking...';

                const motdEl = document.createElement('div');
                motdEl.style.cssText = 'font-size:11px; color:#bbb; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px;';
                motdEl.textContent = '—';

                // IP: hidden by default, click eye icon to reveal
                const ipDisplay = document.createElement('div');
                ipDisplay.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:2px;';
                const ipText = document.createElement('span');
                ipText.style.cssText = 'font-size:12px; color:#aaa; letter-spacing:2px; font-family:monospace; user-select:none;';
                ipText.textContent = '••••••••••••';
                ipText.dataset.hidden = 'true';
                const eyeBtn = document.createElement('button');
                eyeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:#ccc; font-size:11px; padding:0; line-height:1; flex-shrink:0;';
                eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
                eyeBtn.title = 'Click to reveal IP';
                eyeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (ipText.dataset.hidden === 'true') {
                        ipText.textContent = srv.ip;
                        ipText.style.letterSpacing = 'normal';
                        ipText.style.userSelect = 'text';
                        ipText.dataset.hidden = 'false';
                        eyeBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
                        eyeBtn.title = 'Hide IP';
                    } else {
                        ipText.textContent = '••••••••••••';
                        ipText.style.letterSpacing = '2px';
                        ipText.style.userSelect = 'none';
                        ipText.dataset.hidden = 'true';
                        eyeBtn.innerHTML = '<i class="fas fa-eye"></i>';
                        eyeBtn.title = 'Click to reveal IP';
                    }
                });
                ipDisplay.appendChild(ipText);
                ipDisplay.appendChild(eyeBtn);

                const info = document.createElement('div');
                info.style.cssText = 'flex:1; min-width:0;';
                const nameEl = document.createElement('div');
                nameEl.style.cssText = 'font-weight:700; font-size:14px; color:#1a1a1a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;';
                nameEl.title = srv.name;
                nameEl.textContent = srv.name;
                info.appendChild(nameEl);
                info.appendChild(ipDisplay);
                info.appendChild(motdEl);

                const playersEl = document.createElement('div');
                playersEl.style.cssText = 'font-size:11px; color:#ccc; margin-top:4px;';
                playersEl.innerHTML = '<i class="fas fa-users"></i> —';

                const versionEl = document.createElement('div');
                versionEl.style.cssText = 'font-size:11px; color:#ccc; margin-top:2px;';

                const right = document.createElement('div');
                right.style.cssText = 'display:flex; flex-direction:column; align-items:flex-end; gap:2px; flex-shrink:0;';
                right.appendChild(statusBadge);
                right.appendChild(playersEl);
                right.appendChild(versionEl);

                card.appendChild(iconEl);
                card.appendChild(info);
                card.appendChild(right);
                list.appendChild(card);

                // Ping the server asynchronously
                window.electron.pingServer({ host, port: portStr }).then(status => {
                    if (status.online) {
                        statusBadge.style.background = '#e8f5e9';
                        statusBadge.style.color = '#27ae60';
                        statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Online';
                        playersEl.innerHTML = `<i class="fas fa-users"></i> ${status.players.online}/${status.players.max}`;
                        playersEl.style.color = '#666';
                        versionEl.textContent = status.version;
                        versionEl.style.color = '#aaa';
                        if (status.motd) { motdEl.textContent = status.motd; motdEl.style.color = '#999'; }
                        if (status.favicon) { iconEl.src = status.favicon; }
                    } else {
                        statusBadge.style.background = '#ffebee';
                        statusBadge.style.color = '#e74c3c';
                        statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Offline';
                        playersEl.textContent = '';
                    }
                }).catch(() => {
                    statusBadge.style.color = '#e74c3c';
                    statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Error';
                });
            }
        } catch(e) {
            console.error('loadServers error:', e);
            list.innerHTML = '<div style="padding:16px; color:#d00; text-align:center;">Error loading servers.</div>';
        }
    },

    openWorldEditor(inst, w) {
        const modal = document.getElementById('world-editor-modal');
        if (!modal) return;

        modal._inst = inst;
        modal._world = w;

        // Populate fields
        document.getElementById('we-name').value        = w.name   || w.folder;
        document.getElementById('we-gamemode').value    = w.gameType   ?? 0;
        document.getElementById('we-difficulty').value  = w.difficulty ?? 2;
        document.getElementById('we-icon').src          = w.icon || 'assets/logo.png';
        document.getElementById('we-world-title').textContent = w.name || w.folder;

        // Sync custom toggle
        const cb    = document.getElementById('we-cheats');
        const track = document.getElementById('we-cheats-track');
        const thumb = document.getElementById('we-cheats-thumb');
        cb.checked = !!(w.allowCommands);
        if (track) track.style.background = cb.checked ? '#1a1a1a' : '#ccc';
        if (thumb) thumb.style.left       = cb.checked ? '22px'    : '2px';

        modal.style.display = 'flex';
    },

    async saveWorldSettings() {
        const modal  = document.getElementById('world-editor-modal');
        if (!modal || !modal._world) return;

        const saveBtn = document.getElementById('we-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const settings = {
            name:          document.getElementById('we-name').value.trim(),
            gameType:      parseInt(document.getElementById('we-gamemode').value),
            difficulty:    parseInt(document.getElementById('we-difficulty').value),
            allowCommands: document.getElementById('we-cheats').checked ? 1 : 0
        };

        try {
            const result = await window.electron.saveWorldSettings(modal._world.path, settings);
            if (result && result.success) {
                modal.style.display = 'none';
                // Reload worlds tab
                const inst = modal._inst || window._currentInstanceDetails;
                if (inst) await this.loadWorlds(inst);
            } else {
                window.HexaAlert("Information", 'Failed to save: ' + (result && result.message ? result.message : 'Unknown error'));
            }
        } catch(e) {
            window.HexaAlert("Information", 'Error: ' + e.message);
        }

        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    },

    openPhotoEditor(inst, shot) {
        const modal = document.getElementById('photo-editor-modal');
        if (!modal) return;

        modal._inst = inst;
        modal._shot = shot;

        // Reset sliders
        document.getElementById('pe-brightness').value = 100;
        document.getElementById('pe-contrast').value = 100;
        document.getElementById('pe-saturation').value = 100;
        document.getElementById('pe-brightness-val').textContent = '100%';
        document.getElementById('pe-contrast-val').textContent = '100%';
        document.getElementById('pe-saturation-val').textContent = '100%';
        document.getElementById('pe-filename').textContent = shot.name;

        const canvas = document.getElementById('pe-canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        img.onload = () => {
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            modal._baseImage = img;
            this.applyPhotoFilters();
        };
        img.src = shot.data;

        modal.style.display = 'flex';
    },

    applyPhotoFilters() {
        const canvas = document.getElementById('pe-canvas');
        const modal = document.getElementById('photo-editor-modal');
        if (!modal || !modal._baseImage || !canvas) return;
        const ctx = canvas.getContext('2d');
        const brightness = document.getElementById('pe-brightness').value;
        const contrast = document.getElementById('pe-contrast').value;
        const saturation = document.getElementById('pe-saturation').value;
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(modal._baseImage, 0, 0);
    },

    async saveEditedPhoto() {
        const modal = document.getElementById('photo-editor-modal');
        const canvas = document.getElementById('pe-canvas');
        if (!modal || !modal._inst || !modal._shot) return;

        const saveBtn = document.getElementById('pe-save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        try {
            const data = canvas.toDataURL('image/png');
            const instPath = modal._inst.folder || modal._inst.path;
            await window.electron.saveScreenshot(instPath, modal._shot.name, data);
            // Update the in-memory shot data so re-open shows edited version
            modal._shot.data = data;
            modal._baseImage = null;
            const img = new Image();
            img.onload = () => { modal._baseImage = img; };
            img.src = data;
        } catch(e) {
            window.HexaAlert("Information", 'Save failed: ' + e.message);
        }

        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    },

    async deleteCurrentPhoto() {
        const modal = document.getElementById('photo-editor-modal');
        if (!modal || !modal._inst || !modal._shot) return;
        if (!confirm(`Delete "${modal._shot.name}"? This cannot be undone.`)) return;

        try {
            const instPath = modal._inst.folder || modal._inst.path;
            await window.electron.deleteScreenshot(instPath, modal._shot.name);
            modal.style.display = 'none';
            await this.loadScreenshots(modal._inst);
        } catch(e) {
            window.HexaAlert("Information", 'Delete failed: ' + e.message);
        }
    },

    selectInstance(inst) {
        // Switch to Home
        document.querySelector('[data-tab="home"]').click();
        
        // Update Selector & Launch Button
        const verSelector = document.getElementById('version-selector');
        
        // Check if option exists, if not add it temp
        let optString = `USER: ${inst.name} (${inst.version})`;
        
        // Simple switch for demo purposes - in real app, main process needs to know path
        // We will repurpose the selector to show we selected this
        if (verSelector) {
            // Create a temp option
            const opt = document.createElement('option');
            opt.value = `custom_${inst.id}`;
            opt.innerText = optString;
            verSelector.add(opt);
            verSelector.value = opt.value;
        }

        const btn = document.getElementById('play-btn');
        if(btn) btn.innerText = `LAUNCH ${inst.name}`;
    },

    async add(name, version, loader, icon, cloudSync = false) {
        // ... (this logic seems duplicated or incomplete in original, assuming it works)
        const folder = `inst_${Date.now()}`;
        // Normally we call electron to create folder
        if(window.electron && window.electron.createInstance) {
             const result = await window.electron.createInstance({ name, version, loader, cloudSync, folderName: folder });
             if (!result || !result.success) throw new Error((result && result.error) || 'Failed to create instance');
        }

        const newInst = {
            id: 'inst_' + Date.now(),
            name,
            version,
            loader,
            icon: icon || 'assets/logo.png',
            status: 'Ready',
            folder,
            cloudSync
        };
        this.instances.push(newInst);
        this.save();
        this.render();
        return newInst;
    },

    async duplicate(id) {
        const inst = this.instances.find(i => i.id === id);
        if (!inst) return;
        
        try {
            const newName = inst.name + " (Copy)";
            const newFolder = `inst_${Date.now()}`;
            
            let actualFolder = newFolder;
            // 1. Create new folder via Electron (and copy contents)
            if (window.electron && window.electron.importLauncherInstance) {
                // Determine source path
                const sourceFolder = inst.folder;
                const resultFolder = await window.electron.importLauncherInstance({ 
                    sourcePath: sourceFolder,
                    instanceName: newName
                });
                if (resultFolder) actualFolder = resultFolder;
            }
            
            // 2. Add to library
            const newInst = { ...inst };
            newInst.id = 'inst_' + Date.now();
            newInst.name = newName;
            newInst.folder = actualFolder;
            newInst.status = 'Ready';
            
            this.instances.push(newInst);
            this.save();
            this.render();
            
            window.HexaAlert("Success", "Instance duplicated successfully.");
        } catch(e) {
            console.error("Duplicate failed", e);
            window.HexaAlert("Error", "Failed to duplicate instance: " + e.message);
        }
    },

    confirmDelete(id) {
        const modal = document.getElementById('delete-confirm-modal');
        if(!modal) return;
        modal.classList.add('open');
        
        const confirmBtn = document.getElementById('confirm-delete-btn');
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.onclick = () => {
             this.delete(id);
             modal.classList.remove('open');
             // Also close settings modal if open
             if(InstanceSettings && InstanceSettings.close) InstanceSettings.close();
        };
    },

    async delete(id) {
        const inst = this.instances.find(i => i.id === id);
        if (!inst) return;
        
        // Confirmation is handled by caller (InstanceSettings.delete)
        // Check if we need to actually delete files from disk
        if (inst.folder && window.electron && window.electron.deleteInstance) {
            try {
                await window.electron.deleteInstance(inst.folder);
            } catch(e) {
                console.warn('[delete-instance] Warning:', e);
            }
        }
        
        this.instances = this.instances.filter(i => i.id !== id);
        this.save();
        this.render();
        
        // Close details if open
        const view = document.getElementById('instance-details-view');
        if (view && view.style.display !== 'none' && window._currentInstanceDetails && window._currentInstanceDetails.id === id) {
            view.style.display = 'none';
        }
    },

    // === NOTIFICATION SYSTEM ===
    showToast(title, progress = 0, id = null) {
        const container = document.getElementById('progress-container');
        if(!container) return;

        let toast = id ? document.getElementById(id) : null;
        
        if (!toast) {
            toast = document.createElement('div');
            if (id) toast.id = id;
            toast.className = 'progress-toast';
            // Styling handled by CSS
            toast.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span class="toast-title" style="font-weight:600; font-size:13px;">${title}</span>
                    <span class="toast-percent" style="font-size:12px; color:#aaa;">${progress}%</span>
                </div>
                <div style="width:100%; height:4px; background:#333; border-radius:0; overflow:hidden;">
                    <div class="toast-bar" style="width:${progress < 0 ? 100 : progress}%; height:100%; background:${progress < 0 ? '#e74c3c' : '#fff'}; transition: width 0.3s;"></div>
                </div>
            `;
            container.appendChild(toast);
        } else {
            toast.querySelector('.toast-title').innerText = title;
            if(progress >= 0) {
                 toast.querySelector('.toast-percent').innerText = progress + '%';
                 toast.querySelector('.toast-bar').style.width = progress + '%';
                 toast.querySelector('.toast-bar').style.background = 'var(--primary-pink)';
            } else {
                 toast.querySelector('.toast-percent').innerText = 'Failed';
                 toast.querySelector('.toast-bar').style.background = '#d00';
            }
        }
        
        if (progress >= 100 || progress < 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 500);
            }, 3000);
        }
    },

    setupEventListeners() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        // ... existing listeners ...
        if(window.electron) {
            window.electron.onInstallProgress((data) => {
                const { instance, percent, msg } = data;
                this.showToast(msg || `Installing ${instance}...`, percent, 'toast-' + instance);
                
                // Update instance card status if visible
                const inst = this.instances.find(i => i.folder === instance);
                if(inst && percent < 100 && percent >= 0) {
                     inst.status = `Installing ${percent}%`;
                     this.render(); // Re-render to show status on card
                } else if (inst && percent >= 100) {
                     inst.status = 'Ready';
                     this.save();
                     this.render();
                }
            });

            // Logs
            window.electron.onLog((data) => {
                const logContainer = document.getElementById('inst-logs-container');
                if(logContainer) {
                    const line = document.createElement('div');
                    line.style.whiteSpace = "pre-wrap";
                    line.style.fontFamily = "Consolas, monospace";
                    line.style.fontSize = "12px";
                    line.style.lineHeight = "1.4";
                    line.style.userSelect = "text"; // ENABLE SELECTION
                    line.style.cursor = "text"; 

                    // Parse Data String
                    const str = data.toString();
                    line.innerText = str;

                    // Color Coding
                    if(str.includes('ERROR') || str.includes('Exception') || str.includes('Caused by') || str.includes('Crash Report')) {
                        line.style.color = "#ff5555"; // Red
                    } else if (str.includes('WARN')) {
                        line.style.color = "#ffaa00"; // Orange
                    } else if (str.includes('INFO')) {
                        line.style.color = "#ddd"; // Standard
                    } else {
                        // Likely stacktrace or raw output
                        if(str.trim().startsWith('at ') || str.trim().startsWith('--')) {
                             line.style.color = "#ff5555"; 
                        }
                    }
                    
                    // Special Highlighting for Crash Header
                    if(str.includes('---- Minecraft Crash Report ----')) {
                        line.style.color = "#ff0000";
                        line.style.fontWeight = "bold";
                        line.style.borderBottom = "1px solid red";
                        line.style.marginTop = "10px";
                    }

                    logContainer.appendChild(line);
                    logContainer.scrollTop = logContainer.scrollHeight;
                }
            });
        }
        
        // Add Copy Button to Logs
        const logContainer = document.getElementById('inst-logs-container');
        if(logContainer && !document.getElementById('copy-logs-btn')) {
             // Create a floating action button inside the logs pane
             const copyBtn = document.createElement('button');
             copyBtn.id = 'copy-logs-btn';
             copyBtn.innerText = "COPY LOGS";
             copyBtn.className = "secondary-btn small";
             copyBtn.style.cssText = "position: absolute; bottom: 20px; right: 40px; z-index: 100; opacity: 0.8;";
             copyBtn.onclick = () => {
                 const text = logContainer.innerText;
                 navigator.clipboard.writeText(text).then(() => {
                     const original = copyBtn.innerText;
                     copyBtn.innerText = "COPIED!";
                     setTimeout(() => copyBtn.innerText = original, 2000);
                 });
             };
             // Ensure parent is relative for absolute positioning or append next to it
             // Actually, inst-logs-container is inside a tab pane. Let's append to the pane.
             const pane = document.getElementById('inst-logs');
             if(pane) {
                 pane.style.position = 'relative'; // Ensure positioning context
                 pane.appendChild(copyBtn);
             }
        }

        // Main Launch Button Logic
        const playBtn = document.getElementById('play-btn');
        if (playBtn) {
            // Remove old listeners by cloning (simple hack) or just add new one if none existed
            // For safety, we just add. If double launch specific logs appear, we know why.
            playBtn.addEventListener('click', async () => {
                const selector = document.getElementById('version-selector');
                const selectedId = selector.value;
                if(!selectedId) return;

                // Identify instance
                let inst = OFFICIAL_INSTANCES.find(i => i.id === selectedId);
                if (!inst) inst = this.instances.find(i => i.id === selectedId);
                
                // Handle "custom_" prefix from Instance Details selection
                if (!inst && selectedId.startsWith('custom_')) {
                     const realId = selectedId.replace('custom_', '');
                     inst = this.instances.find(i => i.id === realId);
                }

                if(!inst) {
                    window.HexaAlert("Information", 'Error: Instance not found.');
                    return;
                }
                
                // Update UI to Launched state
                playBtn.disabled = true;
                playBtn.innerText = "LAUNCHING...";
                const progressText = document.getElementById('progress-text');
                if(progressText) progressText.innerText = "Initializing launch sequence...";

                try {
                    // Logic to handle "Official" paths vs "Custom" paths
                    const launchOptions = {
                        ...inst,
                        username: currentUser ? currentUser.username : 'Player',
                        uuid: currentUser ? currentUser.uuid : '0000',
                        accessToken: currentUser ? currentUser.accessToken : '0000',
                        isOfficial: inst.isOfficial || false
                    };
                    
                    // Main.js expects instanceFolder for correct path
                    if (inst.folder) launchOptions.instanceFolder = inst.folder;
                    
                    console.log("Launching with options:", launchOptions);
                    await window.electron.launch(launchOptions);
                    
                    // Reset button after some time or when game closes (we interpret 'launch' promise completion as 'started')
                    setTimeout(() => {
                         playBtn.disabled = false;
                         playBtn.innerText = "GAME RUNNING"; 
                         if(progressText) progressText.innerText = "Game process started.";
                    }, 5000);

                } catch (e) {
                    console.error("Launch Error", e);
                    window.HexaAlert("Information", "Launch failed: " + e.message);
                    playBtn.disabled = false;
                    playBtn.innerText = "LAUNCH GAME";
                    if(progressText) progressText.innerText = "Error during launch.";
                }
            });
        }

        const createBtn = document.getElementById('btn-create-inst');
        const modal = document.getElementById('new-instance-modal');
        const closeBtn = document.getElementById('close-modal-btn');
        const cancelBtn = document.getElementById('cancel-create-btn');
        const confirmBtn = document.getElementById('confirm-create-btn');

        // Opening & Populating Versions
        if (createBtn) createBtn.addEventListener('click', async () => {
            if(modal) {
                modal.style.display = 'flex'; // Enforce display flex
                modal.classList.add('open');
            }
            
            // Fetch versions if empty
            const verSelect = document.getElementById('nim-version');
            if(verSelect && verSelect.options.length <= 1) {
                verSelect.innerHTML = '<option value="">Loading versions...</option>';
                try {
                    const resp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                    const data = await resp.json();
                    
                    window.mcVersionsData = data.versions;
                    window.mcLatestRelease = data.latest && data.latest.release ? data.latest.release : null;

                    window.nimUpdateVersions = () => {
                        const select = document.getElementById('nim-version');
                        const loader = document.getElementById('nim-loader')?.value || 'vanilla';
                        const showAll = document.getElementById('nim-show-all')?.checked || false;
                        
                        const prevValue = select.value;
                        select.innerHTML = '';

                        // Define limits based on modloader
                        let limitId = null;
                        if(loader === 'neoforge') limitId = '1.20.1';
                        if(loader === 'quilt') limitId = '1.14';
                        if(loader === 'fabric') limitId = '1.14';
                        if(loader === 'forge') limitId = '1.1';

                        let limitIdx = window.mcVersionsData.length;
                        if (limitId) {
                            const found = window.mcVersionsData.findIndex(v => v.id === limitId);
                            if (found !== -1) limitIdx = found;
                        }

                        const optGroupRel = document.createElement('optgroup');
                        optGroupRel.label = "Releases";
                        const optGroupSnap = document.createElement('optgroup');
                        optGroupSnap.label = "Snapshots";

                        window.mcVersionsData.forEach((v, index) => {
                            // Filter older than the supported limit
                            if (index > limitIdx) return;

                            // Filter snapshots
                            if (v.type !== 'release') {
                                if (!showAll) return;
                                // Forge and NeoForge do not support standard snapshots cleanly
                                if (loader === 'forge' || loader === 'neoforge') return;
                            }

                            const opt = document.createElement('option');
                            opt.value = v.id;
                            opt.textContent = v.id;
                            if (v.type === 'release') {
                                optGroupRel.appendChild(opt);
                            } else {
                                optGroupSnap.appendChild(opt);
                            }
                        });

                        if (optGroupRel.children.length > 0) select.appendChild(optGroupRel);
                        if (optGroupSnap.children.length > 0) select.appendChild(optGroupSnap);

                        // Try to preserve selection, or set default properly
                        let validOptions = Array.from(select.options).map(o => o.value);
                        if (validOptions.includes(prevValue)) {
                            select.value = prevValue;
                        } else if (validOptions.includes(window.mcLatestRelease) && loader === 'vanilla') {
                            select.value = window.mcLatestRelease;
                        } else if (validOptions.length > 0) {
                            select.value = validOptions[0]; // first valid option
                        }
                    };

                    window.nimUpdateVersions();
                } catch (e) {
                    console.error('Failed to fetch versions', e);
                    verSelect.innerHTML = '<option value="1.21.1">1.21.1 (Offline Fallback)</option>';
                }
            } else if (verSelect && window.nimUpdateVersions) {
                window.nimUpdateVersions();
            }
        });
        
        // Closing
        const closeModal = () => { if(modal) modal.style.display = 'none'; };
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

        // Confirmation
        if (confirmBtn) {
            // Remove old listeners to prevent duplicates if init() called multiple times
            const newConfirm = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
            
            newConfirm.addEventListener('click', async () => {
                const activeTab = (typeof _nimCurrentTab !== 'undefined') ? _nimCurrentTab : 'custom';

                if (activeTab === 'custom') {
                    // ── Custom instance creation ──
                    const nameInput  = document.getElementById('nim-name');
                    const verInput   = document.getElementById('nim-version');
                    const loaderVal  = document.getElementById('nim-loader')?.value || 'vanilla';
                    const iconB64    = document.getElementById('nim-icon-b64')?.value || null;

                    const name = nameInput ? nameInput.value.trim() : '';
                    const ver  = verInput  ? verInput.value  : '';
                    if (!name) { window.HexaAlert("Information", 'Name is required!'); return; }

                    newConfirm.disabled = true;
                    newConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…';
                    try {
                        await this.add(name, ver, loaderVal, iconB64 || null);
                        closeModal();
                        if (nameInput) nameInput.value = '';
                    } catch (e) {
                        window.HexaAlert("Information", 'Failed to create instance: ' + e.message);
                    } finally {
                        newConfirm.disabled = false;
                        newConfirm.innerHTML = '<i class="fas fa-plus"></i> Create';
                    }

                } else if (activeTab === 'modrinth') {
                    // ── Other Launcher import ──
                    const selInst = (typeof _nimSelectedLauncherInst !== 'undefined') ? _nimSelectedLauncherInst : null;
                    if (!selInst) { window.HexaAlert("Information", 'Please select an instance from the list.'); return; }

                    newConfirm.disabled = true;
                    newConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing…';
                    try {
                        const id = 'inst_' + Date.now();
                        const newInst = { id, name: selInst.name, version: selInst.version, loader: selInst.loader, icon: selInst.iconBase64 || null, created: Date.now(), status: 'Importing…', folder: '' };
                        this.instances.push(newInst); this.save(); this.render();
                        closeModal();

                        window.electron.importLauncherInstance({ sourcePath: selInst.instancePath, instanceName: selInst.name }).then(res => {
                            if (res && res.folder) newInst.folder = res.folder;
                            newInst.status = res?.success ? 'Ready' : 'Error: ' + res?.error;
                            this.save(); this.render();
                        });
                    } catch (e) {
                        window.HexaAlert("Information", 'Import failed: ' + e.message);
                        newConfirm.disabled = false;
                        newConfirm.innerHTML = '<i class="fas fa-download"></i> Import';
                    }

                } else if (activeTab === 'file') {
                    // ── Local file import (.mrpack / .zip) ──
                    const fd = (typeof _nimFileData !== 'undefined') ? _nimFileData : null;
                    if (!fd) { window.HexaAlert("Information", 'Please select a modpack file first.'); return; }

                    newConfirm.disabled = true;
                    newConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importing…';
                    try {
                        if (fd.type === 'hexa') {
                            // .hexa backup restore
                            const name = fd.name.replace(/\.hexa$/, '');
                            const id = 'inst_' + Date.now();
                            const newInst = { id, name, version: '', loader: 'vanilla', icon: null, created: Date.now(), status: 'Restoring…', folder: '' };
                            this.instances.push(newInst); this.save(); this.render();
                            closeModal();

                            window.electron.installHexaInstance({ filePath: fd.filePath, instanceName: name }).then(res => {
                                if (res && res.folder) newInst.folder = res.folder;
                                if (res?.success && res.meta) {
                                    newInst.name    = res.meta.name    || newInst.name;
                                    newInst.version = res.meta.version || '';
                                    newInst.loader  = res.meta.loader  || 'vanilla';
                                    if (res.meta.icon) newInst.icon = res.meta.icon;
                                }
                                newInst.status = res?.success ? 'Ready' : 'Error: ' + res?.error;
                                this.save(); this.render();
                            });
                        } else if (fd.type === 'mrpack') {
                            const name = fd.name.replace(/\.mrpack$/, '');
                            const id = 'inst_' + Date.now();
                            const newInst = { id, name, version: '', loader: 'fabric', icon: null, created: Date.now(), status: 'Installing 0%', folder: '' };
                            this.instances.push(newInst); this.save(); this.render();
                            closeModal();

                            window.electron.installLocalMrpack({ filePath: fd.filePath, instanceName: name }).then(res => {
                                if (res && res.folder) newInst.folder = res.folder;
                                if (res && res.success && res.indexData) {
                                    const idx = res.indexData;
                                    newInst.version = idx.dependencies?.minecraft || '';
                                    const lk = Object.keys(idx.dependencies || {}).find(k => k !== 'minecraft');
                                    if (lk) newInst.loader = lk.replace('-loader', '');
                                    newInst.name = idx.name || newInst.name;
                                } else if (res && !res.success) {
                                    newInst.status = 'Error: ' + res.error;
                                }
                                newInst.status = res?.success ? 'Ready' : newInst.status;
                                this.save(); this.render();
                            });
                        } else {
                            // CurseForge .zip
                            const id = 'inst_' + Date.now();
                            const dummyInst = { id, name: 'Importing…', version: '', loader: 'vanilla', icon: null, created: Date.now(), status: 'Extracting…', folder: '' };
                            this.instances.push(dummyInst); this.save(); this.render();
                            closeModal();

                            const res = await window.electron.installLocalCurseForge({ filePath: fd.filePath, instanceName: 'import' });
                            if (res && res.folder) dummyInst.folder = res.folder;
                            if (res && res.success && res.meta) {
                                dummyInst.name    = res.meta.name    || dummyInst.name;
                                dummyInst.version = res.meta.mcVersion || '';
                                dummyInst.loader  = res.meta.loader   || 'vanilla';
                            }
                            dummyInst.status = res?.success ? 'Ready' : 'Error: ' + res?.error;
                            this.save(); this.render();
                        }
                    } catch (e) {
                        window.HexaAlert("Information", 'Failed to import: ' + e.message);
                        newConfirm.disabled = false;
                        newConfirm.innerHTML = '<i class="fas fa-download"></i> Import';
                    }
                }
            });
        }
    }
};

// Expose for inline HTML handlers (photo editor, etc.)
window.LibraryManager = LibraryManager;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
    if(window.LibraryManager) {
        window.LibraryManager.init();
    }
});
// Instance Navigation Tabs Logic
const instTabs = document.querySelectorAll('.inst-tab');
instTabs.forEach(btn => {
    btn.addEventListener('click', () => {
        // Hide all panes
        document.querySelectorAll('.inst-tab-pane').forEach(p => p.style.display = 'none');
        instTabs.forEach(t => {
            t.classList.remove('active');
            t.style.borderBottom = "2px solid transparent";
            t.style.color = "#999";
        });
        
        // Show target
        const target = btn.getAttribute('data-target');
        const pane = document.getElementById(target);
        if(pane) pane.style.display = 'block';
        
        btn.classList.add('active');
        btn.style.borderBottom = "2px solid black";
        btn.style.color = "black";

        // Lazy-load tab content
        const inst = window._currentInstanceDetails;
        if (inst) {
            if (target === 'inst-worlds') {
                LibraryManager.loadWorlds(inst);
                LibraryManager.loadServers(inst);
            } else if (target === 'inst-screenshots') {
                LibraryManager.loadScreenshots(inst);
            }
        }
    });
});
// End: c:\Users\hugob\Documents\GitHub\hexa.launcher\src\renderer.js

// Global Init
window.addEventListener('load', () => {
    // Hide Loading Screen with fade out
    setTimeout(() => {
        const loader = document.getElementById('app-loading-screen');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
            }, 500);
        }
    }, 1500); // Show logo for at least 1.5 seconds

    // Wait for everything to settle
    setTimeout(initSkinViewer, 500); 
    // Init Library
    if (typeof LibraryManager !== 'undefined') LibraryManager.init();
    // Init Browser
    if (typeof ContentBrowser !== 'undefined') ContentBrowser.init();
});

// === IDLE STATUS MANAGER ===
const IdleManager = {
    timeout: null,
    isIdle: false,
    IDLE_LIMIT: 300000, // 5 Minutes in ms

    init() {
        // Clear existing if re-login
        if(this.timeout) clearTimeout(this.timeout);
        
        // Activity Listeners
        const events = ['mousemove', 'keydown', 'mousedown', 'scroll', 'click'];
        events.forEach(evt => {
            window.addEventListener(evt, () => this.resetTimer());
        });
        
        this.resetTimer();
    },

    resetTimer() {
        // If we were idle, go back to online
        if (this.isIdle) {
            this.setOnline();
        }
        
        // Reset the countdown
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => this.setIdle(), this.IDLE_LIMIT);
    },

    setIdle() {
        if (!currentUser) return; // Don't show status if not logged in
        this.isIdle = true;
        const status = document.querySelector('.status');
        if (status) {
            status.innerText = "IDLE";
            status.style.color = "#ffaa00"; // Orange
        }
    },

    setOnline() {
        this.isIdle = false;
        const status = document.querySelector('.status');
        if (status) {
            status.innerText = "ONLINE";
            status.style.color = "#00aa00"; // Green
        }
    }
};

// Login Logic
const loginOverlay = document.getElementById('login-overlay');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginErrorObj = document.getElementById('login-error');

loginSubmitBtn.addEventListener('click', async () => {
    const username = loginUsernameInput.value;
    const password = loginPasswordInput.value;

    if (!username || !password) {
        loginErrorObj.innerText = "Please fill in all fields.";
        return;
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerText = "VERIFYING...";
    loginErrorObj.innerText = "";
    
    try {
        // Call Main Process Login
        const result = await window.electron.login({ username, password });

        if (result.success) {
            currentUser = result.user;
            console.log("[Login] currentUser:", JSON.stringify(currentUser));
            
            // Save Credentials for Remember Me
            localStorage.setItem('hexa_saved_user', JSON.stringify({
                username: username,
                password: password
            }));

            // Fade out Login Overlay
            loginOverlay.style.opacity = '0';
            setTimeout(() => {
                loginOverlay.style.display = 'none';
            }, 500);
            
            // Update UI with User Info
            document.getElementById('sidebar-username').innerText = currentUser.username;
            document.querySelector('.status').innerText = "ONLINE";
            document.querySelector('.status').style.color = "#00aa00";

            // Start Idle Detection
            IdleManager.init();

            // Load Social Features
            loadFriends(currentUser.username);
            loadFriendRequests(currentUser.username);
            
            // Listen for Java installs
            if(window.electron) { 
                 window.electron.onInstallProgress((data) => {
                    const { instance, percent, msg } = data;
                    if(instance.startsWith('java_')) {
                        // Special handling for Java
                        LibraryManager.showToast(msg, percent, 'toast-' + instance);
                    }
                });
            }

            // Update Skin Display
            refreshSkinDisplay();

        } else {
            loginErrorObj.innerText = result.message;
            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerText = "INITIALIZE SESSION";
        }
    } catch (err) {
        console.error("Login Error:", err);
        loginErrorObj.innerText = "Communication Error: " + (err.message || "Unknown");
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerText = "INITIALIZE SESSION";
    }
});

async function refreshSkinDisplay() {
    if (!currentUser) return;
    
    try {
        // Use the skin/cape URLs directly from the auth API response.
        // Skin files are now saved as pseudo.png (no timestamp suffix).
        // The user specifically requested NOT to use ?t=... cache busting.
        
        // If the API doesn't return skin/cape URLs directly, build them from username.
        // Format: http://91.197.6.177:24607/api/textures/{username}.png
        const skinBase = currentUser.skin || `${API_BASE_URL}/api/textures/${currentUser.username}.png`;
        const capeBase = currentUser.cape || null;
        
        // No cache busting as requested
        const fullSkinUrl = skinBase;
        const capeUrl = capeBase;

        console.log("[Skin] Fetching skin:", fullSkinUrl);

        // Fetch skin via main process to avoid CORS issues with canvas
        let skinDataUrl = null;
        if (fullSkinUrl) {
            skinDataUrl = await window.electron.fetchImageBase64(fullSkinUrl).catch(() => null);
        }

        // Extract head avatar from data URL (no CORS issues)
        let headAvatarSrc = 'https://minotar.net/helm/MHF_Steve/64';
        if (skinDataUrl) {
            headAvatarSrc = await extractHeadAvatar(skinDataUrl).catch(() => 'https://minotar.net/helm/MHF_Steve/64');
        }

        // Update Sidebar Avatar
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<img src="${headAvatarSrc}" style="width: 100%; height: 100%; image-rendering: pixelated; border-radius: 4px;">`;
        }

        // Update Wardrobe Preview
        const wardrobePreview = document.getElementById('wardrobe-preview');
        if (wardrobePreview) {
            wardrobePreview.src = headAvatarSrc;
        }

        // Update 3D Viewer (Full Skin + Cape)
        if (skinViewer) {
            if (skinDataUrl) {
                skinViewer.loadSkin(skinDataUrl);
            } else if (fullSkinUrl) {
                skinViewer.loadSkin(fullSkinUrl);
            }
            if (capeUrl) {
                const capeDataUrl = await window.electron.fetchImageBase64(capeUrl).catch(() => null);
                if (capeDataUrl) skinViewer.loadCape(capeDataUrl);
            }
        }

    } catch (e) {
        console.warn("Avatar Refresh Failed:", e);
        // Fallback to Steve Head
        const fallback = 'https://minotar.net/helm/MHF_Steve/64';
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) sidebarAvatar.innerHTML = `<img src="${fallback}" style="width: 100%; height: 100%; border-radius: 4px;">`;
    }
}

// Head Extraction Algorithm
function extractHeadAvatar(skinUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Required for manipulating external images
        img.src = skinUrl;
        
        img.onload = () => {
             try {
                const canvas = document.createElement('canvas');
                // We scale up to 64x64 for better UI resolution
                canvas.width = 64; 
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                
                // Critical: Nearest Neighbor scaling
                ctx.imageSmoothingEnabled = false; 

                // Source Coordinates (Standard Minecraft)
                // Face: (8, 8) 8x8
                // Hat: (40, 8) 8x8
                
                // 1. Draw Face Layer
                ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);
                
                // 2. Draw Hat Layer ( Overlay )
                ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
                
                resolve(canvas.toDataURL());
             } catch (e) {
                // Handle Tainted Canvas or other errors
                console.warn("Canvas Error (CORS?):", e);
                // Fallback to Steve Head.
                resolve('https://minotar.net/helm/MHF_Steve/64');
             }
        };
        
        img.onerror = (e) => {
            console.warn("Image Load Error:", e);
            resolve('https://minotar.net/helm/MHF_Steve/64'); // Graceful fallback
        };
    });
}

// Skin Upload Logic
const uploadBtn = document.getElementById('upload-skin-btn');
const fileInput = document.getElementById('skin-upload-input');

if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Basic Front-end validation
        if (file.type !== 'image/png') {
            window.HexaAlert("Information", 'Only PNG files are allowed.');
            return;
        }

        const formData = new FormData();
        formData.append('skin', file);
        formData.append('username', currentUser ? currentUser.username : 'Guest');
        formData.append('action', 'upload');

        // UI Feedback
        const originalText = document.querySelector('#upload-skin-btn .card-title').innerText;
        document.querySelector('#upload-skin-btn .card-title').innerText = "Uploading...";

        try {
            // Upload skin to HGStudio API server
            const response = await fetch(`${API_BASE_URL}/api/skin/upload`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                window.HexaAlert("Information", 'Skin uploaded successfully!');
                refreshSkinDisplay();
            } else {
                window.HexaAlert("Information", 'Upload failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            window.HexaAlert("Information", 'Network error while uploading skin.');
        } finally {
            document.querySelector('#upload-skin-btn .card-title').innerText = originalText;
            fileInput.value = ''; // Reset
        }
    });
}

// Enter Key Login
loginPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loginSubmitBtn.click();
    }
});

// Auto-Login / Remember Me
const savedUser = localStorage.getItem('hexa_saved_user');
if (savedUser) {
    try {
        const { username, password } = JSON.parse(savedUser);
        loginUsernameInput.value = username;
        loginPasswordInput.value = password;
        // Auto-click if you want instant login, or just pre-fill. 
        // User asked: "retiens le compte pour eviter de ce relog h24" -> implies auto-login or pre-fill. 
        // Let's pre-fill and maybe auto-click? 
        // "entrer nous permert de ce connecter" -> implies manual action is okay but boring to type.
        // Let's trigger click.
        // But maybe user wants to switch account?
        // Let's just pre-fill + auto-login.
        setTimeout(() => loginSubmitBtn.click(), 500);
    } catch (e) {
        console.error("Saved user corrupted", e);
    }
}


// === NAVIGATION & WINDOW MANAGER ===
const NavSystem = {
    history: [],
    currentIndex: -1,
    isNavigating: false, // Flag to prevent pushing state during history traversal

    init() {
        // Initial State
        this.pushState({ tab: 'home', type: 'root' });
        
        // Buttons
        document.getElementById('nav-back-btn').addEventListener('click', () => this.goBack());
        document.getElementById('nav-fwd-btn').addEventListener('click', () => this.goForward());

        // Mouse Buttons (3 = Back, 4 = Forward)
        window.addEventListener('mouseup', (e) => {
            if (e.button === 3) {
                 // First check for active overlays/modals that should be closed first
                 const gallery = document.getElementById('gallery-lightbox');
                 const instView = document.getElementById('instance-details-view');
                 const selectModal = document.getElementById('select-instance-modal');

                 if (gallery && gallery.style.display !== 'none') {
                     gallery.style.display = 'none';
                     return;
                 }
                 if (selectModal && selectModal.style.display !== 'none') {
                     selectModal.style.display = 'none';
                     return;
                 }
                 // If instance detail view is open and it is THE current state, goBack() handles it.
                 // But if it's just an overlay on top of current state without history push (unlikely with this code), close it.
                 
                 this.goBack();
            }
            if (e.button === 4) this.goForward();
        });

        // Window Controls
        document.getElementById('min-btn').addEventListener('click', () => window.electron.minimize());
        document.getElementById('max-btn').addEventListener('click', () => window.electron.maximize());
        document.getElementById('close-btn').addEventListener('click', () => window.electron.close());
    },

    pushState(state) {
        if (this.isNavigating) return;

        // If we are not at the end of history, slice it
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Avoid duplicate consecutive states
        const current = this.history[this.currentIndex];
        if (current && JSON.stringify(current) === JSON.stringify(state)) return;

        this.history.push(state);
        this.currentIndex++;
        this.updateUI();
    },

    goBack() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.restoreState(this.history[this.currentIndex]);
        }
    },

    goForward() {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            this.restoreState(this.history[this.currentIndex]);
        }
    },

    restoreState(state) {
        this.isNavigating = true;
        
        // Hide all main tab sections first (Reset)
        document.querySelectorAll('.tab-section').forEach(s => {
            s.classList.remove('active');
            s.style.display = ''; // Clear inline styles
        });

        // Always close volatile overlays first
        const instView = document.getElementById('instance-details-view');
        // if(instView) instView.style.display = 'none'; // No longer an overlay, handled by tab-section logic
        
        const gallery = document.getElementById('gallery-lightbox');
        if(gallery) gallery.style.display = 'none';
        
        const projView = document.getElementById('project-details-view');
        if(projView) projView.style.display = 'none';

        if (state.type === 'root') {
            // Switch Sidebar Active State
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            const navBtn = document.querySelector(`.nav-item[data-tab="${state.tab}"]`);
            if (navBtn) navBtn.classList.add('active');

            // Show Target Tab
            const tabEl = document.getElementById(`${state.tab}-tab`);
            if (tabEl) tabEl.classList.add('active');
        } 
        else if (state.type === 'browser-detail') {
            // Ensure we are on browser tab
            const navBtn = document.querySelector(`.nav-item[data-tab="content"]`);
            if (navBtn) {
                 document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
                 navBtn.classList.add('active');
            }
            
            // Show content tab
            const contentTab = document.getElementById('content-tab');
            if(contentTab) contentTab.classList.add('active');

            if (state.hit) {
                ContentBrowser.openProjectDetails(state.hit, false); 
            }
        }
        else if (state.type === 'instance-detail') {
             // Show Instance Details Tab
             const instView = document.getElementById('instance-details-view');
             if(instView) instView.classList.add('active');
             
             // Deselect sidebar (or select Library?)
             document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
             // Maybe keep Library active to show context?
             const libBtn = document.querySelector(`.nav-item[data-tab="library"]`);
             if(libBtn) libBtn.classList.add('active');
        }

        this.updateUI();
        this.isNavigating = false;
    },

    updateUI() {
        document.getElementById('nav-back-btn').disabled = this.currentIndex <= 0;
        document.getElementById('nav-fwd-btn').disabled = this.currentIndex >= this.history.length - 1;
    }
};

// Navigation Logic (Scroll Only)
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Update UI Active State (Sidebar)
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Clear the Install Content target when leaving the launcher page manually
        if (btn.getAttribute('data-tab') !== 'content' && typeof ContentBrowser !== 'undefined') {
            ContentBrowser._targetInstance = null;
        }

        // SCROLL to Target Section (No hiding)
        const tabId = btn.getAttribute('data-tab');
        const tabEl = document.getElementById(`${tabId}-tab`);
        
        if (tabEl) {
            tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Init Nav
NavSystem.init();

// RAM Slider Logic
const ramSlider = document.getElementById('ram-slider');
const ramDisplay = document.getElementById('ram-display');

if(ramSlider && ramDisplay) {
    ramSlider.addEventListener('input', (e) => {
        ramDisplay.innerText = `${e.target.value} MB`;
    });
}
// Listen for update availability
if (window.electron && window.electron.onUpdateAvailable) {
    window.electron.onUpdateAvailable((info) => {
        const updateBtn = document.getElementById('update-btn');
        if (updateBtn) {
            updateBtn.style.display = 'flex';
            updateBtn.title = `Update Available: v${info.version}`;
            // Optional: Show a subtle notification
        }
    });

    window.electron.onUpdateProgress((percent) => {
         const notif = document.getElementById('update-notification-progress');
         if(notif) notif.innerText = percent + "%";
    });
}

// Check for update on load
if (window.electron && window.electron.checkUpdate) {
    window.electron.checkUpdate().then(res => {
        if(res && res.available) {
            const updateBtn = document.getElementById('update-btn');
            if(updateBtn) updateBtn.style.display = 'flex';
        }
    });
}

const updateBtn = document.getElementById('update-btn');
if(updateBtn) {
    updateBtn.addEventListener('click', () => {
        updateBtn.disabled = true;
        updateBtn.style.opacity = "0.5";
        
        // Show Toast
        const toast = document.createElement("div");
        toast.id = "update-toast";
        toast.style.cssText = "position:fixed; bottom:20px; right:20px; background:#fff; padding:15px; border-radius:8px; box-shadow:0 5px 20px rgba(0,0,0,0.2); z-index:10000; animation: slideIn 0.3s ease-out; display:flex; align-items:center; gap:10px;";
        toast.innerHTML = `<i class="fas fa-cog fa-spin" style="color:#e67e22;"></i> <div><b>Updating...</b><div style="font-size:12px; color:#666;">Downloading new version <span id="update-notification-progress">0%</span></div></div>`;
        document.body.appendChild(toast);

        window.electron.downloadUpdate();
    });
}


// Launch Logic
const playBtn = document.getElementById('play-btn');
const progressText = document.getElementById('progress-text');
const versionSelector = document.getElementById('version-selector');

if (playBtn) {
    playBtn.addEventListener('click', async () => {
        const selectedId = versionSelector.value;
        const inst = OFFICIAL_INSTANCES.find(i => i.id === selectedId) || 
                     ((typeof LibraryManager !== 'undefined') ? LibraryManager.instances.find(i => i.id === selectedId) : null);
        
        // Save Last Launched
        localStorage.setItem('hexa_last_launched', selectedId);

        // UI Feedback
        const originalText = playBtn.innerText;
        playBtn.disabled = true;
        playBtn.innerText = "LAUNCHING...";

        const ramVal = document.getElementById('ram-slider') ? document.getElementById('ram-slider').value : "4096";

        const options = {
            username: currentUser ? currentUser.username : "Player", 
            type: 'offline',
            memory: ramVal + "M"
        };
        
        if (inst) {
            options.instanceFolder = inst.folder;
            options.version = {
                number: inst.version,
                type: inst.type || "release"
            };
            // Pass loader info if needed by backend (though backend currently relies on logic we haven't fully implemented for auto-installing loaders just by name)
            // But main.js accepts forge/fabric
            if (inst.loader === 'Fabric') options.fabric = true;
            if (inst.loader === 'Forge') options.forge = true;

        } else {
             // Fallback
             options.version = {
                 number: selectedId || "1.21.1",
                 type: "release"
             };
        }

        window.electron.onLog((msg) => {
            console.log(msg);
            progressText.innerText = `>> ${msg.substring(0, 60)}...`;
            
            // Append to Instance Logs Tab if available
            const logContainer = document.getElementById('inst-logs-container');
            if(logContainer) {
                const line = document.createElement('div');
                line.style.borderBottom = '1px solid #333';
                line.style.padding = '2px 0';
                line.style.fontSize = '11px';
                line.innerText = msg;
                logContainer.appendChild(line);
                // Auto scroll
                logContainer.scrollTop = logContainer.scrollHeight;
            }
        });

        const result = await window.electron.launch(options);

        if (!result.success) {
            window.HexaAlert("Information", "Launch Init Failure: " + result.error);
            playBtn.disabled = false;
            playBtn.innerText = "LAUNCH GAME";
        } else {
            progressText.innerText = "Process Active.";
            setTimeout(() => {
                playBtn.disabled = false;
                playBtn.innerText = "LAUNCH GAME";
                progressText.innerText = "Ready.";
            }, 5000);
        }
    });
}

/* === MODRINTH BROWSER === */
/* === UPDATED MODRINTH BROWSER LOGIC === */
const ContentBrowser = {
    apiBase: 'https://api.modrinth.com/v2/search',
    state: {
        query: '',
        type: 'modpack',
        version: '',
        loader: '',
        category: '',
        env: '', 
        offset: 0,
        limit: 75
    },

    showToast(title, progress, id) {
        if (typeof LibraryManager !== 'undefined') {
            LibraryManager.showToast(title, progress, id);
        }
    },
    
    init() {
        console.log("Initializing ContentBrowser...");
        
        // Populate Version Filter
        this.populateVersions();
        
        this.bindEvents();
        setTimeout(() => this.search(), 100); // Initial Search

        // Setup Instance Selector Modal
        const closeSel = document.getElementById('close-select-inst-btn');
        const modal = document.getElementById('select-instance-modal');
        if(closeSel && modal) {
            closeSel.onclick = () => modal.style.display = 'none';
        }
    },

    async populateVersions() {
        const list = document.getElementById('list-version');
        if(!list) return;

        // Clear existing (except "Any Version")
        // Note: index.html has "Any Version" hardcoded, we append after it
        
        try {
            const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
            const data = await res.json();
            
            // Filter release types if needed, but user asked for "All versions up to latest"
            // Modrinth returns objects like {version: "1.20.1", version_type: "release", date: ...}
            
            // Sort by date desc (recent first)
            const versions = data
                .filter(v => v.version_type === 'release' || v.version_type === 'beta') // Release & Beta
                .sort((a,b) => new Date(b.date) - new Date(a.date));

            // Limit list length to avoid massive scroll? Or show all?
            // User said "all versions up to latest"
            
            versions.forEach(ver => {
                 // Only add standard MC versions (regex check to avoid snapshot spam if desired, but user said ALL)
                 // Let's stick to major/minor releases to keep UI clean, or everything?
                 // Modrinth tags include "1.20.1", "1.19" etc.
                 
                 const div = document.createElement('div');
                 div.className = 'filter-link';
                 div.setAttribute('data-value', ver.version);
                 div.innerText = ver.version;
                 list.appendChild(div);
            });

        } catch(e) {
            console.warn("Failed to fetch versions dynamically, using fallback", e);
            const commonVersions = [
                "1.21.4", "1.21.3", "1.21.1", "1.21", "1.20.6", "1.20.4", "1.20.1", 
                "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.8.9"
            ];
             commonVersions.forEach(ver => {
                const div = document.createElement('div');
                div.className = 'filter-link';
                div.setAttribute('data-value', ver);
                div.innerText = ver;
                list.appendChild(div);
            });
        }
    },

    bindEvents() {

          const btnPrev = document.getElementById('btn-prev-page');
          const btnNext = document.getElementById('btn-next-page');
          if(btnPrev) {
              btnPrev.addEventListener('click', () => {
                  if(this.state.offset > 0) {
                      this.state.offset = Math.max(0, this.state.offset - this.state.limit);
                      this.search();
                  }
              });
          }
          if(btnNext) {
              btnNext.addEventListener('click', () => {
                  this.state.offset += this.state.limit;
                  this.search();
              });
          }

        const searchInput = document.getElementById('browser-search');
        let timeout = null;
        if(searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                this.state.query = e.target.value;
                this.state.offset = 0; 
                timeout = setTimeout(() => this.search(), 75);
            });
        }

        document.querySelectorAll('.nav-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab-btn').forEach(b => {
                           b.classList.remove('active');
                           b.style.color = '#999';
                });
                btn.classList.add('active');
                btn.style.color = '#000';
                
                this.state.type = btn.getAttribute('data-type');
                this.state.offset = 0;
                this.search();
            });
        });

        const setupFilterGroup = (groupId, stateKey) => {
            const container = document.getElementById(groupId);
            if(!container) return;
            container.addEventListener('click', (e) => {
                 const link = e.target.closest('.filter-link');
                 if(!link) return;
                 container.querySelectorAll('.filter-link').forEach(el => el.classList.remove('active'));
                 link.classList.add('active');
                 const val = link.getAttribute('data-value');
                 this.state[stateKey] = val;
                 this.state.offset = 0;
                 this.search();
             });
        };

        setupFilterGroup('list-version', 'version');
        setupFilterGroup('list-loader', 'loader');
        setupFilterGroup('list-category', 'category');
        setupFilterGroup('list-env', 'env');
        
        const closeBtn = document.getElementById('close-browser-btn');
        if(closeBtn) {
            closeBtn.addEventListener('click', () => {
                const tab = document.getElementById('browser-tab');
                if(tab) tab.classList.remove('active-browser');
            });
        }
        
        const searchBtn = document.getElementById('do-search-btn');
        if(searchBtn) {
           searchBtn.addEventListener('click', () => this.search());
        }

        // Open Browser Trigger (e.g. from Library)
        const browseBtn = document.getElementById('btn-browse-repo');
        const backBtn = document.getElementById('back-to-lib');
        
        if(browseBtn) {
             browseBtn.addEventListener('click', () => {
                 const tab = document.getElementById('browser-tab');
                 if(tab) tab.classList.add('active-browser');
                 // Ensure initial search if empty
                 if(document.getElementById('browser-grid').children.length === 0) {
                     this.search();
                 }
             });
        }
        if(backBtn) {
            backBtn.addEventListener('click', () => {
                 const tab = document.getElementById('browser-tab');
                 if(tab) tab.classList.remove('active-browser');
            });
        }
    },

    triggerInstall(project) {
        console.log("Triggering install for:", project);
        const type = this.state.type || project.project_type;
        console.log("Install Type detected:", type);

        if(type === 'modpack') {
            // Pas de boîte de dialogue pour les modpacks, on utilise le titre directement
            this.installModpack(project, project.title || "Modpack");
        } else {
            // Mod / ResourcePack / Shader → install to instance
            // If coming from "+ Install Content" on a specific instance, skip the selector
            if (this._targetInstance) {
                this.installModToInstance(project, this._targetInstance);
                return;
            }

            const modal = document.getElementById('select-instance-modal');
            const list = document.getElementById('instance-selection-list');
            if(modal && list) {
                list.innerHTML = '';
                const instances = (typeof LibraryManager !== 'undefined') ? LibraryManager.instances : [
                     { id: 'def_1', name: 'Hexa Optimized', version: '1.21.1', loader: 'Fabric' }
                ];
                
                instances.forEach(inst => {
                    const item = document.createElement('div');
                    item.className = 'filter-link'; 
                    item.innerHTML = `<b>${inst.name}</b> <small>(${inst.version})</small>`;
                    item.style.border = "1px solid #eee";
                    item.onclick = () => {
                        this.installModToInstance(project, inst);
                        modal.style.display = 'none';
                    };
                    list.appendChild(item);
                });
                modal.style.display = 'flex';
            }
        }
    },

    async installModpack(project, name) {
        // UI Feedback
        const btn = document.activeElement; 
        const originalText = btn ? btn.innerText : 'INSTALL';
        if(btn && btn.tagName === 'BUTTON') btn.innerText = "INITIALIZING...";
        
        try {
            // 1. Fetch Version Info
            const res = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version`);
            const versions = await res.json();
            
            if(!versions || versions.length === 0) throw new Error("No versions found");
            const best = versions[0];
            
            const loader = best.loaders[0];
            const gameVer = best.game_versions[0];
            
            // 2. Add to Library
            if(typeof LibraryManager !== 'undefined') {
                // Determine icon
                const icon = project.icon_url || 'assets/logo.png';
                const newInst = await LibraryManager.add(name, gameVer, loader, icon);
                
                newInst.status = "Installing 0%";
                LibraryManager.save();
                LibraryManager.render();
                
                // Trigger Background Install
                if(window.electron) {
                    // Try to get primary file URL
                    let downloadUrl = null;
                    const primaryFile = best.files.find(f => f.primary);
                    if (primaryFile) downloadUrl = primaryFile.url;
                    else if (best.files.length > 0) downloadUrl = best.files[0].url;

                    if (downloadUrl) {
                        const toastId = 'toast-' + newInst.folder;
                        this.showToast(`Installing ${name}...`, 0, toastId);

                        // Listen to per-step progress events for this install
                        const progressHandler = (data) => {
                            const { instance, percent, msg } = data;
                            if (instance === newInst.folder) {
                                this.showToast(msg || `Installing ${name}...`, percent, toastId);
                                // Update card status
                                if (percent >= 0 && percent < 100) {
                                    newInst.status = `Installing ${percent}%`;
                                    LibraryManager.save();
                                    LibraryManager.render();
                                }
                            }
                        };
                        if (window.electron.onInstallProgress) {
                            window.electron.onInstallProgress(progressHandler);
                        }

                        window.electron.installModpack({
                            url: downloadUrl,
                            name: name,
                            folderName: newInst.folder
                        }).then(res => {
                            if (!res || !res.success) {
                                console.error(res && res.error);
                                this.showToast(`Error: ${(res && res.error) || 'Unknown error'}`, -1, toastId);
                                newInst.status = 'Error';
                                LibraryManager.save();
                                LibraryManager.render();
                            } else {
                                this.showToast(`${name} installed!`, 100, toastId);
                                newInst.status = 'Ready';
                                LibraryManager.save();
                                LibraryManager.render();
                            }
                        });
                    } else {
                        window.HexaAlert("Information", "No download URL found for this version.");
                    }
                } else {
                    window.HexaAlert("Information", "Backend not connected (Dev Mode?). Installation simulated.");
                }
            } else {
                console.error("LibraryManager not defined!");
            }
            
            // 3. Switch to Library Tab
            const tab = document.querySelector('.nav-item[data-tab="content"]');
            if(tab) tab.click();
            
            const browserTab = document.getElementById('browser-tab');
            if(browserTab) browserTab.classList.remove('active-browser');

        } catch(e) {
            console.error(e);
            window.HexaAlert("Information", "Error during installation: " + e.message);
        } finally {
            if(btn && btn.tagName === 'BUTTON') btn.innerText = originalText;
        }
    },

    async installModToInstance(project, instance) {
        console.log(`Installing ${project.title} to ${instance.name}...`);
        try {
            const loaderName = (instance.loader || 'fabric').toLowerCase();
            const verParam = encodeURIComponent(JSON.stringify([instance.version]));
            const loadParam = encodeURIComponent(JSON.stringify([loaderName]));
            const res = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version?game_versions=${verParam}&loaders=${loadParam}`);
            const versions = await res.json();

            if (versions.length > 0) {
                const best = versions[0];
                const file = best.files.find(f => f.primary) || best.files[0];
                if (!file) { window.HexaAlert("Information", 'No downloadable file found.'); return; }

                const type = project.project_type || this.state.type || 'mod';
                const subDir = type === 'resourcepack' ? 'resourcepacks' : type === 'shader' ? 'shaderpacks' : 'mods';

                const toastId = 'toast-mod-' + Date.now();
                this.showToast(`Installation de ${project.title}...`, 0, toastId);
                const result = await window.electron.installContent({
                    url: file.url,
                    fileName: file.filename,
                    folderName: instance.folder,
                    type
                });
                if (result && result.success) {
                    this.showToast(`${project.title} installé dans ${instance.name} !`, 100, toastId);
                } else {
                    this.showToast(`Erreur: ${(result && result.error) || 'Unknown'}`, -1, toastId);
                }
            } else {
                this.showToast(`Aucune version compatible pour ${instance.version} / ${instance.loader}`, -1, 'toast-compat-' + Date.now());
            }
        } catch(e) {
            console.error(e);
            this.showToast('Erreur: ' + e.message, -1, 'toast-err-' + Date.now());
        }
    },

    async search() {
        const grid = document.getElementById('browser-grid');
        const loader = document.getElementById('browser-loader');
        if(!grid) return;
        
        grid.innerHTML = '';
        if(loader) loader.style.display = 'block';
        
        try {
            const facets = [];
            if(this.state.type) facets.push([`project_type:${this.state.type}`]);
            if(this.state.version) facets.push([`versions:${this.state.version}`]);
            if(this.state.loader) facets.push([`categories:${this.state.loader}`]);
            if(this.state.category) facets.push([`categories:${this.state.category}`]);
            if(this.state.env) facets.push([`client_side:${this.state.env}`]);

            const params = new URLSearchParams({
                query: this.state.query,
                limit: this.state.limit,
                offset: this.state.offset,
                facets: JSON.stringify(facets)
            });

            const res = await fetch(`${this.apiBase}?${params}`);
            const data = await res.json();
            
            
              if(loader) loader.style.display = 'none';

              const indicator = document.getElementById('page-indicator');
              if(indicator) {
                  indicator.innerText = 'Page ' + (Math.floor(this.state.offset / this.state.limit) + 1);
              }

            
            if(data.hits && data.hits.length > 0) {
                    data.hits.forEach(hit => {
                        const card = document.createElement("div");
                        card.className = "content-card";
                        card.style.cssText = "display: flex; flex-direction: column; background: var(--card-bg); border: 1px solid var(--border-color); overflow: hidden; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; height: 100%; min-height: 220px;";
                        card.onmouseover = () => { card.style.borderColor = "var(--text-color)"; card.style.transform = "translateY(-4px)"; card.style.boxShadow = "var(--hover-shadow)"; };
                        card.onmouseout = () => { card.style.borderColor = "var(--border-color)"; card.style.transform = "translateY(0)"; card.style.boxShadow = "none"; };

                        const icon = hit.icon_url || "https://via.placeholder.com/64";
                        const title = hit.title || hit.slug;
                        const author = hit.author || "Unknown";
                        const dls = hit.downloads ? (hit.downloads / 1000).toFixed(1) + 'k' : '0k';
                        const date = hit.date_modified ? new Date(hit.date_modified).toLocaleDateString() : '';

                        card.innerHTML = `
                            <div style="height: 100px; background: #f5f5f5; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
                                <img src="${icon}" style="width: 64px; height: 64px; object-fit: contain; z-index: 2;" onerror="this.src='assets/logo.png'">
                            </div>
                            <div style="padding: 15px; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                                <div>
                                    <h4 style="margin: 0 0 5px 0; font-size: 14px; font-weight: 800; font-family: 'Montserrat', sans-serif; color: #000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-transform: uppercase;">${title}</h4>
                                    <span style="font-size: 11px; color: #888; display: block; margin-bottom: 8px; font-weight: 600;">By ${author}</span>
                                    <p style="margin: 0 0 12px 0; font-size: 12px; color: #666; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${hit.description || ''}</p>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #eee;">
                                    <span style="font-size: 11px; color: #999; font-weight: 600;"><i class="fas fa-download"></i> ${dls}</span>
                                    <span style="font-size: 11px; color: #999; font-weight: 600;"><i class="fas fa-calendar-alt"></i> ${date}</span>
                                </div>
                            </div>
                        `;

                        // Click entire card to open details

                    card.addEventListener('click', () => {
                        this.openProjectDetails(hit);
                    });
                    
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<div style="padding:20px; color:#666;">No results found.</div>';
            }

        } catch(e) {
            console.error(e);
            if(loader) loader.innerText = "Error loading results.";
        }
    },

    async openProjectDetails(hit, pushToHistory = true) {
        const view = document.getElementById('project-details-view');
        if(!view) return;

        if (pushToHistory) {
             NavSystem.pushState({ tab: 'content', type: 'browser-detail', hit: hit });
        }

        // Reset & Loading State
        view.style.display = 'block';
        document.getElementById('detail-icon').src = hit.icon_url || 'https://via.placeholder.com/150';
        document.getElementById('detail-title').innerText = hit.title;
        document.getElementById('detail-desc').innerText = hit.description || "Loading description...";
        document.getElementById('markdown-content').innerHTML = '<div class="spinner"></div> Loading...';
        document.getElementById('versions-list').innerHTML = '';
        document.getElementById('gallery-grid').innerHTML = '';
        
        // Setup Close & Install
        document.getElementById('detail-close-btn').onclick = () => {
             NavSystem.goBack();
        };
        
        const installBtn = document.getElementById('detail-install-btn');
        // Remove old listeners by cloning
        const newBtn = installBtn.cloneNode(true);
        installBtn.parentNode.replaceChild(newBtn, installBtn);
        
        newBtn.onclick = () => {
             // Ensure we check 'project_type' from the hit object if state is generic
             // hit might just be search result, which HAS project_type.
             // But if we navigated here directly (e.g. from featured), it might be different.
             // Ensure generic handler checks correct properties.
             if (!hit.project_type && this.state && this.state.type) {
                 hit.project_type = this.state.type;
             }
             this.triggerInstall(hit);
        };
        
        // Tab Logic
        const tabs = document.querySelectorAll('.tab-btn');
        tabs.forEach(t => {
            t.onclick = () => {
                tabs.forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                document.querySelectorAll('.detail-tab').forEach(d => d.classList.remove('active'));
                document.getElementById(t.dataset.target).classList.add('active');
            };
        });
        // Reset to first tab
        tabs[0].click();

        try {
            // Fetch Full Details
            const projectRes = await fetch(`https://api.modrinth.com/v2/project/${hit.slug}`);
            const project = await projectRes.json();
            
            // Store for version specific installs
            this.currentProjectTitle = project.title;
            this.currentProjectIcon = project.icon_url;
            
            // Render Description
            if(project.body) {
                document.getElementById('markdown-content').innerHTML = marked.parse(project.body);
            }
            
            // Render Gallery
            if(project.gallery) {
                const galleryGrid = document.getElementById('gallery-grid');
                project.gallery.forEach(img => {
                    const div = document.createElement('div');
                    div.className = 'gallery-card';
                    div.innerHTML = `
                        <img src="${img.url}" class="gallery-img">
                        <div class="gallery-caption">${img.title || 'Untitled'}</div>
                    `;
                    div.onclick = () => {
                        const lightbox = document.getElementById('gallery-lightbox');
                        const lightboxImg = document.getElementById('lightbox-img');
                        lightboxImg.src = img.url;
                        lightbox.classList.add('open');
                        
                        document.getElementById('lightbox-close').onclick = () => lightbox.classList.remove('open');
                        lightbox.onclick = (e) => { if(e.target === lightbox) lightbox.classList.remove('open'); };
                    };
                    galleryGrid.appendChild(div);
                });
            }
            
            // Sidebar Info
            document.getElementById('info-updated').innerText = new Date(project.updated).toLocaleDateString();
            document.getElementById('info-downloads').innerText = project.downloads.toLocaleString();
            document.getElementById('info-license').innerText = project.license.id.toUpperCase();
            
            document.getElementById('detail-web-btn').onclick = () => {
                 // Use window.api.openExternal if available, else standard open
                 if(window.electron && window.electron.openExternal) window.electron.openExternal(`https://modrinth.com/project/${project.slug}`);
                 else window.open(`https://modrinth.com/project/${project.slug}`);
            };

            // Fetch Versions
            const verRes = await fetch(`https://api.modrinth.com/v2/project/${hit.slug}/version`);
            const versions = await verRes.json();
            this.renderVersions(versions);

        } catch(e) {
            console.error(e);
            document.getElementById('markdown-content').innerText = "Failed to load project details.";
        }
    },

    renderVersions(versions) {
        // Pagination State
        let currentPage = 1;
        const perPage = 10;
        const totalPages = Math.ceil(versions.length / perPage);
        
        const renderPage = (page) => {
            const start = (page - 1) * perPage;
            const pagedVersions = versions.slice(start, start + perPage);
            const list = document.getElementById('versions-list');
            list.innerHTML = '';
            
            pagedVersions.forEach(ver => {
                 const row = document.createElement('div');
                 row.className = 'version-row';
                 
                 const typeClass = ver.version_type === 'release' ? 'tag-release' : (ver.version_type === 'beta' ? 'tag-beta' : 'tag-alpha');
                 
                 row.innerHTML = `
                    <div class="version-info">
                        <span class="version-tag ${typeClass}">${ver.version_type}</span>
                        <div>
                            <div class="version-name">${ver.name}</div>
                            <div class="version-meta">${ver.game_versions[0]} • ${ver.loaders[0]}</div>
                        </div>
                    </div>
                    <button class="secondary-btn small" title="Download">⬇</button>
                 `;
                 
                 // Install specific version
                 row.querySelector('button').onclick = () => {
                      // Pass full context for specific version install
                      // We need to pass the project info too, which we might need to store in 'this' context or pass down.
                      // Minimal hack: fake a project object or use current state
                      
                      // Better: Trigger install with the version object
                      if (this.currentProjectTitle) { // Ensure we have context
                          // If it's a modpack, we install this specific version as a new instance
                          if (this.state.type === 'modpack' || (ver.loaders && ver.loaders.length > 0)) {
                              // We use installModpack but we need to trick it to use THIS version data instead of fetching latest
                              // Actually installModpack implementation currently fetches versions again.
                              // Let's modify installModpack to accept a version object directly if provided.
                          }
                      }
                      
                      // For now, re-route to main install logic which fetches latest. 
                      // TODO: Implement specific version install.
                      // Just alert for now to show button works.
                      // window.HexaAlert("Information", "Installing version: " + ver.version_number);
                      
                      // Try to install this specific file URL
                      if (this.state.type === 'modpack') {
                          this.installModpack({ ...ver, title: this.currentProjectTitle || ver.name, icon_url: this.currentProjectIcon }, "Instance " + ver.version_number);
                      } else {
                          // Mod install
                          this.triggerInstall({ project_type: 'mod', ...ver, title: ver.name });
                      }
                 };
                 list.appendChild(row);
            });
            
            document.getElementById('ver-page-info').innerText = `Page ${page} of ${totalPages}`;
            document.getElementById('ver-prev').disabled = page === 1;
            document.getElementById('ver-next').disabled = page === totalPages;
        };

        document.getElementById('ver-prev').onclick = () => { if(currentPage > 1) renderPage(--currentPage); };
        document.getElementById('ver-next').onclick = () => { if(currentPage < totalPages) renderPage(++currentPage); };
        
        renderPage(1);
    }
};

// --- GLOBAL SETTINGS LOGIC ---
document.addEventListener('DOMContentLoaded', () => {
    const ramSlider = document.getElementById('ram-slider');
    const ramDisplay = document.getElementById('ram-display');
    
    const gpuSelector = document.getElementById('gpu-selector');
    
    // -- NEW GPU DETECTION LOGIC --
    if (gpuSelector) {
        let detectedGPU = "Detected Graphics";
        try {
            const canvas = document.createElement('canvas');
            let gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                if (debugInfo) {
                    const unmasked = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
                    let cleanGPU = unmasked;
                    if(cleanGPU.includes("ANGLE (")) {
                        const parts = cleanGPU.split(',');
                        if(parts.length > 1) {
                            cleanGPU = parts[1].trim().split(' Direct3D')[0].trim();
                        }
                    }
                    detectedGPU = cleanGPU;
                }
            }
        } catch(e) {}
        
        gpuSelector.innerHTML = '<option value="auto">Auto-Select High Performance GPU</option><option value="current">' + detectedGPU + '</option>';
        
        gpuSelector.value = localStorage.getItem('gpu-selector') || 'auto';
        
        gpuSelector.addEventListener('change', (e) => {
            localStorage.setItem('gpu-selector', e.target.value);
        });
    }
    // -- END GPU --
    
    const javaPath = document.getElementById('java-path');
    const defaultWidth = document.getElementById('default-width');
    const defaultHeight = document.getElementById('default-height');
    const defaultJvm = document.getElementById('default-jvm');
    const appTheme = document.getElementById('app-theme');
    const saveBtn = document.getElementById('save-settings-btn');
    const saveMsg = document.getElementById('save-settings-msg');

    // Load saved settings if exist
    if(ramSlider) ramSlider.value = localStorage.getItem('hexa-ram') || '4096';
    if(ramDisplay && ramSlider) ramDisplay.innerText = ramSlider.value + ' MB';
    if(gpuSelector) gpuSelector.value = localStorage.getItem('hexa-gpu') || 'auto';
    if(javaPath) javaPath.value = localStorage.getItem('hexa-java') || '';
    if(defaultWidth) defaultWidth.value = localStorage.getItem('hexa-width') || '1280';
    if(defaultHeight) defaultHeight.value = localStorage.getItem('hexa-height') || '720';
    if(defaultJvm) defaultJvm.value = localStorage.getItem('hexa-jvm') || '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50';
    if(appTheme) appTheme.value = localStorage.getItem('hexa-theme') || 'dark';

    // Save settings on click
    if(saveBtn) {
        saveBtn.addEventListener('click', () => {
            if(ramSlider) localStorage.setItem('hexa-ram', ramSlider.value);
            if(gpuSelector) localStorage.setItem('hexa-gpu', gpuSelector.value);
            if(javaPath) localStorage.setItem('hexa-java', javaPath.value);
            if(defaultWidth) localStorage.setItem('hexa-width', defaultWidth.value);
            if(defaultHeight) localStorage.setItem('hexa-height', defaultHeight.value);
            if(defaultJvm) localStorage.setItem('hexa-jvm', defaultJvm.value);
            if(appTheme) localStorage.setItem('hexa-theme', appTheme.value);

            if(saveMsg) {
                saveMsg.style.display = 'inline-flex';
                setTimeout(() => { saveMsg.style.display = 'none'; }, 3000);
            }
        });
    }
});

// Intercept launch to inject global settings automatically
if (window.electron && window.electron.launch) {
    const originalLaunch = window.electron.launch;
    window.electron.launch = async (opts) => {
        if (!opts) opts = {};
        
        // Memory: Only apply global if not defined in instance (opts)
        if (!opts.memory) {
            const mem = localStorage.getItem('hexa-ram') || '4096';
            opts.memory = mem + 'M';
        }
        
        // Resolution: Global fallback (Default 854x480 as requested)
        if (!opts.resolution) {
            const width = localStorage.getItem('hexa-width') || '854';
            const height = localStorage.getItem('hexa-height') || '480';
            opts.resolution = { width: parseInt(width), height: parseInt(height) };
        }
        
        // JVM Args: Global fallback
        if (!opts.jvmArgs) {
            const jvm = localStorage.getItem('hexa-jvm') || '';
            if (jvm.trim() !== '') opts.jvmArgs = jvm;
        }
        
        // Java Path: Global fallback
        if (!opts.javaPath) {
            const javaP = localStorage.getItem('hexa-java') || '';
            if (javaP.trim() !== '') opts.javaPath = javaP;
        }
        
        console.log('Intercepted launch with merged settings:', opts);
        return originalLaunch(opts);
    };
}

window.toggleAccordion = function(element) {
    const isActivating = !element.classList.contains('active');
    document.querySelectorAll('.acc-item').forEach(el => {
        el.classList.remove('active');
    });
    if (isActivating) {
        element.classList.add('active');
    }
};



// Bedrock Carousel Logic for Hexa Launcher
(function() {
    const track = document.getElementById('wardrobe-track');
    const btnPrev = document.getElementById('wardrobe-prev');
    const btnNext = document.getElementById('wardrobe-next');
    
    let carouselViewers = [];
    let skinList = [];
    let currentIndex = 0;

    const b64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAFVBMVEUAAAA7OztBQUGEhoOVl5TIyMjOzs4e8R79AAAAAXRSTlMAQObYZgAAAM9JREFUSMftleENhCAMhZnBDXQFei7QhgUuuMAh+49wVAT0pBqT84eJj9hE88mjpq1KBdEsJQm1Br7uDeymST8StxdtbgEcpqlU18XHxhnng9JrGWgbnDY2n96N1g6TMSBsAa3rQLYgqll0s4gYCDGcZHXgtokLgS1C9N6xQTbZANaKwPtVA9IZEDgDBG+trwLjwECM5wAEIr7ZAeK6EEif1S90OA4ePSpNLJZKGgOr1j8FHFiUOSEUbOnyRcn/Fyhz4jIgzYkdYL0uAKT/xhcR3cKTnTiPTAAAAABJRU5ErkJggg==';
    const defaultSkins = Array(5).fill(b64);
    let carouselInitialized = false;

    function initCarousel(retries = 5) {
        if (!track) return;
        if (typeof skinview3d === 'undefined') {
            if (retries > 0) setTimeout(() => initCarousel(retries - 1), 500);
            return;
        }

        track.innerHTML = '';
        track.style.justifyContent = 'flex-start';
        track.style.paddingTop = '0';
        track.style.overflow = 'visible';
        if (track.parentElement) {
            track.parentElement.style.justifyContent = 'flex-start';
            track.parentElement.style.overflowX = 'hidden';
        }
        
        carouselViewers.forEach(v => {
            if (v && v.dispose) v.dispose();
        });
        carouselViewers = [];
        skinList = [];

        let uName = (typeof currentUser !== 'undefined' && currentUser && currentUser.username) ? currentUser.username : 'OfflinePlayer';
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.username) {
             // Use skin URL from API, or build it from username if not provided
             const userSkinUrl = (currentUser.skin || `${API_BASE_URL}/api/textures/${currentUser.username}.png`);
             skinList.push({ url: userSkinUrl, name: uName, id: 'main' });
        } else {
             skinList.push({ url: b64, name: 'OfflinePlayer', id: 'main' });
        }
        
        defaultSkins.forEach((s, i) => skinList.push({ url: s, name: 'Dummy ' + (i+1), id: 'dummy_' + i }));

        skinList.forEach((skinObj, index) => {
            const item = document.createElement('div');
            item.className = 'carousel-item';
            item.style.position = 'relative';
            item.style.width = '200px';
            item.style.height = '350px';
            item.style.flexShrink = '0';
            item.style.display = 'flex';
            item.style.justifyContent = 'center';
            item.style.alignItems = 'center';
            item.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.4s ease';
            item.style.overflow = 'visible'; // Allow name tag to render above the canvas boundary

            // Feature: Name tag creation
            const nameTag = document.createElement('div');
            nameTag.className = 'skin-name-tag';
            nameTag.innerText = skinObj.name;
            nameTag.style.position = 'absolute';
            nameTag.style.top = '8px';
            nameTag.style.bottom = 'auto';
            nameTag.style.left = '50%';
            nameTag.style.transform = 'translateX(-50%)';
            nameTag.style.background = 'rgba(0,0,0,0.8)';
            nameTag.style.color = '#fff';
            nameTag.style.padding = '6px 14px';
            nameTag.style.borderRadius = '5px';
            nameTag.style.cursor = 'pointer';
            nameTag.style.fontSize = '12px';
            nameTag.style.fontWeight = 'bold';
            nameTag.style.whiteSpace = 'nowrap';
            nameTag.style.zIndex = '1000';
            nameTag.style.border = '1px solid rgba(255,255,255,0.2)';
            nameTag.style.transition = 'all 0.3s ease';
            
            // Feature: Click to rename dummy
            nameTag.addEventListener('click', (e) => {
                e.stopPropagation();
                if (index === 0 && uName !== 'OfflinePlayer') {
                    window.HexaAlert("Information", 'Tu ne peux pas renommer ton compte principal ici !');
                    return;
                }
                const newName = prompt('Renommer le dummy :', skinObj.name);
                if (newName && newName.trim() !== '') {
                    skinObj.name = newName.trim();
                    nameTag.innerText = skinObj.name;
                }
            });
            
            // Hover states for the name tag
            nameTag.addEventListener('mouseenter', () => nameTag.style.background = 'rgba(50,50,50,0.9)');
            nameTag.addEventListener('mouseleave', () => nameTag.style.background = 'rgba(0,0,0,0.8)');
            
            item.appendChild(nameTag);

            const canvas = document.createElement('canvas');
            item.appendChild(canvas);
            track.appendChild(item);

            try {
                let viewer = new skinview3d.SkinViewer({
                    canvas: canvas,
                    width: 200,
                    height: 350,
                    renderScale: window.devicePixelRatio || 1
                });
                // Initial camera pos
                viewer.camera.position.set(20, 10, 50);
                viewer.zoom = 0.8;
                viewer.animation = new skinview3d.WalkingAnimation();
                viewer.animation.speed = 0.5;

                const skinUrl = skinObj.url || b64;
                const loadPromise = viewer.loadSkin(skinUrl);
                if (loadPromise && typeof loadPromise.catch === 'function') {
                    loadPromise.catch(e => {
                        viewer.loadSkin(b64).catch(()=>{});
                    });
                }

                // Attach viewer and track it
                viewer._animId = null;
                carouselViewers.push(viewer);
            } catch (e) {
                console.error("Erreur generation dummy:", e);
                carouselViewers.push(null);
            }

            item.addEventListener('click', () => {
                if (currentIndex !== index) {
                    currentIndex = index;
                    updateCarouselView();
                }
            });
        });

        currentIndex = 0;
        updateCarouselView();
        carouselInitialized = true;
    }

    function smoothCameraReset(viewer) {
        if (!viewer) return;
        if (viewer._animId) {
            cancelAnimationFrame(viewer._animId);
        }
        
        let targetX = 20, targetY = 10, targetZ = 50;
        
        function animate() {
            let cam = viewer.camera.position;
            let dx = targetX - cam.x;
            let dy = targetY - cam.y;
            let dz = targetZ - cam.z;
            
            // If we are close enough, snap and stop animation
            if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && Math.abs(dz) < 0.1) {
                cam.set(targetX, targetY, targetZ);
                if (viewer.playerObject && viewer.playerObject.rotation) {
                    viewer.playerObject.rotation.y = 0;
                    viewer.playerObject.rotation.x = 0;
                }
                viewer._animId = null;
                return;
            }
            
            // LERP interpolation
            cam.x += dx * 0.1;
            cam.y += dy * 0.1;
            cam.z += dz * 0.1;
            
            // Also reset player rotation smoothly
            if (viewer.playerObject && typeof viewer.playerObject.rotation === 'object') {
                viewer.playerObject.rotation.y += (0 - viewer.playerObject.rotation.y) * 0.1;
                viewer.playerObject.rotation.x += (0 - viewer.playerObject.rotation.x) * 0.1;
            }
            
            viewer._animId = requestAnimationFrame(animate);
        }
        animate();
    }

    function updateCarouselView() {
        if (!track) return;
        const itemWidth = 240; // Approx item width + gap
        const containerWidth = track.parentElement ? track.parentElement.clientWidth : 800;
        const offset = - (currentIndex * itemWidth) + (containerWidth / 2) - (itemWidth / 2);
        
        track.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
        track.style.transform = 'translateX(' + offset + 'px)';

        Array.from(track.children).forEach((child, idx) => {
            const nameTag = child.querySelector('.skin-name-tag');
            let viewer = carouselViewers[idx];

            if (idx === currentIndex) {
                child.style.transform = 'scale(1.25)';
                child.style.opacity = '1';
                child.style.zIndex = '10';
                if (nameTag) {
                    nameTag.style.opacity = '1';
                    nameTag.style.transform = 'translateX(-50%)';
                    nameTag.style.background = 'rgba(0,0,0,0.9)';
                    nameTag.style.border = '1px solid rgba(255,255,255,0.5)';
                }
                
                // Feature: Target smooth camera reset on focus
                if (viewer) smoothCameraReset(viewer);
            } else {
                child.style.transform = 'scale(0.85)';
                child.style.opacity = '0.4';
                child.style.zIndex = '1';
                if (nameTag) {
                    nameTag.style.opacity = '0.5';
                    nameTag.style.transform = 'translateX(-50%)';
                    nameTag.style.background = 'rgba(0,0,0,0.8)';
                    nameTag.style.border = '1px solid rgba(255,255,255,0.2)';
                }
            }
        });
    }

    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
             if (skinList.length === 0) return;
             // Feature: Infinite loop left
             currentIndex = (currentIndex > 0) ? currentIndex - 1 : skinList.length - 1; 
             updateCarouselView(); 
        });
    }
    
    if (btnNext) {
        btnNext.addEventListener('click', () => {
             if (skinList.length === 0) return;
             // Feature: Infinite loop right
             currentIndex = (currentIndex < skinList.length - 1) ? currentIndex + 1 : 0; 
             updateCarouselView(); 
        });
    }

    // Force init after DOM load to bypass strict active tab constraints
    setTimeout(() => {
        initCarousel();
    }, 1500);

})();
// ==========================================
// SOCIAL HUB (FRIENDS LOGIC)
// ==========================================

async function loadFriendRequests(username) {
    const rosterContainer = document.querySelector(".soc-roster");
    if(!rosterContainer) return;

    let reqSection = document.getElementById("soc-req-section");
    if (!reqSection) {
        reqSection = document.createElement("div");
        reqSection.id = "soc-req-section";
        rosterContainer.prepend(reqSection);
    }

    try {
        const result = await window.electron.fetchFriends();
        if (result && result.success && result.friends) {
            const requests = result.friends.filter(u => u.friendship_status === 'pending');
            
            reqSection.innerHTML = "";
            if (requests.length > 0) {
                 const groupTitle = document.createElement("div");
                 groupTitle.className = "soc-group";
                 groupTitle.innerText = "Demandes Reçues - " + requests.length;
                 reqSection.appendChild(groupTitle);
                 
                 requests.forEach(user => {
                     const el = document.createElement("div");
                     el.className = "soc-user";

                     let avatarUrl = `https://minotar.net/helm/${user.username}/64`;
                     const fullSkin = user.skin_url ? (user.skin_url.includes("http") ? user.skin_url : `http://91.197.6.177:24607/api/textures/${user.skin_url}`) : `http://91.197.6.177:24607/api/textures/${user.username}.png`;
                     extractHeadAvatar(fullSkin).then(h => { 
                        const img = el.querySelector("img"); 
                        if(img) img.src = h; 
                     }).catch(()=>{});

                     el.innerHTML = `
                            <div class="soc-avatar">
                                <img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64';">
                                <div class="soc-status-badge status-offline"></div>
                            </div>
                            <div class="soc-info" style="flex:1;">
                                <div class="soc-name">${user.username}</div>
                                <div class="soc-activity" style="color: #f1c40f;">En attente</div>
                            </div>
                            <div class="soc-actions" style="display:flex; gap:5px;">
                                <button onclick="acceptFriendRequest(${user.id}, event)" style="background:#2ecc71; border:none; padding:2px 5px; border-radius:3px; cursor:pointer; color:white;"><i class="fas fa-check"></i></button>
                                <button onclick="rejectFriendRequest(${user.id}, event)" style="background:#e74c3c; border:none; padding:2px 5px; border-radius:3px; cursor:pointer; color:white;"><i class="fas fa-times"></i></button>
                            </div>
                        `;
                     reqSection.appendChild(el);
                 });
            }
        }
    } catch(e) { console.error("Friend Requests fetch error:", e); }
}

async function loadFriends(username) {
    const rosterContainer = document.querySelector(".soc-roster");
    if(!rosterContainer) return;

    let friendSection = document.getElementById("soc-friends-section");
    if (!friendSection) {
        friendSection = document.createElement("div");
        friendSection.id = "soc-friends-section";
        rosterContainer.appendChild(friendSection);
    }

    try {
        const result = await window.electron.fetchFriends();
        if (result && result.success && result.friends) {
            friendSection.innerHTML = "";
            
            const friends = result.friends.filter(u => u.friendship_status !== 'pending');
            const groupedUsers = {
                "Staff, Admin & Amis": [],
                "Mes Amis": []
            };

            friends.forEach(u => {
                if(u.role === "admin" || u.role === "staff") {
                    groupedUsers["Staff, Admin & Amis"].push(u);
                } else {
                    groupedUsers["Mes Amis"].push(u);
                }
            });

            let hasFriends = false;
            for (const [groupName, groupData] of Object.entries(groupedUsers)) {
                if (groupData.length === 0) continue;
                hasFriends = true;

                const groupTitle = document.createElement("div");
                groupTitle.className = "soc-group";
                groupTitle.innerText = groupName + " - " + groupData.length;
                friendSection.appendChild(groupTitle);

                groupData.forEach(user => {
                    const el = document.createElement("div");
                    el.className = "soc-user";

                    let avatarUrl = `https://minotar.net/helm/${user.username}/64`;
                    const fullSkin = user.skin_url ? (user.skin_url.includes("http") ? user.skin_url : `http://91.197.6.177:24607/api/textures/${user.skin_url}`) : `http://91.197.6.177:24607/api/textures/${user.username}.png`;
                    extractHeadAvatar(fullSkin).then(h => { 
                        const img = el.querySelector("img"); 
                        if(img) img.src = h; 
                        avatarUrl = h;
                    }).catch(()=>{});

                    const statusText = (user.status && user.status.toLowerCase() === 'online') ? "En Ligne" : "Hors Ligne";
                    const statusType = user.status ? user.status.toLowerCase() : "offline";
                    el.onclick = () => window.setSocial(user.username, statusText, avatarUrl, statusType, el, user.id);

                    el.innerHTML = `
                            <div class="soc-avatar">
                                <img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64';">
                                <div class="soc-status-badge status-${statusType}"></div>
                            </div>
                            <div class="soc-info">
                                <div class="soc-name">${user.username}</div>
                                <div class="soc-activity" style="color: ${statusType === 'online' ? '#2ecc71' : '#95a5a6'};">${statusText}</div>
                            </div>
                        `;
                    friendSection.appendChild(el);
                });
            }
            if(!hasFriends) {
                 friendSection.innerHTML = "<div style='padding:20px;color:#aaa;'>Aucun ami pour le moment.</div>";
            }
        } else {
            friendSection.innerHTML = "<div style='padding:20px;color:#aaa;'>Aucun ami pour le moment.</div>";
        }
    } catch (e) {
        console.error("Friends fetch error: ", e);
    }
}


async function loadSocialHubUsers() {
    // Preserve existing cleaner logic but delegate
    const rosterContainer = document.querySelector(".soc-roster");
    if(!rosterContainer) return;
    
    // We don't wipe .soc-roster anymore because we use sections. 
    // Is it safe? 
    // If old code ran, .soc-roster might have garbage.
    // Let's clear it IF it doesn't have our sections.
    if (!document.getElementById("soc-req-section") && !document.getElementById("soc-friends-section")) {
        rosterContainer.innerHTML = "";
    }

    if(currentUser) {
        loadFriendRequests(currentUser.username);
        loadFriends(currentUser.username);
    }
}

window.acceptFriendRequest = async function(friendId, e) {
    e.stopPropagation();
    try {
        const res = await window.electron.acceptFriend(friendId);
        if(res.success) loadSocialHubUsers();
        else window.HexaAlert("Information", "Erreur: " + res.message);
    } catch(err) {}
};

window.rejectFriendRequest = async function(friendId, e) {
    e.stopPropagation();
    try {
        const res = await window.electron.rejectFriend(friendId);
        if(res.success) loadSocialHubUsers();
        else window.HexaAlert("Information", "Erreur: " + res.message);
    } catch(err) {}
};

let currentChatFriendId = null;

window.setSocial = function(name, status, avatar, type, element, friendId) {
    document.querySelectorAll(".soc-user").forEach(el => el.classList.remove("active"));
    if(element) element.classList.add("active");

    document.getElementById("soc-header-pic").src = avatar; document.getElementById("soc-header-pic").style.display="block";
    document.getElementById("soc-header-name").innerText = name;

    const statusEl = document.getElementById("soc-header-status");
    statusEl.innerText = status;
    if (type === "online") statusEl.style.color = "#2ecc71";
    else if (type === "offline") statusEl.style.color = "#95a5a6";
    else statusEl.style.color = "#2ecc71";

    const msgList = document.getElementById("soc-msg-list");
    msgList.innerHTML = `<div class="soc-divider"><span>Direct Message</span></div><div style="text-align:center;color:#888;margin-top:20px;font-size:12px;">This is the beginning of your chat history with ${name}.</div><div id="chat-loading" style="text-align:center;margin-top:10px;"><i class="fas fa-spinner fa-spin"></i></div>`;

    const inputArea = document.getElementById("soc-input-text");
    inputArea.placeholder = "Message @" + name + "...";
    inputArea.value = "";
    
    currentChatFriendId = friendId;
    loadChatMessages(friendId, name, avatar);
};

window.loadChatMessages = async function(friendId, friendName, friendAvatar) {
    const msgList = document.getElementById("soc-msg-list");
    if(!friendId) return;
    try {
        const res = await window.electron.getMessages(friendId);
        const loading = document.getElementById("chat-loading");
        if(loading) loading.remove();
        
        if(res && res.success && res.messages) {
            
            // Build messages UI
            let html = `<div class="soc-divider"><span>Direct Message</span></div><div class="soc-chat-intro">Beginning of chat history with ${friendName}.</div>`;
            
            // Get my avatar
            let myAvatar = 'assets/logo.png'; // Fallback
            let myName = 'Moi';
            if(typeof currentUser !== 'undefined' && currentUser) {
                 myName = currentUser.username;
                 try {
                     // Force fetch from custom backend first
                     const skinUrl = `http://91.197.6.177:24607/api/textures/${currentUser.username}.png`;
                     myAvatar = await extractHeadAvatar(skinUrl);
                 } catch(e) {
                     myAvatar = `https://minotar.net/helm/${currentUser.username}/64`;
                 }
            }

            for(const m of res.messages) {
                const isMe = (m.sender_id != friendId); 
                
                // Time Formatting
                let timeStr = "";
                if(m.created_at) {
                    const date = new Date(m.created_at);
                    if(!isNaN(date.getTime())) {
                        const hours = date.getHours().toString().padStart(2, '0');
                        const minutes = date.getMinutes().toString().padStart(2, '0');
                        timeStr = `${hours}:${minutes}`;
                    } else {
                        timeStr = "??:??";
                    }
                } else {
                    timeStr = "Now";
                }

                // Options (Trash)
                let trashBtn = '';
                if(isMe) {
                    trashBtn = `<i class="fas fa-trash soc-trash-btn" onclick="deleteSocialMessage(${m.id}, ${friendId})"></i>`;
                }
                
                let contentHTML = escapeHtml(m.message);
                
                // Modpack Share Parser V2 (Base64 JSON)
                const mpRegexV2 = /\[MP_CARD:(.*?)\]/;
                const matchV2 = m.message.match(mpRegexV2);
                if (matchV2) {
                    try {
                        const jsonStr = decodeURIComponent(escape(atob(matchV2[1])));
                        const data = JSON.parse(jsonStr);
                        
                        // Safe name for JS string
                        const safeName = data.n.replace(/'/g, "\\'"); 
                        
                        contentHTML = `
                        <div style="text-align: left; background:#fff; border:1px solid #ddd; border-top: 3px solid #000; border-radius:6px; overflow:hidden; width:300px; font-family:'Segoe UI', sans-serif; display:flex; flex-direction:column; margin-top:5px;">
                            <div style="padding: 12px; display:flex; gap:12px; align-items: flex-start;">
                                <!-- Logo -->
                                <div style="width:64px; height:64px; background:#f8f9fa; border-radius:6px; flex-shrink:0; overflow:hidden; display:flex; align-items:center; justify-content:center; border:1px solid #eee;">
                                    <img src="${data.i}" onerror="this.src='assets/logo.png'" style="width:100%; height:100%; object-fit:contain;">
                                </div>
                                <!-- Content -->
                                <div style="flex:1; overflow:hidden; min-width:0; display:flex; flex-direction:column; justify-content:center; height:64px;">
                                    <div style="font-weight:800; font-size:14px; color:#222; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:left;" title="${data.n}">${data.n}</div>
                                    <div style="font-size:11px; color:#666; line-height:1.4; text-align:left;">
                                        <div style="display:flex; align-items:center; gap:5px; margin-bottom:2px;">
                                            <i class="fas fa-calendar-alt" style="font-size:10px; width:12px; text-align:center;"></i> ${data.d}
                                        </div>
                                        <div style="display:flex; align-items:center; gap:5px;">
                                            <i class="fas fa-cube" style="font-size:10px; width:12px; text-align:center;"></i> ${data.c} Mods
                                        </div>
                                        <div style="display:flex; align-items:center; gap:5px;">
                                            <i class="fas fa-user" style="font-size:10px; width:12px; text-align:center;"></i> ${data.a}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <!-- Button -->
                            <div style="padding:0 12px 12px 12px;">
                                <button style="width:100%; background:#222; color:#fff; border:none; padding:10px 0; border-radius:4px; font-size:12px; font-weight:800; cursor:pointer; text-transform:uppercase; letter-spacing:0.5px; transition: background 0.2s;" onmouseover="this.style.background='#444'" onmouseout="this.style.background='#222'" onclick="window.HexaAlert('Install', 'Installation of shared pack [${safeName}] started.')">INSTALL MODPACK</button>
                            </div>
                        </div>`;
                    } catch(e) {
                        console.error('Share parse error', e);
                        contentHTML = '<span style="color:#d00; font-style:italic;">[Invalid Share Content]</span>';
                    }
                }
                // Modpack Share Parser (Legacy)
                const mpRegex = /\[MODPACK SHARE\] Check out \*\*(.*?)\*\* for (.*?)!/;
                const match = m.message.match(mpRegex);
                if (match) {
                    const mpName = match[1];
                    const mpVer = match[2];
                    contentHTML = `
                    <div style="margin-top:5px; border:1px solid #ddd; background:#f9f9f9; padding:10px; border-radius:8px; display:flex; align-items:center; cursor:pointer;" onclick="ContentBrowser.state.query='${escapeHtml(mpName)}'; ContentBrowser.search(); document.querySelector('.nav-item[data-tab=\\'content\\']').click();">
                        <div style="width:40px; height:40px; background:#fff; border:1px solid #eee; border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:20px; color:#333;"><i class="fas fa-cube"></i></div>
                        <div style="flex:1; margin-left:10px;">
                            <div style="font-weight:700; font-size:13px; color:#333;">${escapeHtml(mpName)}</div>
                            <div style="font-size:11px; color:#888;">Modpack • ${escapeHtml(mpVer)}</div>
                        </div>
                        <div style="width:32px; height:32px; border-radius:50%; background:#fff; border:1px solid #eee; display:flex; align-items:center; justify-content:center; color:#333;"><i class="fas fa-download"></i></div>
                    </div>`;
                }

                html += `
                    <div class="soc-msg">
                        <div class="soc-msg-content">
                            <div class="soc-msg-header">
                                <img src="${isMe ? myAvatar : friendAvatar}" class="soc-msg-avatar-small">
                                <span class="soc-msg-author">${isMe ? myName : friendName}</span>
                                <span class="soc-msg-time">${timeStr}</span>
                                ${trashBtn}
                            </div>
                            <div class="soc-msg-text">${contentHTML}</div>
                        </div>
                    </div>
                `;
            }
            msgList.innerHTML = html;
            msgList.scrollTop = msgList.scrollHeight; // Scroll to bottom
        }
    } catch(err) {
        console.error("Chat load error", err);
    }
};

window.deleteSocialMessage = async function(msgId, friendId) {
    if(!confirm("Supprimer ce message ?")) return;
    try {
        // Optimistic Remove
        // Note: Backend endpoint for deleting specific message needed
        // Assuming window.electron.deleteMessage exists or creating stub
        if(window.electron && window.electron.deleteMessage) {
            await window.electron.deleteMessage(msgId);
            // Reload
            const friendName = document.getElementById("soc-header-name").innerText;
            const friendAvatar = document.getElementById("soc-header-pic").src;
            loadChatMessages(friendId, friendName, friendAvatar);
        } else {
            alert("Delete feature not connected to backend yet.");
        }
    } catch(e) { console.error(e); }
};

function escapeHtml(unsafe) {
    return (unsafe || "").toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// Attach hook to the chat input to send message!
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("soc-input-text");
    if(input) {
        input.addEventListener('keypress', async (e) => {
            if(e.key === 'Enter' && currentChatFriendId && input.value.trim() !== '') {
                const msg = input.value.trim();
                input.value = "";
                // Optimistic UI directly? Yes roughly
                
                try {
                    const res = await window.electron.sendMessage(currentChatFriendId, msg);
                    if(res.success) {
                        // Reload chat
                        const friendName = document.getElementById("soc-header-name").innerText;
                        const friendAvatar = document.getElementById("soc-header-pic").src;
                        loadChatMessages(currentChatFriendId, friendName, friendAvatar);
                    }
                } catch(err) {
                    console.error("Send message error");
                }
            }
        });
    }
});


/**
 * Code Launcher pour envoyer une demande d'ami
 */
async function sendFriendRequest(targetUsername, myUsername) {
    try {
        console.log(`📤 Envoi demande d'ami de ${myUsername} vers ${targetUsername}...`);

        const response = await fetch('http://91.197.6.177:24607/hexa/api/friends/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username: targetUsername, // Qui on veut ajouter
                from: myUsername          // Qui fait la demande
            })
        });

        const text = await response.text();
        let result;
        try {
            result = JSON.parse(text);
        } catch(e) {
            console.error("Réponse API invalide:", text);
            throw new Error(`Erreur serveur (${response.status})`);
        }
        
        if (result.success) {
            console.log('✅ Demande envoyée avec succès !');
            if (result.delivered) {
                console.log('⚡ Ami en ligne : Notification reçue instantanément !');
            } else {
                console.log('💤 Ami hors ligne : Il verra la demande plus tard.');
            }
            window.HexaAlert("Succès", 'Demande envoyée !');
            loadSocialHubUsers();
        } else {
            console.error('❌ Erreur API:', result.error);
            window.HexaAlert("Erreur", 'Impossible d\'ajouter cet ami : ' + (result.error || result.message));
        }

    } catch (err) {
        console.error('❌ Erreur Réseau:', err);
        window.HexaAlert("Erreur", "Problème de connexion au serveur.");
    }
}

function initFriendSystem() {
    const addBtn = document.getElementById('add-friend-btn');
    if(addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = 'true';
        addBtn.addEventListener('click', async () => {
            const inp = document.getElementById('add-friend-input');
            if(!inp || !inp.value.trim()) return;
            addBtn.disabled = true;
            addBtn.innerText = '...';
            
            const myUsername = (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : 'Unknown';
            await sendFriendRequest(inp.value.trim(), myUsername);
            
            inp.value = '';
            addBtn.disabled = false;
            addBtn.innerText = 'Add';
        });
    }
}
document.addEventListener('DOMContentLoaded', initFriendSystem);

// Fallback if tab is re-rendered
document.addEventListener('click', (e) => {
    if(e.target.id === 'add-friend-btn' && !e.target.dataset.bound) {
        initFriendSystem();
        e.target.click();
    }
});



// Hook into the click event when opening the friends tab
const friendsTabBtn = document.querySelector(`[data-tab="friends"]`);
if (friendsTabBtn) {
    friendsTabBtn.addEventListener("click", () => {
        loadSocialHubUsers();
    });
}

// Global update for chat view
// ==========================================
// USER LOGOUT LOGIC
// ==========================================

const bottomUserStatus = document.getElementById("bottom-user-status");
if (bottomUserStatus) {
    bottomUserStatus.addEventListener("click", () => {
        if(confirm("Voulez-vous vraiment vous deconnecter ?")) {
            // Remove saved credentials
            localStorage.removeItem("hexa_saved_user");
            
            // Clear current variables
            currentUser = null;
            
            // Show login UI & reset fields
            const loginOverlay = document.getElementById("login-overlay");
            if (loginOverlay) {
                loginOverlay.style.display = "flex";
                loginOverlay.style.opacity = "1";
                
                const loginSubmitBtn = document.getElementById("login-submit-btn");
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.innerText = "INITIALIZE SESSION";
                }
                
                const passwordInput = document.getElementById("login-password");
                if(passwordInput) passwordInput.value = "";
                
                const errorObj = document.getElementById("login-error");
                if (errorObj) errorObj.innerText = "";
            }
        }
    });
}


loadSocialHubUsers();

// ============================================================
// SYSTEME DE NOTIFICATIONS TEMPS RÉEL (SSE)
// ============================================================
function initSSE() {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.username) {
        setTimeout(initSSE, 1000); // Retry if user not loaded yet
        return;
    }
    
    console.log(`🔌 Connexion au flux social pour : ${currentUser.username}...`);
    const eventSource = new EventSource(`http://91.197.6.177:24607/api/events/social?username=${currentUser.username}`);
    
    eventSource.onopen = function() {
        console.log('✅ Connecté aux événements en temps réel (SSE) !');
    };
    
    eventSource.addEventListener('friend_status', (e) => {
        try {
            const data = JSON.parse(e.data);
            console.log(`[AMI] ${data.name} est maintenant ${data.status}`);
            loadSocialHubUsers(); // Actualise l'interface
        } catch(err){}
    });
    
    eventSource.addEventListener('friend_request', (e) => {
        try {
            const data = JSON.parse(e.data);
            console.log(`[ANNONCE] Demande d'ami de ${data.from}`);
            new Notification("Nouvelle demande d'ami", {
                body: `${data.from} veut t'ajouter en ami !`
            });
            loadSocialHubUsers(); // Recharge la liste
        } catch(err){}
    });
    
    eventSource.addEventListener('chat_message', (e) => {
        try {
            const data = JSON.parse(e.data);
            console.log(`[CHAT] ${data.from}: ${data.content}`);
            // Notification lors d'un nouveau message
            new Notification('Nouveau message', {
                body: `${data.from}: ${data.content}`
            });
            // Intégration future avec votre chat
            if(window.ChatSystem && window.ChatSystem.isOpen) {
                // window.ChatSystem.fetchMessages();
            }
        } catch(err){}
    });
    
    eventSource.onerror = function(err) {
        console.warn('⚠️ Perte de connexion SSE. Tentative de reconnexion automatique...');
    };
}

// Initialiser le système SSE (au lieu de recharger en boucle)
initSSE();
// === CHAT SYSTEM ===
const ChatSystem = {
    messages: [],
    isOpen: false,
    serverUrl: "http://91.197.6.177:24607",
    
    get username() {
        return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : 'Guest';
    },

    get avatar() {
        if (typeof currentUser !== 'undefined' && currentUser) {
            // Priority 1: Hexa Custom Skin (if enabled in future backend)
            // Priority 2: Minotar
            // Note: If you have a custom skin upload feature, check that URL first.
            if(API_BASE_URL) {
                 return `${API_BASE_URL}/api/textures/${currentUser.username}.png`;
            }
            return `https://minotar.net/helm/${currentUser.username}/64`;
        }
        return 'https://minotar.net/helm/Steve/64';
    },

    init() {
        console.log('[ChatSystem] Initializing...');
        this.injectHTML();
        this.bindEvents();
        // SSE handles chat updates now
    },

    injectHTML() {
        if(document.getElementById('discord-overlay')) return;

        const div = document.createElement('div');
        div.id = 'discord-overlay';
        div.className = 'chat-overlay'; 
        div.style.display = 'none';
        div.innerHTML = `
            <div class="chat-container">
                <div class="chat-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="assets/logo.png" style="width:24px; height:24px;" onerror="this.src='https://minotar.net/helm/Steve/24'">
                        <span style="font-weight:700;">HEXA CHAT</span>
                    </div>
                    <button id="close-chat-btn" style="background:none; border:none; color:#bbb; cursor:pointer; font-size:18px;">&times;</button>
                </div>
                
                <div class="chat-messages" id="chat-messages-area">
                    <div class="chat-msg system">
                        <span class="msg-content" style="color:#888; font-size:12px;">Bienvenue sur le chat global ! Soyez respectueux.</span>
                    </div>
                </div>

                <div class="chat-input-area">
                    <button id="emoji-btn" style="background:none; border:none; cursor:pointer; font-size:18px; color:#bbb;">☺</button>
                    <input type="text" id="chat-input" placeholder="Envoyer un message..." autocomplete="off">
                    <button id="send-chat-btn" style="background:#5865F2; border:none; color:white; border-radius:4px; padding:5px 12px; cursor:pointer;">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                    <div id="emoji-picker" class="emoji-picker" style="display:none;"></div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        
        // Floating Button
        if(!document.getElementById('float-chat-btn')) {
            const floatBtn = document.createElement('button');
            floatBtn.id = 'float-chat-btn';
            floatBtn.innerHTML = '<i class="fas fa-comments"></i>';
            floatBtn.style.cssText = "position:fixed; bottom:20px; right:20px; width:50px; height:50px; border-radius:50%; background:#5865F2; color:white; border:none; box-shadow:0 4px 10px rgba(0,0,0,0.3); cursor:pointer; font-size:20px; z-index:9000; transition: transform 0.2s;";
            floatBtn.onmouseover = () => floatBtn.style.transform = 'scale(1.1)';
            floatBtn.onmouseout = () => floatBtn.style.transform = 'scale(1)';
            floatBtn.onclick = () => this.toggle();
            document.body.appendChild(floatBtn);
        }
    },

    bindEvents() {
        const closeBtn = document.getElementById('close-chat-btn');
        if(closeBtn) closeBtn.onclick = () => this.toggle(false);
        
        const sendBtn = document.getElementById('send-chat-btn');
        if(sendBtn) sendBtn.onclick = () => this.sendMessage();
        
        const input = document.getElementById('chat-input');
        if(input) {
            input.addEventListener('keypress', (e) => {
                if(e.key === 'Enter') this.sendMessage();
            });
        }

        const emojiBtn = document.getElementById('emoji-btn');
        const picker = document.getElementById('emoji-picker');
        
        if(emojiBtn && picker) {
            emojiBtn.onclick = (e) => {
                e.stopPropagation();
                picker.style.display = picker.style.display === 'none' ? 'grid' : 'none';
                if(picker.children.length === 0) this.populateEmojis();
            };

            window.addEventListener('click', (e) => {
                if(picker && !picker.contains(e.target) && e.target !== emojiBtn) {
                    picker.style.display = 'none';
                }
            });
        }
    },

    populateEmojis() {
        const picker = document.getElementById('emoji-picker');
        if(!picker) return;
        const list = ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾'];
        
        list.forEach(char => {
            const s = document.createElement('span');
            s.className = 'emoji-item';
            s.innerText = char;
            s.onclick = () => {
                const inp = document.getElementById('chat-input');
                if(inp) {
                    inp.value += char;
                    inp.focus();
                }
            };
            picker.appendChild(s);
        });
    },

    toggle(forceState) {
        const overlay = document.getElementById('discord-overlay');
        if(!overlay) return;
        
        if(typeof forceState === 'boolean') {
            this.isOpen = forceState;
        } else {
            this.isOpen = !this.isOpen;
        }
        
        overlay.style.display = this.isOpen ? 'flex' : 'none';
        if(this.isOpen) {
            this.scrollToBottom();
            this.fetchMessages(); // Trigger fetch immediately
        }
    },

    scrollToBottom() {
        const area = document.getElementById('chat-messages-area');
        if(area) area.scrollTop = area.scrollHeight;
    },

    async fetchMessages() {
        // Implementation for later
    },

    async sendMessage() {
        const input = document.getElementById('chat-input');
        if(!input) return;
        const text = input.value.trim();
        if(!text) return;
        
        input.value = '';
        
        this.addMessageToUI({
            author: this.username,
            avatar: this.avatar,
            content: text, // HTML escaped in addMessageToUI logic if needed, but here simple
            timestamp: new Date().toISOString(),
            isMe: true
        });
    },

    addMessageToUI(msg) {
        const area = document.getElementById('chat-messages-area');
        if(!area) return;
        
        const div = document.createElement('div');
        div.className = `chat-msg ${msg.isMe ? 'own' : ''}`;
        
        if (msg.isSystem) {
            div.innerHTML = `<span style="color:#aaa;">${msg.content}</span>`;
        } else {
             // Safe HTML injection
            const authorDiv = document.createElement('div');
            authorDiv.className = 'chat-author';
            authorDiv.innerText = msg.author;
            
            const timeSpan = document.createElement('span');
            timeSpan.style.fontSize='10px';
            timeSpan.style.color='#72767d';
            timeSpan.style.marginLeft='5px';
            
            // Format time as HH:MM
            const d = new Date(msg.timestamp);
            const hours = d.getHours().toString().padStart(2, '0');
            const mins = d.getMinutes().toString().padStart(2, '0');
            timeSpan.innerText = `${hours}:${mins}`;
            
            authorDiv.appendChild(timeSpan);
            
            // Delete Button (if own message)
            if(msg.isMe) {
                 const delBtn = document.createElement('i');
                 delBtn.className = 'fas fa-trash';
                 delBtn.style.marginLeft = '10px';
                 delBtn.style.fontSize = '12px';
                 delBtn.style.color = '#ff4444';
                 delBtn.style.cursor = 'pointer';
                 delBtn.onclick = () => {
                     // TODO: Call API to delete
                     div.remove();
                 };
                 authorDiv.appendChild(delBtn);
            }
            
            const textDiv = document.createElement('div');
            textDiv.className = 'chat-text';
            textDiv.innerText = msg.content; 

            const wrapper = document.createElement('div');
            wrapper.className = 'chat-content';
            wrapper.appendChild(authorDiv);
            wrapper.appendChild(textDiv);
            
            // Skin Head (Avatar) logic - already handled by msg.avatar passed from getter
            // But let's support fallback
            const img = document.createElement('img');
            img.className = 'chat-avatar';
            // Custom Avatar Logic: 
            // 1. Try uploaded Hexa skin
            // 2. Fallback to Minotar (Mojang)
            // 3. Fallback to Steve
            // This URL construction logic is now centralized in the getter or here
            
            if(msg.avatar && msg.avatar.includes('http')) {
                img.src = msg.avatar;
            } else {
                 // Fallback if avatar prop is missing
                 img.src = `https://minotar.net/helm/${msg.author}/64`;
            }

            img.onerror = function() {
                // If custom skin fails, try minotar
                if (this.src.includes('hexa/skins')) {
                     this.src = `https://minotar.net/helm/${msg.author}/64`;
                } else {
                     this.src = 'https://minotar.net/helm/Steve/64';
                }
            };
            
            if(msg.isMe) {
                 div.appendChild(wrapper);
                 div.appendChild(img);
            } else {
                 div.appendChild(img);
                 div.appendChild(wrapper);
            }
        }
        
        area.appendChild(div);
        this.scrollToBottom();
    }
};

//ChatSystem.init();

/* --- ATTACHMENT SYSTEM / MODPACK IMPORT --- */
// Functionality to manage modpack/screenshot sharing

window.toggleAttachPopup = function(force) {
    const p = document.getElementById('chat-attach-popup');
    if(!p) return;
    
    if (typeof force !== 'undefined') p.style.display = force ? 'flex' : 'none';
    else p.style.display = p.style.display === 'none' ? 'flex' : 'none';

    if (p.style.display === 'none') {
        // Reset state on close
        resetAttachView();
    }
};

window.resetAttachView = function() {
    document.getElementById('attach-menu-view').style.display = 'flex';
    document.getElementById('attach-list-view').style.display = 'none';
    document.getElementById('attach-footer').style.display = 'none';
    const list = document.getElementById('attach-list-content');
    if(list) {
        list.innerHTML = '';
        list.style.display = 'block'; // Reset layout
    }
    document.getElementById('attach-title').innerText = 'ATTACHMENT';
};

window.showAttachModpacks = async function() {
    const list = document.getElementById('attach-list-content');
    const view = document.getElementById('attach-list-view');
    const menu = document.getElementById('attach-menu-view');
    const footer = document.getElementById('attach-footer');
    const title = document.getElementById('attach-title');
    
    // Ensure styles for list view
    if(list) list.style.display = 'block';
    
    menu.style.display = 'none';
    view.style.display = 'block';
    footer.style.display = 'block';
    title.innerText = 'SELECT MODPACK';
    list.innerHTML = '';
    
    // Combine Official and User Instances
    const allInstances = [...OFFICIAL_INSTANCES, ...LibraryManager.instances];
    
    if (allInstances.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No modpacks found.</div>';
        return;
    }

    allInstances.forEach(inst => {
        const item = document.createElement('div');
        item.className = 'attach-item';
        item.innerHTML = `
            <img src="${inst.icon || 'assets/logo.png'}" style="width:32px; height:32px; object-fit:contain;">
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:12px;">${inst.name}</div>
                <div style="font-size:10px; color:#666;">${inst.version} • ${inst.loader || 'Vanilla'}</div>
            </div>
            <i class="fas fa-paper-plane" style="color:#888;"></i>
        `;
        item.onclick = async () => {
             toggleAttachPopup(false);
             
             // Gather Info
             let modCount = '?';
             try {
                // Determine path for content fetch
                const pathToCheck = inst.folder || inst.path; 
                // We use a lightweight check if available, else standard
                const content = await window.electron.getInstanceContent(pathToCheck);
                if(content && content.mods) modCount = content.mods.length;
             } catch(e) { console.error("Share stats error", e); }

             const dateStr = new Date().toLocaleDateString();
             const author = (typeof currentUser !== 'undefined') ? currentUser.username : 'Unknown';
             
             // Create Payload
             const payload = {
                 n: inst.name,
                 v: inst.version,
                 l: inst.loader,
                 a: author,
                 d: dateStr,
                 c: modCount,
                 i: inst.icon || 'assets/logo.png'
             };
             
             // Encode
             const json = JSON.stringify(payload);
             const safeJson = btoa(unescape(encodeURIComponent(json))); // Base64 safe
             
             const msg = `[MP_CARD:${safeJson}]`;
             const inp = document.getElementById('soc-input-text');
             if(inp) {
                 inp.value = msg;
                 inp.focus();
             }
        };
        list.appendChild(item);
    });
};

window.showAttachScreenshots = async function() {
    const list = document.getElementById('attach-list-content');
    const view = document.getElementById('attach-list-view');
    const menu = document.getElementById('attach-menu-view');
    const footer = document.getElementById('attach-footer');
    const title = document.getElementById('attach-title');
    const loader = document.getElementById('attach-list-loader');

    menu.style.display = 'none';
    view.style.display = 'block';
    footer.style.display = 'block';
    title.innerText = 'SELECT SCREENSHOT';
    list.innerHTML = '';
    list.style.display = 'none'; // Hide while loading
    if(loader) loader.style.display = 'block';
    
    try {
        const allInstances = [...OFFICIAL_INSTANCES, ...LibraryManager.instances];
        const allScreenshots = [];

        // Concurrently fetch screenshots from all instances
        await Promise.all(allInstances.map(async (inst) => {
             const folder = inst.folder || inst.path || inst.id;
             if(!folder) return;
             try {
                // Returns array of {name, data} where data is Base64
                const shots = await window.electron.getScreenshots(folder);
                if (shots && Array.isArray(shots)) {
                    shots.forEach(s => {
                        allScreenshots.push({
                            name: s.name, 
                            data: s.data, 
                            instanceName: inst.name
                        });
                    });
                }
             } catch(e) { 
                 console.warn("Error fetching screenshots for " + inst.name, e); 
             }
        }));
        
        if (loader) loader.style.display = 'none';
        list.style.display = 'grid'; // Grid layout for images

        if (allScreenshots.length === 0) {
            list.style.display = 'block';
            list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No screenshots found across all instances.</div>';
            return;
        }

        // Display
        allScreenshots.forEach(shot => {
             const item = document.createElement('div');
             item.className = 'attach-item';
             item.style.flexDirection = 'column'; // Vertical layout for images
             item.style.alignItems = 'flex-start';
             item.style.gap = '5px';
             item.style.height = 'auto';
             
             item.innerHTML = `
                 <div style="width:100%; aspect-ratio:16/9; background:#000; border-radius:4px; overflow:hidden;">
                     <img src="${shot.data}" style="width:100%; height:100%; object-fit:cover;">
                 </div>
                 <div style="width:100%; overflow:hidden;">
                     <div style="font-weight:bold; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shot.name}</div>
                     <div style="font-size:10px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shot.instanceName}</div>
                 </div>
             `;
             
             item.onclick = () => {
                 // For now, assume we just share the name. 
                 // If we had upload, we would upload here.
                 const msg = `[Shared Screenshot: ${shot.name} from ${shot.instanceName}]`;
                 const inp = document.getElementById('soc-input-text');
                 if(inp) {
                     inp.value = msg;
                     inp.focus();
                 }
                 toggleAttachPopup(false);
             };
             
             list.appendChild(item);
        });

    } catch(e) {
        if(loader) loader.style.display = 'none';
        list.style.display = 'block';
        list.innerHTML = `<div style="padding:20px; color:red;">Error: ${e.message}</div>`;
    }
};

window.sendChatMessage = async function() {
    const input = document.getElementById('soc-input-text');
    if(!input || !currentChatFriendId || !input.value.trim()) return;
    const msg = input.value.trim();
    input.value = '';
    try {
        const res = await window.electron.sendMessage(currentChatFriendId, msg);
        if(res.success) {
            const friendName = document.getElementById('soc-header-name').innerText;
            const friendAvatar = document.getElementById('soc-header-pic').src;
            loadChatMessages(currentChatFriendId, friendName, friendAvatar);
        }
    } catch(err) { console.error(err); }
};

// Init Friends on Load
document.addEventListener('DOMContentLoaded', () => {
    if(window.electron && window.electron.getFriends) {
        window.electron.getFriends().catch(e => console.log('Friends init error', e));
    }
});


/* === CUSTOMIZATION INITIALIZATION === */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Theme Manager
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
        // Load saved theme or default
        const savedTheme = localStorage.getItem('hexa_theme') || 'light';
        themeSelector.value = savedTheme;
        
        // Remove old theme classes first
        document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-pink');
        if(savedTheme !== 'light') {
            document.documentElement.classList.add('theme-' + savedTheme);
        }

        themeSelector.addEventListener('change', (e) => {
            const val = e.target.value;
            localStorage.setItem('hexa_theme', val);
            
            document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-pink');
            if(val !== 'light') {
                document.documentElement.classList.add('theme-' + val);
            }
        });
    }

    // 2. External Links Handler
    // Intercept all link clicks and open in default browser
    document.body.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href && link.href.startsWith('http')) {
            e.preventDefault();
            if (window.electron && window.electron.openExternal) {
                window.electron.openExternal(link.href);
            } else {
                // Fallback (might still open in electron window if not handled in main)
                window.open(link.href, '_blank');
            }
        }
    });

    // 3. Button Helper for External Links (data-href)
    document.querySelectorAll('[data-href]').forEach(btn => {
        btn.addEventListener('click', () => {
            const url = btn.getAttribute('data-href');
            if (url && window.electron && window.electron.openExternal) {
                window.electron.openExternal(url);
            }
        });
    });
});

