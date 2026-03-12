if (options.loader && typeof options.loader === 'string') {
        const lower = options.loader.toLowerCase();
        
        // --- NEOFORGE & FORGE HANDLING (Robust Manual Patch) ---
        if (lower.includes('forge')) {
            const isNeo = lower.includes('neo');
            const loaderName = isNeo ? 'neoforge' : 'forge';
            const mcVer = options.version.number || (typeof options.version === 'string' ? options.version : "1.21.1");
            
            console.log(`[Hexa] Preparing ${loaderName} for ${mcVer}...`);

            // --- 0. ENSURE VANILLA JSON EXISTS (Required for inheritance) ---
            try {
                const vanillaVerDir = path.join(gamePath, 'versions', mcVer);
                const vanillaJsonPath = path.join(vanillaVerDir, `${mcVer}.json`);
                
                if (!await fs.pathExists(vanillaJsonPath)) {
                    console.log(`[Hexa] Vanilla meta missing for ${mcVer}, fetching...`);
                    const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                    const manifest = await manifestRes.json();
                    const vInfo = manifest.versions.find(v => v.id === mcVer);
                    if (vInfo) {
                        const vRes = await fetch(vInfo.url);
                        const vJson = await vRes.json();
                        await fs.ensureDir(vanillaVerDir);
                        await fs.writeJson(vanillaJsonPath, vJson, { spaces: 4 });
                    }
                }
            } catch (vErr) {
                console.warn("[Hexa] Vanilla JSON fetch warning (might exist):", vErr.message);
            }

            // --- 1. DETERMINE & DOWLOAD INSTALLER ---
            let downloadUrl = "";
            let installerPath = "";
            
            // Try to find specific version or latest
            // Folder structure: .hexa/loaders/neoforge-1.21.1-21.1.42-installer.jar
            
            if (isNeo) {
                // Hardcoded Safe Versions (Automatic lookup is brittle)
                let neoVer = "";
                if (mcVer === '1.21.1') neoVer = "21.1.42"; // Stable
                else if (mcVer === '1.20.4') neoVer = "20.4.237";
                else if (mcVer === '1.20.1') neoVer = "47.1.106"; // Actually Forge for 1.20.1 usually preferred, but Neo exists? No Neo started 1.20.2+ effectively split. 
                // Wait, NeoForge 1.20.1 is technically Forge 47.1.3+.
                
                // If we don't have a map, try to fetch latest from maven
                if (!neoVer) {
                   try {
                       const metaUrl = `https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge`;
                       const res = await fetch(metaUrl);
                       if(res.ok) {
                           const data = await res.json();
                           // Simple filter: versions starting with minor mc ver (e.g. "21" for 1.21)
                           const prefix = mcVer.split('.')[1]; 
                           const candidates = data.versions.filter(v => v.startsWith(prefix));
                           if (candidates.length > 0) neoVer = candidates[candidates.length - 1];
                       }
                   } catch(e) {}
                }
                
                if (!neoVer) neoVer = "21.1.42"; // Fallback to avoid crash

                downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVer}/neoforge-${neoVer}-installer.jar`;
                installerPath = path.join(loadersDir, `neoforge-${mcVer}-${neoVer}-installer.jar`);
            } 
            else {
                // Forge
                let forgeVer = "";
                 // Simple map for stability
                if (mcVer === '1.20.1') forgeVer = "47.2.0";
                else if (mcVer === '1.19.2') forgeVer = "43.3.0";
                else if (mcVer === '1.18.2') forgeVer = "40.2.0";
                else if (mcVer === '1.16.5') forgeVer = "36.2.34";
                else if (mcVer === '1.12.2') forgeVer = "14.23.5.2860";
                else if (mcVer === '1.8.9') forgeVer = "11.15.1.2318-1.8.9";

                if (!forgeVer) {
                    // Try determining via promotions
                    try {
                         const promoRes = await fetch('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
                         const promos = await promoRes.json();
                         forgeVer = promos.promos[`${mcVer}-recommended`] || promos.promos[`${mcVer}-latest`];
                    } catch(e){}
                }
                
                if (!forgeVer) throw new Error(`Could not determine Forge version for ${mcVer}`);

                downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVer}-${forgeVer}/forge-${mcVer}-${forgeVer}-installer.jar`;
                // 1.8.9 URL structure might differ, but recent forge follows this.
                // If 1.8.9 fails, it might need the old format? 
                // Old: http://files.minecraftforge.net/maven/net/minecraftforge/forge/1.8.9-11.15.1.1722/forge-1.8.9-11.15.1.1722-installer.jar
                // MCLC checks for this usually.
                
                installerPath = path.join(loadersDir, `forge-${mcVer}-${forgeVer}-installer.jar`);
            }

            // Download
            if (!await fs.pathExists(installerPath)) {
                console.log(`[Hexa] Downloading installer from ${downloadUrl}`);
                mainWindow.webContents.send('install-progress', { 
                    instance: loaderName, percent: 10, msg: `Downloading ${loaderName}...` 
                });
                const dl = await fetch(downloadUrl);
                if (!dl.ok) throw new Error(`Failed to download ${loaderName}: ${dl.statusText}`);
                const dest = fs.createWriteStream(installerPath);
                await new Promise((resolve, reject) => {
                    dl.body.pipe(dest);
                    dl.body.on('error', reject);
                    dest.on('finish', resolve);
                });
            }

            // --- 2. INSTALL LOADER VIA INSTALLER (Standard Execution) ---
            try {
                const zip = new AdmZip(installerPath);
                const versionEntry = zip.getEntry('version.json');
                if (!versionEntry) throw new Error("version.json missing in installer");
                
                const versionJson = JSON.parse(zip.readAsText(versionEntry));
                const targetId = versionJson.id; // e.g. "neoforge-21.1.42"
                
                // Check if already installed
                const targetVersionFile = path.join(gamePath, 'versions', targetId, `${targetId}.json`);
                
                if (!await fs.pathExists(targetVersionFile)) {
                    console.log(`[Hexa] Installing ${targetId} via java -jar...`);
                    mainWindow.webContents.send('install-progress', { 
                        instance: loaderName, percent: 30, msg: `Installing ${loaderName} (this may take a while)...` 
                    });

                    // FIX: Ensure launcher_profiles.json exists so the installer doesn't bail
                    const profilesPath = path.join(gamePath, 'launcher_profiles.json');
                    if (!await fs.pathExists(profilesPath)) {
                        await fs.writeJson(profilesPath, { profiles: {} });
                    }

                    // Use the managed Java we resolved earlier (javaExec) to ensure compatibility
                    // e.g. NeoForge 1.21 needs Java 21. 
                    // ADDED: Capture stdout/stderr more aggressively and ignore legitimate exit codes if needed (though 0 is expected)
                    const installCmd = `"${javaExec}" -jar "${installerPath}" --installClient "${gamePath}"`;
                    console.log(`[Hexa] Running Installer: ${installCmd}`);
                    
                    await new Promise((resolve, reject) => {
                       exec(installCmd, (error, stdout, stderr) => {
                           console.log(`[Installer STDOUT]: ${stdout}`);
                           console.error(`[Installer STDERR]: ${stderr}`);

                           if (error) {
                               // verify if it really failed or just printed to stderr
                               // NeoForge installer normally returns 0 on success.
                               console.error(`Installer execution error: ${error.message}`);
                               reject(error);
                           } else {
                               resolve();
                           }
                       });
                    });
                    
                    // Verify success
                    if (!await fs.pathExists(targetVersionFile)) {
                        throw new Error("Installer finished but version.json not found.");
                    }
                } else {
                    console.log(`[Hexa] ${targetId} already installed.`);
                }

                // --- 3. CONFIGURE MCLC LAUNCH OPTS ---
                // Now we just tell MCLC to launch this version ID.
                
                // Read the installed JSON to ensure we have the correct ID and structure
                try {
                     const installedJson = await fs.readJson(targetVersionFile);
                     // MCLC expects 'custom' to be a string name of the version folder inside root/versions
                     options.version.custom = installedJson.id;
                     options.version.number = mcVer;
                     
                     // IMPORTANT: Update opts.version immediately to ensure it's captured
                     opts.version.number = mcVer;
                     opts.version.custom = installedJson.id;
                     
                     // Clean up any weird forge opts
                     delete opts.forge;
                     delete options.forge; // Also clean original options

                    console.log(`[Hexa] Loaded Native JSON for ${installedJson.id}`);
                } catch(e) {
                    console.error("Failed to read installed version JSON", e);
                    // Fallback to ID based launch
                    if (typeof options.version === 'string') {
                         options.version = { number: targetId, type: 'release'};
                    } else {
                         options.version.number = targetId;
                         options.version.custom = undefined; 
                    }
                }

                console.log(`[Hexa] Ready to launch Native ${targetId}`);

            } catch (installErr) {
                console.error("Native Installation failed:", installErr);
                throw installErr; // Stop launch, don't fallback to vanilla
            }

        } else if (lower.includes('fabric')) {
             let fabVer = options.fabricLoaderVersion;
             const mcVer = options.version.number || (typeof options.version === 'string' ? options.version : "1.21.1");
             
             if (!fabVer) {
                 try {
                     const fRes = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVer}`);
                     if (fRes.ok) {
                         const fData = await fRes.json();
                         if (fData && fData.length > 0) fabVer = fData[0].loader.version;
                     }
                 } catch(e) { console.error("Fabric meta fetch failed", e); }
             }
             if (!fabVer) fabVer = "0.16.9"; // safe modern default

             console.log(`[Hexa] Preparing manual Fabric JSON for ${mcVer} (loader: ${fabVer})`);
             
             try {
                // Ensure vanilla json exists first (like forge)
                const vanillaVerDir = path.join(gamePath, 'versions', mcVer);
                const vanillaJsonPath = path.join(vanillaVerDir, `${mcVer}.json`);
                if (!await fs.pathExists(vanillaJsonPath)) {
                    const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                    const manifest = await manifestRes.json();
                    const vInfo = manifest.versions.find(v => v.id === mcVer);
                    if (vInfo) {
                        const vRes = await fetch(vInfo.url);
                        const vJson = await vRes.json();
                        await fs.ensureDir(vanillaVerDir);
                        await fs.writeJson(vanillaJsonPath, vJson, { spaces: 4 });
                    }
                }

                if (await fs.pathExists(vanillaJsonPath)) {
                    const fUrl = `https://meta.fabricmc.net/v2/versions/loader/${mcVer}/${fabVer}/profile/json`;
                    const fRes = await fetch(fUrl);
                    if (!fRes.ok) throw new Error("Failed to download Fabric JSON");
                    const fJson = await fRes.json();
                    
                    const vanillaJson = await fs.readJson(vanillaJsonPath);
                    // Safe injection so MCLC downloads correct mappings
                    const versionId = `fabric-loader-${fabVer}-${mcVer}`;
                    fJson.id = versionId;
                    fJson.inheritsFrom = mcVer;
                    
                    // SAVE IT TO DISK so MCLC can find it
                    const customVerDir = path.join(gamePath, 'versions', versionId);
                    await fs.ensureDir(customVerDir);
                    await fs.writeJson(path.join(customVerDir, `${versionId}.json`), fJson, { spaces: 4 });
                    
                    // PASS THE STRING (version filename) to MCLC
                    opts.version.custom = versionId;
                    opts.version.number = mcVer;
                }
             } catch (e) {
                 console.error("Fabric prep failed", e);
             }
        } else if (lower.includes('quilt')) {
             let quiltVer = options.quiltLoaderVersion;
             const mcVer = options.version.number || (typeof options.version === 'string' ? options.version : "1.21.1");
             
             if (!quiltVer) {
                 try {
                     const qRes = await fetch(`https://meta.quiltmc.org/v3/versions/loader/${mcVer}`);
                     if (qRes.ok) {
                         const qData = await qRes.json();
                         if (qData && qData.length > 0) quiltVer = qData[0].loader.version;
                     }
                 } catch(e) { console.error("Quilt meta fetch failed", e); }
             }
             if (!quiltVer) quiltVer = "0.26.3"; 

             console.log(`[Hexa] Preparing manual Quilt JSON for ${mcVer} (loader: ${quiltVer})`);
             try {
                const vanillaVerDir = path.join(gamePath, 'versions', mcVer);
                const vanillaJsonPath = path.join(vanillaVerDir, `${mcVer}.json`);
                if (!await fs.pathExists(vanillaJsonPath)) {
                    const manifestRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
                    const manifest = await manifestRes.json();
                    const vInfo = manifest.versions.find(v => v.id === mcVer);
                    if (vInfo) {
                        const vRes = await fetch(vInfo.url);
                        const vJson = await vRes.json();
                        await fs.ensureDir(vanillaVerDir);
                        await fs.writeJson(vanillaJsonPath, vJson, { spaces: 4 });
                    }
                }

                if (await fs.pathExists(vanillaJsonPath)) {
                    const qUrl = `https://meta.quiltmc.org/v3/versions/loader/${mcVer}/${quiltVer}/profile/json`;
                    const qRes = await fetch(qUrl);
                    if (!qRes.ok) throw new Error("Failed to download Quilt JSON");
                    const qJson = await qRes.json();
                    
                    const versionId = `quilt-loader-${quiltVer}-${mcVer}`;
                    qJson.id = versionId;
                    qJson.inheritsFrom = mcVer;
                    
                    // SAVE IT TO DISK so MCLC can find it
                    const customVerDir = path.join(gamePath, 'versions', versionId);
                    await fs.ensureDir(customVerDir);
                    await fs.writeJson(path.join(customVerDir, `${versionId}.json`), qJson, { spaces: 4 });

                    // PASS THE STRING to MCLC
                    opts.version.custom = versionId;
                    opts.version.number = mcVer;
                }
             } catch (e) {
                 console.error("Quilt prep failed", e);
             }
        }
    }
    
    // Clean up MCLC native loader objects so they don't interfere with our manual setups
    if (opts.version && opts.version.custom) {
        delete opts.forge;
        delete options.forge;
        delete opts.fabric;
        delete options.fabric;
        delete opts.quilt;
        delete options.quilt;
    } else {
        // Fallback/Override from explicit options if provided natively
        if (options.forge) opts.forge = options.forge;
        if (options.fabric) opts.fabric = options.fabric;
    }

    