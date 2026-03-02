// Global Auth State
let currentUser = null;
let skinViewer = null;

// GLOBAL EVENT LISTENERS
if(window.electron) {
    window.electron.onGameExit((code) => {
        console.log("Game Exited with code", code);
        
        // 1. Reset Play Button if visible
        const playBtn = document.getElementById('inst-play-btn');
        if(playBtn) {
             playBtn.disabled = false;
             playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
             playBtn.style.background = ""; // Reset color
             
             if (playBtn._originalOnClick) {
                 playBtn.onclick = playBtn._originalOnClick;
                 playBtn._originalOnClick = null; // Clear reference
             } else {
                 // Even if we don't have _originalOnClick (maybe user refreshed view?),
                 // the button text is reset.
                 // Ideally we should reload the view or re-bind, but if the view wasn't closed,
                 // the original onclick might technically be lost if we didn't save it on the element?
                 // No, if we didn't save it, playBtn.onclick IS the stop handler.
                 // We need to be careful.
                 // If _originalOnClick is missing, it means either:
                 // A) We are in 'Play' state already (ignorable)
                 // B) We are in 'Stop' state but failed to save.
                 
                 // If the text was "STOP", and we don't have originalOnClick, we might have broken the button.
                 // But in our launch logic, we ALWAYS save it.
             }
        }
        
        // 2. Persistent Crash Notification
        if (code !== 0) {
             const container = document.getElementById('progress-container');
             if(container) {
                 const toast = document.createElement('div');
                 toast.className = 'progress-toast';
                 // Styling matches user request: "Persistent until clicked"
                 toast.style.cssText = "background: #d00; color: white; padding: 15px; border-radius: 8px; width: 300px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); pointer-events: auto; cursor: pointer; display: flex; align-items: center; gap: 10px; margin-top: 10px;";
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

// Initialize Skin Viewer
function initSkinViewer(retries = 5) {
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

        skinViewer = new skinview3d.SkinViewer({
            canvas: canvas,
            width: width,
            height: height,
            skin: "https://textures.minecraft.net/texture/b3fbd8d742942472d2427f794c489c4d943261a7a0364d9b4db7d47f0d01", // Default Steve
        });

        // Set camera
        skinViewer.camera.position.x = 20;
        skinViewer.camera.position.y = 10;
        skinViewer.camera.position.z = 50;
        skinViewer.zoom = 0.9;
        
        // Animation
        skinViewer.animation = new skinview3d.WalkingAnimation();
        skinViewer.animation.speed = 0.5;
        
        // Controls
        let control = skinview3d.createOrbitControls(skinViewer);
        control.enableRotate = true;
        control.enableZoom = false;
        control.enablePan = false;

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
        this.currentId = id;
        const inst = LibraryManager.instances.find(i => i.id === id) || OFFICIAL_INSTANCES.find(i => i.id === id);
        if (!inst) return;

        // Reset & Populate Form
        document.getElementById('inst-set-name').value = inst.name;
        document.getElementById('inst-set-loader').value = inst.loader ? inst.loader.toLowerCase() : 'vanilla';
        document.getElementById('inst-set-version').value = inst.version;
        
        // Java Logic
        const javaSelect = document.getElementById('inst-set-java');
        const javaPathInput = document.getElementById('inst-set-java-path');
        
        if (inst.javaVersion) {
            javaSelect.value = inst.javaVersion; 
        } else {
             javaSelect.value = 'auto';
        }

        if (inst.javaPath && inst.javaVersion === 'custom') {
            javaPathInput.value = inst.javaPath;
            javaPathInput.style.display = 'block';
        } else {
            javaPathInput.value = '';
            javaPathInput.style.display = 'none';
        }

        javaSelect.onchange = () => {
            if (javaSelect.value === 'custom') {
                javaPathInput.style.display = 'block';
            } else {
                javaPathInput.style.display = 'none';
            }
        };

        // RAM Logic
        const ramSlider = document.getElementById('inst-set-ram');
        const ramLabel = document.getElementById('inst-set-ram-val');
        
        // Parse "XG" or "XM" into MB
        let currentRam = 4096; // Default 4GB
        if (inst.memory) {
            if (inst.memory.endsWith('G')) currentRam = parseInt(inst.memory) * 1024;
            else if (inst.memory.endsWith('M')) currentRam = parseInt(inst.memory);
        }
        ramSlider.value = currentRam;
        ramLabel.innerText = (currentRam / 1024).toFixed(1) + " GB";

        ramSlider.oninput = () => {
            ramLabel.innerText = (ramSlider.value / 1024).toFixed(1) + " GB";
        };

        // Resolution
        if (inst.resolution) {
            document.getElementById('inst-set-width').value = inst.resolution.width;
            document.getElementById('inst-set-height').value = inst.resolution.height;
        } else {
            document.getElementById('inst-set-width').value = 1280;
            document.getElementById('inst-set-height').value = 720;
        }

        // JVM Args
        document.getElementById('inst-set-jvm').value = inst.jvmArgs || '';

        // Show Modal
        document.getElementById('instance-settings-modal').style.display = 'flex';
    },

    close() {
        document.getElementById('instance-settings-modal').style.display = 'none';
        this.currentId = null;
    },

    save() {
        if (!this.currentId) return;
        
        const inst = LibraryManager.instances.find(i => i.id === this.currentId);
        if (!inst) {
            alert("Official instances cannot be modified."); // Or handle overrides separately
            this.close();
            return;
        }

        // Gather Data
        inst.name = document.getElementById('inst-set-name').value;
        inst.javaVersion = document.getElementById('inst-set-java').value;
        if (inst.javaVersion === 'custom') {
            inst.javaPath = document.getElementById('inst-set-java-path').value;
        } else {
            delete inst.javaPath; // Clear if not custom
        }

        const ramMB = document.getElementById('inst-set-ram').value;
        inst.memory = Math.round(ramMB / 1024) + "G"; // Store as "4G" for MCLC compat

        inst.resolution = {
            width: parseInt(document.getElementById('inst-set-width').value),
            height: parseInt(document.getElementById('inst-set-height').value)
        };

        inst.jvmArgs = document.getElementById('inst-set-jvm').value;

        // Save & Reload
        LibraryManager.save();
        LibraryManager.render();
        this.close();
    }
};

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
                { id: 'def_1', name: 'Hexa Optimized', version: '1.21.1', loader: 'Fabric', icon: 'assets/logo_no_bc.png', status: 'Ready', folder: 'hexa_optimized' }
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
            const iconUrl = inst.icon || 'assets/logo_no_bc.png';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <img src="${iconUrl}" class="instance-icon" onerror="this.src='assets/logo_no_bc.png'">
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
                    <button class="mini-play-btn" style="border:none; font-size:12px; margin-left:5px; background:rgba(255,255,255,0.2);" onclick="event.stopPropagation(); InstanceSettings.open('${inst.id}')">⚙</button>
                    <button class="mini-play-btn" style="border:none; font-size:10px; margin-left:5px; background:rgba(255,0,0,0.4);" onclick="event.stopPropagation(); LibraryManager.delete('${inst.id}')">✕</button>
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

    async add(name, version, loader, icon, cloudSync) {
        const id = 'inst_' + Date.now();
        // folder name safe
        const folder = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_' + Date.now();
        
        try {
            // Wait for backend installation (Java, Loader, Folder creation)
            const result = await window.electron.createInstance({ 
                name, version, loader, folder, cloudSync 
            });
            
            if (!result.success) {
                console.error("Backend creation failed:", result.error);
                throw new Error(result.error); 
            }
        } catch (e) {
            console.error("Detailed creation error:", e);
            throw e; // Rethrow to update UI in modal
        }

        const newInst = {
            id: id,
            name: name,
            version: version,
            loader: loader,
            icon: icon,
            created: Date.now(),
            status: 'Ready',
            folder: folder,
            cloudSync: cloudSync || false
        };
        this.instances.push(newInst);
        this.save();
        this.render();
        console.log("Added Instance:", newInst);
        return newInst;
    },
    
    // ... delete and openDetails remain mostly same ...

    delete(id) {
        if(confirm("Delete this instance?")) {
            this.instances = this.instances.filter(i => i.id !== id);
            this.save();
            this.render();
        }
    },

    openDetails(inst) {
        const view = document.getElementById('instance-details-view');
        if(!view) return;
        
        // Push History State
        if (typeof NavSystem !== 'undefined') {
            NavSystem.pushState({ tab: 'library', type: 'instance-detail', instanceId: inst.id });
        }

        // Populate Header
        document.getElementById('inst-name-lg').innerText = inst.name;
        document.getElementById('inst-version-tag').innerText = inst.version;
        document.getElementById('inst-loader-tag').innerText = inst.loader;
        document.getElementById('inst-icon-lg').src = inst.icon || 'assets/logo_no_bc.png';
        
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
                alert("Launch failed: " + e.message);
                playBtn.disabled = false;
                playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
            }
        };
        
        // More Button (Open Folder)
        
        // More Button (Open Folder)
        const moreBtn = document.getElementById('inst-more-btn');
        if (moreBtn) {
            // Remove old listeners
            const newMoreBtn = moreBtn.cloneNode(true);
            moreBtn.parentNode.replaceChild(newMoreBtn, moreBtn);
            
            newMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Create or find Popover
                let popover = document.getElementById('more-popover');
                if (!popover) {
                    popover = document.createElement('div');
                    popover.id = 'more-popover';
                    popover.style.cssText = `
                        position: absolute; 
                        background: white; 
                        border-radius: 6px; 
                        box-shadow: 0 4px 15px rgba(0,0,0,0.1); 
                        padding: 5px; 
                        z-index: 5000;
                        display: none;
                        min-width: 150px;
                        border: 1px solid #eee;
                    `;
                    document.body.appendChild(popover);
                    
                    // Close on click out
                    window.addEventListener('click', (ev) => {
                        if(ev.target !== newMoreBtn && !popover.contains(ev.target)) {
                            popover.style.display = 'none';
                        }
                    });
                }
                
                // Populate options
                popover.innerHTML = `
                    <button class="pop-btn" id="pop-open-folder" style="display:flex; align-items:center; width:100%; text-align:left; padding:8px 12px; background:none; border:none; cursor:pointer; color:#333; font-size:13px; gap:8px;">
                        <i class="fas fa-folder-open" style="color:#666;"></i> Open Folder
                    </button>
                    <!-- Add more options here later -->
                `;
                
                // Position
                const rect = newMoreBtn.getBoundingClientRect();
                popover.style.top = (rect.bottom + 5) + 'px';
                popover.style.left = (rect.left - 100) + 'px'; // Shift left to align
                popover.style.display = 'block';
                
                // Action
                document.getElementById('pop-open-folder').onclick = async () => {
                    await window.electron.openFolder(inst.folder);
                    popover.style.display = 'none';
                };
            });
        }
        
        // Close Button
        const closeBtn = document.getElementById('inst-close-btn');
        if (closeBtn) closeBtn.onclick = () => {
             if (typeof NavSystem !== 'undefined') NavSystem.goBack();
             else view.style.display = 'none';
        };

        // Reset Tabs
        document.querySelectorAll('.inst-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.inst-tab-pane').forEach(p => p.style.display = 'none');
        
        // Default Tab
        document.querySelector('.inst-tab[data-target="inst-content"]').classList.add('active');
        document.getElementById('inst-content').style.display = 'block';
        
        // Load Screenshots Logic (Mock for now)
        this.loadScreenshots(inst);

        // Load Mods
        this.loadInstanceMods(inst);

        view.style.display = 'block';
    },

    async loadInstanceMods(inst) {
        const list = document.getElementById('inst-mods-list');
        list.innerHTML = '<div style="padding:40px; text-align:center; color:#999;"><i class="fas fa-spinner fa-spin"></i> Scanning mods...</div>';
        
        try {
            // Need the absolute path. Current 'inst' object might just have relative or partial path.
            // Assuming inst.path is available and correct. If not, this needs adjustment.
            // For now, let's assume inst object has { path: "C:/..." } or we construct it.
            // In a real app, InstanceManager would provide the full path.
            // Assuming: 'instances/' + inst.folder (from renderer context) or provided path.
            
            // NOTE: The 'inst' object passed from selectInstance usually comes from 'this.instances'.
            // Ensure 'inst.path' or 'inst.folder' communicates the location.
            // If inst only has a relative path, we need to know the root.
            // For this implementation, I will assume inst.path matches the filesystem path expected by main.js.
            let path = inst.path; 
            if(!path && inst.folder) path = inst.folder; // Fallback
            
            const mods = await window.electron.getInstanceMods(path);
            
            list.innerHTML = '';
            
            if(mods.length === 0) {
                list.innerHTML = '<div class="empty-state" style="padding: 30px; text-align: center; color: #999;">No mods found in folder.</div>';
                return;
            }
            
            mods.forEach(mod => {
                const row = document.createElement('div');
                row.className = 'mod-row';
                row.style.cssText = "display: flex; align-items: center; padding: 10px 20px; border-bottom: 1px solid #eee; gap: 15px;";
                
                const iconSrc = mod.icon || 'assets/logo_no_bc.png'; // Fallback icon
                
                row.innerHTML = `
                    <img src="${iconSrc}" style="width: 32px; height: 32px; border-radius: 4px; object-fit: contain; background: #f5f5f5;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; font-size: 13px; color: #333;">${mod.name}</div>
                        <div style="font-size: 11px; color: #888;">${mod.author}</div>
                    </div>
                    <div style="width: 100px; font-size: 12px; color: #666;">${mod.version}</div>
                    <div style="width: 120px; text-align: right;">
                        <button class="icon-onyl-btn" style="width: 28px; height: 28px; font-size: 12px; color: #d00;" title="Delete (Not Implemented)"><i class="fas fa-trash"></i></button>
                    </div>
                `;
                list.appendChild(row);
            });
            
        } catch(e) {
            console.error(e);
            list.innerHTML = '<div style="padding:20px; color:#d00;">Error loading mods.</div>';
        }
    },

    loadScreenshots(inst) {
        const grid = document.getElementById('inst-screenshots-grid');
        grid.innerHTML = '';
        
        // Check Cloud Sync preference
        const isCloud = inst.cloudSync ? '(Cloud Synced)' : '(Local Only)';
        
        // Mock Data - In real app, use fs.readdir on instance folder
        // For demonstration, we just show a message or empty state if no real screenshots
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.style.gridColumn = "1 / -1";
        empty.style.textAlign = "center";
        empty.style.padding = "40px";
        empty.style.color = "#999";
        empty.innerHTML = `
            <i class="fas fa-images" style="font-size: 30px; margin-bottom: 10px;"></i>
            <p>No screenshots found in instance folder.</p>
            <small>${isCloud}</small>
        `;
        grid.appendChild(empty);
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

    add(name, version, loader, icon, cloudSync = false) {
        const safeName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const newInst = {
            id: 'inst_' + Date.now(),
            name: name,
            version: version,
            loader: loader,
            icon: icon || 'assets/logo_no_bc.png',
            status: 'Ready',
            folder: safeName,
            cloudSync: cloudSync
        };
        this.instances.push(newInst);
        this.save();
        this.render();
        return newInst;
    },

    delete(id) {
        if(confirm('Delete this instance?')) {
            this.instances = this.instances.filter(i => i.id !== id);
            this.save();
            this.render();
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
            toast.style.cssText = "background: #222; color: white; padding: 15px; border-radius: 8px; width: 300px; box-shadow: 0 5px 15px rgba(0,0,0,0.5); pointer-events: auto; transition: opacity 0.5s;";
            toast.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span class="toast-title" style="font-weight:600; font-size:13px;">${title}</span>
                    <span class="toast-percent" style="font-size:12px; color:#aaa;">${progress}%</span>
                </div>
                <div style="width:100%; height:4px; background:#444; border-radius:2px; overflow:hidden;">
                    <div class="toast-bar" style="width:${progress < 0 ? 100 : progress}%; height:100%; background:${progress < 0 ? '#d00' : 'var(--primary-pink)'}; transition: width 0.3s;"></div>
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
                    alert('Error: Instance not found.');
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
                    alert("Launch failed: " + e.message);
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
            const verSelect = document.getElementById('inst-version');
            if(verSelect && verSelect.options.length <= 1) { // 1 because of default "Select Version"
                verSelect.innerHTML = '<option value="">Loading versions...</option>';
                try {
                    const resp = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                    const data = await resp.json();
                    
                    window.mcVersionsData = data.versions;
                    window.mcLatestRelease = data.latest && data.latest.release ? data.latest.release : null;

                    window.updateVersionsList = () => {
                        const select = document.getElementById('inst-version');
                        const loader = document.getElementById('inst-loader')?.value || 'vanilla';
                        const showAll = document.getElementById('inst-show-all-versions')?.checked || false;
                        
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

                    window.updateVersionsList();
                } catch (e) {
                    console.error('Failed to fetch versions', e);
                    verSelect.innerHTML = '<option value="1.21.1">1.21.1 (Offline Fallback)</option>';
                }
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
                const nameInput = document.getElementById('inst-name');
                const verifyInput = document.getElementById('inst-version');
                const loaderInput = document.getElementById('inst-loader');
                const cloudInput = document.getElementById('inst-cloud-screenshots');
                
                if(!nameInput || !verifyInput || !loaderInput) return;

                const name = nameInput.value;
                const ver = verifyInput.value; 
                const load = loaderInput.value;
                const cloudSync = cloudInput ? cloudInput.checked : false;

                const dbIconField = document.getElementById('inst-custom-icon-base64');
                const customIcon = dbIconField && dbIconField.value ? dbIconField.value : null;

                if(name) {
                    confirmBtn.disabled = true;
                    confirmBtn.innerText = "Processing...";

                    try {
                        await this.add(name, ver, load, customIcon, cloudSync);
                        closeModal();
                        // Reset input
                        nameInput.value = '';
                        if(typeof clearCustomIcon === 'function') clearCustomIcon();
                    } catch (e) {
                        alert("Failed to create instance: " + e.message);
                    } finally {
                        confirmBtn.disabled = false;
                        confirmBtn.innerText = "CONFIRM";
                    }
                } else {
                    alert('Name is required!');
                }
            });
        }
    }
};

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
        // Construct the PHP Bridge URL for the avatar head
        const headAvatar = `${API_BASE_URL}/php_bridge/skin_handler.php?action=get_head&username=${encodeURIComponent(currentUser.username)}&t=${Date.now()}`;
        
        // Construct the full skin URL (assuming it's directly accessible or via the existing API)
        // If they are saved to storage/hexa/skins/:
        const fullSkinUrl = `${API_BASE_URL}/storage/hexa/skins/${currentUser.username}.png?t=${Date.now()}`;

        // 3. Update Sidebar Avatar
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<img src="${headAvatar}" style="width: 100%; height: 100%; image-rendering: pixelated; border-radius: 4px;">`;
        }

        // 4. Update Wardrobe Preview
        const wardrobePreview = document.getElementById('wardrobe-preview');
        if (wardrobePreview) {
            wardrobePreview.src = headAvatar;
        }

        // 5. Update 3D Viewer (Full Skin)
        if (skinViewer) {
            skinViewer.loadSkin(fullSkinUrl);
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
            alert('Only PNG files are allowed.');
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
            // Use legacy endpoint for upload if not specified otherwise
            const response = await fetch(`${API_BASE_URL}/php_bridge/skin_handler.php`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                alert('Skin uploaded successfully!');
                refreshSkinDisplay();
            } else {
                alert('Upload failed: ' + (result.error || 'Unknown error'));
            }
        } catch (err) {
            console.error(err);
            alert('Network error while uploading skin.');
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
        
        // Always close volatile overlays first
        const instView = document.getElementById('instance-details-view');
        if(instView) instView.style.display = 'none';
        
        const gallery = document.getElementById('gallery-lightbox');
        if(gallery) gallery.style.display = 'none';

        if (state.type === 'root') {
            // Close overlays
            const detailView = document.getElementById('project-details-view');
            if(detailView) detailView.style.display = 'none';

            // Switch Tab
            const navBtn = document.querySelector(`.nav-item[data-tab="${state.tab}"]`);
            if (navBtn) navBtn.click();
        } 
        else if (state.type === 'browser-detail') {
            // Ensure we are on browser tab
            const navBtn = document.querySelector(`.nav-item[data-tab="content"]`);
            if (navBtn) navBtn.click();
            
            // Re-open details if we have data, otherwise might have to reload (complex)
            // For now, we assume ContentBrowser caches the object or we just hide/show
            // Since restoring exact object is hard without storage, we will rely on 
            // the view being just "open" or "closed".
            
            // Actually, simpler approach:
            // If going back to root -> hide detail view
            // If going forward to detail -> show detail view (if data persists)
            
            // Better: Store the 'hit' object in state if possible, or just handle view visibility
            if (state.hit) {
                ContentBrowser.openProjectDetails(state.hit, false); // false = don't push state
            }
        }
        else if (state.type === 'instance-detail') {
             // We need to re-open the Instance View
             // Since we don't store the full 'inst' object in history (to save mem), we might need to find it again
             // OR we just assume the DOM is still there if we haven't destroyed it.
             // For now, let's try to just show it if we have the ID, or look it up.
             
             // Simple fallback: If we saved the ID, we could fetch it.
             // But 'openDetails' requires the full object.
             // IMPROVEMENT: We should store vital info in state or look up from InstanceManager.
             
             // WORKAROUND: Just show the view. The view might still be populated with the *previous* instance
             // if the user visited multiple instances. 
             // Ideally: InstanceManager.getInstance(state.instanceId) -> openDetails
             
             // For now, show view:
             const instView = document.getElementById('instance-details-view');
             if(instView) instView.style.display = 'block';
        }

        this.updateUI();
        this.isNavigating = false;
    },

    updateUI() {
        document.getElementById('nav-back-btn').disabled = this.currentIndex <= 0;
        document.getElementById('nav-fwd-btn').disabled = this.currentIndex >= this.history.length - 1;
    }
};

// Navigation Logic (Tab Switching)
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Update UI Active State
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Scroll to Target Section
        const tabId = btn.getAttribute('data-tab');
        const tabEl = document.getElementById(`${tabId}-tab`);
        
        if (tabEl) {
            tabEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Push to History (only if triggered by user click, not by code)
        if (e.isTrusted || !NavSystem.isNavigating) {
             NavSystem.pushState({ tab: tabId, type: 'root' });
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
            alert("Launch Init Failure: " + result.error);
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
        // Fallback: If this.state.type is missing, try to infer from project.project_type
        const type = this.state.type || project.project_type;
        console.log("Install Type detected:", type);

        if(type === 'modpack') {
            const modal = document.getElementById('instance-name-modal');
            const input = document.getElementById('new-instance-name');
            const confirmBtn = document.getElementById('confirm-inst-name');
            const cancelBtn = document.getElementById('cancel-inst-name');

            if(modal && input) {
                input.value = project.title;
                modal.style.display = 'flex';
                
                // One-time event handlers
                const onConfirm = () => {
                   const name = input.value;
                   if(name) this.installModpack(project, name);
                   cleanup();
                };

                const onCancel = () => {
                    cleanup();
                };

                const cleanup = () => {
                    modal.style.display = 'none';
                    confirmBtn.removeEventListener('click', onConfirm);
                    cancelBtn.removeEventListener('click', onCancel);
                };

                confirmBtn.addEventListener('click', onConfirm);
                cancelBtn.addEventListener('click', onCancel);
            } else {
                // Fallback
                const name = prompt("Name your new instance:", project.title);
                if(name) this.installModpack(project, name);
            }
        } else {
            // Mod / ResourcePack / Shader -> Add to existing instance
            const modal = document.getElementById('select-instance-modal');
            const list = document.getElementById('instance-selection-list');
            if(modal && list) {
                list.innerHTML = '';
                // Use LibraryManager instances if available
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
                const icon = project.icon_url || 'assets/logo_no_bc.png';
                const newInst = LibraryManager.add(name, gameVer, loader, icon);
                
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
                        this.showToast(`Started installation of ${name}`, 0);
                        
                        window.electron.installModpack({
                            url: downloadUrl,
                            name: name,
                            folderName: newInst.folder
                        }).then(res => {
                            if(!res.success) {
                                console.error(res.error);
                                this.showToast(`Error: ${res.error}`, -1);
                                newInst.status = "Error";
                                LibraryManager.save();
                                LibraryManager.render();
                            }
                        });
                    } else {
                        alert("No download URL found for this version.");
                    }
                } else {
                    alert("Backend not connected (Dev Mode?). Installation simulated.");
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
            alert("Error during installation: " + e.message);
        } finally {
            if(btn && btn.tagName === 'BUTTON') btn.innerText = originalText;
        }
    },

    async installModToInstance(project, instance) {
        console.log(`Installing ${project.title} to ${instance.name}...`);
        try {
            const res = await fetch(`https://api.modrinth.com/v2/project/${project.slug}/version?game_versions=["${instance.version}"]&loaders=["${instance.loader}"]`);
            const versions = await res.json();
            
            if(versions.length > 0) {
                const best = versions[0]; // First is usually latest
                const file = best.files.find(f => f.primary) || best.files[0];
                
                if(confirm(`Install ${project.title} v${best.version_number} to ${instance.name}?`)) {
                     alert("Download started... (Backend implementation pending)");
                }
            } else {
                alert(`No compatible version found for ${instance.name} (${instance.version} / ${instance.loader})`);
            }
        } catch(e) {
            console.error(e);
            alert("Error fetching versions.");
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
                        card.style.cssText = "display: flex; flex-direction: column; background: #111; border-radius: 8px; border: 1px solid #222; overflow: hidden; cursor: pointer; transition: transform 0.2s, background 0.2s; height: 100%; min-height: 220px;";
                        card.onmouseover = () => { card.style.background = "#181818"; card.style.transform = "translateY(-2px)"; };
                        card.onmouseout = () => { card.style.background = "#111"; card.style.transform = "translateY(0)"; };

                        const icon = hit.icon_url || "https://via.placeholder.com/64";
                        const title = hit.title || hit.slug;
                        const author = hit.author || "Unknown";
                        const dls = hit.downloads ? (hit.downloads / 1000).toFixed(1) + 'k' : '0k';
                        const date = hit.date_modified ? new Date(hit.date_modified).toLocaleDateString() : '';

                        card.innerHTML = `
                            <div style="height: 100px; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden; position: relative;">
                                <img src="${icon}" style="width: 64px; height: 64px; border-radius: 12px; object-fit: contain; z-index: 2;">
                            </div>
                            <div style="padding: 15px; display: flex; flex-direction: column; flex: 1; justify-content: space-between;">
                                <div>
                                    <h4 style="margin: 0 0 5px 0; font-size: 16px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</h4>
                                    <span style="font-size: 12px; color: #888; display: block; margin-bottom: 10px;">By ${author}</span>
                                    <p style="margin: 0 0 15px 0; font-size: 12px; color: #aaa; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">${hit.description || ''}</p>
                                </div>
                                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #222;">
                                    <span style="font-size: 11px; color: #777;"><i class="fas fa-download"></i> ${dls}</span>
                                    <span style="font-size: 11px; color: #777;"><i class="fas fa-calendar-alt"></i> ${date}</span>
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
                      // alert("Installing version: " + ver.version_number);
                      
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
        const mem = localStorage.getItem('hexa-ram') || '4096';
        opts.memory = mem + 'M';
        
        const width = localStorage.getItem('hexa-width') || '1280';
        const height = localStorage.getItem('hexa-height') || '720';
        opts.resolution = { width: parseInt(width), height: parseInt(height) };
        
        const jvm = localStorage.getItem('hexa-jvm') || '';
        if (jvm.trim() !== '') opts.jvmArgs = jvm;
        
        const javaP = localStorage.getItem('hexa-java') || '';
        if (javaP.trim() !== '') opts.javaPath = javaP;
        
        console.log('Intercepted launch with global settings:', opts);
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

