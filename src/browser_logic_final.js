
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
        limit: 20
    },
    
    init() {
        console.log("Initializing ContentBrowser...");
        this.bindEvents();
        setTimeout(() => this.search(), 100); // Initial Search
        
        // Setup Instance Selector Modal
        const closeSel = document.getElementById('close-select-inst-btn');
        const modal = document.getElementById('select-instance-modal');
        if(closeSel && modal) {
            closeSel.onclick = () => modal.style.display = 'none';
        }
    },

    bindEvents() {
        const searchInput = document.getElementById('browser-search');
        let timeout = null;
        if(searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                this.state.query = e.target.value;
                this.state.offset = 0; 
                timeout = setTimeout(() => this.search(), 500);
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
        
        const closeBtn = document.getElementById('close-browser-btn'); // For fixed overlay
        const backBtn = document.getElementById('back-to-lib'); // Legacy support
        
        const closeHandler = () => {
             const tab = document.getElementById('browser-tab');
             if(tab) tab.style.display = 'none';
        };

        if(closeBtn) closeBtn.addEventListener('click', closeHandler);
        if(backBtn) backBtn.addEventListener('click', closeHandler);
        
        const searchBtn = document.getElementById('do-search-btn');
        if(searchBtn) {
           searchBtn.addEventListener('click', () => this.search());
        }
        
        // Open Browser Trigger (e.g. from Library)
        const browseBtn = document.getElementById('btn-browse-repo');
        if(browseBtn) {
             browseBtn.addEventListener('click', () => {
                 const tab = document.getElementById('browser-tab');
                 if(tab) {
                     tab.style.display = 'flex';
                     // Force sidebar layout styles if missing
                     tab.style.position = 'fixed';
                     tab.style.top = '0';
                     tab.style.left = '0';
                     tab.style.width = '100vw';
                     tab.style.height = '100vh';
                     tab.style.backgroundColor = 'var(--bg-color)';
                     tab.style.zIndex = '5000';
                     tab.style.flexDirection = 'column';
                 }
             });
        }
    },

    triggerInstall(project) {
        if(this.state.type === 'modpack') {
            const name = prompt("Name your new instance:", project.title);
            if(name) {
                alert(`Installing Modpack [${name}] is not yet implemented in backend.`);
            }
        } else {
            // Mod / ResourcePack / Shader -> Add to existing instance
            const modal = document.getElementById('select-instance-modal');
            const list = document.getElementById('instance-selection-list');
            if(modal && list) {
                list.innerHTML = '';
                // Hardcoded instances (as we don't have a dynamic list API yet visible)
                const instances = [
                    { id: 'base', name: 'HG S1', version: '1.20.1', loader: 'fabric' },
                    { id: 'atm10', name: 'ATM 10', version: '1.21.1', loader: 'neoforge' },
                    { id: 'enhanced', name: 'Enhanced', version: '1.21.1', loader: 'fabric' }
                ];
                
                instances.forEach(inst => {
                    const item = document.createElement('div');
                    item.className = 'filter-link'; // Reuse style
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
        // Ensure List Layout
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.gap = '12px';
        grid.style.padding = '10px';

        if(loader) loader.style.display = 'block';
        
        try {
            const facets = [];
            // ... (facets logic remains)
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

            // Using Modrinth Search API
            const res = await fetch(`https://api.modrinth.com/v2/search?${params}`);
            const data = await res.json();
            
            if(loader) loader.style.display = 'none';
            
            if(data.hits && data.hits.length > 0) {
                data.hits.forEach(hit => {
                    const card = document.createElement('div');
                    card.className = 'content-card';
                    // Horizontal Layout Style
                    card.style.cssText = `
                        display: flex; 
                        gap: 15px; 
                        padding: 12px; 
                        border: 1px solid var(--border-color); 
                        border-radius: 8px; 
                        background: var(--card-bg); 
                        align-items: center;
                        transition: transform 0.2s, box-shadow 0.2s;
                        cursor: default;
                    `;
                    
                    // Hover effect
                    card.onmouseenter = () => { card.style.transform = 'translateY(-2px)'; card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; };
                    card.onmouseleave = () => { card.style.transform = 'none'; card.style.boxShadow = 'none'; };

                    const icon = hit.icon_url || 'https://via.placeholder.com/80';
                    const dateStr = new Date(hit.date_modified).toLocaleDateString();
                    const downloads = hit.downloads ? (hit.downloads / 1000).toFixed(1) + 'k' : '0';
                    
                    card.innerHTML = `
                        <!-- Logo -->
                        <div style="flex-shrink: 0; width: 80px; height: 80px; background: #f8f8f8; border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                             <img src="${icon}" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                        
                        <!-- Info -->
                        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px;">
                            <div style="display: flex; align-items: center; justify-content: space-between;">
                                <h4 style="margin: 0; font-size: 16px; font-weight: 700; color: #222;">${hit.title}</h4>
                            </div>
                            
                            <p style="margin: 0; font-size: 13px; color: #555; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; max-width: 90%;">
                               ${hit.description || 'No description available.'}
                            </p>
                            
                            <div style="display: flex; gap: 15px; font-size: 11px; color: #888; font-weight: 600; margin-top: 2px;">
                                <span><i class="fas fa-user"></i> ${hit.author}</span>
                                <span><i class="fas fa-calendar-alt"></i> ${dateStr}</span>
                                <span><i class="fas fa-download"></i> ${downloads}</span>
                            </div>
                        </div>
                        
                        <!-- Action -->
                        <div style="flex-shrink: 0; padding-left: 10px; border-left: 1px solid #eee;">
                             <button class="btn-install" style="
                                 padding: 8px 20px; 
                                 background: #000; 
                                 color: #fff; 
                                 border: none; 
                                 border-radius: 4px; 
                                 cursor: pointer; 
                                 font-weight: 700; 
                                 font-size: 12px; 
                                 letter-spacing: 0.5px;
                                 text-transform: uppercase;
                             ">INSTALL</button>
                        </div>
                    `;
                    
                    card.querySelector('.btn-install').addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.triggerInstall(hit);
                    });
                    
                    grid.appendChild(card);
                });
            } else {
                grid.innerHTML = '<div style="padding:40px; text-align:center; color:#888;">No results found.</div>';
            }

        } catch(e) {
            console.error(e);
            if(loader) loader.innerHTML = `<div style="color:red; padding:20px;">Error: ${e.message}</div>`;
        }
    }
};

ContentBrowser.init();
