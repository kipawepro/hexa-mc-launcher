window._gameRunning = false;
window._logBuffer   = [];   // persistent game log lines (cleared on new launch)
window._installerLog = [];  // persistent installer log lines

// ─── UNIFIED NOTIFICATION SYSTEM ────────────────────────────────────────────
// notify(type, title, message?, opts?)
//   type: 'success' | 'error' | 'warning' | 'info' | 'progress'
//   opts.id      — reuse existing toast by id (for progress updates)
//   opts.percent — 0-100 for progress bar, omit to hide bar
//   opts.duration — ms before auto-dismiss (default: 4000, 0 = sticky)
window.notify = function(type, title, message, opts = {}) {
    const container = document.getElementById('progress-container');
    if (!container) return null;

    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle', progress: 'fa-circle-notch fa-spin' };
    const icon = icons[type] || 'fa-bell';

    let toast = opts.id ? document.getElementById(opts.id) : null;

    if (!toast) {
        toast = document.createElement('div');
        toast.className = `hexa-toast toast-${type}`;
        if (opts.id) toast.id = opts.id;
        container.appendChild(toast);
        toast.onclick = () => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); };
    } else {
        toast.className = `hexa-toast toast-${type}`;
    }

    const pct = opts.percent ?? -1;

    // Build toast DOM safely (no innerHTML with user data to prevent XSS)
    let iconEl;
    if (opts.avatar) {
        iconEl = document.createElement('img');
        iconEl.src = opts.avatar;
        iconEl.className = 'toast-avatar';
        iconEl.onerror = () => { iconEl.src = 'assets/default.png'; };
    } else {
        iconEl = document.createElement('i');
        iconEl.className = `toast-icon fas ${icon}`;
    }

    const titleEl = document.createElement('div');
    titleEl.className = 'toast-title';
    titleEl.textContent = title;

    const bodyEl = document.createElement('div');
    bodyEl.className = 'toast-body';
    bodyEl.appendChild(titleEl);

    if (message) {
        const msgEl = document.createElement('div');
        msgEl.className = 'toast-msg';
        msgEl.textContent = message;
        bodyEl.appendChild(msgEl);
    }
    if (pct >= 0) {
        const track = document.createElement('div');
        track.className = 'toast-bar-track';
        const bar = document.createElement('div');
        bar.className = 'toast-bar';
        bar.style.width = `${pct}%`;
        track.appendChild(bar);
        bodyEl.appendChild(track);
    }

    toast.innerHTML = '';
    toast.appendChild(iconEl);
    toast.appendChild(bodyEl);

    // Auto-dismiss
    const duration = opts.duration !== undefined ? opts.duration : (type === 'progress' ? 0 : 4000);
    if (duration > 0) {
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
    return toast;
};

// HexaAlert → routes to notify() so all existing calls keep working
// 'Success'/'Succès' → success, 'Error'/'Erreur' → error, rest → info
window.HexaAlert = function(title, message) {
    const t = title.toLowerCase();
    const type = (t.includes('success') || t.includes('succ')) ? 'success'
               : (t.includes('error')   || t.includes('err'))  ? 'error'
               : (t.includes('warning') || t.includes('warn')) ? 'warning'
               : 'info';
    window.notify(type, title, message);
};

// ─── DEV CONSOLE HELPERS ────────────────────────────────────────────────────
// Usage in DevTools console:
//   hexa.ok("Skin chargé")
//   hexa.err("Connexion échouée", "Timeout après 5s")
//   hexa.warn("Java 17 détecté", "Java 21 recommandé")
//   hexa.info("NeoForge 26.1.2.55", "Installé avec succès")
//   hexa.load("Installation mod...", "sodium-0.6.jar")  — puis hexa.done() ou hexa.fail()
//   hexa.progress(42)   — met à jour le pourcentage du loading en cours
//   hexa.crash(1)       — simule un crash jeu (code de sortie)
//   hexa.help()         — affiche cette liste
window.hexa = {
    _loadId: null,

    ok:       (title, msg)  => window.notify('success',  title, msg || null),
    err:      (title, msg)  => window.notify('error',    title, msg || null, { duration: 0 }),
    warn:     (title, msg)  => window.notify('warning',  title, msg || null),
    info:     (title, msg)  => window.notify('info',     title, msg || null),

    load(title, msg) {
        this._loadId = 'dev-load-' + Date.now();
        window.notify('progress', title, msg || null, { id: this._loadId, percent: 0, duration: 0 });
        return this;
    },
    progress(pct) {
        if (!this._loadId) { console.warn('hexa: pas de loading en cours, lance hexa.load() d\'abord'); return; }
        window.notify('progress', document.getElementById(this._loadId)?.querySelector('.toast-title')?.textContent || 'Loading...', `${pct}%`, { id: this._loadId, percent: pct, duration: 0 });
        return this;
    },
    done(msg) {
        if (!this._loadId) return;
        window.notify('success', 'Done', msg || null, { id: this._loadId, duration: 3000 });
        this._loadId = null;
    },
    fail(msg) {
        if (!this._loadId) return;
        window.notify('error', 'Failed', msg || null, { id: this._loadId, duration: 0 });
        this._loadId = null;
    },

    crash(code = 1) {
        window._gameRunning = false;
        const playBtn = document.querySelector('.inst-page[style*="display: block"] [data-ref="inst-play-btn"]')
                     || document.querySelector('.inst-page [data-ref="inst-play-btn"]');
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.classList.remove('state-stop', 'state-launching');
            playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
        }
        window.notify('error', 'GAME CRASHED', `Exit code: ${code} — click to close`, { duration: 0 });
        console.log(`[hexa.crash] Simulated game exit with code ${code}`);
    },

    // ── LOG COMMANDS ────────────────────────────────────────────────────────
    logs(n) {
        const buf = window._logBuffer;
        if (!buf.length) { console.log('%c[hexa.logs] Aucun log en mémoire (lancer une partie d\'abord)', 'color:#888'); return; }
        const lines = n ? buf.slice(-n) : buf;
        console.log(`%c── Game Logs (${lines.length}/${buf.length} lignes) ──`, 'color:#DA0037; font-weight:bold');
        lines.forEach(l => {
            const style = (l.includes('ERROR') || l.includes('Exception') || l.includes('Caused by'))
                ? 'color:#ff5555' : l.includes('WARN') ? 'color:#ffaa00' : 'color:#ccc';
            console.log(`%c${l}`, style);
        });
    },

    errors() {
        const errs = window._logBuffer.filter(l =>
            l.includes('ERROR') || l.includes('Exception') || l.includes('Caused by') ||
            l.includes('Crash Report') || l.trim().startsWith('at ')
        );
        if (!errs.length) { console.log('%c[hexa.errors] Aucune erreur trouvée dans les logs', 'color:#2ecc71'); return; }
        console.log(`%c── Errors / Exceptions (${errs.length} lines) ──`, 'color:#ff5555; font-weight:bold');
        errs.forEach(l => console.log(`%c${l}`, 'color:#ff5555'));
    },

    last(n = 50) { this.logs(n); },

    install() {
        const buf = window._installerLog;
        if (!buf.length) { console.log('%c[hexa.install] Aucun log d\'installateur en mémoire', 'color:#888'); return; }
        console.log(`%c── Installer Logs (${buf.length} lignes) ──`, 'color:#DA0037; font-weight:bold');
        buf.forEach(l => console.log(`%c${l}`, 'color:#aaddff'));
    },

    copy(which = 'game') {
        const buf = which === 'install' ? window._installerLog : window._logBuffer;
        if (!buf.length) { console.warn('[hexa.copy] Buffer vide'); return; }
        const text = buf.join('\n');
        navigator.clipboard.writeText(text).then(
            () => console.log(`%c[hexa.copy] ${buf.length} lignes copiées dans le presse-papiers`, 'color:#2ecc71'),
            () => console.warn('[hexa.copy] Échec copie — essaie hexa.save()')
        );
    },

    save(which = 'game') {
        const buf = which === 'install' ? window._installerLog : window._logBuffer;
        if (!buf.length) { console.warn('[hexa.save] Buffer vide'); return; }
        const text = buf.join('\n');
        const name = which === 'install'
            ? `hexa-installer-${Date.now()}.log`
            : `hexa-game-${Date.now()}.log`;
        const blob = new Blob([text], { type: 'text/plain' });
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
        a.click();
        console.log(`%c[hexa.save] Fichier téléchargé : ${name}`, 'color:#2ecc71');
    },

    clear(which = 'game') {
        if (which === 'install') {
            window._installerLog = [];
            console.log('%c[hexa.clear] Installer log vidé', 'color:#888');
        } else {
            window._logBuffer = [];
            const activePage = document.querySelector('.inst-page[style*="display: block"]')
                            || document.querySelector('.inst-page:not([style*="display: none"])');
            const c = activePage?.querySelector('[data-ref="inst-logs-container"]');
            if (c) c.innerHTML = '';
            console.log('%c[hexa.clear] Game log vidé (buffer + DOM)', 'color:#888');
        }
    },

    help() {
        console.log(`%chexa — Hexa Launcher DevTools
%c
  ── NOTIFICATIONS ─────────────────────────────────────────────
  hexa.ok("titre", "msg")        → toast vert
  hexa.err("titre", "msg")       → toast rouge (sticky)
  hexa.warn("titre", "msg")      → toast orange
  hexa.info("titre", "msg")      → toast bleu
  hexa.load("titre", "msg")      → lance un toast de chargement
  hexa.progress(42)              → met à jour le % (0-100)
  hexa.done("msg")               → termine avec succès
  hexa.fail("msg")               → termine en erreur
  hexa.crash(code)               → simule crash jeu + reset bouton PLAY

  ── LOGS ──────────────────────────────────────────────────────
  hexa.logs()                    → affiche tous les logs du jeu
  hexa.logs(100)                 → affiche les 100 dernières lignes
  hexa.last(50)                  → alias → logs(50)
  hexa.errors()                  → filtre erreurs / exceptions
  hexa.install()                 → logs de l'installateur
  hexa.copy()                    → copie game logs → presse-papiers
  hexa.copy("install")           → copie installer logs
  hexa.save()                    → télécharge game logs (.log)
  hexa.save("install")           → télécharge installer logs
  hexa.clear()                   → vide game log (buffer + DOM)
  hexa.clear("install")          → vide installer log buffer

  hexa.help()                    → cette aide
`,
        'font-weight:bold; font-size:14px; color:#DA0037;',
        'color:#aaa; font-size:12px;');
    },
};

// Global Auth State
let currentUser = null;
let profileData = null; // populated by loadProfileSettings()
let skinViewer = null;
let roleColorsCache = null;
let gcMyAvatarDataUrl = null; // cached head avatar data-URL for instant optimistic UI
const _userRoleCache = {}; // username.toLowerCase() → role, populated at login
const _mySanctions = { mute: false, restricted: false, ban: false }; // active sanctions for current user

// Global default Steve skin for fallback (used in wardrobe/carousel and elsewhere)
const b64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAFVBMVEUAAAA7OztBQUGEhoOVl5TIyMjOzs4e8R79AAAAAXRSTlMAQObYZgAAAM9JREFUSMftleENhCAMhZnBDXQFei7QhgUuuMAh+49wVAT0pBqT84eJj9hE88mjpq1KBdEsJQm1Br7uDeymST8StxdtbgEcpqlU18XHxhnng9JrGWgbnDY2n96N1g6TMSBsAa3rQLYgqll0s4gYCDGcZHXgtokLgS1C9N6xQTbZANaKwPtVA9IZEDgDBG+trwLjwECM5wAEIr7ZAeK6EEif1S90OA4ePSpNLJZKGgOr1j8FHFiUOSEUbOnyRcn/Fyhz4jIgzYkdYL0uAKT/xhcR3cKTnTiPTAAAAABJRU5ErkJggg==';

// GLOBAL EVENT LISTENERS
// ── Live playtime ticker ──────────────────────────────────────────────────────
const _playtimeTicker = (() => {
    let _ticker      = null;
    let _sessionStart = null;
    let _baseInst    = 0;   // instance playtime at game-start (from server)
    let _baseGlobal  = 0;   // global total_playtime at game-start (from server)
    let _folder      = null;
    let _lastInstMins = 0;  // last computed value — never overwrite with 0
    let _lastGlobalMins = 0;

    function _fmtMins(m) {
        if (m <= 0) return '0m';
        const h = Math.floor(m / 60), r = m % 60;
        return h > 0 ? (r > 0 ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
    }

    function _applyInst(mins) {
        if (mins <= 0) return; // never blank out a value that was showing
        _lastInstMins = mins;
        const fmt = `<i class="far fa-clock"></i> ${_fmtMins(mins)}`;
        const activePage = document.querySelector('.inst-page[style*="display: block"]')
                        || document.querySelector('.inst-page:not([style*="display: none"])');
        const tag = activePage?.querySelector('[data-ref="inst-time-tag"]');
        if (tag) tag.innerHTML = fmt;
        if (_folder) {
            document.querySelectorAll(`.inst-card-playtime[data-folder="${CSS.escape(_folder)}"]`).forEach(el => {
                el.innerHTML = fmt;
            });
        }
    }

    function _applyGlobal(mins) {
        if (mins <= 0) return;
        _lastGlobalMins = mins;
        const statEl = document.getElementById('prof-stat-playtime');
        if (statEl) statEl.textContent = _fmtMins(mins);
    }

    function _tick() {
        const sessionMins = Math.floor((Date.now() - _sessionStart) / 60000);
        _applyInst(_baseInst + sessionMins);
        _applyGlobal(_baseGlobal + sessionMins);
    }

    return {
        start({ instanceFolder, baseMinutes, globalBaseMinutes }) {
            _folder       = instanceFolder || null;
            _baseInst     = baseMinutes || 0;
            _baseGlobal   = globalBaseMinutes || 0;
            _sessionStart = Date.now();
            clearInterval(_ticker);
            _tick(); // immediate update so display isn't stale for first minute
            _ticker = setInterval(_tick, 60000);
        },
        stop() {
            clearInterval(_ticker);
            _ticker = null;
            // do NOT reset display — keep last value until server confirms
        },
        // Called by server refresh: only update if new value > last shown
        syncFromServer(folder, instMins, globalMins) {
            if (folder === _folder) {
                if (instMins > 0) _applyInst(instMins);
                else _applyInst(_lastInstMins); // server returned 0? keep what we had
            }
            if (globalMins > 0) _applyGlobal(globalMins);
            else _applyGlobal(_lastGlobalMins);
        },
    };
})();

/* ── SCREENSHOT LIGHTBOX ─────────────────────────────────────────── */
const _ssLightbox = (() => {
    let _shots = [];       // all shots for current instance
    let _idx   = 0;        // current index
    let _inst  = null;
    let _baseImage = null; // HTMLImageElement of current shot (unmodified)
    let _rot = 0;          // rotation in 90° steps
    let _flipH = false;
    let _flipV = false;
    let _preset = 'none';

    // Slider ids → CSS filter builders
    const SLIDERS = ['brightness','contrast','saturation'];
    // Extra params handled via canvas compositing
    const EXTRA   = ['exposure','vibrance','warmth','vignette','sharpen'];

    function _el(id) { return document.getElementById(id); }

    // ── Preset definitions ──
    const PRESETS = {
        none:      { brightness:100, contrast:100, saturation:100, exposure:0, vibrance:0, warmth:0, vignette:0, sharpen:0 },
        grayscale: { brightness:100, contrast:110, saturation:0,   exposure:0, vibrance:0, warmth:0, vignette:0, sharpen:0 },
        sepia:     { brightness:105, contrast:100, saturation:20,  exposure:5, vibrance:0, warmth:40,vignette:20,sharpen:0 },
        vivid:     { brightness:105, contrast:120, saturation:160, exposure:5, vibrance:30,warmth:10,vignette:0, sharpen:15},
        cool:      { brightness:100, contrast:100, saturation:110, exposure:0, vibrance:10,warmth:-40,vignette:0,sharpen:0 },
        warm:      { brightness:105, contrast:100, saturation:115, exposure:5, vibrance:0, warmth:50, vignette:0,sharpen:0 },
        fade:      { brightness:115, contrast:80,  saturation:75,  exposure:10,vibrance:0, warmth:10, vignette:0,sharpen:0 },
        noir:      { brightness:90,  contrast:130, saturation:0,   exposure:-5,vibrance:0, warmth:-20,vignette:40,sharpen:10},
    };

    function _getSliderVal(name) {
        const el = _el(`ss-e-${name}`);
        return el ? Number(el.value) : (name==='brightness'||name==='contrast'||name==='saturation' ? 100 : 0);
    }
    function _setSlider(name, val) {
        const el = _el(`ss-e-${name}`); if (el) el.value = val;
        const vEl = _el(`ss-e-${name}-val`); if (vEl) vEl.textContent = val;
    }

    function _applyPreset(name) {
        _preset = name;
        const p = PRESETS[name] || PRESETS.none;
        [...SLIDERS, ...EXTRA].forEach(k => _setSlider(k, p[k]));
        document.querySelectorAll('.ss-lb-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === name));
        _redraw();
    }

    function _redraw() {
        const canvas = _el('ss-lb-canvas');
        if (!canvas || !_baseImage) return;
        const ctx = canvas.getContext('2d');

        const br  = _getSliderVal('brightness');
        const co  = _getSliderVal('contrast');
        const sat = _getSliderVal('saturation');
        const exp = _getSliderVal('exposure');    // -100..100 → brightness offset
        const wm  = _getSliderVal('warmth');      // -100..100 → colour matrix tint
        const vig = _getSliderVal('vignette');    // 0..100
        const sh  = _getSliderVal('sharpen');     // 0..100 — rendered after
        // vibrance: approximated via saturation extra bump on low-sat pixels (skip for canvas, treat as sat boost)
        const vib = _getSliderVal('vibrance');

        // Determine effective canvas size after rotation
        const w = (_rot % 180 === 0) ? _baseImage.naturalWidth  : _baseImage.naturalHeight;
        const h = (_rot % 180 === 0) ? _baseImage.naturalHeight : _baseImage.naturalWidth;
        canvas.width  = w;
        canvas.height = h;

        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.rotate(_rot * Math.PI / 180);
        ctx.scale(_flipH ? -1 : 1, _flipV ? -1 : 1);
        ctx.translate(-_baseImage.naturalWidth/2, -_baseImage.naturalHeight/2);

        // CSS filters for basic adjustments
        const brEff  = Math.max(0, br + exp);
        const satEff = Math.max(0, sat + vib * 0.6);
        ctx.filter = `brightness(${brEff}%) contrast(${co}%) saturate(${satEff}%)`;
        ctx.drawImage(_baseImage, 0, 0);
        ctx.restore();

        // Warmth tint overlay
        if (wm !== 0) {
            ctx.save();
            const alpha = Math.abs(wm) / 400;
            ctx.globalCompositeOperation = 'soft-light';
            ctx.fillStyle = wm > 0
                ? `rgba(255,180,80,${alpha})`
                : `rgba(80,150,255,${alpha})`;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Vignette
        if (vig > 0) {
            const grad = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*0.35, w/2, h/2, Math.max(w,h)*0.75);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, `rgba(0,0,0,${vig/150})`);
            ctx.save();
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // Sharpen (unsharp mask via convolution — skip if 0)
        if (sh > 0) {
            try {
                const iData = ctx.getImageData(0, 0, w, h);
                const amount = sh / 150;
                const d = iData.data, ow = w;
                const tmp = new Uint8ClampedArray(d);
                for (let y=1;y<h-1;y++) for (let x=1;x<ow-1;x++) {
                    const i=(y*ow+x)*4;
                    for (let c=0;c<3;c++) {
                        const lap = -tmp[(i-ow*4)+c] - tmp[(i-4)+c] + 8*tmp[i+c]
                            - tmp[(i+4)+c] - tmp[(i+ow*4)+c]
                            - tmp[(i-ow*4-4)+c] - tmp[(i-ow*4+4)+c]
                            - tmp[(i+ow*4-4)+c] - tmp[(i+ow*4+4)+c];
                        d[i+c] = Math.min(255, Math.max(0, tmp[i+c] + amount * lap * 0.1));
                    }
                }
                ctx.putImageData(iData, 0, 0);
            } catch(e) { /* cross-origin guard */ }
        }
    }

    function _updateNav() {
        const prev = _el('ss-lb-prev');
        const next = _el('ss-lb-next');
        if (prev) prev.disabled = _idx === 0;
        if (next) next.disabled = _idx === _shots.length - 1;
        const counter = _el('ss-lb-counter');
        if (counter) counter.textContent = `${_idx + 1} / ${_shots.length}`;
        const fn = _el('ss-lb-filename');
        if (fn) fn.textContent = _shots[_idx]?.name || '';
        // Filmstrip
        const strip = _el('ss-lb-strip');
        if (strip) {
            strip.querySelectorAll('.ss-lb-thumb').forEach((t, i) => {
                t.classList.toggle('active', i === _idx);
            });
            const activeThumb = strip.querySelector('.ss-lb-thumb.active');
            if (activeThumb) activeThumb.scrollIntoView({ behavior:'smooth', inline:'center', block:'nearest' });
        }
    }

    function _loadShot(idx) {
        _idx = idx;
        _rot = 0; _flipH = false; _flipV = false;
        _applyPreset('none');
        _updateNav();
        const shot = _shots[_idx];
        if (!shot) return;
        const img = new Image();
        img.onload = () => {
            _baseImage = img;
            _redraw();
        };
        img.src = shot.data;
    }

    function _buildStrip() {
        const strip = _el('ss-lb-strip');
        if (!strip) return;
        strip.innerHTML = '';
        _shots.forEach((shot, i) => {
            const thumb = document.createElement('img');
            thumb.className = 'ss-lb-thumb';
            thumb.src = shot.data;
            thumb.addEventListener('click', () => _loadShot(i));
            strip.appendChild(thumb);
        });
    }

    function _wireSliders() {
        [...SLIDERS, ...EXTRA].forEach(name => {
            const el = _el(`ss-e-${name}`);
            if (!el || el.dataset.wired) return;
            el.dataset.wired = '1';
            el.addEventListener('input', () => {
                const v = _el(`ss-e-${name}-val`);
                if (v) v.textContent = el.value;
                _preset = 'none';
                document.querySelectorAll('.ss-lb-preset').forEach(b => b.classList.toggle('active', b.dataset.preset === 'none'));
                _redraw();
            });
        });
    }

    function _wireOnce() {
        const lb = _el('ss-lightbox');
        if (!lb || lb.dataset.wired) return;
        lb.dataset.wired = '1';

        // Close on backdrop click
        lb.addEventListener('click', (e) => { if (e.target === lb) close(); });

        _el('ss-lb-close')?.addEventListener('click', close);

        _el('ss-lb-prev')?.addEventListener('click', () => { if (_idx > 0) _loadShot(_idx - 1); });
        _el('ss-lb-next')?.addEventListener('click', () => { if (_idx < _shots.length-1) _loadShot(_idx + 1); });

        _el('ss-lb-edit-toggle')?.addEventListener('click', () => {
            const editor = _el('ss-lb-editor');
            if (!editor) return;
            const visible = editor.style.display !== 'none';
            editor.style.display = visible ? 'none' : 'flex';
            const btn = _el('ss-lb-edit-toggle');
            if (btn) btn.classList.toggle('primary', !visible);
        });

        _el('ss-lb-delete-btn')?.addEventListener('click', async () => {
            const shot = _shots[_idx];
            if (!shot || !_inst) return;
            if (!confirm(`Delete "${shot.name}"?`)) return;
            try {
                const instPath = _inst.folder || _inst.path;
                await window.electron.deleteScreenshot(instPath, shot.name);
                _shots.splice(_idx, 1);
                if (_shots.length === 0) { close(); return; }
                _idx = Math.min(_idx, _shots.length - 1);
                _buildStrip();
                _loadShot(_idx);
            } catch(e) { window.HexaAlert?.('Error', e.message); }
        });

        _el('ss-e-reset-btn')?.addEventListener('click', () => _applyPreset('none'));

        _el('ss-e-save-btn')?.addEventListener('click', async () => {
            const canvas = _el('ss-lb-canvas');
            const shot = _shots[_idx];
            if (!canvas || !shot || !_inst) return;
            const btn = _el('ss-e-save-btn');
            if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
            try {
                const data = canvas.toDataURL('image/png');
                const instPath = _inst.folder || _inst.path;
                await window.electron.saveScreenshot(instPath, shot.name, data);
                shot.data = data;
                _baseImage = null;
                const img = new Image();
                img.onload = () => { _baseImage = img; };
                img.src = data;
                // refresh strip thumb
                const strip = _el('ss-lb-strip');
                if (strip) { const t = strip.querySelectorAll('.ss-lb-thumb')[_idx]; if (t) t.src = data; }
            } catch(e) { window.HexaAlert?.('Error', e.message); }
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save'; }
        });

        _el('ss-e-rotate-l')?.addEventListener('click', () => { _rot = (_rot - 90 + 360) % 360; _redraw(); });
        _el('ss-e-rotate-r')?.addEventListener('click', () => { _rot = (_rot + 90) % 360; _redraw(); });
        _el('ss-e-flip-h')?.addEventListener('click',   () => { _flipH = !_flipH; _redraw(); });
        _el('ss-e-flip-v')?.addEventListener('click',   () => { _flipV = !_flipV; _redraw(); });

        document.querySelectorAll('.ss-lb-preset').forEach(btn => {
            btn.addEventListener('click', () => _applyPreset(btn.dataset.preset));
        });

        // Keyboard navigation
        document.addEventListener('keydown', _onKey);
    }

    function _onKey(e) {
        const lb = _el('ss-lightbox');
        if (!lb || lb.style.display === 'none') return;
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')    { e.preventDefault(); if (_idx > 0) _loadShot(_idx - 1); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown')  { e.preventDefault(); if (_idx < _shots.length-1) _loadShot(_idx + 1); }
        if (e.key === 'Escape') close();
    }

    function open(inst, shots, startIdx) {
        _inst  = inst;
        _shots = shots;
        _wireOnce();
        _wireSliders();
        _buildStrip();
        _loadShot(startIdx || 0);
        // Hide editor panel on open
        const editor = _el('ss-lb-editor');
        if (editor) editor.style.display = 'none';
        const editBtn = _el('ss-lb-edit-toggle');
        if (editBtn) editBtn.classList.remove('primary');
        const lb = _el('ss-lightbox');
        if (lb) lb.style.display = 'flex';
    }

    function close() {
        const lb = _el('ss-lightbox');
        if (lb) lb.style.display = 'none';
        _baseImage = null;
    }

    return { open, close };
})();

if(window.electron) {
    window.electron.onGameStart((data) => {
        _playtimeTicker.start(data);
    });

    window.electron.onGameExit((code) => {
        console.log("Game Exited with code", code);

        _playtimeTicker.stop();

        // Clear global game state — openDetails() reads this to restore the correct button state
        window._gameRunning = false;

        // Update Heartbeat State
        ActivityManager.isGameRunning = false;
        ActivityManager.sendHeartbeat();

        // Reset play button on the currently visible inst-page
        const playBtn = document.querySelector('.inst-page[style*="display: block"] [data-ref="inst-play-btn"]')
                     || document.querySelector('.inst-page [data-ref="inst-play-btn"]');
        if (playBtn) {
            playBtn.disabled = false;
            playBtn.classList.remove('state-stop', 'state-launching');
            playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
        }

        if (code !== 0 && code !== null) {
            window.notify('error', 'GAME CRASHED', `Exit code: ${code} — click to close`, { duration: 0 });
        } else if (code === 0) {
            window.notify('success', 'Game closed', null, { duration: 3000 });
        }
    });

    // Final sync from server once session is saved — corrects any ticker drift
    window.electron.onInstancePlaytimeRefresh(async (folder) => {
        const instMins = await window.electron.getInstancePlaytime(folder).catch(() => 0);
        // Fetch updated global total using current username
        let globalMins = 0;
        try {
            const username = currentUser?.username;
            if (username) {
                const res = await window.electron.fetchUserProfile(username, true);
                globalMins = res?.profile?.total_playtime || 0;
            }
        } catch {}
        _playtimeTicker.syncFromServer(folder, instMins, globalMins);
    });
}

// CONFIGURATION
const API_BASE_URL = "https://hexa-mc.fr";

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


    // Global default Steve skin for fallback
    const b64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABABAMAAABYR2ztAAAAFVBMVEUAAAA7OztBQUGEhoOVl5TIyMjOzs4e8R79AAAAAXRSTlMAQObYZgAAAM9JREFUSMftleENhCAMhZnBDXQFei7QhgUuuMAh+49wVAT0pBqT84eJj9hE88mjpq1KBdEsJQm1Br7uDeymST8StxdtbgEcpqlU18XHxhnng9JrGWgbnDY2n96N1g6TMSBsAa3rQLYgqll0s4gYCDGcZHXgtokLgS1C9N6xQTbZANaKwPtVA9IZEDgDBG+trwLjwECM5wAEIr7ZAeK6EEif1S90OA4ePSpNLJZKGgOr1j8FHFiUOSEUbOnyRcn/Fyhz4jIgzYkdYL0uAKT/xhcR3cKTnTiPTAAAAABJRU5ErkJggg==';
    const b64Steve = b64;

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
            const deleteBtn = document.querySelector('#instance-settings-modal button[onclick*="InstanceSettings.deleteInstance"]');
            if (deleteBtn) {
                deleteBtn.style.display = isOfficial ? 'none' : 'block';
                deleteBtn.style.width = isOfficial ? '0' : '100%'; 
                if (isOfficial) deleteBtn.parentElement.style.display = 'none';
                else deleteBtn.parentElement.style.display = 'flex';
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

            // Helper: get global config default
            const gcfg = window._globalConfig || {};

            // RAM Logic
            const ramSlider = document.getElementById('inst-set-ram');
            const ramLabel = document.getElementById('inst-set-ram-val');

            if (ramSlider && ramLabel) {
                let currentRam = 4096;
                if (inst.memory) {
                    if (typeof inst.memory === 'string' && inst.memory.endsWith('G')) currentRam = parseInt(inst.memory) * 1024;
                    else if (typeof inst.memory === 'string' && inst.memory.endsWith('M')) currentRam = parseInt(inst.memory);
                    else if (typeof inst.memory === 'number') currentRam = inst.memory;
                } else if (gcfg.maxRam) {
                    if (typeof gcfg.maxRam === 'string' && gcfg.maxRam.endsWith('G')) currentRam = parseInt(gcfg.maxRam) * 1024;
                    else if (typeof gcfg.maxRam === 'string' && gcfg.maxRam.endsWith('M')) currentRam = parseInt(gcfg.maxRam);
                }
                ramSlider.value = currentRam;
                ramLabel.innerText = (currentRam / 1024).toFixed(1) + ' GB';
                ramSlider.oninput = () => { ramLabel.innerText = (ramSlider.value / 1024).toFixed(1) + ' GB'; };
            }

            // Resolution
            const widthInput  = document.getElementById('inst-set-width');
            const heightInput = document.getElementById('inst-set-height');
            if (widthInput && heightInput) {
                widthInput.value  = inst.resolution?.width  ?? gcfg.resolution?.width  ?? 854;
                heightInput.value = inst.resolution?.height ?? gcfg.resolution?.height ?? 480;
            }

            // JVM Args
            const jvmInput = document.getElementById('inst-set-jvm');
            if (jvmInput) {
                jvmInput.value = inst.jvmArgs ?? gcfg.jvmArgs ?? '';
            }

            // Reset to defaults button
            const resetBtn = document.getElementById('inst-set-reset-defaults');
            if (resetBtn) {
                resetBtn.onclick = () => {
                    if (ramSlider && ramLabel) {
                        let defRam = 4096;
                        if (gcfg.maxRam) {
                            if (gcfg.maxRam.endsWith('G')) defRam = parseInt(gcfg.maxRam) * 1024;
                            else if (gcfg.maxRam.endsWith('M')) defRam = parseInt(gcfg.maxRam);
                        }
                        ramSlider.value = defRam;
                        ramLabel.innerText = (defRam / 1024).toFixed(1) + ' GB';
                    }
                    if (widthInput)  widthInput.value  = gcfg.resolution?.width  ?? 854;
                    if (heightInput) heightInput.value = gcfg.resolution?.height ?? 480;
                    if (jvmInput)    jvmInput.value    = gcfg.jvmArgs ?? '';
                    const javaSelect = document.getElementById('inst-set-java');
                    if (javaSelect) { javaSelect.value = 'auto'; javaSelect.dispatchEvent(new Event('change')); }
                };
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

    
    duplicate() {
        if(!this.currentId) return;
        LibraryManager.duplicate(this.currentId);
        this.close();
    },

    deleteInstance() {
        if(!this.currentId) return;
        // Settings modal is open, but we show confirm modal on top
        if(LibraryManager && LibraryManager.confirmDelete) {
            LibraryManager.confirmDelete(this.currentId);
            // this.close(); // Keep settings open so user can cancel
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

        const gcfg = window._globalConfig || {};

        const javaVersion = document.getElementById('inst-set-java').value;
        const javaPath = javaVersion === 'custom' ? document.getElementById('inst-set-java-path').value : null;
        const ramMb   = parseInt(document.getElementById('inst-set-ram').value);
        const ramG    = Math.round(ramMb / 1024) + 'G';
        const w       = parseInt(document.getElementById('inst-set-width').value)  || 854;
        const h       = parseInt(document.getElementById('inst-set-height').value) || 480;
        const jvmArgs = document.getElementById('inst-set-jvm').value.trim();

        // Build newData — omit per-instance fields that match global defaults (clean storage)
        const newData = {
            name:             document.getElementById('inst-set-name').value,
            javaVersion:      javaVersion !== 'auto' ? javaVersion : undefined,
            javaPath:         javaPath || undefined,
            memory:           ramG !== gcfg.maxRam ? ramG : undefined,
            resolution:       (w !== (gcfg.resolution?.width ?? 854) || h !== (gcfg.resolution?.height ?? 480))
                                ? { width: w, height: h } : undefined,
            jvmArgs:          jvmArgs !== (gcfg.jvmArgs ?? '') ? jvmArgs : undefined,
            preLaunchCommand: document.getElementById('inst-set-hook-pre').value || undefined,
            wrapperCommand:   document.getElementById('inst-set-hook-wrapper').value || undefined,
            postExitCommand:  document.getElementById('inst-set-hook-post').value || undefined,
        };

        // Strip undefined keys
        Object.keys(newData).forEach(k => newData[k] === undefined && delete newData[k]);

        // Apply changes to inst object — first strip old per-instance fields, then apply
        ['javaVersion','javaPath','memory','resolution','jvmArgs','preLaunchCommand','wrapperCommand','postExitCommand'].forEach(k => delete inst[k]);
        Object.assign(inst, newData);

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
        
        // Refresh detail page if open
        if (window._currentInstanceDetails && window._currentInstanceDetails.id === inst.id) {
            const cachedPage = LibraryManager._pageCache[inst.id];
            if (cachedPage) {
                const nameEl = cachedPage.querySelector('[data-ref="inst-name-lg"]');
                if (nameEl) nameEl.innerText = inst.name;
            }
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
    _pageCache: {},   // inst.id → DOM element
    _ref(page, name) { return page.querySelector(`[data-ref="${name}"]`); },

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
                { id: 'def_1', name: 'Hexa Optimized', version: '1.21.1', loader: 'Fabric', icon: 'assets/logo.svg', status: 'Ready', folder: 'hexa_optimized' }
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
        
        // Update Fast Launch custom selector — only real user instances
        _renderInstSelect(this.instances);

        if (!grid) return;
        grid.innerHTML = '';

        const MAX_VISIBLE = 7;
        const MAX_PINS = 3;

        // Load / save pinned ids
        const getPinned = () => JSON.parse(localStorage.getItem('hexa_pinned') || '[]');
        const savePinned = (arr) => localStorage.setItem('hexa_pinned', JSON.stringify(arr));

        const togglePin = (id) => {
            const validIds = new Set(this.instances.map(i => i.id));
            let pins = getPinned().filter(p => validIds.has(p)); // purge deleted
            if (pins.includes(id)) {
                pins = pins.filter(p => p !== id);
            } else {
                if (pins.length >= MAX_PINS) {
                    window.notify('warning', 'Pin limit', `You can only pin ${MAX_PINS} instances`, { duration: 3000 });
                    return;
                }
                pins.push(id);
            }
            savePinned(pins);
            this.render();
        };

        // Sort: pinned first, then rest in original order (purge stale pins silently)
        const validIds = new Set(this.instances.map(i => i.id));
        const pins = getPinned().filter(p => validIds.has(p));
        const pinned = this.instances.filter(i => pins.includes(i.id));
        const unpinned = this.instances.filter(i => !pins.includes(i.id));
        const sorted = [...pinned, ...unpinned];

        // View-all state
        const viewAll = grid.dataset.viewAll === 'true';
        const visible = viewAll ? sorted : sorted.slice(0, MAX_VISIBLE);

        const makeCard = (inst) => {
            const card = document.createElement('div');
            card.className = 'instance-card';
            card.dataset.instId = inst.id;
            const iconUrl = inst.icon || 'assets/logo.svg';
            const isInstalling = inst.status === 'installing';
            const isPinned = pins.includes(inst.id);

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <img src="${iconUrl}" class="instance-icon" onerror="this.src='assets/logo.svg'">
                    <div style="display:flex; gap:4px; align-items:center;">
                        <button class="inst-action-btn play-btn" title="Play"><i class="fas fa-play"></i></button>
                        <button class="inst-action-btn delete-btn" title="Delete"><i class="fas fa-trash"></i></button>
                        <button class="inst-pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}"><i class="fas fa-thumbtack"></i></button>
                        <span class="card-loader-badge">${inst.loader || 'Vanilla'}</span>
                    </div>
                </div>
                <div class="instance-info">
                    <h3>${inst.name}</h3>
                    <div class="instance-meta">
                        <span>${inst.version}</span>
                        <span>•</span>
                        <span>${inst.status || 'Ready'}</span>
                        <span>•</span>
                        <span class="inst-card-playtime" data-folder="${inst.folder || ''}"><i class="far fa-clock"></i> —</span>
                    </div>
                </div>
                ${isInstalling ? `<div class="card-installing-overlay"><i class="fas fa-spinner fa-spin"></i></div>` : ''}
            `;

            if (isInstalling) {
                card.classList.add('is-installing');
                card.querySelectorAll('.inst-action-btn').forEach(b => b.disabled = true);
            }

            // Pin button
            card.querySelector('.inst-pin-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                togglePin(inst.id);
            });

            // Play button
            card.querySelector('.inst-action-btn.play-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (selector) {
                    selector.value = inst.id;
                    selector.dispatchEvent(new Event('change'));
                }
                document.querySelector('.nav-item[data-tab="home"]').click();
            });

            // Delete button
            card.querySelector('.inst-action-btn.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.confirmDelete(inst.id);
            });

            card.addEventListener('click', () => this.openDetails(inst));

            return card;
        };

        visible.forEach(inst => grid.appendChild(makeCard(inst)));

        // Load playtime for each instance card
        if (window.electron?.getInstancePlaytime) {
            visible.forEach(inst => {
                if (!inst.folder) return;
                window.electron.getInstancePlaytime(inst.folder).then(mins => {
                    document.querySelectorAll(`.inst-card-playtime[data-folder="${CSS.escape(inst.folder)}"]`).forEach(el => {
                        el.innerHTML = `<i class="far fa-clock"></i> ${_fmtInstPlaytime(mins)}`;
                    });
                }).catch(() => {});
            });
        }

        // "Create New" card always last
        const addCard = document.createElement('div');
        addCard.className = 'instance-card add-card';
        addCard.innerHTML = `
            <div style="text-align:center; color:#888;">
                <i class="fas fa-plus" style="font-size:32px; margin-bottom:10px; display:block;"></i>
                <div style="font-weight:600;">CREATE NEW</div>
            </div>
        `;
        addCard.onclick = () => document.getElementById('btn-create-inst').click();
        grid.appendChild(addCard);

        // View all button
        const viewAllWrap = document.getElementById('library-view-all-wrap');
        const viewAllBtn  = document.getElementById('btn-view-all-inst');
        if (viewAllWrap && viewAllBtn) {
            if (sorted.length > MAX_VISIBLE) {
                viewAllWrap.style.display = 'block';
                if (viewAll) {
                    viewAllBtn.innerHTML = 'SHOW LESS <i class="fas fa-chevron-up"></i>';
                } else {
                    viewAllBtn.innerHTML = `VIEW ALL (${sorted.length}) <i class="fas fa-chevron-down"></i>`;
                }
                viewAllBtn.onclick = () => {
                    grid.dataset.viewAll = viewAll ? 'false' : 'true';
                    this.render();
                };
            } else {
                viewAllWrap.style.display = 'none';
            }
        }
    },

    openDetails(inst, pushToHistory = true) {
        const container = document.getElementById('inst-pages-container');
        if (!container) return;

        // Show overlay container
        container.style.display = 'block';

        // Hide all existing pages
        container.querySelectorAll('.inst-page').forEach(p => p.style.display = 'none');

        // Nav history
        if (typeof NavSystem !== 'undefined' && pushToHistory) {
            NavSystem.pushState({ tab: 'library', type: 'instance-detail', instanceId: inst.id });
        }

        // Reuse cached page or build a new one
        if (this._pageCache[inst.id]) {
            const page = this._pageCache[inst.id];
            page.style.display = 'block';
            window._currentInstanceDetails = inst;
            // Refresh live playtime tag
            const timeTag = this._ref(page, 'inst-time-tag');
            if (timeTag && inst.folder && window.electron?.getInstancePlaytime) {
                window.electron.getInstancePlaytime(inst.folder).then(mins => {
                    timeTag.innerHTML = `<i class="far fa-clock"></i> ${_fmtInstPlaytime(mins)}`;
                }).catch(() => {});
            }
            return;
        }

        // Clone template
        const tpl = document.getElementById('inst-page-tpl');
        const frag = tpl.content.cloneNode(true);
        const pageEl = document.createElement('div');
        pageEl.className = 'inst-page';
        pageEl.style.cssText = 'height:100%; overflow-y:auto;';
        pageEl.appendChild(frag);

        this._pageCache[inst.id] = pageEl;
        container.appendChild(pageEl);

        window._currentInstanceDetails = inst;

        // Helper to get refs within this page
        const R = (name) => this._ref(pageEl, name);

        // ── POPULATE HEADER ──
        R('inst-name-lg').innerText = inst.name;
        R('inst-version-tag').innerHTML = `<i class="fas fa-cube"></i> ${inst.version}`;
        R('inst-loader-tag').innerHTML = `<i class="fas fa-scroll"></i> ${inst.loader || 'Vanilla'}`;
        R('inst-icon-lg').src = inst.icon || 'assets/logo.svg';

        // ── PLAYTIME TAG ──
        const timeTag = R('inst-time-tag');
        if (timeTag && inst.folder && window.electron?.getInstancePlaytime) {
            window.electron.getInstancePlaytime(inst.folder).then(mins => {
                timeTag.innerHTML = `<i class="far fa-clock"></i> ${_fmtInstPlaytime(mins)}`;
            }).catch(() => {});
        }

        // ── HERO BACKGROUND ──
        const heroBg = R('idv-hero-bg');
        if (heroBg) {
            const applyIconGradient = () => {
                if (!inst.icon) return;
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const SIZE = 32;
                        const c = document.createElement('canvas');
                        c.width = SIZE; c.height = SIZE;
                        c.getContext('2d').drawImage(img, 0, 0, SIZE, SIZE);
                        const data = c.getContext('2d').getImageData(0, 0, SIZE, SIZE).data;
                        const buckets = {};
                        let totalBrightness = 0, pixelCount = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i + 3] < 128) continue;
                            const r = data[i], g = data[i+1], b = data[i+2];
                            totalBrightness += (r + g + b) / 3;
                            pixelCount++;
                            const key = `${Math.round(r/24)*24},${Math.round(g/24)*24},${Math.round(b/24)*24}`;
                            buckets[key] = (buckets[key] || 0) + 1;
                        }
                        const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
                        const [dr, dg, db] = top ? top[0].split(',').map(Number) : [60, 60, 100];
                        const avgBright = pixelCount > 0 ? totalBrightness / pixelCount : 50;
                        const edgeFactor = 0.03 + (avgBright / 255) * 0.12;
                        const er = Math.round(dr * edgeFactor), eg = Math.round(dg * edgeFactor), eb = Math.round(db * edgeFactor);
                        const mr = Math.round(dr * 0.4), mg = Math.round(dg * 0.4), mb = Math.round(db * 0.4);
                        heroBg.style.background = `linear-gradient(135deg, rgb(${er},${eg},${eb}) 0%, rgb(${mr},${mg},${mb}) 50%, rgb(${er},${eg},${eb}) 100%)`;
                    } catch(e) {}
                };
                img.src = inst.icon;
            };
            if (window.electron?.getInstanceBanner && inst.folder) {
                window.electron.getInstanceBanner(inst.folder).then(dataUrl => {
                    if (dataUrl) {
                        heroBg.style.cssText = `background: url('${dataUrl}') center/cover no-repeat;`;
                    } else { applyIconGradient(); }
                }).catch(() => applyIconGradient());
            } else { applyIconGradient(); }
        }

        // ── CHANGE BANNER BUTTON ──
        R('inst-change-banner-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!window.electron?.openFileDialog) return;
            const filePath = await window.electron.openFileDialog({
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
                properties: ['openFile']
            });
            if (!filePath) return;
            await window.electron.saveInstanceBanner(inst.folder, filePath);
            const dataUrl = await window.electron.getInstanceBanner(inst.folder);
            if (dataUrl && heroBg) heroBg.style.cssText = `background: url('${dataUrl}') center/cover no-repeat !important;`;
        });

        // ── SETTINGS BUTTON ──
        R('inst-settings-btn')?.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (typeof InstanceSettings !== 'undefined' && InstanceSettings.open) {
                try { InstanceSettings.open(inst.id); } catch(err) { if(window.HexaAlert) window.HexaAlert('Error', err.message); }
            }
        });

        // ── MORE BUTTON (context menu) ──
        const moreBtn = R('inst-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const ctx = document.getElementById('inst-context-menu');
                if (!ctx) return;
                const rect = moreBtn.getBoundingClientRect();
                ctx.style.top = (rect.bottom + 10) + 'px';
                ctx.style.left = (rect.right - 190) + 'px';
                ctx.style.display = 'block';
                const wire = (id, fn) => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    const cl = el.cloneNode(true);
                    el.parentNode.replaceChild(cl, el);
                    cl.onclick = () => { fn(); ctx.style.display = 'none'; };
                };
                wire('ctx-open-folder', () => window.electron?.openFolder(inst.folder));
                wire('ctx-export-pack', () => window.HexaAlert?.('Info', 'Export feature coming soon.'));
                wire('ctx-duplicate', () => LibraryManager.duplicate(inst.id));
                wire('ctx-delete', () => {
                    if (confirm('Delete this instance?')) {
                        LibraryManager.delete(inst.id);
                        pageEl.style.display = 'none';
                        container.style.display = 'none';
                    }
                });
            });
        }

        // ── PLAY BUTTON ──
        const playBtn = R('inst-play-btn');
        const setPlayState = () => {
            if (!window._gameRunning) {
                playBtn.disabled = false;
                playBtn.classList.remove('state-stop', 'state-launching');
                playBtn.innerHTML = '<i class="fas fa-play"></i> PLAY';
            } else {
                playBtn.disabled = false;
                playBtn.classList.remove('state-launching');
                playBtn.classList.add('state-stop');
                playBtn.innerHTML = '<i class="fas fa-stop"></i> STOP';
            }
        };
        setPlayState();
        playBtn.addEventListener('click', async () => {
            if (playBtn.disabled) return;
            if (window._gameRunning) {
                playBtn.disabled = true;
                playBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> STOPPING...';
                if (window.electron?.stopGame) await window.electron.stopGame();
                return;
            }
            // Switch to Logs tab
            const logTab = pageEl.querySelector('.inst-tab[data-target="inst-logs"]');
            if (logTab) logTab.click();
            const logContainer = R('inst-logs-container');
            if (logContainer) logContainer.innerHTML = '';
            window._logBuffer = [];
            playBtn.disabled = true;
            playBtn.classList.add('state-launching');
            playBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> LAUNCHING...';
            const launchOptions = { ...inst,
                username: currentUser?.username || 'Player',
                uuid: currentUser?.uuid || '00000000-0000-0000-0000-000000000000',
                accessToken: currentUser?.accessToken || '0',
                isOfficial: inst.isOfficial || false
            };
            if (!launchOptions.instanceFolder && launchOptions.folder) launchOptions.instanceFolder = launchOptions.folder;
            try {
                await window.electron.launch(launchOptions);
                window._gameRunning = true;
                playBtn.disabled = false;
                playBtn.classList.remove('state-launching');
                playBtn.classList.add('state-stop');
                playBtn.innerHTML = '<i class="fas fa-stop"></i> STOP';
            } catch (e) {
                if (window.HexaAlert) window.HexaAlert('Error', e.message || String(e));
                window._gameRunning = false;
                setPlayState();
            }
        });

        // ── CLOSE BUTTON ──
        R('inst-close-btn')?.addEventListener('click', () => {
            pageEl.style.display = 'none';
            container.style.display = 'none';
            if (typeof NavSystem !== 'undefined') NavSystem.goBack();
        });

        // ── TABS ──
        pageEl.querySelectorAll('.inst-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                pageEl.querySelectorAll('.inst-tab').forEach(t => t.classList.remove('active'));
                pageEl.querySelectorAll('.inst-tab-pane').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const pane = pageEl.querySelector(`[data-ref="${tab.dataset.target}"]`);
                if (pane) pane.classList.add('active');
                if (tab.dataset.target === 'inst-screenshots') this.loadScreenshots(inst, pageEl);
                else if (tab.dataset.target === 'inst-worlds') { this.loadWorlds(inst, pageEl); this.loadServers(inst, pageEl); }
            });
        });

        // Reset to Content tab
        pageEl.querySelectorAll('.inst-tab-pane').forEach(p => p.classList.remove('active'));
        const defaultTab = pageEl.querySelector('.inst-tab[data-target="inst-content"]');
        const defaultPane = R('inst-content');
        if (defaultTab) defaultTab.classList.add('active');
        if (defaultPane) defaultPane.classList.add('active');

        // Load mods for this page
        this.loadInstanceMods(inst, pageEl);
    },

    async loadInstanceMods(inst, page) {
        const scope = page || document;

        const list = scope.querySelector('[data-ref="inst-mods-list"]') || scope.getElementById?.('inst-mods-list');
        const pagBar = scope.querySelector('[data-ref="inst-mods-pagination"]') || scope.getElementById?.('inst-mods-pagination');
        if (!list) return;

        const loadId = Date.now() + Math.random();
        this._contentLoadId = loadId;

        const installBtn = scope.querySelector('[data-ref="inst-install-content-btn"]') || scope.getElementById?.('inst-install-content-btn');
        if (installBtn && !installBtn.dataset.wired) {
            installBtn.dataset.wired = '1';
            installBtn.addEventListener('click', () => {
                if (typeof ContentBrowser !== 'undefined') ContentBrowser.openForInstance(inst);
            });
        }

        const instPath = inst.path || inst.folder;
        const perPage = 15;

        // Per-page persistent state stored on the DOM element so closures survive re-calls
        if (!scope._modState) scope._modState = { filter: 'all', page: 1, content: null };
        const state = scope._modState;

        const prevBtn = scope.querySelector('[data-ref="mods-prev-btn"]');
        const nextBtn = scope.querySelector('[data-ref="mods-next-btn"]');
        const pageInfo = scope.querySelector('[data-ref="mods-page-info"]');

        const renderContentPage = (content) => {
            state.content = content;
            let items;
            if (state.filter === 'mod') items = content.mods;
            else if (state.filter === 'resourcepack') items = content.resourcepacks;
            else if (state.filter === 'shader') items = content.shaders;
            else items = [...content.mods, ...content.resourcepacks, ...content.shaders];

            const totalPages = Math.max(1, Math.ceil(items.length / perPage));
            state.page = Math.max(1, Math.min(state.page, totalPages));
            const slice = items.slice((state.page - 1) * perPage, state.page * perPage);

            list.innerHTML = '';

            if (items.length === 0) {
                list.innerHTML = '<div class="idv-empty-state"><i class="fas fa-box-open"></i><p>No content found.</p></div>';
                if (pagBar) pagBar.style.display = 'none';
                return;
            }

            slice.forEach(item => {
                const row = document.createElement('div');
                row.className = 'idv-mod-row' + (item.isEnabled ? '' : ' disabled');
                const typeLabel = item.subDir === 'mods' ? 'MOD' : item.subDir === 'resourcepacks' ? 'RP' : 'SHADER';
                row.innerHTML = `
                    <div class="idv-row-icon-wrap"><img src="${item.icon || 'assets/logo.svg'}" class="idv-row-icon" onerror="this.src='assets/logo.svg'"></div>
                    <div class="idv-row-info">
                        <span class="idv-row-name">${item.name}</span>
                        <span class="idv-row-author">${item.author || ''}</span>
                    </div>
                    <span class="idv-row-type-badge">${typeLabel}</span>
                    <span class="idv-row-version">${item.version || '—'}</span>
                    <div class="idv-row-actions" onclick="event.stopPropagation()">
                        <button class="idv-row-btn content-toggle-btn" style="color:${item.isEnabled ? '#27ae60' : 'var(--text-muted)'};" title="${item.isEnabled ? 'Disable' : 'Enable'}" data-jar="${item.jar}" data-enabled="${item.isEnabled}" data-subdir="${item.subDir}">
                            <i class="fas fa-${item.isEnabled ? 'toggle-on' : 'toggle-off'}"></i>
                        </button>
                        <button class="idv-row-btn content-delete-btn" style="color:#e74c3c;" title="Delete" data-jar="${item.jar}" data-subdir="${item.subDir}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;

                row.querySelector('.content-toggle-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    const jar = btn.dataset.jar;
                    const isEnabled = btn.dataset.enabled === 'true';
                    const sub = btn.dataset.subdir;
                    const res = await window.electron.toggleMod(instPath, jar, !isEnabled, sub);
                    if (res && res.success) {
                        const arr = sub === 'mods' ? content.mods : sub === 'resourcepacks' ? content.resourcepacks : content.shaders;
                        const idx = arr.findIndex(m => m.jar === jar);
                        if (idx !== -1) { arr[idx].isEnabled = !isEnabled; arr[idx].jar = res.newFileName; }
                        renderContentPage(content);
                    }
                });

                row.querySelector('.content-delete-btn').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const btn = e.currentTarget;
                    const jar = btn.dataset.jar;
                    const sub = btn.dataset.subdir;
                    if (!confirm(`Delete "${jar}"?`)) return;
                    const res = await window.electron.deleteContentFile({ instPath, subDir: sub, fileName: jar });
                    if (res && res.success) {
                        const arr = sub === 'mods' ? content.mods : sub === 'resourcepacks' ? content.resourcepacks : content.shaders;
                        const idx = arr.findIndex(m => m.jar === jar);
                        if (idx !== -1) arr.splice(idx, 1);
                        if (this._contentCache?.[inst.id]) {
                            const c = this._contentCache[inst.id];
                            const arrC = sub === 'mods' ? c.mods : sub === 'resourcepacks' ? c.resourcepacks : c.shaders;
                            const idxC = arrC.findIndex(m => m.jar === jar);
                            if (idxC !== -1) arrC.splice(idxC, 1);
                        }
                        renderContentPage(content);
                    }
                });

                list.appendChild(row);
            });

            if (pagBar) pagBar.style.display = totalPages > 1 ? 'flex' : 'none';
            if (pageInfo) pageInfo.textContent = `Page ${state.page} of ${totalPages}  (${items.length} items)`;
            if (prevBtn) prevBtn.disabled = state.page === 1;
            if (nextBtn) nextBtn.disabled = state.page === totalPages;
        };

        // Wire filter chips (once per page — closures reference state object)
        const filterBar = scope.querySelector('[data-ref="inst-content-filters"]');
        if (filterBar && !filterBar.dataset.wired) {
            filterBar.dataset.wired = '1';
            filterBar.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-filter]');
                if (!btn || !state.content) return;
                filterBar.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.filter = btn.dataset.filter;
                state.page = 1;
                renderContentPage(state.content);
            });
        }
        if (prevBtn && !prevBtn.dataset.wired) {
            prevBtn.dataset.wired = '1';
            prevBtn.addEventListener('click', () => { if (state.content) { state.page--; renderContentPage(state.content); } });
        }
        if (nextBtn && !nextBtn.dataset.wired) {
            nextBtn.dataset.wired = '1';
            nextBtn.addEventListener('click', () => { if (state.content) { state.page++; renderContentPage(state.content); } });
        }

        if (!this._contentCache) this._contentCache = {};
        const cached = this._contentCache[inst.id];

        if (cached) {
            renderContentPage(cached);
        } else {
            list.innerHTML = '<div class="idv-empty-state"><i class="fas fa-spinner fa-spin"></i><p>Loading content…</p></div>';
            if (pagBar) pagBar.style.display = 'none';
        }

        try {
            const content = await window.electron.getInstanceContent(instPath);
            if (this._contentLoadId !== loadId) return;
            this._contentCache[inst.id] = content;
            const changed = !cached || JSON.stringify(cached) !== JSON.stringify(content);
            if (changed) renderContentPage(content);
        } catch(e) {
            console.error(e);
            if (!list.querySelector('.idv-mod-row')) {
                list.innerHTML = '<div style="padding:20px; color:#d00;">Error loading content: ' + e.message + '</div>';
            }
        }
    },

    async loadScreenshots(inst, page) {
        const scope = page || document;
        const grid = scope.querySelector('[data-ref="inst-screenshots-grid"]') || scope.getElementById?.('inst-screenshots-grid');
        if (!grid) return;

        // ── Per-page state ──
        if (!scope._ssState) scope._ssState = { sort: 'date-desc', search: '', selectMode: false, selected: new Set() };
        const st = scope._ssState;
        let _allShots = null; // raw array from server (may be cached)

        const instPath = inst.folder || inst.path;

        // ── Wire controls (once per page element) ──
        const searchEl   = scope.querySelector('[data-ref="ss-search"]');
        const countEl    = scope.querySelector('[data-ref="screenshots-count"]');
        const selBar     = scope.querySelector('[data-ref="ss-selection-bar"]');
        const selCount   = scope.querySelector('[data-ref="ss-sel-count"]');
        const selAllBtn  = scope.querySelector('[data-ref="ss-sel-all-btn"]');
        const selNoneBtn = scope.querySelector('[data-ref="ss-sel-none-btn"]');
        const selDelBtn  = scope.querySelector('[data-ref="ss-sel-delete-btn"]');
        const selToggle  = scope.querySelector('[data-ref="ss-select-toggle-btn"]');
        const openFolderBtn = scope.querySelector('[data-ref="ss-open-folder-btn"]');

        if (openFolderBtn && !openFolderBtn.dataset.wired) {
            openFolderBtn.dataset.wired = '1';
            openFolderBtn.addEventListener('click', () => window.electron.openFolder(instPath + '/screenshots'));
        }

        if (searchEl && !searchEl.dataset.wired) {
            searchEl.dataset.wired = '1';
            searchEl.addEventListener('input', () => { st.search = searchEl.value; _render(); });
        }

        // Sort chips
        const sortChips = scope.querySelector('.ss-filter-bar');
        if (sortChips && !sortChips.dataset.wired) {
            sortChips.dataset.wired = '1';
            sortChips.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-ss-sort]');
                if (!btn) return;
                sortChips.querySelectorAll('[data-ss-sort]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                st.sort = btn.dataset.ssSort;
                _render();
            });
        }

        // Select mode toggle
        if (selToggle && !selToggle.dataset.wired) {
            selToggle.dataset.wired = '1';
            selToggle.addEventListener('click', () => {
                st.selectMode = !st.selectMode;
                st.selected.clear();
                grid.classList.toggle('ss-select-mode', st.selectMode);
                if (selBar) selBar.style.display = st.selectMode ? 'flex' : 'none';
                selToggle.classList.toggle('primary', st.selectMode);
                _updateSelBar();
                _render();
            });
        }
        if (selAllBtn && !selAllBtn.dataset.wired) {
            selAllBtn.dataset.wired = '1';
            selAllBtn.addEventListener('click', () => {
                _getVisible().forEach(s => st.selected.add(s.name));
                _render();
            });
        }
        if (selNoneBtn && !selNoneBtn.dataset.wired) {
            selNoneBtn.dataset.wired = '1';
            selNoneBtn.addEventListener('click', () => { st.selected.clear(); _render(); });
        }
        if (selDelBtn && !selDelBtn.dataset.wired) {
            selDelBtn.dataset.wired = '1';
            selDelBtn.addEventListener('click', async () => {
                if (st.selected.size === 0) return;
                if (!confirm(`Delete ${st.selected.size} screenshot(s)? This cannot be undone.`)) return;
                selDelBtn.disabled = true;
                selDelBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…';
                const names = [...st.selected];
                for (const name of names) {
                    try { await window.electron.deleteScreenshot(instPath, name); } catch(e) { console.error(e); }
                }
                st.selected.clear();
                // Invalidate cache and reload
                if (this._ssCache) delete this._ssCache[inst.id];
                await _load();
                selDelBtn.disabled = false;
                selDelBtn.innerHTML = '<i class="fas fa-trash"></i> Delete selected';
            });
        }

        function _getVisible() {
            if (!_allShots) return [];
            let list = [..._allShots];
            const q = st.search.toLowerCase().trim();
            if (q) list = list.filter(s => s.name.toLowerCase().includes(q));
            if (st.sort === 'date-desc') list.sort((a,b) => (b.mtime||0)-(a.mtime||0));
            else if (st.sort === 'date-asc') list.sort((a,b) => (a.mtime||0)-(b.mtime||0));
            else if (st.sort === 'name-asc') list.sort((a,b) => a.name.localeCompare(b.name));
            else if (st.sort === 'size-desc') list.sort((a,b) => (b.size||0)-(a.size||0));
            return list;
        }

        function _updateSelBar() {
            if (selCount) selCount.textContent = `${st.selected.size} selected`;
            if (selDelBtn) selDelBtn.disabled = st.selected.size === 0;
        }

        function _fmtSize(bytes) {
            if (!bytes) return '';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
            return (bytes/(1024*1024)).toFixed(1) + ' MB';
        }

        function _render() {
            const visible = _getVisible();
            if (countEl) countEl.textContent = visible.length ? `(${visible.length})` : '';
            grid.innerHTML = '';

            if (!_allShots) {
                grid.innerHTML = '<div class="idv-empty-state" style="grid-column:1/-1"><i class="fas fa-spinner fa-spin"></i><p>Loading…</p></div>';
                return;
            }
            if (visible.length === 0) {
                grid.innerHTML = '<div class="idv-empty-state" style="grid-column:1/-1"><i class="fas fa-images"></i><p>' + (st.search ? 'No results.' : 'No screenshots yet.') + '</p></div>';
                return;
            }

            visible.forEach((shot, visIdx) => {
                const card = document.createElement('div');
                card.className = 'ss-card' + (st.selected.has(shot.name) ? ' selected' : '');
                card.dataset.name = shot.name;

                const img = document.createElement('img');
                img.src = shot.data;
                img.loading = 'lazy';

                const overlay = document.createElement('div');
                overlay.className = 'ss-card-overlay';
                overlay.innerHTML = `<span class="ss-card-name">${shot.name}</span><span class="ss-card-size">${_fmtSize(shot.size)}</span>`;

                const check = document.createElement('div');
                check.className = 'ss-card-check';
                check.innerHTML = '<i class="fas fa-check"></i>';

                card.appendChild(img);
                card.appendChild(overlay);
                card.appendChild(check);

                card.addEventListener('click', (e) => {
                    if (st.selectMode) {
                        if (st.selected.has(shot.name)) st.selected.delete(shot.name);
                        else st.selected.add(shot.name);
                        card.classList.toggle('selected', st.selected.has(shot.name));
                        check.style.opacity = st.selected.has(shot.name) ? '1' : '';
                        _updateSelBar();
                        return;
                    }
                    _ssLightbox.open(inst, visible, visIdx);
                });

                grid.appendChild(card);
            });

            _updateSelBar();
        }

        async function _load() {
            try {
                const shots = await window.electron.getScreenshots(instPath);
                if (!this._ssCache) this._ssCache = {};
                this._ssCache[inst.id] = shots;
                _allShots = shots || [];
                _render();
            } catch(e) {
                console.error('Screenshots load error:', e);
                grid.innerHTML = '<div class="idv-empty-state" style="grid-column:1/-1"><i class="fas fa-exclamation-triangle"></i><p>Error loading screenshots.</p></div>';
            }
        }

        // Stale-while-revalidate
        if (!this._ssCache) this._ssCache = {};
        const cached = this._ssCache[inst.id];
        if (cached) {
            _allShots = cached;
            _render();
        } else {
            _render(); // shows spinner via _allShots===null
        }

        await _load.call(this);
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

    async loadWorlds(inst, page) {
        const scope = page || document;
        const list = scope.querySelector('[data-ref="inst-worlds-list"]') || scope.getElementById?.('inst-worlds-list');
        if (!list) return;
        list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><p style="margin-top:10px;">Loading worlds...</p></div>';

        try {
            const instPath = inst.folder || inst.path;
            const worlds = await window.electron.getWorlds(instPath);
            list.innerHTML = '';

            if (!worlds || worlds.length === 0) {
                list.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-muted);"><i class="fas fa-globe" style="font-size:36px; display:block; margin-bottom:12px;"></i><p>No worlds found.</p><small>Create a world in Minecraft first.</small></div>';
                return;
            }

            const GAME_MODES = ['Survival', 'Creative', 'Adventure', 'Spectator'];
            const DIFFICULTIES = ['Peaceful', 'Easy', 'Normal', 'Hard'];
            const DIFF_COLORS = ['#4caf50', '#8bc34a', '#ff9800', '#f44336'];

            worlds.forEach(w => {
                const card = document.createElement('div');
                card.style.cssText = 'display:flex; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border-color); gap:16px; transition:background 0.15s; border-radius:6px;';
                card.addEventListener('mouseenter', () => card.style.background = 'var(--secondary-bg)');
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

                const iconEl = document.createElement('img');
                iconEl.style.cssText = 'width:80px; height:80px; border-radius:6px; object-fit:cover; image-rendering:pixelated; background:var(--surface-2); border:2px solid var(--border-color); flex-shrink:0;';
                iconEl.src = w.icon || 'assets/logo.svg';

                const info = document.createElement('div');
                info.style.cssText = 'flex:1; min-width:0;';
                info.innerHTML = `
                    <div style="font-weight:700; font-size:15px; color:var(--text-color); margin-bottom:5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${w.name}">${w.name}</div>
                    <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${w.folder}">${w.folder}</div>
                    <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:5px;">
                        ${isHardcore ? `<span style="background:#c0392b; border-radius:4px; padding:2px 8px; font-size:11px; font-weight:800; color:#fff; display:inline-flex; align-items:center; gap:4px; letter-spacing:0.3px;">&#x2620; HARDCORE</span>` : ''}
                        <span style="background:var(--surface-2); border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:var(--text-muted);">${modeLabel}</span>
                        <span style="background:${diffColor}22; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:${diffColor};">${diffLabel}</span>
                        <span style="background:${w.allowCommands ? '#f59e0b22' : 'var(--surface-2)'}; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:600; color:${w.allowCommands ? '#f59e0b' : 'var(--text-muted)'};">${cheatsLabel}</span>
                    </div>
                    <div style="font-size:11px; color:var(--text-muted);">
                        <i class="fas fa-clock" style="width:13px;"></i> ${dateStr} &nbsp;·&nbsp;
                        <i class="fas fa-gamepad" style="width:13px;"></i> ${playtimeStr} &nbsp;·&nbsp;
                        <i class="fas fa-trophy" style="width:13px;"></i> ${w.advancements} advancements
                    </div>
                `;

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

    async loadServers(inst, page) {
        const scope = page || document;
        const list = scope.querySelector('[data-ref="inst-servers-list"]') || scope.getElementById?.('inst-servers-list');
        if (!list) return;
        const instPath = inst.folder || inst.path;

        list.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading servers...</div>';
        try {
            const servers = await window.electron.getServers(instPath);
            list.innerHTML = '';

            const visible = servers.filter(s => !s.hidden);
            if (visible.length === 0) {
                list.innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-muted);"><i class="fas fa-server" style="font-size:26px; display:block; margin-bottom:10px;"></i>No servers saved.<br><small>Add servers in Minecraft first.</small></div>';
                return;
            }

            for (const srv of visible) {
                const card = document.createElement('div');
                card.style.cssText = 'display:flex; align-items:center; padding:14px 18px; border-bottom:1px solid var(--border-color); gap:16px; transition:background 0.15s; border-radius:6px;';
                card.addEventListener('mouseenter', () => card.style.background = 'var(--secondary-bg)');
                card.addEventListener('mouseleave', () => card.style.background = 'transparent');

                const iconEl = document.createElement('img');
                iconEl.style.cssText = 'width:52px; height:52px; border-radius:6px; object-fit:cover; border:1px solid var(--border-color); flex-shrink:0; image-rendering:pixelated; background:var(--surface-2);';
                iconEl.src = srv.icon || 'assets/logo.svg';
                iconEl.onerror = () => { iconEl.src = 'assets/logo.svg'; };

                // Parse host:port
                const colonIdx = (srv.ip || '').lastIndexOf(':');
                const host = colonIdx > 0 ? srv.ip.slice(0, colonIdx) : (srv.ip || '');
                const portStr = colonIdx > 0 ? srv.ip.slice(colonIdx + 1) : '25565';

                const statusBadge = document.createElement('span');
                statusBadge.style.cssText = 'display:inline-flex; align-items:center; gap:4px; padding:2px 9px; border-radius:4px; font-size:11px; font-weight:700; background:var(--surface-2); color:var(--text-muted);';
                statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Checking...';

                const motdEl = document.createElement('div');
                motdEl.style.cssText = 'font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:4px;';
                motdEl.textContent = '—';

                // IP: hidden by default, click eye icon to reveal
                const ipDisplay = document.createElement('div');
                ipDisplay.style.cssText = 'display:flex; align-items:center; gap:6px; margin-top:2px;';
                const ipText = document.createElement('span');
                ipText.style.cssText = 'font-size:12px; color:var(--text-muted); letter-spacing:2px; font-family:monospace; user-select:none;';
                ipText.textContent = '••••••••••••';
                ipText.dataset.hidden = 'true';
                const eyeBtn = document.createElement('button');
                eyeBtn.style.cssText = 'background:none; border:none; cursor:pointer; color:var(--text-muted); font-size:11px; padding:0; line-height:1; flex-shrink:0;';
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
                nameEl.style.cssText = 'font-weight:700; font-size:14px; color:var(--text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-bottom:2px;';
                nameEl.title = srv.name;
                nameEl.textContent = srv.name;
                info.appendChild(nameEl);
                info.appendChild(ipDisplay);
                info.appendChild(motdEl);

                const playersEl = document.createElement('div');
                playersEl.style.cssText = 'font-size:11px; color:var(--text-muted); margin-top:4px;';
                playersEl.innerHTML = '<i class="fas fa-users"></i> —';

                const versionEl = document.createElement('div');
                versionEl.style.cssText = 'font-size:11px; color:var(--text-muted); margin-top:2px;';

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
                        statusBadge.style.background = '#27ae6022';
                        statusBadge.style.color = '#27ae60';
                        statusBadge.innerHTML = '<i class="fas fa-circle" style="font-size:7px;"></i> Online';
                        playersEl.innerHTML = `<i class="fas fa-users"></i> ${status.players.online}/${status.players.max}`;
                        playersEl.style.color = 'var(--text-muted)';
                        versionEl.textContent = status.version;
                        versionEl.style.color = 'var(--text-muted)';
                        if (status.motd) { motdEl.textContent = status.motd; motdEl.style.color = 'var(--text-muted)'; }
                        if (status.favicon) { iconEl.src = status.favicon; }
                    } else {
                        statusBadge.style.background = '#e74c3c22';
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
        document.getElementById('we-icon').src          = w.icon || 'assets/logo.svg';
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

    selectInstance(inst) {
        document.querySelector('[data-tab="home"]').click();

        // Select this instance in the custom dropdown
        const wrap  = document.getElementById('inst-select');
        const label = document.getElementById('inst-select-label');
        if (wrap && label) {
            wrap.dataset.value = inst.id;
            label.textContent  = inst.name;
            _setInstSelectIcon(inst);
            document.querySelectorAll('#inst-select-list .inst-select-item').forEach(el => {
                el.classList.toggle('active', el.dataset.id === inst.id);
            });
            localStorage.setItem('hexa_last_launched', inst.id);
        }
        _updatePlayBtn(inst);
    },

    async add(name, version, loader, icon, cloudSync = false, loaderVersion = null) {
        const toastVanilla = 'inst-vanilla-' + Date.now();
        const toastLoader  = 'inst-loader-'  + Date.now();
        const loaderLabel  = (loader && loader !== 'vanilla')
            ? loader.charAt(0).toUpperCase() + loader.slice(1).toLowerCase()
            : null;

        // Phase 1 toast — Minecraft download
        window.notify('progress', `Downloading Minecraft ${version}`, null, { id: toastVanilla, percent: 0, duration: 0 });

        // Add placeholder card immediately
        const tempId  = 'inst_' + Date.now();
        const folder  = `inst_${Date.now()}`;
        const newInst = { id: tempId, name, version, loader, icon: icon || null, status: 'installing', folder, cloudSync };
        this.instances.push(newInst);
        this.save();
        this.render();

        // Helper: update the spinner percent label on the card directly (no full re-render)
        const updateCardSpinner = (pct) => {
            const overlay = document.querySelector(`[data-inst-id="${tempId}"] .card-installing-overlay`);
            if (!overlay) return;
            let label = overlay.querySelector('.spinner-pct');
            if (!label) {
                label = document.createElement('span');
                label.className = 'spinner-pct';
                overlay.appendChild(label);
            }
            label.textContent = pct >= 0 ? `${pct}%` : '';
        };

        // Route install-progress events to the right toast based on phase
        const progressHandler = (data) => {
            if (data.instance !== folder) return;

            if (data.phase === 'vanilla') {
                updateCardSpinner(data.percent);
                window.notify('progress', data.title || `Downloading Minecraft ${version}`,
                    data.percent < 100 ? `${data.percent}%` : null,
                    { id: toastVanilla, percent: data.percent, duration: 0 });

            } else if (data.phase === 'loader') {
                updateCardSpinner(data.percent);
                // First loader event — finalize vanilla toast as success
                window.notify('success', `Minecraft ${version} installed`, null, { id: toastVanilla, duration: 3000 });
                // Show/update loader toast
                window.notify('progress', data.title || `Installing ${loaderLabel}`,
                    data.percent < 100 ? `${data.percent}%` : null,
                    { id: toastLoader, percent: data.percent, duration: 0 });

            } else if (data.phase === 'done') {
                updateCardSpinner(-1);
                if (loaderLabel) {
                    window.notify('success', `${loaderLabel} installed`, `${name} ready!`, { id: toastLoader, duration: 4000 });
                } else {
                    // Vanilla-only: close vanilla toast
                    window.notify('success', `Minecraft ${version} installed`, `${name} ready!`, { id: toastVanilla, duration: 4000 });
                }
            } else if (data.percent < 0) {
                window.notify('error', `Failed — ${name}`, data.msg, { id: toastVanilla, duration: 0 });
            }
        };
        if (window.electron?.onInstallProgress) window.electron.onInstallProgress(progressHandler);

        try {
            const result = await window.electron.createInstance({ name, version, loader, loaderVersion, cloudSync, folderName: folder });
            if (!result?.success) throw new Error(result?.error || 'Failed to create instance');

            newInst.folder        = result.folder || folder;
            newInst.loaderVersion = result.loaderVersion || loaderVersion || null;
            newInst.status        = 'Ready';
            this.save();
            this.render();
            return newInst;
        } catch (e) {
            newInst.status = 'Error';
            this.save();
            this.render();
            window.notify('error', `Failed — ${name}`, e.message, { id: toastVanilla, duration: 0 });
            throw e;
        }
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
        if(!modal) {
            console.error('Delete modal not found!');
            if(confirm('Delete this instance permanently?')) this.delete(id);
            return;
        }
        // Force display flex just in case
        modal.style.display = 'flex';
        // Add open class for opacity transition
        requestAnimationFrame(() => modal.classList.add('open'));
        
        const confirmBtn = document.getElementById('confirm-delete-btn');
        if(confirmBtn) {
            const newBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
            
            newBtn.onclick = () => {
                 this.delete(id);
                 modal.classList.remove('open');
                 setTimeout(() => modal.style.display = 'none', 300); // Hide after transition
                 // Also close settings modal if open
                 if(InstanceSettings && InstanceSettings.close) InstanceSettings.close();
            };
        }
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
        
        // Close cached page for deleted instance and hide container if needed
        const cachedPage = this._pageCache[id];
        if (cachedPage) {
            cachedPage.style.display = 'none';
            delete this._pageCache[id];
        }
        const container = document.getElementById('inst-pages-container');
        if (container && window._currentInstanceDetails && window._currentInstanceDetails.id === id) {
            container.style.display = 'none';
        }
    },

    // === NOTIFICATION SYSTEM ===
    showToast(title, progress = 0, id = null) {
        if (progress < 0) {
            window.notify('error', title, null, { id, duration: 4000 });
        } else if (progress >= 100) {
            window.notify('success', title, null, { id, duration: 3000 });
        } else {
            window.notify('progress', title, null, { id, percent: progress, duration: 0 });
        }
    },

    setupEventListeners() {
        if (this._listenersAttached) return;
        this._listenersAttached = true;

        // ... existing listeners ...
        if(window.electron) {
            window.electron.onInstallProgress((data) => {
                const { instance, percent, msg } = data;
                if (msg) window._installerLog.push(`[${instance}][${percent}%] ${msg}`);
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
                const str = data.toString();
                window._logBuffer.push(str); // accumulate for hexa.logs()

                const activePage = document.querySelector('.inst-page[style*="display: block"]')
                                || document.querySelector('.inst-page:not([style*="display: none"])');
                const logContainer = activePage?.querySelector('[data-ref="inst-logs-container"]');
                if(logContainer) {
                    const line = document.createElement('div');
                    line.style.whiteSpace = "pre-wrap";
                    line.style.fontFamily = "Consolas, monospace";
                    line.style.fontSize = "12px";
                    line.style.lineHeight = "1.4";
                    line.style.userSelect = "text"; // ENABLE SELECTION
                    line.style.cursor = "text";

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
        
        // Copy button for logs is now added per-page inside openDetails() via the logs pane (data-ref="inst-logs")
        // No global setup needed since each inst-page has its own log container.

        // Play button is handled by the Fast Launch IIFE at the bottom of the file

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
                    const nameInput      = document.getElementById('nim-name');
                    const verInput       = document.getElementById('nim-version');
                    const loaderVal      = document.getElementById('nim-loader')?.value || 'vanilla';
                    const loaderVerInput = document.getElementById('nim-loader-version');
                    const iconB64        = document.getElementById('nim-icon-b64')?.value || null;
            
                    const name        = nameInput ? nameInput.value.trim() : '';
                    const ver         = verInput  ? verInput.value  : '';
                    const loaderVer   = loaderVerInput?.value?.trim() || null;
                    if (!name) { window.HexaAlert("Information", 'Name is required!'); return; }

                    newConfirm.disabled = true;
                    newConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Installing…';
                    try {
                        // Close modal immediately — progress toast takes over feedback
                        closeModal();
                        if (nameInput) nameInput.value = '';
                        await this.add(name, ver, loaderVal, iconB64 || null, false, loaderVer);
                    } catch (e) {
                        window.HexaAlert("Information", 'Failed to install instance: ' + e.message);
                    } finally {
                        newConfirm.disabled = false;
                        newConfirm.innerHTML = '<i class="fas fa-download"></i> Install';
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
// End: c:\Users\hugob\Documents\GitHub\hexa.launcher\src\renderer.js

// Global Init
window.addEventListener('load', () => {
    // Hide Loading Screen with fade out
    const loader = document.getElementById('app-loading-screen');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 400);
    }

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
    }
};

        // Activity Listeners
// ACTIVITY TRACKER & HEARTBEAT SYSTEM
// Based on User Request (JS Heartbeat Logic)
// ==========================================

const ActivityManager = {
    lastActivityTime: Date.now(),
    currentStatus: 'online',
    isGameRunning: false, // Additional flag for launcher state
    
    // Constants from request
    INACTIVE_THRESHOLD: 60 * 1000, // 1 minute
    HEARTBEAT_INTERVAL: 30 * 1000, // 30 seconds
    
    API_URL: `${API_BASE_URL}/hexa/api/heartbeat`, 

    init() {
        console.log("[ActivityManager] Initializing...");
        
        // Track user activity
        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        
        // Reset Activity Logic (bound to this)
        const resetActivity = () => {
            this.lastActivityTime = Date.now();
            
            // If coming back from inactive (and game not running), force update immediately
            // Note: If game is running, we stay 'ingame' regardless of mouse movement, which is fine.
            if (this.currentStatus === 'inactive') {
                this.currentStatus = 'online';
                this.sendHeartbeat();
            }
        };

        activityEvents.forEach(evt => {
            // Passive listeners for better performance
            window.addEventListener(evt, resetActivity, { passive: true });
        });

        // Start Heartbeat Loop
        setInterval(() => this.sendHeartbeat(), this.HEARTBEAT_INTERVAL);
        
        // Initial call
        this.sendHeartbeat();
    },
    
    // Helper to force game state (Launcher Integration)
    setGameRunning(running) {
        this.isGameRunning = running;
        // Immediate update on state change
        this.sendHeartbeat(); 
    },

    async sendHeartbeat() {
        if (!currentUser) return;

        // Determine status based on last activity
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        
        // Logic: 
        // 1. If Game Running -> Force 'ingame'
        // 2. If Time > Threshold -> 'inactive'
        // 3. Else -> 'online'

        if (this.isGameRunning) {
            this.currentStatus = 'ingame'; 
        } else if (timeSinceActivity > this.INACTIVE_THRESHOLD) {
            this.currentStatus = 'inactive';
        } else {
            this.currentStatus = 'online';
        }

        // Update Launcher UI
        this.updateUI(this.currentStatus);

        try {
            const headers = { 'Content-Type': 'application/json' };
            if (currentUser.accessToken) headers['Authorization'] = `Bearer ${currentUser.accessToken}`;
            await fetch(this.API_URL, {
                method: 'POST',
                headers,
                body: JSON.stringify({ status: this.currentStatus, username: currentUser.username }),
            });
        } catch (err) {
            console.warn('Heartbeat failed', err);
        }
    },
    
    updateUI(state) {
        if (!this._statusEl) this._statusEl = document.querySelector('.status');
        const statusEl = this._statusEl;
        if (!statusEl) return;
        if (state === 'ingame') {
            statusEl.innerText = "PLAYING";
            statusEl.style.color = "#9b59b6";
        } else if (state === 'online') {
            statusEl.innerText = "ONLINE";
            statusEl.style.color = "#2ecc71";
        } else {
            statusEl.innerText = "IDLE";
            statusEl.style.color = "#f1c40f";
        }
    }
};

// Start Manager
// ActivityManager.init(); // Called after login

function _applySanctionUI() {
    const gcInput = document.getElementById('gc-input-text');
    const dmInput = document.getElementById('soc-input-text');
    const gcPanel = document.getElementById('soc-view-global');
    const dmPanel = document.getElementById('soc-view-dm');
    const gcTab   = document.querySelector('[data-soc-tab="global"]');
    const dmTab   = document.querySelector('[data-soc-tab="dm"]');

    const isBanned     = _mySanctions.ban;
    const isRestricted = _mySanctions.restricted;
    const isMuted      = _mySanctions.mute;

    // Muted: can't type in any chat input
    if (gcInput) {
        gcInput.disabled = isMuted || isRestricted || isBanned;
        gcInput.placeholder = isMuted ? 'You are muted.' : isRestricted ? 'You are restricted.' : isBanned ? 'You are banned.' : 'Global chat — write something...';
    }
    if (dmInput) {
        dmInput.disabled = isRestricted || isBanned;
        dmInput.placeholder = isRestricted ? 'You are restricted.' : isBanned ? 'You are banned.' : 'Write a message...';
    }

    // Restricted/banned: hide global chat tab and DM tab
    if (gcTab) { gcTab.style.opacity = isRestricted || isBanned ? '0.35' : ''; gcTab.style.pointerEvents = isRestricted || isBanned ? 'none' : ''; }
    if (dmTab) { dmTab.style.opacity = isRestricted || isBanned ? '0.35' : ''; dmTab.style.pointerEvents = isRestricted || isBanned ? 'none' : ''; }
}

function onLoginSuccess(user) {
    // Fade out Login Overlay
    loginOverlay.style.opacity = '0';
    loginOverlay.style.pointerEvents = 'none';
    setTimeout(() => { loginOverlay.style.display = 'none'; }, 500);
    if (loginDiscordBtn) { loginDiscordBtn.disabled = false; loginDiscordBtn.innerHTML = '<i class="fab fa-discord"></i> CONTINUE WITH DISCORD'; }

    // Fetch role colors
    if (window.electron && window.electron.fetchRoleColors) {
        window.electron.fetchRoleColors().then(res => {
            if (res && res.success) {
                const FA_ICON_MAP = { kitty: 'fa-cat', staff: 'fa-shield-halved', owner: 'fa-crown' };
                Object.entries(res.roles).forEach(([role, data]) => { data.faIcon = FA_ICON_MAP[role] || null; });
                roleColorsCache = res.roles;
            }

        }).catch(() => {});
    }
    // Fetch all users to build role cache for @mentions
    if (window.electron?.fetchUsers) {
        window.electron.fetchUsers().then(res => {
            if (res?.success && Array.isArray(res.users)) {
                res.users.forEach(u => { if (u.username && u.role) _userRoleCache[u.username.toLowerCase()] = u.role; });
            }
        }).catch(() => {});
    }
    // Check active sanctions for current user
    if (window.electron?.checkMySanctions) {
        window.electron.checkMySanctions().then(res => {
            _mySanctions.mute = false; _mySanctions.restricted = false; _mySanctions.ban = false;
            if (res?.success && Array.isArray(res.sanctions)) {
                res.sanctions.forEach(s => { _mySanctions[s.type] = true; });
            }
            _applySanctionUI();
        }).catch(() => {});
    }

    document.getElementById('sidebar-username').innerText = user.username;
    document.querySelector('.status').innerText = "ONLINE";
    document.querySelector('.status').style.color = "#00aa00";

    ActivityManager.currentUser = user;
    ActivityManager.init();

    loadFriends(user.username);
    loadFriendRequests(user.username);

    if (window.electron) {
        window.electron.onInstallProgress((data) => {
            const { instance, percent, msg } = data;
            if (instance.startsWith('java_')) LibraryManager.showToast(msg, percent, 'toast-' + instance);
        });
    }

    refreshSkinDisplay();
    // Re-enable chat input on login
    const gcInput = document.getElementById('gc-input-text');
    if (gcInput) { gcInput.disabled = false; gcInput.placeholder = 'Write a message...'; }
    const gcSendBtn = document.getElementById('gc-send-btn');
    if (gcSendBtn) gcSendBtn.disabled = false;

    const _skinUrlForCache = user.skin || `${API_BASE_URL}/hexa/api/textures/skins/${user.username}.png`;
    window.electron.fetchImageBase64(_skinUrlForCache).then(dataUrl => {
        if (dataUrl) extractHeadAvatar(dataUrl).then(h => { gcMyAvatarDataUrl = h; }).catch(() => {});
    }).catch(() => {});
}

// Login Logic
const loginOverlay = document.getElementById('login-overlay');
const loginUsernameInput = document.getElementById('login-username');
const loginPasswordInput = document.getElementById('login-password');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginDiscordBtn = document.getElementById('login-discord-btn');
const loginErrorObj = document.getElementById('login-error');

// Discord deep-link auth-success listener (fires when browser completes OAuth)
window.electron.onAuthSuccess((user) => {
    currentUser = user;
    onLoginSuccess(user);
});
window.electron.onAuthError((err) => {
    loginErrorObj.innerText = 'Discord login failed: ' + err;
    if (loginDiscordBtn) { loginDiscordBtn.disabled = false; loginDiscordBtn.innerHTML = '<i class="fab fa-discord"></i> CONTINUE WITH DISCORD'; }
});

if (loginDiscordBtn) {
    loginDiscordBtn.addEventListener('click', () => {
        loginDiscordBtn.disabled = true;
        loginDiscordBtn.innerHTML = '<i class="fab fa-discord"></i> OPENING BROWSER...';
        loginErrorObj.innerText = '';
        window.electron.openExternal('https://hexa-mc.fr/auth/discord/login?launcher=1');
        // Re-enable after 30s if no callback
        setTimeout(() => {
            if (loginDiscordBtn.disabled) {
                loginDiscordBtn.disabled = false;
                loginDiscordBtn.innerHTML = '<i class="fab fa-discord"></i> CONTINUE WITH DISCORD';
            }
        }, 30000);
    });
}

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
        const result = await window.electron.login({ username, password });

        if (result.success) {
            currentUser = result.user;
            localStorage.setItem('hexa_saved_user', JSON.stringify({ username, password }));
            onLoginSuccess(currentUser);

        } else if (result.requires_2fa) {
            // Afficher l'overlay 2FA
            document.getElementById('login-2fa-box').style.display = '';
            document.querySelector('#login-overlay .login-box:not(#login-2fa-box)').style.display = 'none';
            document.getElementById('login-2fa-input').focus();
            // Stocker le tempToken pour la vérification
            document.getElementById('login-2fa-btn').dataset.tempToken = result.tempToken;
            document.getElementById('login-2fa-btn').dataset.savedUsername = username;
            document.getElementById('login-2fa-btn').dataset.savedPassword = password;

            loginSubmitBtn.disabled = false;
            loginSubmitBtn.innerText = "INITIALIZE SESSION";
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

// ── 2FA verification at login ─────────────────────────────────────────────────
const twoFaBtn   = document.getElementById('login-2fa-btn');
const twoFaInput = document.getElementById('login-2fa-input');
const twoFaError = document.getElementById('login-2fa-error');
const twoFaBack  = document.getElementById('login-2fa-back');

async function submit2FA() {
    const code = twoFaInput.value.replace(/\s/g, '');
    if (code.length !== 6) { twoFaError.innerText = 'Enter a 6-digit code.'; return; }
    twoFaBtn.disabled = true;
    twoFaBtn.innerText = 'VERIFYING...';
    twoFaError.innerText = '';
    try {
        const tempToken = twoFaBtn.dataset.tempToken;
        const result = await window.electron.verify2fa({ tempToken, code });
        if (result.success) {
            currentUser = result.user;
            const savedUsername = twoFaBtn.dataset.savedUsername;
            const savedPassword = twoFaBtn.dataset.savedPassword;
            if (savedUsername && savedPassword) {
                localStorage.setItem('hexa_saved_user', JSON.stringify({ username: savedUsername, password: savedPassword }));
            }
            // Remettre le login-box visible pour la prochaine fois
            document.getElementById('login-2fa-box').style.display = 'none';
            document.querySelector('#login-overlay .login-box:not(#login-2fa-box)').style.display = '';
            onLoginSuccess(currentUser);
        } else {
            twoFaError.innerText = result.message || 'Invalid code.';
            twoFaBtn.disabled = false;
            twoFaBtn.innerText = 'VERIFY';
        }
    } catch (e) {
        twoFaError.innerText = 'Error: ' + e.message;
        twoFaBtn.disabled = false;
        twoFaBtn.innerText = 'VERIFY';
    }
}

if (twoFaBtn) twoFaBtn.addEventListener('click', submit2FA);
if (twoFaInput) twoFaInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit2FA(); });
if (twoFaBack) twoFaBack.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-2fa-box').style.display = 'none';
    document.querySelector('#login-overlay .login-box:not(#login-2fa-box)').style.display = '';
    twoFaInput.value = '';
    twoFaError.innerText = '';
});

async function refreshSkinDisplay() {
    if (!currentUser) return;
    
    try {
        const fullSkinUrl = currentUser.skin || `${API_BASE_URL}/hexa/api/textures/skins/${currentUser.username}.png`;
        const capeUrl = currentUser.cape || null; // ne pas charger si pas de cape

        console.log("[Skin] Fetching skin:", fullSkinUrl);

        // Fetch skin via main process
        let skinDataUrl = null;
        if (fullSkinUrl) {
            skinDataUrl = await window.electron.fetchImageBase64(fullSkinUrl).catch(() => null);
        }
        
        // Fetch cape
        let capeDataUrl = null;
        if (capeUrl) {
            // Check if cape actually exists (returns non-transparent)
            // skin_handler checks file existence.
            capeDataUrl = await window.electron.fetchImageBase64(capeUrl).catch(() => null);
            // If it's a 1x1 transparent png, skinview3d might ignore it or we should check size.
            // But we'll let viewer handle it.
        }

        // Extract head avatar from data URL (no CORS issues)
        let headAvatarSrc = 'https://minotar.net/helm/MHF_Steve/64';
        if (skinDataUrl) {
            headAvatarSrc = await extractHeadAvatar(skinDataUrl).catch(() => 'https://minotar.net/helm/MHF_Steve/64');
        }
        gcMyAvatarDataUrl = headAvatarSrc; // cache for instant chat optimistic UI

        // Update Sidebar Avatar
        const sidebarAvatar = document.getElementById('sidebar-avatar');
        if (sidebarAvatar) {
            sidebarAvatar.innerHTML = `<img src="${headAvatarSrc}" style="width: 100%; height: 100%; image-rendering: pixelated; border-radius: 4px;">`;
        }

        // Update Wardrobe Preview (if used elsewhere)
        const wardrobePreview = document.getElementById('wardrobe-preview');
        if (wardrobePreview) {
            wardrobePreview.src = headAvatarSrc;
        }

        // Update 3D Viewer (Full Skin + Cape) if it exists
        if (typeof skinViewer !== 'undefined' && skinViewer) {
            if (skinDataUrl) {
                skinViewer.loadSkin(skinDataUrl);
            } else if (fullSkinUrl) {
                skinViewer.loadSkin(fullSkinUrl);
            }
            if (capeDataUrl) {
                skinViewer.loadCape(capeDataUrl);
            } else if (capeUrl) {
                skinViewer.loadCape(capeUrl).catch(()=>{});
            } else {
                 skinViewer.loadCape(null);
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

// Skin & Cape Upload Logic
(function() {
    const uploadBtn = document.getElementById('upload-skin-btn');
    const fileInput = document.getElementById('skin-upload-input');
    const capeBtn = document.getElementById('upload-cape-btn');
    const capeInput = document.getElementById('cape-upload-input');
    const removeCapeBtn = document.getElementById('remove-cape-btn');
    
    // Updated endpoint logic based on user setup
    const HANDLER_URL = `${API_BASE_URL}/php/skin_handler.php`;

    // SKIN UPLOAD
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type !== 'image/png') {
                window.HexaAlert("Information", 'Only PNG files are allowed.');
                return;
            }

            const formData = new FormData();
            formData.append('skin', file);
            formData.append('username', currentUser ? currentUser.username : 'Guest');
            formData.append('action', 'upload');

            const orgText = uploadBtn.innerHTML;
            uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            uploadBtn.disabled = true;

            try {
                const response = await fetch(HANDLER_URL, { method: 'POST', body: formData });
                // Check if response is OK and JSON
                if (!response.ok) throw new Error('Server error: ' + response.status);
                const result = await response.json();

                if (result.success) {
                    window.HexaAlert("Success", 'Skin uploaded successfully!');
                    // Refresh rendering
                    refreshSkinDisplay(); 
                    if (window.initCarousel) window.initCarousel(); // Refresh wardrobe
                } else {
                    window.HexaAlert("Error", 'Upload failed: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                console.error(err);
                // Fallback attempt to old API if new handler fails (optional)
                window.HexaAlert("Error", 'Network error or invalid server response.');
            } finally {
                uploadBtn.innerHTML = orgText;
                uploadBtn.disabled = false;
                fileInput.value = '';
            }
        });
    }

    // CAPE UPLOAD
    if (capeBtn && capeInput) {
        capeBtn.addEventListener('click', () => capeInput.click());

        capeInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (file.type !== 'image/png') {
                window.HexaAlert("Information", 'Only PNG files are allowed.');
                return;
            }

            const formData = new FormData();
            formData.append('cape', file);
            formData.append('username', currentUser ? currentUser.username : 'Guest');
            formData.append('action', 'upload_cape');

            const orgText = capeBtn.innerHTML;
            capeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
            capeBtn.disabled = true;

            try {
                const response = await fetch(HANDLER_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Server error: ' + response.status);
                const result = await response.json();

                if (result.success) {
                    window.HexaAlert("Success", 'Cape uploaded successfully!');
                    if (window.initCarousel) window.initCarousel(); // Refresh wardrobe
                    refreshSkinDisplay();
                } else {
                    window.HexaAlert("Error", 'Upload failed: ' + (result.error || 'Unknown error'));
                }
            } catch (err) {
                console.error(err);
                window.HexaAlert("Error", 'Failed to upload cape.');
            } finally {
                capeBtn.innerHTML = orgText;
                capeBtn.disabled = false;
                capeInput.value = '';
            }
        });
    }
    
    // REMOVE CAPE
    if (removeCapeBtn) {
        removeCapeBtn.addEventListener('click', async () => {
             // For now we don't have a remove-cape endpoint in PHP handler, 
             // but usually uploading a transparent png or having a dedicated action works.
             // I'll assume we might not implement full removal yet or use a hack.
             window.HexaAlert("Information", "To remove a cape, please upload a transparent 64x32 PNG file.");
        });
    }
})();

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
                 const selectModal = document.getElementById('select-instance-modal');

                 if (gallery && gallery.style.display !== 'none') {
                     gallery.style.display = 'none';
                     return;
                 }
                 if (selectModal && selectModal.style.display !== 'none') {
                     selectModal.style.display = 'none';
                     return;
                 }
                 // If an inst-page is currently visible, goBack() will handle hiding it via restoreState.
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
        
        // Hide non-scroll tab sections (scroll-sections stay visible, they use scroll position)
        document.querySelectorAll('.tab-section:not(.scroll-section)').forEach(s => {
            s.classList.remove('active');
            s.style.display = '';
        });

        // Always close volatile overlays first
        // Hide inst-pages-container when navigating away from instance-detail states
        const instContainer = document.getElementById('inst-pages-container');
        if (instContainer && state.type !== 'instance-detail') {
            instContainer.style.display = 'none';
            instContainer.querySelectorAll('.inst-page').forEach(p => p.style.display = 'none');
        }

        const gallery = document.getElementById('gallery-lightbox');
        if(gallery) gallery.style.display = 'none';

        const projView = document.getElementById('project-details-view');
        if(projView) projView.style.display = 'none';

        if (state.type === 'root') {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            const navBtn = document.querySelector(`.nav-item[data-tab="${state.tab}"]`);
            if (navBtn) navBtn.classList.add('active');

            const tabEl = document.getElementById(`${state.tab}-tab`);
            if (tabEl) {
                if (tabEl.classList.contains('scroll-section')) {
                    // Instant scroll (no animation during history restore)
                    tabEl.scrollIntoView({ behavior: 'instant', block: 'start' });
                } else {
                    tabEl.classList.add('active');
                }
            }
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
             // Show the cached inst-page for this instance if it exists
             const cachedPage = LibraryManager._pageCache[state.instanceId];
             if (cachedPage && instContainer) {
                 instContainer.style.display = 'block';
                 cachedPage.style.display = 'block';
             } else if (state.instanceId) {
                 // Page not yet built — re-open it
                 const inst = LibraryManager.instances.find(i => i.id === state.instanceId);
                 if (inst) LibraryManager.openDetails(inst, false);
             }

             // Deselect sidebar
             document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
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

// ── Navigation: scroll-sync ──────────────────────────────────────────────────
(function () {
    const contentArea = document.querySelector('.content-area');
    const scrollSections = document.querySelectorAll('.scroll-section');

    // Map section id → nav tab name  (e.g. "home-tab" → "home")
    const sectionTabMap = {};
    scrollSections.forEach(s => {
        const match = s.id.match(/^(.+)-tab$/);
        if (match) sectionTabMap[s.id] = match[1];
    });

    function setActiveNav(tabName) {
        document.querySelectorAll('.nav-item').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tabName);
        });
    }

    // IntersectionObserver — highlights whichever section's top edge is in the
    // upper third of the viewport. Works with sections taller than the screen.
    let scrollLock = false;
    const observer = new IntersectionObserver((entries) => {
        if (scrollLock) return;
        // Pick the entry whose top is closest to (but still below) the root top
        let best = null;
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (!best || entry.boundingClientRect.top < best.boundingClientRect.top) {
                    best = entry;
                }
            }
        });
        if (best) {
            const tabName = sectionTabMap[best.target.id];
            if (tabName) setActiveNav(tabName);
        }
    }, {
        root: contentArea,
        // Fire when the top ~40% of the section enters the top of the scroll area
        rootMargin: '0px 0px -60% 0px',
        threshold: 0,
    });

    scrollSections.forEach(s => observer.observe(s));

    // Nav click → scroll to matching section
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            if (btn.getAttribute('data-tab') !== 'content' && typeof ContentBrowser !== 'undefined') {
                ContentBrowser._targetInstance = null;
            }

            // Check if this tab is a scroll-section
            const scrollTarget = document.getElementById(`${tabId}-tab`);
            if (scrollTarget && scrollTarget.classList.contains('scroll-section')) {
                setActiveNav(tabId);
                scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // Non-scroll tab (browser-tab, instance-details, etc.) — show/hide approach
                setActiveNav(tabId);
                document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
                if (scrollTarget) scrollTarget.classList.add('active');
            }
        });
    });
})();

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
// ── UPDATE SYSTEM ────────────────────────────────────────────────────────────
const UpdateManager = (() => {
    let _currentVersion = '0.0.0';
    let _latestVersion  = null;
    let _releaseNotes   = '';
    let _isOutdated     = false;

    function _parseVer(v) {
        return (v || '0.0.0').split('.').map(Number);
    }
    // Outdated if major diff >= 1, OR if major is equal and minor/patch diff >= 5
    function _isOutdatedCheck(current, latest) {
        const [cMaj, cMin, cPat] = _parseVer(current);
        const [lMaj, lMin, lPat] = _parseVer(latest);
        if (lMaj > cMaj) return true;
        if (lMaj === cMaj && (lMin - cMin) >= 5) return true;
        if (lMaj === cMaj && lMin === cMin && (lPat - cPat) >= 5) return true;
        return false;
    }

    function _openModal() {
        const modal = document.getElementById('update-modal');
        if (!modal) return;
        document.getElementById('upd-cur-version').textContent = `v${_currentVersion}`;
        document.getElementById('upd-new-version').textContent = `v${_latestVersion || '?'}`;

        const badge = document.getElementById('upd-badge');
        const outdatedMsg = document.getElementById('upd-outdated-msg');
        if (_isOutdated) {
            badge.textContent = 'OUTDATED — UPDATE REQUIRED';
            badge.classList.add('outdated');
            outdatedMsg.style.display = 'block';
        } else {
            badge.textContent = 'UPDATE AVAILABLE';
            badge.classList.remove('outdated');
            outdatedMsg.style.display = 'none';
        }

        document.getElementById('upd-changelog-wrap').style.display = 'none';
        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('open'));
    }

    function _closeModal() {
        const modal = document.getElementById('update-modal');
        if (!modal) return;
        modal.classList.remove('open');
        setTimeout(() => { modal.style.display = 'none'; }, 300);
    }

    function _setUpdate(info) {
        _latestVersion = info.version;
        _releaseNotes  = Array.isArray(info.notes)
            ? info.notes.map(n => (typeof n === 'string' ? n : n.note || '')).join('\n')
            : (info.notes || '');
        _isOutdated = _isOutdatedCheck(_currentVersion, _latestVersion);

        // Make titlebar logo pulse red if update available
        const logo = document.querySelector('.titlebar-logo');
        if (logo) logo.classList.add('has-update');
    }

    function isLaunchBlocked() { return _isOutdated && _latestVersion !== null; }

    function init() {
        // Get current version first, then check for updates
        const versionPromise = (window.electron && window.electron.getAppVersion)
            ? window.electron.getAppVersion()
            : Promise.resolve('0.0.0');

        versionPromise.then(async v => {
            _currentVersion = v || '0.0.0';
            const el = document.getElementById('launcher-version');
            if (el) el.textContent = 'v' + _currentVersion;

            // Check GitHub releases API directly — no dependency on latest.yml
            try {
                const res = await fetch('https://api.github.com/repos/kipawepro/hexa-mc-launcher/releases/latest', {
                    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'HexaLauncher' }
                });
                if (res.ok) {
                    const data = await res.json();
                    const latest = (data.tag_name || '').replace(/^v/, '');
                    const notes  = data.body || '';
                    if (latest && latest !== _currentVersion) {
                        _setUpdate({ version: latest, notes });
                    }
                }
            } catch(e) {
                console.warn('[UpdateManager] GitHub check failed:', e.message);
            }
        });

        // Download progress
        if (window.electron && window.electron.onUpdateProgress) {
            window.electron.onUpdateProgress(percent => {
                window.notify('progress', 'Updating', `${percent}%`, { id: 'update-toast', percent: parseInt(percent), duration: 0 });
                if (parseInt(percent) >= 100) {
                    window.notify('success', 'Update ready', 'Restarting…', { id: 'update-toast', duration: 0 });
                }
            });
        }

        // Titlebar logo → open modal
        const logo = document.querySelector('.titlebar-logo');
        if (logo) {
            logo.style.cursor = 'pointer';
            logo.addEventListener('click', () => {
                if (_latestVersion) {
                    _openModal();
                } else {
                    // No update — check now
                    if (window.electron && window.electron.checkUpdate) {
                        window.electron.checkUpdate().then(res => {
                            if (res && res.available) { _setUpdate(res); _openModal(); }
                            else window.notify('success', 'Up to date', `v${_currentVersion} is the latest version`, { duration: 3000 });
                        });
                    }
                }
            });
        }

        // Modal buttons
        const closeBtn = document.getElementById('upd-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', _closeModal);

        const modal = document.getElementById('update-modal');
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) _closeModal(); });

        const nowBtn = document.getElementById('upd-now-btn');
        if (nowBtn) nowBtn.addEventListener('click', async () => {
            nowBtn.disabled = true;
            nowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Preparing…';
            window.notify('progress', 'Downloading update', '0%', { id: 'update-toast', percent: 0, duration: 0 });
            try {
                // electron-updater requires checkForUpdates before downloadUpdate
                if (window.electron && window.electron.checkUpdate) {
                    await window.electron.checkUpdate();
                }
                if (window.electron && window.electron.downloadUpdate) {
                    await window.electron.downloadUpdate();
                }
                // Rocket launch after download starts
                const rocketWrap = document.getElementById('upd-rocket-wrap');
                if (rocketWrap) rocketWrap.classList.add('launching');
                nowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Downloading…';
            } catch(e) {
                nowBtn.disabled = false;
                nowBtn.innerHTML = '<i class="fas fa-download"></i> Update Now';
                window.notify('error', 'Update failed', e.message, { duration: 5000 });
            }
        });

        const changelogBtn = document.getElementById('upd-changelog-btn');
        if (changelogBtn) changelogBtn.addEventListener('click', () => {
            const wrap = document.getElementById('upd-changelog-wrap');
            const body = document.getElementById('upd-changelog-body');
            if (!wrap) return;
            if (wrap.style.display === 'none') {
                body.textContent = _releaseNotes || 'No release notes available.';
                wrap.style.display = 'block';
                changelogBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Hide';
            } else {
                wrap.style.display = 'none';
                changelogBtn.innerHTML = "<i class='fas fa-scroll'></i> What's New";
            }
        });
    }

    return { init, isLaunchBlocked };
})();

UpdateManager.init();


// Launch Logic
// ─── CUSTOM INSTANCE SELECT ─────────────────────────────────────────────────

function _setInstSelectIcon(inst) {
    const img = document.getElementById('inst-select-img');
    if (!img) return;
    img.src = (inst && inst.icon) ? inst.icon : 'assets/logo.svg';
}

function _renderInstSelect(instances) {
    const wrap  = document.getElementById('inst-select');
    const list  = document.getElementById('inst-select-list');
    const label = document.getElementById('inst-select-label');
    if (!wrap || !list) return;

    list.innerHTML = '';

    if (!instances || instances.length === 0) {
        list.innerHTML = '<div class="inst-select-empty">No instances — create one in your Library</div>';
        wrap.dataset.value = '';
        label.textContent = 'No instance yet';
        _setInstSelectIcon(null);
        _updatePlayBtn(null);
        return;
    }

    const lastId  = localStorage.getItem('hexa_last_launched');
    let   selInst = instances.find(i => i.id === lastId) || instances[0];

    instances.forEach(inst => {
        const item = document.createElement('div');
        item.className = 'inst-select-item' + (inst.id === selInst.id ? ' active' : '');
        item.dataset.id = inst.id;

        const iconSrc = inst.icon || 'assets/logo.svg';
        const loader  = inst.loader || 'Vanilla';
        const status  = inst.status && inst.status !== 'Ready' ? ` · ${inst.status}` : '';
        item.innerHTML = `<img class="inst-si-icon" src="${iconSrc}" onerror="this.src='assets/logo.svg'">
            <div class="inst-si-text">
                <span class="inst-si-name">${inst.name}</span>
                <span class="inst-si-meta">${inst.version} · ${loader}${status}</span>
            </div>`;

        item.addEventListener('click', () => {
            list.querySelectorAll('.inst-select-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            wrap.dataset.value = inst.id;
            label.textContent  = inst.name;
            _setInstSelectIcon(inst);
            wrap.classList.remove('open');
            _updatePlayBtn(inst);
            localStorage.setItem('hexa_last_launched', inst.id);
        });

        list.appendChild(item);
    });

    wrap.dataset.value = selInst.id;
    label.textContent  = selInst.name;
    _setInstSelectIcon(selInst);
    _updatePlayBtn(selInst);
}

function _updatePlayBtn(inst) {
    const btn = document.getElementById('play-btn');
    if (!btn || btn.dataset.state === 'running' || btn.dataset.state === 'launching') return;
    if (!inst) {
        btn.textContent = 'LAUNCH GAME';
        btn.disabled    = true;
        return;
    }
    if (inst.status && inst.status !== 'Ready') {
        btn.textContent = inst.status.toUpperCase();
        btn.disabled    = true;
    } else {
        btn.textContent = `LAUNCH ${inst.name.toUpperCase()}`;
        btn.disabled    = false;
    }
}

// Toggle open/close on trigger click, close on outside click
;(function () {
    const wrap = document.getElementById('inst-select');
    const curr = document.getElementById('inst-select-current');
    if (!wrap || !curr) return;
    curr.addEventListener('click', (e) => {
        e.stopPropagation();
        wrap.classList.toggle('open');
    });
    document.addEventListener('click', () => wrap.classList.remove('open'));
})();

// ─── FAST LAUNCH ─────────────────────────────────────────────────────────────

(function () {
    const playBtn = document.getElementById('play-btn');
    const wrap    = document.getElementById('inst-select');
    if (!playBtn || !wrap) return;

    function getSelectedInst() {
        const id = wrap.dataset.value;
        if (!id) return null;
        return (typeof LibraryManager !== 'undefined' ? LibraryManager.instances.find(i => i.id === id) : null);
    }

    function setBtn(state) {
        // state: 'play' | 'launching' | 'running' | 'stopping'
        playBtn.disabled = state !== 'play' && state !== 'running';
        const icons = { play: 'fa-play', launching: 'fa-spinner fa-spin', running: 'fa-stop', stopping: 'fa-spinner fa-spin' };
        const labels = { play: 'PLAY', launching: 'LAUNCHING...', running: 'STOP', stopping: 'STOPPING...' };
        playBtn.innerHTML = `<i class="fas ${icons[state]}"></i> ${labels[state]}`;
        playBtn.dataset.state = state;
    }

    playBtn.addEventListener('click', async () => {
        const state = playBtn.dataset.state || 'play';

        // STOP action
        if (state === 'running') {
            setBtn('stopping');
            if (window.electron?.stopGame) await window.electron.stopGame();
            return;
        }
        if (state !== 'play') return;

        // Block launch if launcher is outdated
        if (typeof UpdateManager !== 'undefined' && UpdateManager.isLaunchBlocked()) {
            window.notify('error', 'Update required', 'Your launcher is outdated. Please update to play.', { duration: 5000 });
            document.getElementById('update-modal').style.display = 'flex';
            document.getElementById('update-modal').classList.add('open');
            return;
        }

        const inst = getSelectedInst();
        if (!inst) {
            window.notify('warning', 'Fast Launch', 'Select an instance first');
            return;
        }

        localStorage.setItem('hexa_last_launched', wrap.dataset.value);
        setBtn('launching');

        const toastId = 'fast-launch-toast';
        window.notify('progress', `Launching — ${inst.name}`, `${inst.version} / ${inst.loader || 'Vanilla'}`, { id: toastId, percent: 0, duration: 0 });

        // Build correct launch options matching what main.js expects
        const loaderType = (inst.loader && inst.loader.toLowerCase() !== 'vanilla') ? inst.loader.toLowerCase() : null;
        const launchOptions = {
            instanceFolder: inst.folder || inst.id,
            version:        inst.version,
            loader:         loaderType || 'vanilla',
            loaderVersion:  inst.loaderVersion || null,
            isOfficial:     inst.isOfficial || false,
            username:       currentUser ? currentUser.username : 'Player',
            uuid:           currentUser ? (currentUser.uuid || currentUser.id) : '00000000-0000-0000-0000-000000000000',
            accessToken:    currentUser ? currentUser.accessToken : '0',
        };

        // Forward log lines to toast message
        const logUnsub = window.electron.onLog(msg => {
            window.notify('progress', `Launching — ${inst.name}`, msg.substring(0, 60), { id: toastId, percent: 50, duration: 0 });
        });

        try {
            const result = await window.electron.launch(launchOptions);
            if (!result?.success) {
                throw new Error(result?.message || 'Launch error');
            }
            // Game process started
            window._gameRunning = true;
            setBtn('running');
            window.notify('success', `${inst.name} running`, `${inst.version} / ${inst.loader || 'Vanilla'}`, { id: toastId, duration: 4000 });
        } catch (e) {
            window._gameRunning = false;
            setBtn('play');
            window.notify('error', `Failed — ${inst.name}`, e.message, { id: toastId, duration: 0 });
        }
    });

    // Reset fast launch button on game exit (same event as the instance page)
    window.electron.onGameExit(() => {
        setBtn('play');
    });
})();

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
        limit: 24
    },

    showToast(title, progress, id) {
        LibraryManager.showToast(title, progress, id);
    },
    
    init() {
        console.log("Initializing ContentBrowser...");
        this.populateVersions();
        this.bindEvents();
        this._updateSidebarForType(this.state.type);
        setTimeout(() => this.search(), 100);

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
                 const div = document.createElement('div');
                 div.className = 'brw-cat-link';
                 div.setAttribute('data-value', ver.version);
                 div.innerHTML = `<i class="fas fa-code-branch"></i> ${ver.version}`;
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
                div.className = 'brw-cat-link';
                div.setAttribute('data-value', ver);
                div.innerHTML = `<i class="fas fa-code-branch"></i> ${ver}`;
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

        document.querySelectorAll('.brw-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.brw-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const newType = btn.getAttribute('data-type');
                this.state.type = newType;
                this.state.category = '';
                this.state.env = '';
                this.state.offset = 0;
                // Restore instance loader when switching back to mods, clear it otherwise
                const loaderTypes = ['mod', 'modpack'];
                if (loaderTypes.includes(newType)) {
                    this.state.loader = (newType === 'mod' && this._instanceLoader) ? this._instanceLoader : '';
                    // Sync loader UI
                    const loaderList = document.getElementById('list-loader');
                    if (loaderList) {
                        loaderList.querySelectorAll('.brw-cat-link').forEach(l => l.classList.remove('active'));
                        const target = this.state.loader
                            ? loaderList.querySelector(`.brw-cat-link[data-value="${this.state.loader}"]`)
                            : loaderList.querySelector('.brw-cat-link[data-value=""]');
                        if (target) target.classList.add('active');
                    }
                }
                this._updateSidebarForType(newType);
                this.search();
            });
        });

        const setupFilterGroup = (groupId, stateKey) => {
            const container = document.getElementById(groupId);
            if(!container) return;
            container.addEventListener('click', (e) => {
                 const link = e.target.closest('.brw-cat-link');
                 if(!link) return;
                 container.querySelectorAll('.brw-cat-link').forEach(el => el.classList.remove('active'));
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
                if(tab) {
                    tab.classList.remove('active-browser');
                    tab.style.display = 'none';
                }
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
                 this.reset();
                 const tab = document.getElementById('browser-tab');
                 if(tab) {
                     tab.removeAttribute('style');
                     tab.classList.add('active-browser');
                 }
             });
        }
        if(backBtn) {
            backBtn.addEventListener('click', () => {
                 const tab = document.getElementById('browser-tab');
                 if(tab) {
                     tab.classList.remove('active-browser');
                     tab.removeAttribute('style');
                 }
            });
        }
    },

    _updateSidebarForType(type) {
        // Show/hide loader & env sections based on type
        const loaderSec = document.getElementById('brw-loader-section');
        const envSec = document.getElementById('brw-env-section');
        const showLoader = ['mod', 'modpack'].includes(type);
        const showEnv = ['mod', 'modpack'].includes(type);
        if (loaderSec) loaderSec.style.display = showLoader ? '' : 'none';
        if (envSec) envSec.style.display = showEnv ? '' : 'none';

        // Reset loader filter when switching to a type that doesn't use it
        if (!showLoader) {
            this.state.loader = '';
            const loaderList = document.getElementById('list-loader');
            if (loaderList) {
                loaderList.querySelectorAll('.brw-cat-link').forEach(l => l.classList.remove('active'));
                const first = loaderList.querySelector('.brw-cat-link');
                if (first) first.classList.add('active');
            }
        }

        // Update category list based on type
        const catList = document.getElementById('list-category');
        if (!catList) return;
        const allCats = catList.querySelector('.brw-cat-link[data-value=""]');

        const catSets = {
            modpack: [
                {v:'adventure',l:'Adventure',i:'fa-map'},{v:'combat',l:'Combat',i:'fa-fist-raised'},
                {v:'exploration',l:'Exploration',i:'fa-compass'},{v:'magic',l:'Magic',i:'fa-hat-wizard'},
                {v:'minigame',l:'Mini Game',i:'fa-gamepad'},{v:'multiplayer',l:'Multiplayer',i:'fa-users'},
                {v:'optimization',l:'Optimization',i:'fa-tachometer-alt'},{v:'quests',l:'Quests',i:'fa-exclamation-circle'},
                {v:'tech',l:'Technology',i:'fa-microchip'},{v:'vanilla-like',l:'Vanilla+',i:'fa-leaf'}
            ],
            mod: [
                {v:'adventure',l:'Adventure',i:'fa-compass'},{v:'decoration',l:'Decoration',i:'fa-chair'},
                {v:'equipment',l:'Equipment',i:'fa-shield-alt'},{v:'food',l:'Food',i:'fa-utensils'},
                {v:'game_mechanics',l:'Game Mechanics',i:'fa-cogs'},{v:'magic',l:'Magic',i:'fa-magic'},
                {v:'management',l:'Management',i:'fa-tasks'},{v:'minigame',l:'Minigame',i:'fa-gamepad'},
                {v:'mobs',l:'Mobs',i:'fa-paw'},{v:'optimization',l:'Optimization',i:'fa-tachometer-alt'},
                {v:'social',l:'Social',i:'fa-users'},{v:'storage',l:'Storage',i:'fa-box'},
                {v:'technology',l:'Technology',i:'fa-microchip'},{v:'transportation',l:'Transportation',i:'fa-subway'},
                {v:'utility',l:'Utility',i:'fa-tools'},{v:'world_generation',l:'World Gen',i:'fa-globe'}
            ],
            resourcepack: [
                {v:'combat',l:'Combat',i:'fa-tag'},{v:'cursed',l:'Cursed',i:'fa-tag'},
                {v:'decoration',l:'Decoration',i:'fa-tag'},{v:'realistic',l:'Realistic',i:'fa-camera'},
                {v:'simplistic',l:'Simplistic',i:'fa-tag'},{v:'themed',l:'Themed',i:'fa-tag'},
                {v:'tweaks',l:'Tweaks',i:'fa-tag'},{v:'utility',l:'Utility',i:'fa-tools'},
                {v:'vanilla-like',l:'Vanilla Like',i:'fa-tag'}
            ],
            shader: [
                {v:'cartoon',l:'Cartoon',i:'fa-paint-brush'},{v:'fantasy',l:'Fantasy',i:'fa-magic'},
                {v:'realistic',l:'Realistic',i:'fa-camera'},{v:'semi-realistic',l:'Semi Realistic',i:'fa-film'},
                {v:'vanilla-like',l:'Vanilla Like',i:'fa-ice-cream'}
            ],
            datapack: [
                {v:'adventure',l:'Adventure',i:'fa-compass'},{v:'decoration',l:'Decoration',i:'fa-chair'},
                {v:'food',l:'Food',i:'fa-utensils'},{v:'game_mechanics',l:'Game Mechanics',i:'fa-cogs'},
                {v:'magic',l:'Magic',i:'fa-magic'},{v:'mobs',l:'Mobs',i:'fa-paw'},
                {v:'optimization',l:'Optimization',i:'fa-tachometer-alt'},{v:'storage',l:'Storage',i:'fa-box'},
                {v:'technology',l:'Technology',i:'fa-microchip'},{v:'world_generation',l:'World Gen',i:'fa-globe'}
            ]
        };

        const cats = catSets[type] || catSets.mod;
        catList.innerHTML = '<div class="brw-cat-link active" data-value=""><i class="fas fa-th-large"></i> All Categories</div>';
        cats.forEach(c => {
            catList.insertAdjacentHTML('beforeend',
                `<div class="brw-cat-link" data-value="${c.v}"><i class="fas ${c.i}"></i> ${c.l}</div>`);
        });
        // Re-bind click for the refreshed list
        const setupCat = (groupId, stateKey) => {
            const container = document.getElementById(groupId);
            if (!container) return;
            container.addEventListener('click', (e) => {
                const link = e.target.closest('.brw-cat-link');
                if (!link) return;
                container.querySelectorAll('.brw-cat-link').forEach(el => el.classList.remove('active'));
                link.classList.add('active');
                this.state[stateKey] = link.getAttribute('data-value');
                this.state.offset = 0;
                this.search();
            });
        };
        setupCat('list-category', 'category');
    },

    reset() {
        this._targetInstance = null;
        this._installedFiles = [];
        this._instanceLoader = null;
        this.state.type = 'modpack';
        this.state.version = '';
        this.state.loader = '';
        this.state.category = '';
        this.state.env = '';
        document.querySelectorAll('.brw-type-btn').forEach(b => { b.classList.remove('active'); b.style.display = ''; });
        const mpBtn = document.querySelector('.brw-type-btn[data-type="modpack"]');
        if (mpBtn) mpBtn.classList.add('active');
        // Reset all filter active states
        ['list-version','list-loader','list-category','list-env'].forEach(id => {
            const c = document.getElementById(id);
            if (c) {
                c.querySelectorAll('.brw-cat-link').forEach(l => l.classList.remove('active'));
                const first = c.querySelector('.brw-cat-link');
                if (first) first.classList.add('active');
            }
        });
        this._updateSidebarForType('modpack');
        this.state.offset = 0;
        this.search();
    },

    async openForInstance(inst) {
        console.log("Opening Browser for Instance:", inst.name);
        this._targetInstance = inst;
        this._installedFiles = []; // Reset list

        // Try load installed content for better UI feedback
        try {
            if(window.electron && window.electron.getInstanceContent) {
                const data = await window.electron.getInstanceContent(inst.folder);
                if(data) {
                     const mods = (data.mods || []).map(m => m.fileName);
                     const rps = (data.resourcepacks || []).map(m => m.jar);
                     const shaders = (data.shaders || []).map(m => m.jar); // Shaders align with RPs usually
                     
                     this._installedFiles = [...mods, ...rps, ...shaders].filter(Boolean).map(f => f.toLowerCase());
                } else {
                     this._installedFiles = [];
                }
            }
        } catch(e) {
            console.warn("Failed to load instance content for browser check", e);
        }
        
        // Open Browser Tab
        const tab = document.getElementById('browser-tab');
        if(tab) {
             tab.removeAttribute('style');
             tab.classList.add('active-browser');
        }

        // Hide Modpacks tab when browsing for a specific instance
        const mpBtn = document.querySelector('.brw-type-btn[data-type="modpack"]');
        if (mpBtn) mpBtn.style.display = 'none';

        this._instanceLoader = (inst.loader || '').toLowerCase();
        const isVanilla = !this._instanceLoader || this._instanceLoader === 'vanilla';

        // Hide Mods tab if vanilla (no modloader)
        const modBtn = document.querySelector('.brw-type-btn[data-type="mod"]');
        if (modBtn) modBtn.style.display = isVanilla ? 'none' : '';

        // Default type: resourcepack if vanilla, mod otherwise
        const defaultType = isVanilla ? 'resourcepack' : 'mod';
        document.querySelectorAll('.brw-type-btn').forEach(b => b.classList.remove('active'));
        const defaultBtn = document.querySelector(`.brw-type-btn[data-type="${defaultType}"]`);
        if (defaultBtn) defaultBtn.classList.add('active');

        this.state.type = defaultType;
        this.state.version = inst.version || '';
        this.state.loader = isVanilla ? '' : this._instanceLoader;
        this.state.category = '';
        this.state.env = '';
        this.state.offset = 0;
        this._updateSidebarForType(defaultType);
        // Sync loader UI to instance loader (only for non-vanilla)
        if (!isVanilla) {
            const loaderList = document.getElementById('list-loader');
            if (loaderList) {
                loaderList.querySelectorAll('.brw-cat-link').forEach(l => l.classList.remove('active'));
                const loaderBtn = loaderList.querySelector(`.brw-cat-link[data-value="${this._instanceLoader}"]`);
                if (loaderBtn) loaderBtn.classList.add('active');
            }
        }
        this.search();
    },

    async triggerInstall(project) {
        console.log("Triggering install for:", project);
        const type = this.state.type || project.project_type;
        console.log("Install Type detected:", type);

        if(type === 'modpack') {
            // Pas de boîte de dialogue pour les modpacks, on utilise le titre directement
            await this.installModpack(project, project.title || "Modpack");
        } else {
            // Mod / ResourcePack / Shader → install to instance
            // If coming from "+ Install Content" on a specific instance, skip the selector
            if (this._targetInstance) {
                return await this.installModToInstance(project, this._targetInstance);
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
            // Fetch versions + full project details in parallel (gallery is only in project endpoint)
            const [versionsRes, projectRes] = await Promise.all([
                fetch(`https://api.modrinth.com/v2/project/${project.slug}/version`),
                fetch(`https://api.modrinth.com/v2/project/${project.slug}`)
            ]);
            const versions = await versionsRes.json();
            const projectFull = await projectRes.json();

            if(!versions || versions.length === 0) throw new Error("No versions found");
            const best = versions[0];

            const loader = best.loaders[0];
            const gameVer = best.game_versions[0];

            // 2. Add to Library
            if(typeof LibraryManager !== 'undefined') {
                // Determine icon
                const icon = project.icon_url || projectFull.icon_url || 'assets/logo.svg';
                const newInst = await LibraryManager.add(name, gameVer, loader, icon);

                // Download & save gallery image as local banner (full resolution)
                const gallery = projectFull.gallery || project.gallery || [];
                if (gallery.length > 0) {
                    // Use raw_url (full resolution) — fallback to url if not present
                    let bannerUrl = gallery[0].raw_url || gallery[0].url;
                    if (window.electron && window.electron.saveInstanceBanner) {
                        window.electron.saveInstanceBanner(newInst.folder, bannerUrl).catch(() => {});
                    }
                }

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
            const type = project.project_type || this.state.type || 'mod';
            const needsLoader = type === 'mod';

            // Build version filter URL — resourcepacks/shaders/datapacks don't filter by loader
            let versionUrl = `https://api.modrinth.com/v2/project/${project.slug}/version`;
            const qp = [];
            if (instance.version) qp.push(`game_versions=${encodeURIComponent(`["${instance.version}"]`)}`);
            if (needsLoader && instance.loader) qp.push(`loaders=${encodeURIComponent(`["${instance.loader.toLowerCase()}"]`)}`);
            if (qp.length) versionUrl += '?' + qp.join('&');

            const res = await fetch(versionUrl);
            if (!res.ok) throw new Error("API Modrinth returned " + res.status);

            const versions = await res.json();

            if (versions && versions.length > 0) {
                const best = versions[0];
                const file = best.files.find(f => f.primary) || best.files[0];
                if (!file) { 
                    window.HexaAlert("Information", 'No downloadable file found.'); 
                    return false; 
                }

                const toastId = 'toast-mod-' + Date.now();
                this.showToast(`Installing ${project.title}...`, 0, toastId);

                const result = await window.electron.installContent({
                    url: file.url,
                    fileName: file.filename,
                    folderName: instance.folder,
                    type: type
                });
                
                if (result && result.success) {
                    this.showToast(`${project.title} installed!`, 100, toastId);
                    return true;
                } else {
                    this.showToast(`Error: ${(result && result.error) || 'Unknown'}`, -1, toastId);
                    return false;
                }
            } else {
                this.showToast(`No compatible version for ${instance.version} / ${instance.loader}`, -1, 'toast-compat-' + Date.now());
                return false;
            }
        } catch(e) {
            console.error(e);
            this.showToast('Error: ' + e.message, -1, 'toast-err-' + Date.now());
            return false;
        }
    },

    _buildCard(hit) {
        const icon    = hit.icon_url || 'assets/logo.svg';
        const title   = hit.title || hit.slug;
        const author  = hit.author || 'Unknown';
        const dls     = hit.downloads ? (hit.downloads >= 1000000
            ? (hit.downloads / 1000000).toFixed(1) + 'M'
            : Math.floor(hit.downloads / 1000) + 'k') : '0';

        let btnText = 'INSTALL';
        let btnDisabled = false;

        if (this._targetInstance && this._installedFiles && hit.project_type !== 'modpack') {
            const slug = (hit.slug || '').toLowerCase();
            if (this._installedFiles.some(f => f.replace('.jar','').includes(slug))) {
                btnText = 'INSTALLED'; btnDisabled = true;
            }
        }
        if (hit.project_type !== 'modpack' && !this._targetInstance) btnText = 'ADD TO...';

        const card = document.createElement('div');
        card.className = 'brw-item-card';
        card.innerHTML = `
            <img class="brw-item-icon" src="assets/logo.svg" data-src="${icon}" onerror="this.src='assets/logo.svg'" loading="lazy">
            <div class="brw-item-info">
                <h3 class="brw-item-title">${title}</h3>
                <div class="brw-item-author">By ${author}</div>
                <p class="brw-item-desc">${hit.description || ''}</p>
                <div class="brw-item-footer">
                    <span class="brw-item-stat"><i class="fas fa-download"></i> ${dls}</span>
                    <button class="brw-install-btn${btnDisabled ? ' installed' : ''}"
                        ${btnDisabled ? 'disabled' : ''}>${btnText}</button>
                </div>
            </div>
        `;

        const installBtn = card.querySelector('.brw-install-btn');
        installBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (installBtn.disabled) return;
            const orig = installBtn.innerText;
            installBtn.innerText = 'INSTALLING...';
            installBtn.disabled = true;
            const ok = await this.triggerInstall(hit);
            if (ok && (orig === 'INSTALL' || orig === 'ADD TO...')) {
                installBtn.innerText = 'INSTALLED';
                installBtn.classList.add('installed');
                if (this._installedFiles) this._installedFiles.push(hit.slug);
            } else {
                installBtn.innerText = orig;
                installBtn.disabled = false;
            }
        });
        card.addEventListener('click', () => this.openProjectDetails(hit));
        return card;
    },

    _makeSkeleton() {
        const el = document.createElement('div');
        el.className = 'brw-skeleton';
        el.innerHTML = `<div class="brw-skeleton-img"></div>
            <div class="brw-skeleton-body">
                <div class="brw-skeleton-line"></div>
                <div class="brw-skeleton-line short"></div>
                <div class="brw-skeleton-line"></div>
                <div class="brw-skeleton-line xshort" style="margin-top:auto;"></div>
            </div>`;
        return el;
    },

    async search() {
        const grid = document.getElementById('browser-grid');
        const loader = document.getElementById('browser-loader');
        if (!grid) return;

        // Cancel any in-flight request
        if (this._searchAbort) this._searchAbort.abort();
        this._searchAbort = new AbortController();
        const signal = this._searchAbort.signal;

        // Show skeletons immediately (12 placeholders)
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(260px, 1fr))';
        grid.style.gap = '16px';
        grid.style.padding = '0';
        grid.style.overflow = 'visible';
        grid.innerHTML = '';
        if (loader) loader.style.display = 'none';
        const skelFrag = document.createDocumentFragment();
        for (let i = 0; i < 12; i++) skelFrag.appendChild(this._makeSkeleton());
        grid.appendChild(skelFrag);

        try {
            const facets = [];
            if (this.state.type)     facets.push([`project_type:${this.state.type}`]);
            if (this.state.version)  facets.push([`versions:${this.state.version}`]);
            if (this.state.loader)   facets.push([`categories:${this.state.loader}`]);
            if (this.state.category) facets.push([`categories:${this.state.category}`]);
            if (this.state.env)      facets.push([`client_side:${this.state.env}`]);

            const params = new URLSearchParams({
                query:  this.state.query,
                limit:  this.state.limit,
                offset: this.state.offset,
                facets: JSON.stringify(facets)
            });

            const res  = await fetch(`${this.apiBase}?${params}`, { signal });
            const data = await res.json();

            if (signal.aborted) return;

            const indicator = document.getElementById('page-indicator');
            if (indicator) indicator.innerText = 'Page ' + (Math.floor(this.state.offset / this.state.limit) + 1);

            grid.innerHTML = '';

            if (data.hits && data.hits.length > 0) {
                // Lazy-load images via IntersectionObserver
                const imgObserver = new IntersectionObserver((entries, obs) => {
                    entries.forEach(en => {
                        if (en.isIntersecting) {
                            const img = en.target;
                            const src = img.dataset.src;
                            if (src) { img.src = src; delete img.dataset.src; }
                            obs.unobserve(img);
                        }
                    });
                }, { rootMargin: '200px' });

                const frag = document.createDocumentFragment();
                data.hits.forEach(hit => {
                    const card = this._buildCard(hit);
                    frag.appendChild(card);
                    const img = card.querySelector('.brw-item-icon');
                    if (img && img.dataset.src) imgObserver.observe(img);
                });
                grid.appendChild(frag);
            } else {
                grid.innerHTML = '<div style="padding:40px;color:#888;font-family:Montserrat,sans-serif;">No results found.</div>';
            }

            // Scroll grid area to top
            const wrap = grid.closest('.browser-content') || grid.parentElement;
            if (wrap) wrap.scrollTop = 0;

        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error(e);
            grid.innerHTML = '<div style="padding:40px;color:#e74c3c;font-family:Montserrat,sans-serif;">Error loading results.</div>';
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
        
        // Initial Installation Check
        const isModpack = hit.project_type === 'modpack';
        let isInstalled = false;

        if (!isModpack && this._targetInstance && this._installedFiles) {
            const slug = hit.slug ? hit.slug.toLowerCase() : '';
            const titleSearch = hit.title ? hit.title.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
            
            isInstalled = this._installedFiles.some(f => {
                const name = f.replace('.jar', '');
                return (slug && name.includes(slug)) || (titleSearch && name.includes(titleSearch));
            });
        }
        
        if (isInstalled) {
            newBtn.innerText = "INSTALLED";
            newBtn.disabled = true;
            newBtn.style.opacity = "0.7";
            newBtn.style.background = "#e0e0e0";
            newBtn.style.color = "#888"; 
        } else {
            newBtn.innerText = isModpack ? "CREATE PROFILE" : "INSTALL";
            newBtn.disabled = false;
            newBtn.style.opacity = "1";
            newBtn.style.background = ""; // Reset to default
            newBtn.style.color = "";
        }
        
        newBtn.onclick = async () => {
             const originalText = newBtn.innerText;
             if (isInstalled) return;

             newBtn.innerText = "INSTALLING...";
             newBtn.disabled = true;
             newBtn.style.opacity = "0.7";

             // Ensure we check 'project_type' from the hit object if state is generic
             // hit might just be search result, which HAS project_type.
             // But if we navigated here directly (e.g. from featured), it might be different.
             // Ensure generic handler checks correct properties.
             if (!hit.project_type && this.state && this.state.type) {
                 hit.project_type = this.state.type;
             }
             const res = await this.triggerInstall(hit);
             
             if (res) {
                 newBtn.innerText = "INSTALLED";
                 // Update cache so if we reopen, it knows
                 if(this._installedFiles) this._installedFiles.push(hit.slug);
             } else {
                 newBtn.innerText = originalText;
                 newBtn.disabled = false;
                 newBtn.style.opacity = "1";
             }
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
            this.currentProjectGallery = project.gallery || [];
            
            // Render Description
            if(project.body) {
                document.getElementById('markdown-content').innerHTML = marked.parse(project.body);
            }
            
            // Render Gallery
            if(project.gallery) {
                const galleryGrid = document.getElementById('gallery-grid');
                project.gallery.forEach(img => {
                    const thumbUrl = img.url;           // thumbnail (small)
                    const fullUrl  = img.raw_url || img.url; // full resolution
                    const div = document.createElement('div');
                    div.className = 'gallery-card';
                    div.innerHTML = `
                        <img src="${thumbUrl}" class="gallery-img">
                        <div class="gallery-caption">${img.title || 'Untitled'}</div>
                    `;
                    div.onclick = () => {
                        const lightbox = document.getElementById('gallery-lightbox');
                        const lightboxImg = document.getElementById('lightbox-img');
                        lightboxImg.src = fullUrl;
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
            this.renderVersions(versions, hit); // Pass full hit object with slug

        } catch(e) {
            console.error(e);
            document.getElementById('markdown-content').innerText = "Failed to load project details.";
        }
    },

    renderVersions(versions, project) {
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
                 const btn = row.querySelector('button');
                 btn.onclick = async () => {
                      if (this.state.type === 'modpack' || ver.loaders.length > 0 && !this._targetInstance) {
                          // Install as new instance logic (modpack)
                          this.installModpack({ ...ver, slug: project.slug, project_type: 'modpack', title: this.currentProjectTitle || ver.name, icon_url: this.currentProjectIcon, gallery: this.currentProjectGallery || [] }, "Instance " + ver.version_number);
                      } else {
                          // Mod install to Target Instance
                          if (this._targetInstance) {
                               const originalText = btn.innerText;
                               btn.innerText = "...";
                               await this.installSpecificVersionToInstance(ver, project, this._targetInstance);
                               btn.innerText = "OK";
                               setTimeout(() => btn.innerText = originalText, 2000);
                          } else {
                               window.HexaAlert("Select Instance", "Please go back and select a target instance first, or use the main Install button.");
                          }
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
    },

    async installSpecificVersionToInstance(versionObj, project, instance) {
        console.log(`Installing version ${versionObj.version_number} of ${project.title} to ${instance.name}...`);
        try {
            const file = versionObj.files.find(f => f.primary) || versionObj.files[0];
            if (!file) { window.HexaAlert("Information", 'No downloadable file found in this version.'); return; }

            const type = project.project_type || this.state.type || 'mod'; // mod, resourcepack, shader
            
            const toastId = 'toast-ver-' + Date.now();
            this.showToast(`Installing ${versionObj.name}...`, 0, toastId);
            
            const result = await window.electron.installContent({
                url: file.url,
                fileName: file.filename,
                folderName: instance.folder,
                type
            });
            
            if (result && result.success) {
                this.showToast(`${project.title} (${versionObj.version_number}) installed!`, 100, toastId);
                // Update cache
                if(this._installedFiles) this._installedFiles.push(project.slug);
            } else {
                this.showToast(`Error: ${(result && result.error) || 'Unknown'}`, -1, toastId);
            }
        } catch(e) {
            console.error(e);
            this.showToast('Error: ' + e.message, -1, 'toast-err-' + Date.now());
        }
    }
};

// --- GLOBAL SETTINGS LOGIC ---
// Cache of the last loaded config so instance settings can read defaults
window._globalConfig = null;

document.addEventListener('DOMContentLoaded', () => {
    const ramSlider   = document.getElementById('ram-slider');
    const ramDisplay  = document.getElementById('ram-display');
    const gpuSelector = document.getElementById('gpu-selector');
    const defaultWidth  = document.getElementById('default-width');
    const defaultHeight = document.getElementById('default-height');
    const defaultJvm    = document.getElementById('default-jvm');
    const saveBtn = document.getElementById('save-settings-btn');
    const saveMsg = document.getElementById('save-settings-msg');

    // -- GPU DETECTION --
    if (gpuSelector) {
        let detectedGPU = "Detected Graphics";
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            if (gl) {
                const dbg = gl.getExtension('WEBGL_debug_renderer_info');
                if (dbg) {
                    let r = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
                    if (r.includes("ANGLE (")) {
                        const parts = r.split(',');
                        if (parts.length > 1) r = parts[1].trim().split(' Direct3D')[0].trim();
                    }
                    detectedGPU = r;
                }
            }
        } catch(e) {}
        gpuSelector.innerHTML = `<option value="auto">Auto-Select High Performance GPU</option><option value="current">${detectedGPU}</option>`;
    }

    // Load config from main process and populate all fields
    async function loadGlobalSettings() {
        if (!window.electron || !window.electron.getSettings) return;
        const cfg = await window.electron.getSettings();
        window._globalConfig = cfg;

        // RAM — stored as "4G" or "4096M"
        let ramMb = 4096;
        if (cfg.maxRam) {
            if (typeof cfg.maxRam === 'string' && cfg.maxRam.endsWith('G')) ramMb = parseInt(cfg.maxRam) * 1024;
            else if (typeof cfg.maxRam === 'string' && cfg.maxRam.endsWith('M')) ramMb = parseInt(cfg.maxRam);
        }
        if (ramSlider) { ramSlider.value = ramMb; }
        if (ramDisplay) ramDisplay.innerText = (ramMb / 1024).toFixed(1) + ' GB';

        // Java paths
        ['8','17','21','25'].forEach(v => {
            const el = document.getElementById(`java-path-${v}`);
            if (el) el.value = cfg[`javaPath${v}`] || '';
        });

        // Resolution
        if (defaultWidth)  defaultWidth.value  = cfg.resolution?.width  ?? 854;
        if (defaultHeight) defaultHeight.value = cfg.resolution?.height ?? 480;

        // JVM args
        if (defaultJvm) defaultJvm.value = cfg.jvmArgs || '';

        // GPU (localStorage only, not in config file)
        if (gpuSelector) gpuSelector.value = localStorage.getItem('gpu-selector') || 'auto';
    }

    loadGlobalSettings();

    // RAM slider live feedback
    if (ramSlider && ramDisplay) {
        ramSlider.addEventListener('input', () => {
            ramDisplay.innerText = (ramSlider.value / 1024).toFixed(1) + ' GB';
        });
    }

    // Save to config.json via IPC
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            if (!window.electron || !window.electron.saveSettings) return;

            const existing = window._globalConfig || {};

            const ramMb = ramSlider ? parseInt(ramSlider.value) : 4096;
            const ramG  = Math.round(ramMb / 1024) + 'G';

            const javaPaths = {};
            ['8','17','21','25'].forEach(v => {
                const el = document.getElementById(`java-path-${v}`);
                if (el && el.value.trim()) javaPaths[`javaPath${v}`] = el.value.trim();
            });

            const newConfig = {
                ...existing,
                minRam: ramG,
                maxRam: ramG,
                jvmArgs: defaultJvm ? defaultJvm.value.trim() : (existing.jvmArgs || ''),
                resolution: {
                    width:  defaultWidth  ? parseInt(defaultWidth.value)  || 854 : (existing.resolution?.width  || 854),
                    height: defaultHeight ? parseInt(defaultHeight.value) || 480 : (existing.resolution?.height || 480),
                },
                ...javaPaths,
            };

            if (gpuSelector) localStorage.setItem('gpu-selector', gpuSelector.value);

            window._globalConfig = newConfig;
            const res = await window.electron.saveSettings(newConfig);
            if (saveMsg) {
                saveMsg.style.display = 'inline-flex';
                saveMsg.textContent = res && res.success ? '✓ Saved' : '✗ Error';
                setTimeout(() => { saveMsg.style.display = 'none'; }, 3000);
            }
        });
    }

    // ── Profile Settings ────────────────────────────────────────────────────
    const profileAccordion = document.getElementById('profile-settings-content');
    if (profileAccordion) {
        let profileSettingsLoaded = false;

        // Lazy-load when accordion opens
        const accItem = profileAccordion.closest('.acc-item');
        if (accItem) {
            const origToggle = accItem.onclick;
            accItem.onclick = (e) => {
                if (origToggle) origToggle.call(accItem, e);
                if (!profileSettingsLoaded && accItem.classList.contains('active')) {
                    profileSettingsLoaded = true;
                    loadProfileSettings();
                }
            };
        }

        // Banner
        const bannerPreview = document.getElementById('sett-banner-preview');
        const bannerBtn = document.getElementById('sett-banner-btn');
        async function pickBannerImage() {
            const filePath = await window.electron.openFileDialog({
                title: 'Choose Banner Image',
                filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp','gif'] }],
                properties: ['openFile'],
            });
            if (!filePath) return;
            const dataUrl = await window.electron.fetchImageBase64(filePath);
            if (!dataUrl) return notify('error', 'Banner Error', 'Could not read file.');
            const res = await window.electron.saveProfileBanner(dataUrl);
            if (res && res.success) {
                bannerPreview.style.background = `url(${dataUrl}) center/cover no-repeat`;
                bannerPreview.dataset.hasImage = '1';
                const removeBtn = document.getElementById('sett-banner-remove-btn');
                if (removeBtn) removeBtn.style.display = '';
                notify('success', 'Banner updated!');
            } else {
                notify('error', 'Banner Error', res?.message || 'Unknown error');
            }
        }
        async function pickBannerColor() {
            const colorInput = document.getElementById('sett-banner-color-input');
            if (!colorInput) return;
            colorInput.onchange = async () => {
                const color = colorInput.value;
                const res = await window.electron.saveProfileBanner(`color:${color}`);
                if (res && res.success) {
                    bannerPreview.style.background = `linear-gradient(135deg, ${color}ee 0%, ${color}66 60%, ${color}22 100%)`;
                    bannerPreview.dataset.hasImage = '0';
                    const removeBtn = document.getElementById('sett-banner-remove-btn');
                    if (removeBtn) removeBtn.style.display = 'none';
                    notify('success', 'Couleur mise à jour !');
                } else {
                    notify('error', 'Erreur', res?.message || 'Unknown error');
                }
            };
            colorInput.click();
        }
        async function removeBanner() {
            const res = await window.electron.saveProfileBanner('');
            if (res && res.success) {
                const rd = getRoleData(currentUser?.role || 'player');
                const fallback = rd.glow || rd.color || '#DA0037';
                bannerPreview.style.background = `linear-gradient(135deg, ${fallback}ee 0%, ${fallback}66 60%, ${fallback}22 100%)`;
                bannerPreview.dataset.hasImage = '0';
                const removeBtn = document.getElementById('sett-banner-remove-btn');
                if (removeBtn) removeBtn.style.display = 'none';
                notify('success', 'Bannière supprimée.');
            }
        }
        if (bannerBtn) bannerBtn.addEventListener('click', pickBannerImage);
        const colorBtn = document.getElementById('sett-banner-color-btn');
        if (colorBtn) colorBtn.addEventListener('click', pickBannerColor);
        const removeBtn = document.getElementById('sett-banner-remove-btn');
        if (removeBtn) removeBtn.addEventListener('click', removeBanner);

        // Gradient picker
        const gradientBtn    = document.getElementById('sett-banner-gradient-btn');
        const gradientPicker = document.getElementById('sett-banner-gradient-picker');
        const gradTopInput   = document.getElementById('sett-gradient-top');
        const gradBotInput   = document.getElementById('sett-gradient-bottom');
        const gradStrip      = document.getElementById('sett-gradient-preview-strip');
        const gradApplyBtn   = document.getElementById('sett-gradient-apply-btn');

        function updateGradStrip() {
            if (gradStrip) gradStrip.style.background = `linear-gradient(to bottom, ${gradTopInput.value}, ${gradBotInput.value})`;
        }
        if (gradientBtn) gradientBtn.addEventListener('click', () => {
            const open = gradientPicker.style.display !== 'none';
            gradientPicker.style.display = open ? 'none' : '';
        });
        if (gradTopInput) gradTopInput.addEventListener('input', () => {
            updateGradStrip();
            if (bannerPreview) bannerPreview.style.background = `linear-gradient(to bottom, ${gradTopInput.value}, ${gradBotInput.value})`;
        });
        if (gradBotInput) gradBotInput.addEventListener('input', () => {
            updateGradStrip();
            if (bannerPreview) bannerPreview.style.background = `linear-gradient(to bottom, ${gradTopInput.value}, ${gradBotInput.value})`;
        });
        if (gradApplyBtn) gradApplyBtn.addEventListener('click', async () => {
            const top = gradTopInput.value;
            const bot = gradBotInput.value;
            const res = await window.electron.saveProfileBanner(`gradient:${top},${bot}`);
            if (res && res.success) {
                bannerPreview.style.background = `linear-gradient(to bottom, ${top}, ${bot})`;
                bannerPreview.dataset.hasImage = '0';
                if (removeBtn) removeBtn.style.display = 'none';
                gradientPicker.style.display = 'none';
                notify('success', 'Gradient appliqué !');
            } else {
                notify('error', 'Erreur', res?.message || 'Unknown error');
            }
        });

        // Username
        const usernameInput = document.getElementById('sett-username-input');
        const usernameBtn = document.getElementById('sett-username-btn');
        const usernameMsg = document.getElementById('sett-username-msg');
        const username2faRow = document.getElementById('sett-username-2fa-row');
        const username2faInput = document.getElementById('sett-username-2fa-input');
        const username2faBtn = document.getElementById('sett-username-2fa-btn');
        const usernameCancelBtn = document.getElementById('sett-username-cancel-btn');
        const usernameCooldownEl = document.getElementById('sett-username-cooldown');

        // Show cooldown if applicable
        if (profileData?.last_username_change) {
            const cooldownMs = 30 * 24 * 60 * 60 * 1000;
            const elapsed = Date.now() - new Date(profileData.last_username_change).getTime();
            if (elapsed < cooldownMs) {
                const daysLeft = Math.ceil((cooldownMs - elapsed) / (24 * 60 * 60 * 1000));
                usernameCooldownEl.textContent = `— change again in ${daysLeft} day(s)`;
                usernameCooldownEl.style.display = '';
                usernameBtn.disabled = true;
                usernameInput.disabled = true;
            }
        }

        const _doChangeUsername = async (totpCode) => {
            const val = (usernameInput?.value || '').trim();
            const res = await window.electron.changeUsername(val, totpCode);
            if (res && res.success) {
                username2faRow.style.display = 'none';
                usernameMsg.textContent = 'Username updated!';
                usernameMsg.style.color = 'var(--success)';
                usernameMsg.style.display = '';
                if (currentUser) currentUser.username = val;
                document.getElementById('player-name-display') && (document.getElementById('player-name-display').textContent = val);
                setTimeout(() => { usernameMsg.style.display = 'none'; }, 4000);
            } else if (res?.message === 'requires_2fa' || res?.error === 'requires_2fa') {
                username2faRow.style.display = '';
                username2faInput?.focus();
            } else {
                if (username2faInput) { username2faInput.value = ''; }
                usernameMsg.textContent = res?.message || 'Error.';
                usernameMsg.style.color = 'var(--error)';
                usernameMsg.style.display = '';
                setTimeout(() => { usernameMsg.style.display = 'none'; }, 4000);
            }
        };

        if (usernameBtn) {
            usernameBtn.addEventListener('click', async () => {
                const val = (usernameInput?.value || '').trim();
                if (!val || val.length < 3) {
                    usernameMsg.textContent = 'Min. 3 characters.';
                    usernameMsg.style.color = 'var(--error)';
                    usernameMsg.style.display = '';
                    return;
                }
                usernameBtn.disabled = true;
                usernameBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                await _doChangeUsername('');
                usernameBtn.disabled = false;
                usernameBtn.innerHTML = '<i class="fas fa-check"></i> Save';
            });
        }

        if (username2faBtn) {
            username2faBtn.addEventListener('click', async () => {
                const code = (username2faInput?.value || '').trim();
                username2faBtn.disabled = true;
                username2faBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                await _doChangeUsername(code);
                username2faBtn.disabled = false;
                username2faBtn.innerHTML = '<i class="fas fa-lock-open"></i> Confirm';
            });
        }

        if (usernameCancelBtn) {
            usernameCancelBtn.addEventListener('click', () => {
                username2faRow.style.display = 'none';
                if (username2faInput) username2faInput.value = '';
            });
        }
    }
});

async function loadProfileSettings() {
    const bannerPreview = document.getElementById('sett-banner-preview');
    const usernameInput = document.getElementById('sett-username-input');
    const badgesList = document.getElementById('sett-badges-list');

    // Pre-fill current username
    if (usernameInput && currentUser) usernameInput.value = currentUser.username || '';

    // Pre-fill banner + show_role_badge from profile — bypass cache so 2FA state is always fresh
    profileData = null;
    if (currentUser) {
        const res = await window.electron.fetchUserProfile(currentUser.id || currentUser.username, true).catch(() => null);
        profileData = res?.profile || null;
        const removeBtn = document.getElementById('sett-banner-remove-btn');
        if (bannerPreview && profileData?.banner_url) {
            const bUrl = profileData.banner_url;
            const rd2 = getRoleData(currentUser?.role || 'player');
            bannerPreview.style.background = bannerUrlToCss(bUrl, `linear-gradient(135deg, ${rd2.glow || rd2.color || '#DA0037'}ee 0%, ${rd2.glow || rd2.color || '#DA0037'}22 100%)`);
            const isImage = !bUrl.startsWith('color:') && !bUrl.startsWith('gradient:');
            if (isImage) { bannerPreview.dataset.hasImage = '1'; if (removeBtn) removeBtn.style.display = ''; }
            // Pre-fill gradient pickers if gradient
            if (bUrl.startsWith('gradient:')) {
                const [t, b] = bUrl.slice(9).split(',');
                const gTop = document.getElementById('sett-gradient-top');
                const gBot = document.getElementById('sett-gradient-bottom');
                const gStrip = document.getElementById('sett-gradient-preview-strip');
                if (gTop) gTop.value = t || '#DA0037';
                if (gBot) gBot.value = b || '#000000';
                if (gStrip) gStrip.style.background = `linear-gradient(to bottom, ${t || '#DA0037'}, ${b || '#000000'})`;
            }
        } else if (bannerPreview) {
            const rd = getRoleData(currentUser.role || 'player');
            const fallback = rd.glow || rd.color || '#DA0037';
            bannerPreview.style.background = `linear-gradient(135deg, ${fallback}ee 0%, ${fallback}66 60%, ${fallback}22 100%)`;
            if (removeBtn) removeBtn.style.display = 'none';
        }
        if (profileData) currentUser.show_role_badge = profileData.show_role_badge ?? 1;

        if (profileData) currentUser.profile_bg = profileData.profile_bg || '';
    }

    // ── Profile background picker ──────────────────────────────────────────
    (function initBgPicker() {
        const preview   = document.getElementById('sett-bg-preview');
        const colorBtn  = document.getElementById('sett-bg-color-btn');
        const gradBtn   = document.getElementById('sett-bg-gradient-btn');
        const resetBtn  = document.getElementById('sett-bg-reset-btn');
        const colorInput = document.getElementById('sett-bg-color-input');
        const gradPicker = document.getElementById('sett-bg-gradient-picker');
        const gradTop   = document.getElementById('sett-bg-grad-top');
        const gradBot   = document.getElementById('sett-bg-grad-bot');
        const gradStrip = document.getElementById('sett-bg-grad-strip');
        const gradApply = document.getElementById('sett-bg-grad-apply');
        if (!preview) return;

        function applyBgPreview(v) {
            if (!v) { preview.style.background = 'var(--surface-2)'; resetBtn.style.display = 'none'; return; }
            if (v.startsWith('color:'))    preview.style.background = v.slice(6);
            else if (v.startsWith('gradient:')) { const p = v.slice(9).split(','); preview.style.background = `linear-gradient(to bottom,${p[0]},${p[1]})`; }
            resetBtn.style.display = '';
        }

        const currentBg = currentUser?.profile_bg || '';
        applyBgPreview(currentBg);
        if (currentBg.startsWith('color:')) {
            const colorDot = document.getElementById('sett-bg-color-dot');
            if (colorDot) colorDot.style.color = currentBg.slice(6);
        }

        colorBtn.onclick = () => {
            gradPicker.style.display = 'none';
            colorInput.onchange = async () => {
                const v = `color:${colorInput.value}`;
                applyBgPreview(v);
                const colorDot = document.getElementById('sett-bg-color-dot');
                if (colorDot) colorDot.style.color = colorInput.value;
                const r = await window.electron.saveProfileBg(v).catch(() => null);
                if (r?.success) { if (currentUser) currentUser.profile_bg = v; applyLauncherCosmetics(); }
                else notify('error', 'Error', r?.message || '');
            };
            colorInput.click();
        };

        gradBtn.onclick = () => {
            gradPicker.style.display = gradPicker.style.display === 'none' ? '' : 'none';
        };

        const updateStrip = () => {
            if (gradStrip) gradStrip.style.background = `linear-gradient(to bottom,${gradTop.value},${gradBot.value})`;
        };
        if (gradTop) gradTop.oninput = updateStrip;
        if (gradBot) gradBot.oninput = updateStrip;

        if (gradApply) gradApply.onclick = async () => {
            const v = `gradient:${gradTop.value},${gradBot.value}`;
            applyBgPreview(v);
            gradPicker.style.display = 'none';
            const r = await window.electron.saveProfileBg(v).catch(() => null);
            if (r?.success) { if (currentUser) currentUser.profile_bg = v; applyLauncherCosmetics(); }
            else notify('error', 'Error', r?.message || '');
        };

        resetBtn.onclick = async () => {
            applyBgPreview('');
            const r = await window.electron.saveProfileBg('').catch(() => null);
            if (r?.success) { if (currentUser) currentUser.profile_bg = ''; applyLauncherCosmetics(); }
        };
    })();

    if (!badgesList) return;
    badgesList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';

    const bRes = await window.electron.getAllUserBadges().catch(() => null);
    badgesList.innerHTML = '';

    // ── Role badge toggle ──────────────────────────────────────────────────
    const myRole = currentUser?.role || 'player';
    const myRd = getRoleData(myRole);
    if (myRole !== 'player' && myRd.faIcon) {
        const showNow = (currentUser?.show_role_badge ?? 1) !== 0;
        const roleBtn = document.createElement('button');
        roleBtn.className = 'sett-badge-toggle' + (showNow ? ' active' : '');
        roleBtn.dataset.showRole = showNow ? '1' : '0';
        roleBtn.innerHTML = `<i class="fas ${myRd.faIcon} badge-icon" style="color:${myRd.color}"></i>${myRd.label} <span style="font-size:10px;color:var(--text-subtle);margin-left:2px;">(role)</span><i class="fas ${showNow ? 'fa-eye' : 'fa-eye-slash'} badge-eye"></i>`;
        roleBtn.title = 'Show/hide your role badge next to your name';
        roleBtn.addEventListener('click', async () => {
            const nowShow = roleBtn.dataset.showRole !== '1';
            roleBtn.disabled = true;
            const res = await window.electron.setShowRoleBadge(nowShow);
            roleBtn.disabled = false;
            if (res?.success) {
                roleBtn.dataset.showRole = nowShow ? '1' : '0';
                roleBtn.classList.toggle('active', nowShow);
                roleBtn.querySelector('.badge-eye').className = `fas ${nowShow ? 'fa-eye' : 'fa-eye-slash'} badge-eye`;
                if (currentUser) currentUser.show_role_badge = nowShow ? 1 : 0;
            }
        });
        badgesList.appendChild(roleBtn);
    }

    // ── Regular badges ─────────────────────────────────────────────────────
    if (!bRes || !bRes.badges || !bRes.badges.length) {
        if (myRole === 'player') {
            badgesList.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No badges yet.</div>';
        }
        return;
    }
    for (const b of bRes.badges) {
        const btn = document.createElement('button');
        btn.className = 'sett-badge-toggle' + (b.displayed ? ' active' : '');
        btn.dataset.badgeId = b.id;
        btn.dataset.displayed = b.displayed ? '1' : '0';
        btn.innerHTML = `<span class="badge-icon">${badgeIconHtml(b, '18px')}</span>${escHtml(b.name)}<i class="fas ${b.displayed ? 'fa-eye' : 'fa-eye-slash'} badge-eye"></i>`;
        btn.addEventListener('click', async () => {
            const nowDisplayed = btn.dataset.displayed !== '1';
            btn.disabled = true;
            const res = await window.electron.toggleBadgeDisplay(+b.id, nowDisplayed);
            btn.disabled = false;
            if (res?.success) {
                btn.dataset.displayed = nowDisplayed ? '1' : '0';
                btn.classList.toggle('active', nowDisplayed);
                btn.querySelector('.badge-eye').className = `fas ${nowDisplayed ? 'fa-eye' : 'fa-eye-slash'} badge-eye`;
            }
        });
        badgesList.appendChild(btn);
    }

    // ── Cosmetics inventory ────────────────────────────────────────────────────
    await loadLauncherInventory();

    // ── 2FA settings ──────────────────────────────────────────────────────────
    init2faSettings(profileData);
}

// ── Launcher Cosmetics ────────────────────────────────────────────────────────
const RARITY_COLORS = { common:'#aaa', uncommon:'#2ecc71', rare:'#3498db', epic:'#9b59b6', legendary:'#f39c12' };
let _launcherInventory = [];

function switchLauncherInvTab(tab) {
    document.querySelectorAll('.sett-inv-tab').forEach(b => {
        const active = b.dataset.invTab === tab;
        b.style.background = active ? 'var(--accent,#DA0037)' : 'transparent';
        b.style.color      = active ? '#fff' : 'var(--text-muted)';
    });
    document.querySelectorAll('.sett-inv-panel').forEach(p => {
        p.style.display = 'none';
    });
    const panel = document.getElementById('sett-inv-' + tab);
    if (panel) panel.style.display = 'grid';
}

// Build a CSS background string from a normalised cosmetic
function cosPreviewCss(c) {
    if (c.type === 'profile_gradient' && c.value) {
        const parts = c.value.replace('gradient:','').split(',');
        return `linear-gradient(135deg,${parts[0]},${parts[1]})`;
    }
    if (c.type === 'profile_color' && c.value) {
        return c.value.replace('color:','');
    }
    // holo — use a shimmer gradient as preview
    const n = (c.name || c.label || '').toLowerCase();
    if (n.includes('rainbow'))  return 'linear-gradient(135deg,#f00,#ff7700,#ff0,#0f0,#00f,#8b00ff)';
    if (n.includes('cyber'))    return 'linear-gradient(135deg,#00f2fe,#4facfe,#a18cd1)';
    if (n.includes('lava'))     return 'linear-gradient(135deg,#f12711,#f5af19)';
    if (n.includes('void'))     return 'linear-gradient(135deg,#0f0c29,#302b63)';
    if (n.includes('gold'))     return 'linear-gradient(135deg,#f6d365,#fda085)';
    if (n.includes('hexa'))     return 'linear-gradient(135deg,#DA0037,#1a0010)';
    return 'linear-gradient(135deg,#333,#666)';
}

function _renderInvPanel(tab, type) {
    const panel = document.getElementById('sett-inv-' + tab);
    if (!panel) return;
    const items = _launcherInventory.filter(c => c.type === type);
    if (!items.length) {
        panel.innerHTML = '<div style="grid-column:1/-1;font-size:11px;color:var(--text-muted);text-align:center;padding:14px 0;"><i class="fas fa-box-open" style="display:block;font-size:20px;margin-bottom:6px;opacity:.4;"></i>No cosmetics yet.</div>';
        return;
    }
    panel.innerHTML = '';
    items.forEach(c => {
        const card = document.createElement('div');
        const equipped = !!c.equipped;
        card.style.cssText = `
            cursor:pointer;border-radius:8px;overflow:hidden;
            border:2px solid ${equipped ? 'var(--accent,#DA0037)' : 'var(--border-color)'};
            background:var(--surface-1);
            transition:border-color .15s,transform .1s;
            position:relative;
        `;
        card.title = `${c.label || c.name} — ${c.rarity}`;

        const preview = document.createElement('div');
        const bg = cosPreviewCss(c);
        const shimmer = c.type === 'holo_effect' ? 'animation:holo-shimmer 4s linear infinite;background-size:300% 300%;' : '';
        preview.style.cssText = `height:42px;background:${bg};${shimmer}`;
        card.appendChild(preview);

        const info = document.createElement('div');
        info.style.cssText = 'padding:5px 6px 4px;';

        const name = document.createElement('div');
        name.style.cssText = 'font-size:9px;font-weight:800;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-color);text-transform:uppercase;';
        name.textContent = c.label || c.name;
        info.appendChild(name);

        const rar = document.createElement('div');
        rar.style.cssText = `font-size:8px;font-weight:700;color:${RARITY_COLORS[c.rarity]||'#aaa'};letter-spacing:.3px;`;
        rar.textContent = (c.rarity || '').toUpperCase();
        info.appendChild(rar);
        card.appendChild(info);

        if (equipped) {
            const tick = document.createElement('div');
            tick.innerHTML = '<i class="fas fa-check-circle"></i>';
            tick.style.cssText = 'position:absolute;top:4px;right:4px;color:var(--accent,#DA0037);font-size:12px;text-shadow:0 0 4px rgba(0,0,0,.5);';
            card.appendChild(tick);
        }

        card.onmouseenter = () => { card.style.transform = 'scale(1.04)'; };
        card.onmouseleave = () => { card.style.transform = ''; };

        card.addEventListener('click', async () => {
            const nowEquipped = !equipped;
            card.style.opacity = '.6';
            const r = await window.electron.cosmeticsEquip(c.id, nowEquipped).catch(() => null);
            card.style.opacity = '';
            if (r?.success) {
                _launcherInventory.forEach(i => { if (i.type === c.type) i.equipped = 0; });
                const mine = _launcherInventory.find(i => i.id === c.id);
                if (mine) mine.equipped = nowEquipped ? 1 : 0;
                _renderAllInvTabs();
                applyLauncherCosmetics();
                notify('success', nowEquipped ? `${c.label || c.name} activé !` : `${c.label || c.name} désactivé.`);
            } else {
                notify('error', 'Erreur', r?.error || r?.message || '');
            }
        });

        panel.appendChild(card);
    });
}

const _INV_TABS = { holo: 'holo_effect' };

function _renderAllInvTabs() {
    for (const [tab, type] of Object.entries(_INV_TABS)) {
        _renderInvPanel(tab, type);
    }
}

async function loadLauncherInventory() {
    for (const tab of Object.keys(_INV_TABS)) {
        const panel = document.getElementById('sett-inv-' + tab);
        if (panel) panel.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;text-align:center;padding:10px;"><i class="fas fa-spinner fa-spin"></i></div>';
    }
    let res = null;
    try { res = await window.electron.cosmeticsGetInventory(); } catch(e) { res = { success: false, _error: e.message }; }

    const setMsg = (msg) => {
        for (const tab of Object.keys(_INV_TABS)) {
            const panel = document.getElementById('sett-inv-' + tab);
            if (panel) panel.innerHTML = `<div style="grid-column:1/-1;font-size:11px;color:var(--text-muted);text-align:center;padding:10px;">${msg}</div>`;
        }
    };

    if (!res) { setMsg('Connection error.'); return; }
    if (res._status === 401 || (!res.success && !res.inventory)) {
        setMsg(res._status === 401 ? 'Session expired — please log in again.' : (res._error ? `Error: ${res._error}` : 'Log in to see your cosmetics.'));
        return;
    }
    _launcherInventory = res.inventory || [];
    _renderAllInvTabs();
    applyLauncherCosmetics();
}

const _HOLO_CLASSES = ['holo-rainbow','holo-gold','holo-hexa','holo-cyber','holo-lava','holo-void'];

function _holoClassFromName(name) {
    const n = (name || '').toLowerCase();
    if (n.includes('rainbow')) return 'holo-rainbow';
    if (n.includes('gold'))    return 'holo-gold';
    if (n.includes('hexa'))    return 'holo-hexa';
    if (n.includes('cyber'))   return 'holo-cyber';
    if (n.includes('lava'))    return 'holo-lava';
    if (n.includes('void'))    return 'holo-void';
    return 'holo-rainbow';
}

// Apply profile_bg (colour/gradient) + holo effect to the profile panel for self
function applyLauncherCosmetics() {
    const panel = document.getElementById('prof-panel');
    if (!panel) return;

    const bg = currentUser?.profile_bg || '';
    _applyPanelBg(panel, bg);

    const holo = _launcherInventory.find(c => c.type === 'holo_effect' && c.equipped);
    panel.classList.remove(..._HOLO_CLASSES);
    if (holo) panel.classList.add(_holoClassFromName(holo.name || holo.label || ''));
    _applyAvatarGlow(holo || null);
}

function _applyPanelBg(panel, bg) {
    if (bg.startsWith('color:')) {
        panel.style.background = bg.slice(6);
        panel.classList.add('has-prof-bg');
    } else if (bg.startsWith('gradient:')) {
        const p = bg.slice(9).split(',');
        panel.style.background = `linear-gradient(to bottom,${p[0]},${p[1]})`;
        panel.classList.add('has-prof-bg');
    } else {
        panel.style.removeProperty('background');
        panel.classList.remove('has-prof-bg');
    }
}

function _applyAvatarGlow(holo) {
    const wrap = document.getElementById('prof-avatar-wrap');
    const glow = document.getElementById('prof-avatar-glow');
    if (!wrap || !glow) return;
    wrap.classList.remove('has-glow');
    glow.style.cssText = 'position:absolute;inset:-4px;border-radius:0;opacity:0;transition:opacity 0.3s;pointer-events:none;';
    if (!holo) return;
    const cls = _holoClassFromName(holo.name || holo.label || '');
    const gradMap = {
        'holo-rainbow': 'linear-gradient(135deg,#f00,#ff7700,#ff0,#0f0,#00f,#8b00ff)',
        'holo-gold':    'linear-gradient(135deg,#f6d365,#fda085,#f6d365)',
        'holo-hexa':    'linear-gradient(135deg,#DA0037,#ff3366,#DA0037)',
        'holo-cyber':   'linear-gradient(135deg,#00f2fe,#4facfe,#a18cd1)',
        'holo-lava':    'linear-gradient(135deg,#f12711,#f5af19)',
        'holo-void':    'linear-gradient(135deg,#0f0c29,#302b63,#24243e)',
    };
    const bg = gradMap[cls] || gradMap['holo-rainbow'];
    glow.style.cssText = `position:absolute;inset:-4px;border-radius:0;opacity:1;pointer-events:none;background:${bg};animation:holo-pulse 2s ease-in-out infinite alternate;`;
    wrap.classList.add('has-glow');
}

// Apply profile bg + holo effect for any user's profile panel (fetches from API)
async function applyProfPanelCosmetics(userId) {
    const panel = document.getElementById('prof-panel');
    if (!panel) return;
    try {
        // Fetch profile_bg + equipped cosmetics in parallel
        const [profRes, cosRes] = await Promise.all([
            fetch(`https://hexa-mc.fr/hexa/api/profile/${encodeURIComponent(userId)}`).then(r => r.json()).catch(() => null),
            fetch(`https://hexa-mc.fr/hexa/api/cosmetics/equipped/${encodeURIComponent(userId)}`).then(r => r.json()).catch(() => null),
        ]);

        // Background from profile_bg
        const bg = profRes?.profile?.profile_bg || '';
        _applyPanelBg(panel, bg);

        // Holo shimmer
        const equipped = (cosRes?.success ? cosRes.equipped : null) || [];
        const holo = equipped.find(c => c.type === 'holo_effect');
        panel.classList.remove(..._HOLO_CLASSES);
        if (holo) panel.classList.add(_holoClassFromName(holo.name || ''));
        _applyAvatarGlow(holo || null);
    } catch (_) {
        panel.classList.remove('has-prof-bg', ..._HOLO_CLASSES);
        panel.style.removeProperty('background');
        _applyAvatarGlow(null);
    }
}

// Called from loadProfileSettings to set initial state. Handlers are wired once in DOMContentLoaded below.
function init2faSettings(profileData) {
    const isEnabled = profileData?.totp_enabled ?? false;
    _show2faState(isEnabled ? 'enabled' : 'disabled');
}

// 2FA state machine — wired eagerly so buttons always work regardless of accordion open/close timing
function _show2faState(state) {
    const secDisabled = document.getElementById('sett-2fa-disabled');
    const secSetup    = document.getElementById('sett-2fa-setup');
    const secEnabled  = document.getElementById('sett-2fa-enabled');
    if (!secDisabled) return;
    secDisabled.style.display = state === 'disabled' ? '' : 'none';
    secSetup.style.display    = state === 'setup'    ? '' : 'none';
    secEnabled.style.display  = state === 'enabled'  ? '' : 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const enableBtn  = document.getElementById('sett-2fa-enable-btn');
    const cancelBtn  = document.getElementById('sett-2fa-cancel-btn');
    const confirmBtn = document.getElementById('sett-2fa-confirm-btn');
    const disableBtn = document.getElementById('sett-2fa-disable-btn');
    if (!enableBtn) return;

    enableBtn.onclick = async (e) => {
        e.stopPropagation();
        const res = await window.electron.setup2fa().catch(() => null);
        if (!res || !res.success) return notify('error', '2FA Error', res?.message || 'Could not start 2FA setup.');
        document.getElementById('sett-2fa-qr').src = res.qrDataUrl;
        document.getElementById('sett-2fa-confirm-input').value = '';
        const msg = document.getElementById('sett-2fa-setup-msg');
        msg.style.display = 'none';
        _show2faState('setup');
    };

    cancelBtn.onclick = (e) => { e.stopPropagation(); _show2faState('disabled'); };

    confirmBtn.onclick = async (e) => {
        e.stopPropagation();
        const code = document.getElementById('sett-2fa-confirm-input').value.replace(/\s/g, '');
        const msg  = document.getElementById('sett-2fa-setup-msg');
        if (code.length !== 6) { msg.textContent = 'Enter a 6-digit code.'; msg.style.cssText = 'display:;color:#e74c3c;font-size:11px;margin-top:6px;'; return; }
        const res = await window.electron.enable2fa(code).catch(() => null);
        if (res?.success) {
            msg.textContent = '2FA enabled!'; msg.style.cssText = 'display:;color:#2ecc71;font-size:11px;margin-top:6px;';
            setTimeout(() => _show2faState('enabled'), 800);
        } else {
            msg.textContent = res?.error || 'Invalid code.'; msg.style.cssText = 'display:;color:#e74c3c;font-size:11px;margin-top:6px;';
        }
    };

    disableBtn.onclick = async (e) => {
        e.stopPropagation();
        const code = document.getElementById('sett-2fa-disable-input').value.replace(/\s/g, '');
        const msg  = document.getElementById('sett-2fa-disable-msg');
        if (code.length !== 6) { msg.textContent = 'Enter a 6-digit code.'; msg.style.cssText = 'display:;color:#e74c3c;font-size:11px;margin-top:6px;'; return; }
        const res = await window.electron.disable2fa(code).catch(() => null);
        if (res?.success) {
            msg.textContent = '2FA disabled.'; msg.style.cssText = 'display:;color:#2ecc71;font-size:11px;margin-top:6px;';
            setTimeout(() => _show2faState('disabled'), 800);
        } else {
            msg.textContent = res?.error || 'Invalid code.'; msg.style.cssText = 'display:;color:#e74c3c;font-size:11px;margin-top:6px;';
        }
    };

    // Load initial 2FA state eagerly (no accordion required)
    if (currentUser) {
        window.electron.fetchUserProfile(currentUser.id || currentUser.username, true).then(res => {
            _show2faState((res?.profile?.totp_enabled) ? 'enabled' : 'disabled');
        }).catch(() => {});
    }
});

// Intercept launch to inject global settings automatically
if (window.electron && window.electron.launch) {
    const originalLaunch = window.electron.launch;
    window.electron.launch = async (opts) => {
        // Heartbeat Logic
        ActivityManager.isGameRunning = true;
        ActivityManager.sendHeartbeat(); // Force update

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



// ============================================================
// WARDROBE CAROUSEL
// ============================================================
(function() {
    const SLOTS_COUNT = 6;
    const ITEM_W = 180;
    const ITEM_GAP = 32;
    const ITEM_STRIDE = ITEM_W + ITEM_GAP;

    let viewers = [];     // skinview3d instances, indexed by slot
    let skinList = [];    // { url, cape, name, slotIndex, isLocal }
    let currentIndex = 0;
    let initialized = false;
    let slotNames = {};   // { slot_0: 'Active', slot_1: 'My PvP Skin', ... }

    async function loadNames(uName) {
        slotNames = await window.electron.wardrobeGetNames(uName).catch(() => ({}));
    }
    async function saveName(uName, slotId, name) {
        slotNames[`slot_${slotId}`] = name;
        await window.electron.wardrobeSaveNames(uName, slotNames).catch(() => {});
    }
    function getSlotName(slotId, fallback) {
        return slotNames[`slot_${slotId}`] || fallback;
    }

    // ── helpers ──────────────────────────────────────────────────
    function getTrack()   { return document.getElementById('wardrobe-track'); }
    function getBtnPrev() { return document.getElementById('wardrobe-prev'); }
    function getBtnNext() { return document.getElementById('wardrobe-next'); }

    function destroyViewers() {
        viewers.forEach(v => { try { v && v.dispose && v.dispose(); } catch(_){} });
        viewers = [];
    }

    function makeViewer(canvas, skinUrl, capeUrl) {
        const v = new skinview3d.SkinViewer({ canvas, width: ITEM_W, height: 300, renderScale: 1 });
        v.camera.position.set(0, 12, 45);
        v.zoom = 0.9;
        v.animation = new skinview3d.WalkingAnimation();
        v.animation.speed = 0.5;
        if (skinUrl && skinUrl !== b64) v.loadSkin(skinUrl).catch(() => v.loadSkin(b64));
        else v.loadSkin(b64);
        if (capeUrl) v.loadCape(capeUrl).catch(() => {});
        // orbit
        try { if (skinview3d.createOrbitControls) { const c = skinview3d.createOrbitControls(v); c.enableZoom=false; c.enablePan=false; } } catch(_){}
        return v;
    }

    // ── build DOM for one slot ────────────────────────────────────
    function buildCard(skinObj, index) {
        const card = document.createElement('div');
        card.className = 'wrd-card';
        card.dataset.index = index;

        // badge — double-click shows an overlay input for renaming
        const badge = document.createElement('div');
        badge.className = 'wrd-badge';
        badge.textContent = skinObj.name;
        badge.title = 'Double-click to rename';

        const renameInput = document.createElement('input');
        renameInput.className = 'wrd-badge-input';
        renameInput.maxLength = 20;
        renameInput.style.display = 'none';

        let committing = false;
        const openRename = e => {
            e.stopPropagation();
            committing = false;
            renameInput.value = skinObj.name;
            renameInput.style.display = '';
            badge.style.visibility = 'hidden';
            renameInput.focus();
            renameInput.select();
        };
        const commitRename = async () => {
            if (committing) return;
            committing = true;
            const newName = renameInput.value.trim() || skinObj.name;
            skinObj.name = newName;
            badge.textContent = newName;
            renameInput.style.display = 'none';
            badge.style.visibility = '';
            const uName = currentUser ? currentUser.username : 'OfflinePlayer';
            await saveName(uName, skinObj.slotIndex, newName);
        };
        const cancelRename = () => {
            committing = true;
            renameInput.style.display = 'none';
            badge.style.visibility = '';
        };

        badge.addEventListener('dblclick', openRename);
        renameInput.addEventListener('blur', commitRename);
        renameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter')  { e.preventDefault(); commitRename(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
        });

        card.appendChild(badge);
        card.appendChild(renameInput);

        // empty state label for blank slots
        const emptyLabel = document.createElement('div');
        emptyLabel.className = 'wrd-empty';
        emptyLabel.innerHTML = '<i class="fas fa-plus"></i><span>Empty slot</span>';
        emptyLabel.style.display = (skinObj.isLocal && skinObj.url === b64) ? 'flex' : 'none';
        card.appendChild(emptyLabel);

        // canvas — explicit pixel size so WebGL buffer matches display size
        const canvas = document.createElement('canvas');
        canvas.width  = ITEM_W;
        canvas.height = 300;
        card.appendChild(canvas);

        // hover action bar
        const actions = document.createElement('div');
        actions.className = 'wrd-actions';

        if (skinObj.isLocal) {
            // Upload button
            const uploadBtn = document.createElement('button');
            uploadBtn.className = 'wrd-btn upload';
            uploadBtn.title = 'Load skin into this slot';
            uploadBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
            uploadBtn.onclick = e => { e.stopPropagation(); pickSkinForSlot(skinObj, card, emptyLabel, canvas); };
            actions.appendChild(uploadBtn);

            // Apply button (only if slot has a skin)
            if (skinObj.url !== b64) {
                const applyBtn = document.createElement('button');
                applyBtn.className = 'wrd-btn apply';
                applyBtn.title = 'Set as active skin';
                applyBtn.innerHTML = '<i class="fas fa-check"></i>';
                applyBtn.onclick = async e => {
                    e.stopPropagation();
                    applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    await applySlotToServer(skinObj, applyBtn);
                };
                actions.appendChild(applyBtn);

                // Delete slot button
                const delBtn = document.createElement('button');
                delBtn.className = 'wrd-btn delete';
                delBtn.title = 'Clear this slot';
                delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                delBtn.onclick = async e => {
                    e.stopPropagation();
                    const uName = currentUser ? currentUser.username : 'OfflinePlayer';
                    await window.electron.wardrobeDeleteSlot(uName, skinObj.slotIndex);
                    initCarousel();
                };
                actions.appendChild(delBtn);
            }
        }
        card.appendChild(actions);

        // click to focus
        card.addEventListener('click', () => { if (currentIndex !== index) { currentIndex = index; updateView(); } });

        return { card, canvas };
    }

    async function pickSkinForSlot(skinObj, card, emptyLabel, canvas) {
        const uName = currentUser ? currentUser.username : 'OfflinePlayer';
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/png';
        input.onchange = async ev => {
            const f = ev.target.files[0]; if (!f) return;
            const reader = new FileReader();
            reader.onload = async re => {
                const base64 = re.target.result;
                await window.electron.wardrobeSaveSlot(uName, skinObj.slotIndex, 'skin', base64);
                skinObj.url = base64;
                // update viewer in place
                const v = viewers[skinList.indexOf(skinObj)];
                if (v) { v.loadSkin(base64).catch(() => {}); }
                emptyLabel.style.display = 'none';
                initCarousel(); // rebuild to show apply/delete buttons
            };
            reader.readAsDataURL(f);
        };
        input.click();
    }

    async function applySlotToServer(skinObj, btn) {
        const uName = currentUser ? currentUser.username : 'OfflinePlayer';
        try {
            const res = await fetch(skinObj.url);
            const blob = await res.blob();
            const fd = new FormData();
            fd.append('skin', blob, 'skin.png');
            fd.append('username', uName);
            fd.append('action', 'upload');
            const r = await fetch(`${API_BASE_URL}/php/skin_handler.php`, { method: 'POST', body: fd });
            const json = await r.json();
            if (json.success) {
                if (skinObj.cape) {
                    const cr = await fetch(skinObj.cape); const cb = await cr.blob();
                    const cf = new FormData(); cf.append('cape', cb, 'cape.png'); cf.append('username', uName); cf.append('action', 'upload_cape');
                    await fetch(`${API_BASE_URL}/php/skin_handler.php`, { method: 'POST', body: cf });
                }
                window.HexaAlert('Success', 'Skin applied!');
                refreshSkinDisplay();
                initCarousel();
            } else {
                window.HexaAlert('Error', json.error || 'Upload failed');
                btn.innerHTML = '<i class="fas fa-check"></i>';
            }
        } catch(err) {
            window.HexaAlert('Error', 'Network error');
            btn.innerHTML = '<i class="fas fa-check"></i>';
        }
    }

    // ── layout update ─────────────────────────────────────────────
    function updateView() {
        const track = getTrack(); if (!track) return;
        const containerW = track.parentElement ? track.parentElement.clientWidth : 700;
        const offset = Math.round((containerW / 2) - (currentIndex * ITEM_STRIDE) - (ITEM_W / 2));
        track.style.transform = `translateX(${offset}px)`;

        Array.from(track.children).forEach((card, idx) => {
            const isFocused = idx === currentIndex;
            card.classList.toggle('wrd-active', isFocused);
            // pause animation on non-focused viewers to save GPU
            const v = viewers[idx];
            if (v) { v.animation.paused = !isFocused; }
        });

        // update dot indicators
        document.querySelectorAll('.wrd-dot').forEach((d, i) => d.classList.toggle('active', i === currentIndex));
    }

    // ── main init ─────────────────────────────────────────────────
    async function initCarousel(retries = 6) {
        if (typeof skinview3d === 'undefined') {
            if (retries > 0) setTimeout(() => initCarousel(retries - 1), 400);
            return;
        }
        const track = getTrack(); if (!track) return;

        destroyViewers();
        track.innerHTML = '';
        skinList = [];
        currentIndex = 0;

        const uName = currentUser ? currentUser.username : 'OfflinePlayer';
        await loadNames(uName);

        // Slot 0 — active server skin
        const activeSkin = currentUser ? socAvatarUrl(currentUser) : `${API_BASE_URL}/hexa/api/textures/skins/${uName}.png`;
        const rawCape = currentUser ? (currentUser.cape_url || currentUser.cape || null) : null;
        const activeCape = rawCape
            ? (rawCape.startsWith('http') ? rawCape : `${API_BASE_URL}/hexa/api/textures/capes/${rawCape}`)
            : null;
        skinList.push({ url: activeSkin, cape: activeCape, name: getSlotName(0, 'Active'), slotIndex: 0, isLocal: false });

        // Slots 1-5 — local saved skins
        for (let i = 1; i < SLOTS_COUNT; i++) {
            const localSkin = await window.electron.wardrobeGetSlot(uName, i, 'skin').catch(() => null);
            const localCape = await window.electron.wardrobeGetSlot(uName, i, 'cape').catch(() => null);
            skinList.push({ url: localSkin || b64, cape: localCape || null, name: getSlotName(i, `Slot ${i}`), slotIndex: i, isLocal: true });
        }

        // Build cards
        skinList.forEach((skinObj, index) => {
            const { card, canvas } = buildCard(skinObj, index);
            track.appendChild(card);
            try { viewers[index] = makeViewer(canvas, skinObj.url, skinObj.cape); } catch(e) { console.error(e); viewers[index] = null; }
        });

        // Build dot indicators
        let dotsEl = document.getElementById('wrd-dots');
        if (dotsEl) {
            dotsEl.innerHTML = skinList.map((_, i) => `<span class="wrd-dot${i===0?' active':''}"></span>`).join('');
            dotsEl.querySelectorAll('.wrd-dot').forEach((d, i) => d.addEventListener('click', () => { currentIndex = i; updateView(); }));
        }

        updateView();
        initialized = true;
    }

    // nav buttons (re-query each time to handle hot reload)
    document.addEventListener('click', e => {
        if (e.target.closest('#wardrobe-prev')) {
            if (!skinList.length) return;
            currentIndex = currentIndex > 0 ? currentIndex - 1 : skinList.length - 1;
            updateView();
        }
        if (e.target.closest('#wardrobe-next')) {
            if (!skinList.length) return;
            currentIndex = currentIndex < skinList.length - 1 ? currentIndex + 1 : 0;
            updateView();
        }
    });

    // keyboard nav when wardrobe tab is visible
    document.addEventListener('keydown', e => {
        if (!document.getElementById('wardrobe-tab')?.classList.contains('active')) return;
        if (e.key === 'ArrowLeft')  { currentIndex = currentIndex > 0 ? currentIndex - 1 : skinList.length - 1; updateView(); }
        if (e.key === 'ArrowRight') { currentIndex = currentIndex < skinList.length - 1 ? currentIndex + 1 : 0;  updateView(); }
    });

    window.initCarousel = initCarousel;
    setTimeout(initCarousel, 1200);
})();
// ==========================================
// SOCIAL HUB
// ==========================================

function socAvatarUrl(user) {
    return user.skin_url
        ? (user.skin_url.includes('http') ? user.skin_url : `https://hexa-mc.fr/hexa/api/textures/skins/${user.skin_url}`)
        : `https://hexa-mc.fr/hexa/api/textures/skins/${user.username}.png`;
}

// ── Role helpers ──────────────────────────────────────────────

function getRoleData(role) {
    if (roleColorsCache && roleColorsCache[role]) return roleColorsCache[role];
    const defaults = {
        player: { color: '#aaaaaa', glow: null,      label: 'Player', faIcon: null },
        kitty:  { color: '#ff69b4', glow: '#ff1493', label: 'Kitty',  faIcon: 'fa-cat' },
        staff:  { color: '#3498db', glow: '#2980b9', label: 'Staff',  faIcon: 'fa-shield-halved' },
        admin:  { color: '#e74c3c', glow: '#c0392b', label: 'Admin',  faIcon: 'fa-user-shield' },
        owner:  { color: '#ffd700', glow: '#b8860b', label: 'Owner',  faIcon: 'fa-crown' },
    };
    return defaults[role] || defaults.player;
}

function buildRolePill(role, show = true) {
    if (!show || !role || role === 'player') return '';
    const rd = getRoleData(role);
    if (!rd.faIcon) return '';
    return `<i class="fas ${rd.faIcon} role-icon" style="color:${rd.color}" title="${rd.label}"></i>`;
}

// Premium cert badge — shown next to username when microsoft_id is linked
function buildCertBadge(hasMicrosoft) {
    if (!hasMicrosoft) return '';
    return `<i class="fas fa-certificate cert-badge" title="Premium — Microsoft linked"></i>`;
}

// Apply profile background to the prof-panel element
function applyProfileBg(profileBg) {
    const panel = document.getElementById('prof-panel');
    if (!panel) return;
    if (!profileBg || profileBg === '') {
        panel.style.removeProperty('background');
        return;
    }
    if (profileBg.startsWith('gradient:')) {
        const [top, bot] = profileBg.slice(9).split(',');
        panel.style.background = `linear-gradient(to bottom, ${top}, ${bot})`;
    }
}

// Convert a stored banner_url value to a CSS background string
function bannerUrlToCss(bannerUrl, fallback) {
    if (!bannerUrl) return fallback;
    if (bannerUrl.startsWith('gradient:')) {
        const [top, bot] = bannerUrl.slice(9).split(',');
        return `linear-gradient(to bottom, ${top}, ${bot})`;
    }
    if (bannerUrl.startsWith('color:')) {
        const c = bannerUrl.slice(6);
        return `linear-gradient(135deg, ${c}ee 0%, ${c}66 60%, ${c}22 100%)`;
    }
    return `url(${bannerUrl}) center/cover no-repeat`;
}

// Role badge — synthetic badge for staff/admin/kitty/owner shown in profile badges section
function buildRoleBadgeHtml(role, mode = 'feat') {
    const ROLE_BADGES = {
        owner: { label: 'Owner',  desc: 'Server Owner',          faIcon: 'fa-crown',        color: '#ffd700', glow: '#b8860b', rarity: 'legendary' },
        admin: { label: 'Admin',  desc: 'Server Administrator',  faIcon: 'fa-user-shield',  color: '#e74c3c', glow: '#c0392b', rarity: 'epic' },
        staff: { label: 'Staff',  desc: 'Staff Member',          faIcon: 'fa-shield-halved', color: '#3498db', glow: '#2980b9', rarity: 'rare' },
        kitty: { label: 'Kitty',  desc: 'Special Kitty Role',    faIcon: 'fa-cat',           color: '#ff69b4', glow: '#ff1493', rarity: 'epic' },
    };
    const b = ROLE_BADGES[role];
    if (!b) return '';
    if (mode === 'feat') {
        return `<div class="prof-badge-feat role-badge" data-rarity="${b.rarity}" title="${b.desc}">
            <div class="prof-badge-icon" style="filter:drop-shadow(0 0 6px ${b.glow})"><i class="fas ${b.faIcon}" style="color:${b.color}"></i></div>
            <div class="prof-badge-name">${b.label}</div>
        </div>`;
    }
    return `<div class="prof-badge-item role-badge" data-rarity="${b.rarity}" title="${b.desc}">
        <div class="prof-badge-icon" style="filter:drop-shadow(0 0 6px ${b.glow})"><i class="fas ${b.faIcon}" style="color:${b.color}"></i></div>
        <div class="prof-badge-name">${b.label}</div>
        <div class="prof-badge-desc">${b.desc}</div>
    </div>`;
}

const BADGE_FA_MAP = {
    discord:    'fab fa-discord',
    kitty:      'fa-cat',        cat:       'fa-cat',        star:      'fa-star',
    crown:      'fa-crown',      diamond:   'fa-gem',        fire:      'fa-fire',
    shield:     'fa-shield-alt', sword:     'fa-khanda',     heart:     'fa-heart',
    bolt:       'fa-bolt',       trophy:    'fa-trophy',     medal:     'fa-medal',
    flag:       'fa-flag',       ghost:     'fa-ghost',      rocket:    'fa-rocket',
    skull:      'fa-skull',      eye:       'fa-eye',        moon:      'fa-moon',
    sun:        'fa-sun',        leaf:      'fa-leaf',       snowflake: 'fa-snowflake',
    music:      'fa-music',      code:      'fa-code',       bug:       'fa-bug',
    wrench:     'fa-wrench',     paint:     'fa-paint-brush',pen:       'fa-pen',
    book:       'fa-book',
    default:    'fa-certificate',
};

function badgeFaIcon(badge) {
    const rawIcon = badge.icon || '';
    // FA class stored in icon field
    if (rawIcon.startsWith('fa-') || rawIcon.startsWith('fas ') || rawIcon.startsWith('fab ')) return rawIcon;
    // Map by badge name keywords
    const n = (badge.name || '').toLowerCase();
    for (const [key, cls] of Object.entries(BADGE_FA_MAP)) {
        if (key !== 'default' && n.includes(key)) return cls;
    }
    return BADGE_FA_MAP.default;
}

// Returns the inner HTML for a badge icon — handles icon_img (URL), emoji, and FA classes
function badgeIconHtml(badge, size = '28px') {
    const rawIcon = badge.icon || '';
    // Custom image (icon_img takes priority)
    if (badge.icon_img) {
        return `<img src="${escHtml(badge.icon_img)}" style="width:${size};height:${size};object-fit:contain;image-rendering:pixelated;" onerror="this.style.display='none'">`;
    }
    // Explicit FA class stored in icon field (e.g. "fa-crown", "fas fa-shield")
    const isFa = rawIcon.startsWith('fa-') || rawIcon.startsWith('fas ') || rawIcon.startsWith('fab ');
    if (isFa) {
        const color = badgeIconColor(badge);
        const cls = rawIcon.startsWith('fab ') ? rawIcon : (rawIcon.startsWith('fas ') ? rawIcon : `fas ${rawIcon}`);
        return `<i class="${cls}" style="color:${color};font-size:${size};"></i>`;
    }
    // Keyword that maps to a FA icon in BADGE_FA_MAP (e.g. "discord", "star", "crown")
    if (rawIcon && BADGE_FA_MAP[rawIcon.toLowerCase()]) {
        const fa = BADGE_FA_MAP[rawIcon.toLowerCase()];
        const color = badgeIconColor(badge);
        const cls = fa.startsWith('fab ') ? fa : `fas ${fa}`;
        return `<i class="${cls}" style="color:${color};font-size:${size};"></i>`;
    }
    // Emoji or non-FA text (single character or emoji sequence)
    if (rawIcon && [...rawIcon].length <= 3) {
        return `<span style="font-size:${size};line-height:1;">${rawIcon}</span>`;
    }
    // Name-based FA lookup (fallback)
    const fa = badgeFaClass(badge);
    const color = badgeIconColor(badge);
    return `<i class="${fa}" style="color:${color};font-size:${size};"></i>`;
}

const RARITY_COLOR = {
    legendary:   '#f5a623',
    epic:        '#9b59b6',
    rare:        '#3498db',
    uncommon:    '#2ecc71',
    impossible:  '#cc2222',
    common:      '#aaaaaa',
};

const BADGE_NAME_COLOR = {
    discord: '#5865F2',
    kitty:   '#ff69b4',
    staff:   '#3498db',
    owner:   '#ffd700',
};

function badgeIconColor(badge) {
    const n = (badge.name || '').toLowerCase();
    for (const [key, color] of Object.entries(BADGE_NAME_COLOR)) {
        if (n.includes(key)) return color;
    }
    return RARITY_COLOR[(badge.rarity || '').toLowerCase()] || '#aaaaaa';
}

function buildBadgesInline(badges) {
    if (!badges || !badges.length) return '';
    return badges
        .filter(b => b.displayed != 0 && (b.display_mode === 'inline' || b.display_mode === 'both'))
        .slice(0, 3)
        .map(b => `<span class="inline-badge" title="${escHtml(b.name)} — ${b.rarity || ''}">${badgeIconHtml(b, '13px')}</span>`)
        .join('');
}


// ─────────────────────────────────────────────────────────────

function buildSocUser(user, options = {}) {
    const el = document.createElement('div');
    el.className = 'soc-user';
    const rawStatus  = user.status ? user.status.toLowerCase() : 'offline';
    const statusType = rawStatus === 'inactive' ? 'idle' : rawStatus; // CSS uses 'idle' not 'inactive'
    const statusText = statusType === 'online' ? 'Online' : statusType === 'idle' ? 'Idle' : 'Offline';
    const rd = getRoleData(user.role);
    const hasRole = user.role && user.role !== 'player';
    const subtitleText = user._isHexa ? 'Official' : (hasRole ? rd.label : statusText);
    const subtitleClass = user._isHexa ? 'soc-activity' : (hasRole ? 'soc-role-label' : `soc-activity soc-status-${statusType}`);
    const subtitleStyle = user._isHexa ? `style="color:var(--brand);font-weight:600;"` : (hasRole ? `style="color:${rd.color};"` : '');
    let avatarUrl = user._isHexa ? 'assets/default.png' : `https://minotar.net/helm/${user.username}/64`;

    if (!user._isHexa) {
        extractHeadAvatar(socAvatarUrl(user)).then(h => {
            const img = el.querySelector('img');
            if (img) img.src = h;
            avatarUrl = h;
        }).catch(() => {});
    }

    const rolePill = buildRolePill(user.role, user.show_role_badge !== 0);
    const certBadge = buildCertBadge(user.microsoft_id);

    if (options.type === 'request') {
        el.innerHTML = `
            <div class="soc-avatar"><img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64';">
                <div class="soc-status-badge status-offline"></div></div>
            <div class="soc-info">
                <div class="soc-name-row"><span class="soc-name">${user.username}</span>${rolePill}${certBadge}</div>
                <div class="soc-activity soc-pending">${hasRole ? `<span style="color:${rd.color};font-weight:700;">${rd.label}</span> • ` : ''}Request received</div>
            </div>
            <div class="soc-req-actions">
                <button class="soc-req-btn accept" title="Accept"><i class="fas fa-check"></i></button>
                <button class="soc-req-btn reject" title="Decline"><i class="fas fa-times"></i></button>
            </div>`;
        el.querySelector('.accept').onclick = (e) => { e.stopPropagation(); acceptFriendRequest(user.username); };
        el.querySelector('.reject').onclick = (e) => { e.stopPropagation(); rejectFriendRequest(user.username); };
    } else if (options.type === 'sent') {
        el.innerHTML = `
            <div class="soc-avatar"><img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64';">
                <div class="soc-status-badge status-offline"></div></div>
            <div class="soc-info">
                <div class="soc-name-row"><span class="soc-name">${user.username}</span>${rolePill}${certBadge}</div>
                <div class="soc-activity soc-pending" style="color:var(--text-subtle)"><i class="fas fa-clock" style="font-size:10px;margin-right:3px;"></i>Pending…</div>
            </div>
            <div class="soc-req-actions">
                <button class="soc-req-btn reject" title="Cancel request"><i class="fas fa-times"></i></button>
            </div>`;
        el.querySelector('.reject').onclick = (e) => { e.stopPropagation(); rejectFriendRequest(user.id); };
    } else {
        const isPinned = options.pinned === true;
        el.dataset.friendId = user.id;
        el.dataset.pinned   = isPinned ? 'true' : 'false';
        el.innerHTML = `
            <div class="soc-avatar"><img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64';">
                <div class="soc-status-badge status-${statusType}"></div></div>
            <div class="soc-info">
                <div class="soc-name-row"><span class="soc-name">${user.username}</span>${rolePill}${certBadge}</div>
                <div class="${subtitleClass}" ${subtitleStyle}>${subtitleText}</div>
            </div>
            <div class="soc-friend-actions">
                <button class="soc-pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin'}"><i class="fas fa-thumbtack"></i></button>
                <div class="soc-menu-trigger" data-uid="${user.id}" data-uname="${user.username}"><i class="fas fa-ellipsis-v"></i></div>
            </div>`;
        el.querySelector('.soc-pin-btn').onclick = (e) => { e.stopPropagation(); toggleFriendPin(user.id); };
        if (user._isHexa) {
            el.dataset.friendId = '__hexa__';
            el.querySelector('.soc-menu-trigger').style.display = 'none';
            el.onclick = (ev) => {
                if (ev.target.closest('.soc-friend-actions')) return;
                _clearUnread('__hexa__');
                window.setSocial(user.username, 'Official', avatarUrl, 'online', el, '__hexa__');
            };
        } else {
            el.querySelector('.soc-menu-trigger').onclick = (e) => toggleUserMenu(e, user.id, user.username);
            el.onclick = (ev) => {
                if (ev.target.closest('.soc-friend-actions')) return;
                if (ev.target.closest('.soc-name')) { openProfileOverlay(user.id); return; }
                window.setSocial(user.username, statusText, avatarUrl, statusType, el, user.id);
            };
        }
    }
    return el;
}

const FRIEND_MAX_PINS = 3;
const getFriendPins   = () => JSON.parse(localStorage.getItem('hexa_friend_pins') || '[]');
const saveFriendPins  = (arr) => localStorage.setItem('hexa_friend_pins', JSON.stringify(arr));

function toggleFriendPin(userId) {
    let pins = getFriendPins();
    const wasPin = pins.includes(userId);
    if (wasPin) {
        pins = pins.filter(p => p !== userId);
    } else {
        if (pins.length >= FRIEND_MAX_PINS) {
            window.notify('warning', 'Pin limit', `You can only pin ${FRIEND_MAX_PINS} friends`, { duration: 3000 });
            return;
        }
        pins.push(userId);
    }
    saveFriendPins(pins);
    _animateFriendPin(userId, !wasPin);
}

function _animateFriendPin(userId, pin) {
    const roster = document.getElementById('soc-roster-friends');
    if (!roster) return;

    // Find the card by its data-friend-id attribute
    const card = roster.querySelector(`.soc-user[data-friend-id="${userId}"]`);
    if (!card) { loadFriends(); return; }

    // Update pin button state immediately
    const pinBtn = card.querySelector('.soc-pin-btn');
    if (pinBtn) {
        pinBtn.classList.toggle('pinned', pin);
        pinBtn.title = pin ? 'Unpin' : 'Pin';
    }

    if (pin) {
        // Move to top — ensure PINNED group header exists
        let pinnedGroup = roster.querySelector('.soc-group-pinned');
        if (!pinnedGroup) {
            pinnedGroup = document.createElement('div');
            pinnedGroup.className = 'soc-group soc-group-pinned';
            pinnedGroup.textContent = 'PINNED — 1';
            roster.insertBefore(pinnedGroup, roster.firstChild);
        } else {
            const count = roster.querySelectorAll('.soc-user[data-pinned="true"]').length + 1;
            pinnedGroup.textContent = `PINNED — ${count}`;
        }
        card.dataset.pinned = 'true';
        card.classList.add('friend-pinning');
        // Animate: fly up to just after the pinned header
        const startRect = card.getBoundingClientRect();
        roster.insertBefore(card, pinnedGroup.nextSibling);
        const endRect = card.getBoundingClientRect();
        const dy = startRect.top - endRect.top;
        card.style.transform = `translateY(${dy}px)`;
        card.style.transition = 'none';
        requestAnimationFrame(() => {
            card.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
            setTimeout(() => {
                card.style.boxShadow = '';
                card.classList.remove('friend-pinning');
            }, 340);
        });
    } else {
        // Unpin — send back to online/offline section
        card.dataset.pinned = 'false';
        const pinnedGroup = roster.querySelector('.soc-group-pinned');
        const remaining = roster.querySelectorAll('.soc-user[data-pinned="true"]').length - 1;
        if (pinnedGroup) {
            if (remaining > 0) pinnedGroup.textContent = `PINNED — ${remaining}`;
            else pinnedGroup.remove();
        }
        // Find or create the correct section (online/offline)
        const statusType = card.querySelector('.soc-status-badge')?.className.includes('online') ? 'online' : 'offline';
        const label = statusType === 'online' ? 'ONLINE' : 'OFFLINE';
        let section = [...roster.querySelectorAll('.soc-group:not(.soc-group-pinned)')].find(g => g.textContent.startsWith(label));
        const startRect = card.getBoundingClientRect();
        if (section) {
            section.after(card);
        } else {
            roster.appendChild(card);
        }
        const endRect = card.getBoundingClientRect();
        const dy = startRect.top - endRect.top;
        card.style.transform = `translateY(${dy}px)`;
        card.style.transition = 'none';
        requestAnimationFrame(() => {
            card.style.transition = 'transform 0.32s cubic-bezier(0.22,1,0.36,1)';
            card.style.transform = 'translateY(0)';
        });
    }
}

const HEXA_VIRTUAL_USER = {
    id: '__hexa__',
    username: 'Hexa',
    status: 'online',
    role: 'owner',
    _isHexa: true,
};

// Cache of all friend relations — {id: friendship_status}
let friendRelationCache = {};

async function loadFriends() {
    const roster = document.getElementById('soc-roster-friends');
    if (!roster) return;
    roster.innerHTML = '<div class="soc-empty-msg"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const result = await window.electron.fetchFriends();
        const allRelations = (result && result.friends) ? result.friends : [];
        // Update cache
        friendRelationCache = {};
        allRelations.forEach(u => { friendRelationCache[u.id] = u.friendship_status; });
        const friends = allRelations.filter(u => u.friendship_status === 'accepted');
        const list = [HEXA_VIRTUAL_USER, ...friends];
        const pins = getFriendPins();
        roster.innerHTML = '';

        const pinned   = list.filter(u => pins.includes(u.id));
        const unpinned = list.filter(u => !pins.includes(u.id));

        if (pinned.length) {
            const g = document.createElement('div'); g.className = 'soc-group'; g.textContent = `PINNED — ${pinned.length}`;
            roster.appendChild(g);
            pinned.forEach(u => roster.appendChild(buildSocUser(u, { pinned: true })));
        }

        if (!unpinned.length) return;

        const online  = unpinned.filter(u => u.status === 'online');
        const offline = unpinned.filter(u => u.status !== 'online');

        if (online.length) {
            const g = document.createElement('div'); g.className = 'soc-group'; g.textContent = `ONLINE — ${online.length}`;
            roster.appendChild(g);
            online.forEach(u => roster.appendChild(buildSocUser(u, { pinned: false })));
        }
        if (offline.length) {
            const g = document.createElement('div'); g.className = 'soc-group'; g.textContent = `OFFLINE — ${offline.length}`;
            roster.appendChild(g);
            offline.forEach(u => roster.appendChild(buildSocUser(u, { pinned: false })));
        }
        // Restore any pending unread badges after list rebuild
        Object.keys(_dmUnread).forEach(id => _renderUnreadBadge(id));
    } catch(e) { roster.innerHTML = '<div class="soc-empty-msg">Loading error.</div>'; }
}

async function loadFriendRequests() {
    const roster = document.getElementById('soc-roster-requests');
    const badge = document.getElementById('req-badge');
    if (!roster) return;
    roster.innerHTML = '<div class="soc-empty-msg"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const result = await window.electron.fetchFriends();
        const all = (result && result.friends) ? result.friends : [];
        all.forEach(u => { friendRelationCache[u.id] = u.friendship_status; });
        const received = all.filter(u => u.friendship_status === 'pending');
        const sent     = all.filter(u => u.friendship_status === 'sent');
        roster.innerHTML = '';
        if (badge) { badge.textContent = received.length || ''; badge.classList.toggle('has-requests', received.length > 0); }

        if (!received.length && !sent.length) {
            roster.innerHTML = '<div class="soc-empty-msg">No pending requests.</div>';
            return;
        }
        if (received.length) {
            const g = document.createElement('div'); g.className = 'soc-group'; g.textContent = `RECEIVED — ${received.length}`;
            roster.appendChild(g);
            received.forEach(u => roster.appendChild(buildSocUser(u, { type: 'request' })));
        }
        if (sent.length) {
            const g = document.createElement('div'); g.className = 'soc-group'; g.textContent = `SENT — ${sent.length}`;
            roster.appendChild(g);
            sent.forEach(u => roster.appendChild(buildSocUser(u, { type: 'sent' })));
        }
    } catch(e) { roster.innerHTML = '<div class="soc-empty-msg">Loading error.</div>'; }
}

async function loadSocialHubUsers() {
    loadFriends();
    loadFriendRequests();
}

// Auto-refresh friend statuses every 30s
setInterval(() => {
    if (currentUser) loadFriends();
}, 30000);

async function acceptFriendRequest(username) {
    try {
        const res = await window.electron.acceptFriend(username);
        if (res.success) { loadFriendRequests(); loadFriends(); }
        else window.HexaAlert("Error", res.message);
    } catch(e) {}
}
window.acceptFriendRequest = acceptFriendRequest;

async function rejectFriendRequest(friendId) {
    try {
        const res = await window.electron.rejectFriend(friendId);
        if (res.success) loadFriendRequests();
        else window.HexaAlert("Error", res.message);
    } catch(e) {}
}
window.rejectFriendRequest = rejectFriendRequest;

// ─── DM CHAT ─────────────────────────────────────────────────────────────────
let currentChatFriendId   = null;
let currentChatFriendName = null;
let currentChatFriendAva  = null;
let dmReplyTo             = null; // { id, username, message }
let dmRefreshTimer        = null;
let dmLastKnownId         = 0;   // shared with sendChatMessage to avoid double-append

// ─── UNREAD BADGES ───────────────────────────────────────────────────────────
const _dmUnread = {}; // friendId (string) → unread count

function _incUnread(friendId) {
    const key = String(friendId);
    _dmUnread[key] = (_dmUnread[key] || 0) + 1;
    _renderUnreadBadge(key);
}

function _clearUnread(friendId) {
    const key = String(friendId);
    if (!_dmUnread[key]) return;
    delete _dmUnread[key];
    _renderUnreadBadge(key);
}

function _renderUnreadBadge(friendId) {
    const count = _dmUnread[String(friendId)] || 0;
    // Find the card — Hexa uses '__hexa__', real friends use numeric id
    const card = document.querySelector(`.soc-user[data-friend-id="${friendId}"]`);
    if (!card) return;
    let badge = card.querySelector('.soc-unread-badge');
    if (count === 0) { if (badge) badge.remove(); return; }
    if (!badge) {
        badge = document.createElement('div');
        badge.className = 'soc-unread-badge';
        card.querySelector('.soc-avatar').appendChild(badge);
    }
    badge.textContent = count > 9 ? '9+' : String(count);
}

window.setSocial = function(name, status, avatar, type, element, friendId) {
    setSocMode('dm');
    document.querySelectorAll(".soc-user").forEach(el => el.classList.remove("active"));
    if(element) element.classList.add("active");

    document.getElementById("soc-header-pic").src = avatar; document.getElementById("soc-header-pic").style.display="block";
    document.getElementById("soc-header-name").innerText = name;

    const statusEl = document.getElementById("soc-header-status");
    statusEl.innerText = status;
    statusEl.className = 'soc-header-status status-' + (type || 'online');

    const msgList = document.getElementById("soc-msg-list");
    msgList.innerHTML = `<div class="soc-divider"><span>Direct Message</span></div><div style="text-align:center;color:#888;margin-top:20px;font-size:12px;">This is the beginning of your chat history with ${name}.</div><div id="chat-loading" style="text-align:center;margin-top:10px;"><i class="fas fa-spinner fa-spin"></i></div>`;

    dmClearReply();
    const inputArea = document.getElementById("soc-input-text");
    const isHexa = friendId === '__hexa__';
    inputArea.disabled = isHexa;
    inputArea.placeholder = isHexa ? "You cannot reply to Hexa." : "Message @" + name + "...";
    inputArea.value = "";

    currentChatFriendId   = isHexa ? null : friendId;
    currentChatFriendName = isHexa ? null : name;
    currentChatFriendAva  = isHexa ? null : avatar;
    _clearUnread(isHexa ? '__hexa__' : friendId);
    if (!isHexa) loadChatMessages(friendId, name, avatar);
    else loadHexaMessages();
};

// ── DM Reply state ────────────────────────────────────────────────────────────
function dmSetReply(msgId, username, message) {
    dmReplyTo = { id: msgId, username, message };
    const bar = document.getElementById('dm-reply-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.querySelector('.gc-reply-preview').textContent = `${username}: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`;
}
function dmClearReply() {
    dmReplyTo = null;
    const bar = document.getElementById('dm-reply-bar');
    if (bar) bar.style.display = 'none';
}
window.dmClearReply = dmClearReply;

// ── DM reaction patch (no full reload) ───────────────────────────────────────
let _dmReacting = false;
function dmPatchReactions(msgId, reactionsJson) {
    const list = document.getElementById('soc-msg-list');
    if (!list) return;
    const row = list.querySelector(`[data-dm-id="${msgId}"]`);
    if (!row) return;
    let reacts = {};
    try { reacts = typeof reactionsJson === 'string' ? JSON.parse(reactionsJson) : (reactionsJson || {}); } catch(_) {}
    const myId = gcMyDbId || -1;
    const entries = Object.entries(reacts).filter(([,uids]) => uids.length > 0);
    let existing = row.querySelector('.gc-reactions');
    if (!entries.length) { if (existing) existing.remove(); return; }
    const html = entries.map(([emoji, uids]) => {
        const mine = uids.includes(myId);
        return `<button class="gc-react-chip${mine ? ' mine' : ''}" data-msg-id="${msgId}" data-emoji="${emoji}">${emoji} <span>${uids.length}</span></button>`;
    }).join('');
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'gc-reactions';
        row.querySelector('.soc-msg-body-col')?.appendChild(existing);
    }
    existing.innerHTML = html;
    _jpparse(existing);
    existing.querySelectorAll('.gc-react-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (_dmReacting) return;
            _dmReacting = true;
            const r = await window.electron.reactDmMessage(+btn.dataset.msgId, btn.dataset.emoji);
            _dmReacting = false;
            if (r?.success) dmPatchReactions(+btn.dataset.msgId, r.reactions);
        });
    });
}

function dmOpenReactPicker(anchorBtn, msgId) {
    _openReactPickerFor(anchorBtn, msgId, async (emoji) => {
        if (_dmReacting) return; _dmReacting = true;
        const r = await window.electron.reactDmMessage(msgId, emoji);
        _dmReacting = false;
        if (r?.success) dmPatchReactions(msgId, r.reactions);
    });
}

function dmStartEdit(msgId, currentText) {
    const textEl = document.querySelector(`#soc-msg-list .soc-msg-text[data-dm-id="${msgId}"]`);
    if (!textEl) return;
    const restore = () => { textEl.textContent = currentText; };
    textEl.innerHTML = `<div class="gc-edit-wrap">
        <input class="gc-edit-input" value="${escHtml(currentText)}" maxlength="2000">
        <div class="gc-edit-actions">
            <button class="gc-edit-save">Save</button>
            <button class="gc-edit-cancel">Cancel</button>
        </div>
    </div>`;
    const inp = textEl.querySelector('.gc-edit-input');
    inp.focus(); inp.select();
    textEl.querySelector('.gc-edit-save').addEventListener('click', async () => {
        const val = inp.value.trim();
        if (!val) return;
        const r = await window.electron.editMessage(msgId, val);
        if (r?.success) {
            textEl.textContent = val;
            const header = textEl.closest('.soc-msg-body-col')?.querySelector('.soc-msg-header');
            if (header && !header.querySelector('.gc-edited')) {
                header.insertAdjacentHTML('beforeend', '<span class="gc-edited">(edited)</span>');
            }
        } else {
            restore();
            window.notify?.('error', 'Error', r ? r.message : 'Unable to edit');
        }
    });
    textEl.querySelector('.gc-edit-cancel').addEventListener('click', restore);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textEl.querySelector('.gc-edit-save').click(); }
        if (e.key === 'Escape') restore();
    });
}

let _hexaLastMsgId = 0;
let _hexaRefreshTimer = null;

async function loadHexaMessages() {
    const list = document.getElementById('soc-msg-list');
    if (!list) return;
    if (_hexaRefreshTimer) { clearInterval(_hexaRefreshTimer); _hexaRefreshTimer = null; }
    if (dmRefreshTimer) { clearInterval(dmRefreshTimer); dmRefreshTimer = null; }

    list.innerHTML = `<div class="soc-divider"><span>Hexa — Official</span></div>`;

    const r = await window.electron.getHexaMessages().catch(() => null);
    const msgs = r?.messages || [];
    _hexaLastMsgId = msgs.length ? Math.max(...msgs.map(m => m.id)) : 0;

    if (!msgs.length) {
        list.innerHTML += `<div style="text-align:center;color:var(--text-muted);margin-top:32px;font-size:12px;"><i class="fas fa-crown" style="color:#ffd700;font-size:20px;display:block;margin-bottom:8px;"></i>Messages from the Hexa team will appear here.</div>`;
    } else {
        _appendHexaMessages(msgs, list);
        list.scrollTop = list.scrollHeight;
    }

    _hexaRefreshTimer = setInterval(async () => {
        // Only poll while Hexa conv is still open (no currentChatFriendId means Hexa or nothing)
        if (currentChatFriendId !== null) { clearInterval(_hexaRefreshTimer); return; }
        const rr = await window.electron.getHexaMessages().catch(() => null);
        if (!rr?.messages?.length) return;
        const latest = Math.max(...rr.messages.map(m => m.id));
        if (latest <= _hexaLastMsgId) return;
        const newMsgs = rr.messages.filter(m => m.id > _hexaLastMsgId);
        _hexaLastMsgId = latest;
        const l = document.getElementById('soc-msg-list');
        if (l) { _appendHexaMessages(newMsgs, l); l.scrollTop = l.scrollHeight; }
    }, 2000);
}

function _appendHexaMessages(msgs, list) {
    // Remove empty-state placeholder if present
    const placeholder = list.querySelector('[style*="text-align:center"]');
    if (placeholder) placeholder.remove();

    const myName = currentUser?.username || '';
    msgs.forEach(msg => {
        const html = _renderWithMentions(msg.message, myName, {});
        if (!html) return;
        const div = document.createElement('div');
        div.className = 'soc-msg hexa-bot-msg';
        div.dataset.msgId = msg.id;
        div.innerHTML = `<div class="soc-msg-avatar-wrap">
            <img src="assets/default.png" class="soc-msg-avatar" style="image-rendering:pixelated">
        </div>
        <div class="soc-msg-content">
            <div class="soc-msg-meta">
                <span class="soc-msg-author" style="color:var(--brand);">Hexa</span>
                <span class="soc-msg-time">${new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="soc-msg-text">${html}</div>
        </div>`;
        list.appendChild(div);
    });
}

window.loadChatMessages = async function(friendId, friendName, friendAvatar) {
    const list = document.getElementById('soc-msg-list');
    if (!friendId || !list) return;

    // Stop any previous polling
    if (dmRefreshTimer) { clearInterval(dmRefreshTimer); dmRefreshTimer = null; }

    currentChatFriendName = friendName;
    currentChatFriendAva  = friendAvatar;

    try {
        const res = await window.electron.getMessages(friendId);
        const loading = document.getElementById('chat-loading');
        if (loading) loading.remove();
        if (!res || !res.success) {
            list.innerHTML = `<div class="soc-chat-intro" style="color:#e74c3c;">Error loading messages.</div>`;
            return;
        }

        const msgs = res.messages;
        if (!msgs.length) {
            list.innerHTML = `<div class="soc-divider"><span>Direct Message</span></div><div class="soc-chat-intro">Beginning of your chat history with ${escHtml(friendName)}.</div>`;
        } else {
            await _renderDmMessages(msgs, friendId, friendName, friendAvatar);
        }

        // Polling — appends only new messages, never rebuilds the whole list
        dmLastKnownId = msgs.length ? Math.max(...msgs.map(m => m.id)) : 0;
        const _dmMsgMap = {};
        msgs.forEach(m => { _dmMsgMap[m.id] = m; });
        dmRefreshTimer = setInterval(async () => {
            if (currentChatFriendId !== friendId) { clearInterval(dmRefreshTimer); return; }
            try {
                const r = await window.electron.getMessages(friendId);
                if (!r?.success || !r.messages?.length) return;
                const latest = Math.max(...r.messages.map(m => m.id));
                if (latest <= dmLastKnownId) return;
                const newMsgs = r.messages.filter(m => m.id > dmLastKnownId);
                dmLastKnownId = latest;
                newMsgs.forEach(m => { _dmMsgMap[m.id] = m; });
                _appendDmMessages(newMsgs, _dmMsgMap, friendId, friendName, friendAvatar);
            } catch(_) {}
        }, 2000);

    } catch(err) {
        console.error('[DM] load error', err);
    }
};

async function _renderDmMessages(msgs, friendId, friendName, friendAvatar) {
    const list = document.getElementById('soc-msg-list');
    if (!list) return;

    const myId   = gcMyDbId || -1;
    const myName = currentUser ? currentUser.username : '';
    const myRole = currentUser?.role || 'player';

    let myAvatar = gcMyAvatarDataUrl || `https://minotar.net/helm/${myName}/64`;

    const msgMap = {};
    const dmRoleMap = {};
    if (currentUser?.username) dmRoleMap[currentUser.username.toLowerCase()] = currentUser.role || 'player';
    msgs.forEach(m => {
        msgMap[m.id] = m;
        if (m.username && m.role) dmRoleMap[m.username.toLowerCase()] = m.role;
    });

    let html = `<div class="soc-divider"><span>Direct Message</span></div>`;
    let lastDate = '';

    for (const msg of msgs) {
        const d = new Date(msg.created_at);
        const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        if (dateLabel !== lastDate) {
            lastDate = dateLabel;
            html += `<div class="soc-divider"><span>${dateLabel}</span></div>`;
        }

        const timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
        const isMine  = String(msg.sender_id) !== String(friendId);
        const canEdit = isMine;
        const canDel  = isMine;

        // Use enriched data from server JOIN if available, fall back to known values
        const authorName   = msg.username || (isMine ? myName : friendName);
        const authorRole   = msg.role || (isMine ? myRole : 'player');
        const showRoleBadge = msg.show_role_badge !== 0;
        const nameColor    = getRoleData(authorRole).color || 'var(--chat-author)';

        const avatarSrc = msg.skin_url
            ? (msg.skin_url.includes('http') ? msg.skin_url : `https://hexa-mc.fr/hexa/api/textures/skins/${msg.skin_url}`)
            : (isMine ? `https://hexa-mc.fr/hexa/api/textures/skins/${myName}.png` : `https://hexa-mc.fr/hexa/api/textures/skins/${friendName}.png`);

        // Reply preview
        let replyHtml = '';
        if (msg.reply_to && msgMap[msg.reply_to]) {
            const ref = msgMap[msg.reply_to];
            replyHtml = `<div class="gc-reply-ref" data-reply-id="${ref.id}">
                <i class="fas fa-reply gc-reply-ref-icon"></i>
                <span class="gc-reply-ref-author">${escHtml(ref.username || '')}</span>
                <span class="gc-reply-ref-text">${escHtml((ref.message || '').slice(0, 60))}${ref.message?.length > 60 ? '…' : ''}</span>
            </div>`;
        }

        // Reactions
        let reactsHtml = '';
        if (msg.reactions) {
            let reacts = {};
            try { reacts = JSON.parse(msg.reactions); } catch(_) {}
            const entries = Object.entries(reacts).filter(([,uids]) => uids.length > 0);
            if (entries.length) {
                reactsHtml = `<div class="gc-reactions">` +
                    entries.map(([emoji, uids]) => {
                        const mine = uids.includes(myId);
                        return `<button class="gc-react-chip${mine ? ' mine' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} <span>${uids.length}</span></button>`;
                    }).join('') +
                `</div>`;
            }
        }

        // Mention detection
        const myUsername = currentUser?.username;
        const isMentioned = _processMentions(msg.message, myUsername);

        // Modpack card parser (keep existing logic)
        let contentHTML = _renderWithMentions(msg.message, myUsername, dmRoleMap);
        const mpMatchV2 = msg.message.match(/\[MP_CARD:(.*?)\]/);
        if (mpMatchV2) {
            try {
                const data = JSON.parse(decodeURIComponent(escape(atob(mpMatchV2[1]))));
                const safeName = data.n.replace(/'/g, "\\'");
                contentHTML = `<div style="text-align:left;background:#fff;border:1px solid #ddd;border-top:3px solid #000;border-radius:6px;overflow:hidden;width:300px;font-family:'Segoe UI',sans-serif;display:flex;flex-direction:column;margin-top:5px;">
                    <div style="padding:12px;display:flex;gap:12px;align-items:flex-start;">
                        <div style="width:64px;height:64px;background:#f8f9fa;border-radius:6px;flex-shrink:0;overflow:hidden;display:flex;align-items:center;justify-content:center;border:1px solid #eee;"><img src="${data.i}" onerror="this.src='assets/logo.svg'" style="width:100%;height:100%;object-fit:contain;"></div>
                        <div style="flex:1;overflow:hidden;min-width:0;display:flex;flex-direction:column;justify-content:center;height:64px;">
                            <div style="font-weight:800;font-size:14px;color:#222;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${data.n}">${data.n}</div>
                            <div style="font-size:11px;color:#666;line-height:1.4;">
                                <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;"><i class="fas fa-calendar-alt" style="font-size:10px;width:12px;"></i> ${data.d}</div>
                                <div style="display:flex;align-items:center;gap:5px;"><i class="fas fa-cube" style="font-size:10px;width:12px;"></i> ${data.c} Mods</div>
                                <div style="display:flex;align-items:center;gap:5px;"><i class="fas fa-user" style="font-size:10px;width:12px;"></i> ${data.a}</div>
                            </div>
                        </div>
                    </div>
                    <div style="padding:0 12px 12px 12px;"><button style="width:100%;background:#222;color:#fff;border:none;padding:10px 0;border-radius:4px;font-size:12px;font-weight:800;cursor:pointer;text-transform:uppercase;" onclick="window.HexaAlert('Install','Installation of shared pack [${safeName}] started.')">INSTALL MODPACK</button></div>
                </div>`;
            } catch(e) { contentHTML = '<span style="color:#d00;font-style:italic;">[Invalid Share Content]</span>'; }
        } else {
            const mpLegacy = msg.message.match(/\[MODPACK SHARE\] Check out \*\*(.*?)\*\* for (.*?)!/);
            if (mpLegacy) {
                const mpName = mpLegacy[1], mpVer = mpLegacy[2];
                contentHTML = `<div style="margin-top:5px;border:1px solid #ddd;background:#f9f9f9;padding:10px;border-radius:8px;display:flex;align-items:center;cursor:pointer;" onclick="ContentBrowser.state.query='${escHtml(mpName)}';ContentBrowser.search();document.querySelector('.nav-item[data-tab=\\'content\\']').click();">
                    <div style="width:40px;height:40px;background:#fff;border:1px solid #eee;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:20px;color:#333;"><i class="fas fa-cube"></i></div>
                    <div style="flex:1;margin-left:10px;"><div style="font-weight:700;font-size:13px;color:#333;">${escHtml(mpName)}</div><div style="font-size:11px;color:#888;">Modpack • ${escHtml(mpVer)}</div></div>
                    <div style="width:32px;height:32px;border-radius:50%;background:#fff;border:1px solid #eee;display:flex;align-items:center;justify-content:center;color:#333;"><i class="fas fa-download"></i></div>
                </div>`;
            }
        }

        // Toolbar
        const toolbar = `<div class="gc-toolbar">
            <button class="gc-tb-btn" data-action="react" data-msg-id="${msg.id}" title="React"><i class="fas fa-smile"></i></button>
            <button class="gc-tb-btn" data-action="reply" data-msg-id="${msg.id}" data-username="${escHtml(authorName)}" data-message="${escHtml(msg.message)}" title="Reply"><i class="fas fa-reply"></i></button>
            ${canEdit ? `<button class="gc-tb-btn" data-action="edit" data-msg-id="${msg.id}" data-message="${escHtml(msg.message)}" title="Edit"><i class="fas fa-pen"></i></button>` : ''}
            ${canDel  ? `<button class="gc-tb-btn danger" data-action="delete" data-msg-id="${msg.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;

        html += `
            <div class="soc-msg${isMine ? ' own' : ''}${isMentioned === 'direct' ? ' msg-mentioned' : isMentioned === 'everyone' ? ' msg-mentioned-everyone' : ''}" data-dm-id="${msg.id}" data-uid="${msg.sender_id}">
                ${toolbar}
                <div class="soc-msg-content">
                    <img src="${isMine ? myAvatar : friendAvatar}"
                         class="soc-msg-avatar-small gc-author-avatar"
                         data-skin="${avatarSrc}"
                         onerror="this.src='https://minotar.net/helm/Steve/64'">
                    <div class="soc-msg-body-col">
                        ${replyHtml}
                        <div class="soc-msg-header">
                            <span class="soc-msg-author" style="color:${nameColor};cursor:pointer;" data-uid="${msg.sender_id}">${escHtml(authorName)}</span>
                            ${buildRolePill(authorRole, showRoleBadge)}${buildCertBadge(msg.microsoft_id)}
                            <span class="soc-msg-time">${timeStr}</span>
                            ${msg.edited ? '<span class="gc-edited">(edited)</span>' : ''}
                        </div>
                        <div class="soc-msg-text" data-dm-id="${msg.id}">${contentHTML}</div>
                        ${reactsHtml}
                    </div>
                </div>
            </div>`;
    }

    list.innerHTML = html;
    _jpparse(list);
    _bindDmListEvents(list);
    list.scrollTop = list.scrollHeight;
}

function _bindDmListEvents(scope) {
    const list = document.getElementById('soc-msg-list');

    scope.querySelectorAll('.gc-author-avatar').forEach(img => {
        extractHeadAvatar(img.dataset.skin).then(h => { img.src = h; }).catch(() => {});
        img.style.cursor = 'pointer';
        img.addEventListener('click', () => {
            const uid = +img.closest('.soc-msg').dataset.uid;
            if (uid && uid !== gcMyDbId) openProfileOverlay(uid);
        });
    });
    scope.querySelectorAll('.soc-msg-author[data-uid]').forEach(el => {
        el.addEventListener('click', () => {
            const uid = +el.dataset.uid;
            if (uid && uid !== gcMyDbId) openProfileOverlay(uid);
        });
    });
    scope.querySelectorAll('.gc-reply-ref').forEach(el => {
        el.addEventListener('click', () => {
            const target = list?.querySelector(`[data-dm-id="${el.dataset.replyId}"]`);
            if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('gc-highlight'); setTimeout(() => target.classList.remove('gc-highlight'), 1200); }
        });
    });
    scope.querySelectorAll('.gc-tb-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            const msgId  = +btn.dataset.msgId;
            if (action === 'react')  { dmOpenReactPicker(btn, msgId); }
            else if (action === 'reply') { dmSetReply(msgId, btn.dataset.username, btn.dataset.message); document.getElementById('soc-input-text')?.focus(); }
            else if (action === 'edit')  { dmStartEdit(msgId, btn.dataset.message); }
            else if (action === 'delete') {
                const r = await window.electron.deleteMessage(msgId);
                if (r?.success) {
                    list?.querySelector(`[data-dm-id="${msgId}"]`)?.remove();
                } else {
                    window.HexaAlert('Error', r ? r.message : 'Unable to delete.');
                }
            }
        });
    });
    scope.querySelectorAll('.gc-react-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (_dmReacting) return;
            _dmReacting = true;
            const r = await window.electron.reactDmMessage(+btn.dataset.msgId, btn.dataset.emoji);
            _dmReacting = false;
            if (r?.success) dmPatchReactions(+btn.dataset.msgId, r.reactions);
        });
    });
}

function _appendDmMessages(newMsgs, msgMap, friendId, friendName, friendAvatar) {
    const list = document.getElementById('soc-msg-list');
    if (!list || !newMsgs.length) return;

    const myId   = gcMyDbId || -1;
    const myName = currentUser ? currentUser.username : '';
    const myRole = currentUser?.role || 'player';
    const myAvatar = gcMyAvatarDataUrl || `https://minotar.net/helm/${myName}/64`;

    // Check last displayed date separator to avoid duplicates
    const lastDivider = list.querySelector('.soc-divider:last-of-type span');
    let lastDate = lastDivider ? lastDivider.textContent : '';

    const frag = document.createDocumentFragment();

    for (const msg of newMsgs) {
        const d = new Date(msg.created_at);
        const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        if (dateLabel !== lastDate) {
            lastDate = dateLabel;
            const sep = document.createElement('div');
            sep.className = 'soc-divider';
            sep.innerHTML = `<span>${dateLabel}</span>`;
            frag.appendChild(sep);
        }

        const timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
        const isMine  = String(msg.sender_id) !== String(friendId);
        const authorName = msg.username || (isMine ? myName : friendName);
        const authorRole = msg.role || (isMine ? myRole : 'player');
        const showRoleBadge = msg.show_role_badge !== 0;
        const nameColor = getRoleData(authorRole).color || 'var(--chat-author)';
        const avatarSrc = msg.skin_url
            ? (msg.skin_url.includes('http') ? msg.skin_url : `https://hexa-mc.fr/hexa/api/textures/skins/${msg.skin_url}`)
            : (isMine ? `https://hexa-mc.fr/hexa/api/textures/skins/${myName}.png` : `https://hexa-mc.fr/hexa/api/textures/skins/${friendName}.png`);

        let replyHtml = '';
        if (msg.reply_to && msgMap[msg.reply_to]) {
            const ref = msgMap[msg.reply_to];
            replyHtml = `<div class="gc-reply-ref" data-reply-id="${ref.id}"><i class="fas fa-reply gc-reply-ref-icon"></i><span class="gc-reply-ref-author">${escHtml(ref.username||'')}</span><span class="gc-reply-ref-text">${escHtml((ref.message||'').slice(0,60))}${ref.message?.length>60?'…':''}</span></div>`;
        }

        const canEdit = isMine, canDel = isMine;
        const toolbar = `<div class="gc-toolbar">
            <button class="gc-tb-btn" data-action="react" data-msg-id="${msg.id}" title="React"><i class="fas fa-smile"></i></button>
            <button class="gc-tb-btn" data-action="reply" data-msg-id="${msg.id}" data-username="${escHtml(authorName)}" data-message="${escHtml(msg.message)}" title="Reply"><i class="fas fa-reply"></i></button>
            ${canEdit ? `<button class="gc-tb-btn" data-action="edit" data-msg-id="${msg.id}" data-message="${escHtml(msg.message)}" title="Edit"><i class="fas fa-pen"></i></button>` : ''}
            ${canDel  ? `<button class="gc-tb-btn danger" data-action="delete" data-msg-id="${msg.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;

        const newMentioned = _processMentions(msg.message, myName);
        const row = document.createElement('div');
        row.className = `soc-msg${isMine ? ' own' : ''}${newMentioned === 'direct' ? ' msg-mentioned' : newMentioned === 'everyone' ? ' msg-mentioned-everyone' : ''}`;
        row.dataset.dmId = msg.id;
        row.dataset.uid  = msg.sender_id;
        row.innerHTML = `${toolbar}
            <div class="soc-msg-content">
                <img src="${isMine ? myAvatar : friendAvatar}" class="soc-msg-avatar-small gc-author-avatar" data-skin="${avatarSrc}" onerror="this.src='https://minotar.net/helm/Steve/64'">
                <div class="soc-msg-body-col">
                    ${replyHtml}
                    <div class="soc-msg-header">
                        <span class="soc-msg-author" style="color:${nameColor};cursor:pointer;" data-uid="${msg.sender_id}">${escHtml(authorName)}</span>
                        ${buildRolePill(authorRole, showRoleBadge)}${buildCertBadge(msg.microsoft_id)}
                        <span class="soc-msg-time">${timeStr}</span>
                    </div>
                    <div class="soc-msg-text" data-dm-id="${msg.id}">${_renderWithMentions(msg.message, myName, dmRoleMap)}</div>
                </div>
            </div>`;
        frag.appendChild(row);
        if (newMentioned) {
            window.notify('info', `@${authorName} vous a mentionné`, msg.message.slice(0, 80), { duration: 5000 });
        }
    }

    list.appendChild(frag);
    const allRows = [...list.querySelectorAll('.soc-msg')];
    const newRows = allRows.slice(-newMsgs.length);
    newRows.forEach(row => { _jpparse(row); _bindDmListEvents(row); });
    list.scrollTop = list.scrollHeight;
}

// alias — escHtml defined below, function hoisting makes both available everywhere
function escapeHtml(s) { return escHtml(s); }

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('soc-input-text');
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
    }
});


/**
 * Code Launcher pour envoyer une demande d'ami
 */
async function sendFriendRequest(targetUsername) {
    try {
        const res = await window.electron.addFriend(targetUsername);
        if (res.success) {
            window.HexaAlert("Success", 'Request sent!');
            loadSocialHubUsers();
            return true;
        } else {
            const msg = res.message || 'Unable to send request';
            if (!msg.toLowerCase().includes('already') && !msg.toLowerCase().includes('pending')) {
                window.HexaAlert("Error", msg);
            }
            return false;
        }
    } catch (err) {
        window.HexaAlert("Error", "Connection error with the server.");
        return false;
    }
}

function initSocialUI() {
    // --- Tab switching ---
    document.querySelectorAll('.soc-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.soc-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.soc-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById('soc-panel-' + tab.dataset.socTab);
            if (panel) panel.classList.add('active');

        });
    });

    // --- Filter friends list ---
    const filterInp = document.getElementById('soc-filter-input');
    if (filterInp) {
        filterInp.addEventListener('input', () => {
            const q = filterInp.value.toLowerCase().trim();
            document.querySelectorAll('#soc-roster-friends .soc-user').forEach(el => {
                const name = el.querySelector('.soc-name')?.textContent.toLowerCase() || '';
                el.style.display = (!q || name.includes(q)) ? '' : 'none';
            });
        });
    }

    // --- Live search add friend ---
    const addInp = document.getElementById('add-friend-input');
    if (!addInp) return;

    let searchTimer = null;

    addInp.addEventListener('input', () => {
        clearTimeout(searchTimer);
        const q = addInp.value.trim();
        const roster = document.getElementById('soc-roster-add');
        if (!roster) return;
        if (q.length < 2) {
            roster.innerHTML = '<div class="soc-empty-msg">Type a username to search.</div>';
            return;
        }
        roster.innerHTML = '<div class="soc-empty-msg"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
        searchTimer = setTimeout(() => searchUsers(q, roster), 350);
    });
}

async function searchUsers(query, rosterEl) {
    try {
        const data = await window.electron.fetchUsers();
        const all = (data && data.users) ? data.users : (Array.isArray(data) ? data : []);
        const myName = currentUser ? currentUser.username.toLowerCase() : '';
        const filtered = all.filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && u.username.toLowerCase() !== myName);

        rosterEl.innerHTML = '';

        if (!filtered.length) {
            rosterEl.innerHTML = '<div class="soc-empty-msg">No players found.</div>';
            return;
        }

        const label = document.createElement('div');
        label.className = 'soc-group';
        label.textContent = `RESULTS — ${filtered.length}`;
        rosterEl.appendChild(label);

        filtered.slice(0, 20).forEach(user => {
            const el = document.createElement('div');
            el.className = 'soc-user';

            const avatarUrl = `https://minotar.net/helm/${user.username}/64`;
            const srPill = buildRolePill(user.role);
            const srRd = getRoleData(user.role);
            const srHasRole = user.role && user.role !== 'player';
            const srSub = srHasRole ? srRd.label : 'Player';
            const srSubClass = srHasRole ? 'soc-role-label' : 'soc-activity';
            const srSubStyle = srHasRole ? `style="color:${srRd.color};"` : '';
            el.innerHTML = `
                <div class="soc-avatar">
                    <img src="${avatarUrl}" loading="lazy" onerror="this.src='https://minotar.net/helm/Steve/64'">
                </div>
                <div class="soc-info">
                    <div class="soc-name-row"><span class="soc-name">${user.username}</span>${srPill}</div>
                    <div class="${srSubClass}" ${srSubStyle}>${srSub}</div>
                </div>
                <button class="soc-req-btn accept soc-add-user-btn" title="Add"><i class="fas fa-user-plus"></i></button>`;

            extractHeadAvatar(socAvatarUrl(user)).then(h => {
                const img = el.querySelector('img');
                if (img) img.src = h;
            }).catch(() => {});

            // Set add button state based on existing relation
            const addBtn = el.querySelector('.soc-add-user-btn');
            const relation = friendRelationCache[user.id];
            if (relation === 'accepted') {
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fas fa-user-check"></i>';
                addBtn.title = 'Already friends';
            } else if (relation === 'sent') {
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fas fa-clock"></i>';
                addBtn.title = 'Request pending';
            } else if (relation === 'pending') {
                addBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
                addBtn.title = 'Accept request';
                addBtn.onclick = async (e) => {
                    e.stopPropagation();
                    addBtn.disabled = true;
                    await acceptFriendRequest(user.username);
                    addBtn.innerHTML = '<i class="fas fa-user-check"></i>';
                    friendRelationCache[user.id] = 'accepted';
                };
            } else {
                addBtn.onclick = async (e) => {
                    e.stopPropagation();
                    addBtn.disabled = true;
                    addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    await sendFriendRequest(user.username);
                    addBtn.innerHTML = '<i class="fas fa-clock"></i>';
                    addBtn.title = 'Request pending';
                    friendRelationCache[user.id] = 'sent';
                };
            }
            el.querySelector('.soc-name').style.cursor = 'pointer';
            el.querySelector('.soc-name').onclick = (e) => { e.stopPropagation(); openProfileOverlay(user.id); };

            rosterEl.appendChild(el);
        });
    } catch(e) {
        rosterEl.innerHTML = '<div class="soc-empty-msg">Search error.</div>';
    }
}

document.addEventListener('DOMContentLoaded', initSocialUI);


// ==========================================
// GLOBAL CHAT
// ==========================================

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Chat Image Lightbox ──────────────────────────────────────────────────────
const _chatLb = (() => {
    let _allUrls = []; // all images from the whole chat, oldest first
    let _idx = 0;
    let _touchStartX = 0;
    let _swipeDir = 0; // -1 left, 1 right

    // Collect all image URLs from currently rendered chat messages (DM or global)
    function _collectAllUrls() {
        const imgs = [];
        const lists = [
            document.getElementById('soc-msg-list'),
            document.getElementById('gc-msg-list'),
        ];
        for (const list of lists) {
            if (!list) continue;
            list.querySelectorAll('.msg-img').forEach(img => {
                if (img.src && img.src !== window.location.href) imgs.push(img.src);
            });
        }
        return [...new Set(imgs)]; // deduplicate
    }

    function _show(i, dir) {
        const img = document.getElementById('chat-lb-img');
        _idx = Math.max(0, Math.min(i, _allUrls.length - 1));

        // Animate out
        if (dir !== undefined && img.src) {
            img.classList.remove('chat-lb-anim-in-left', 'chat-lb-anim-in-right', 'chat-lb-anim-out-left', 'chat-lb-anim-out-right');
            img.classList.add(dir > 0 ? 'chat-lb-anim-out-left' : 'chat-lb-anim-out-right');
        }

        setTimeout(() => {
            img.src = _allUrls[_idx];
            img.classList.remove('chat-lb-anim-out-left', 'chat-lb-anim-out-right', 'chat-lb-anim-in-left', 'chat-lb-anim-in-right');
            if (dir !== undefined) {
                img.classList.add(dir > 0 ? 'chat-lb-anim-in-right' : 'chat-lb-anim-in-left');
            }
            document.getElementById('chat-lb-counter').textContent = `${_idx + 1} / ${_allUrls.length}`;
            document.getElementById('chat-lb-prev').classList.toggle('hidden', _idx === 0);
            document.getElementById('chat-lb-next').classList.toggle('hidden', _idx === _allUrls.length - 1);
        }, dir !== undefined ? 120 : 0);
    }

    function open(urls, startIdx) {
        // Build full list from chat, fall back to provided urls
        _allUrls = _collectAllUrls();
        if (_allUrls.length === 0) _allUrls = urls;

        // Find the clicked url in the full list
        const clickedUrl = urls[startIdx];
        const fullIdx = _allUrls.indexOf(clickedUrl);
        _idx = fullIdx >= 0 ? fullIdx : 0;

        const lb = document.getElementById('chat-lb');
        const img = document.getElementById('chat-lb-img');
        lb.style.display = 'flex';
        img.classList.remove('chat-lb-anim-in-left', 'chat-lb-anim-in-right', 'chat-lb-anim-out-left', 'chat-lb-anim-out-right');
        img.src = _allUrls[_idx];
        img.classList.add('chat-lb-anim-open');
        setTimeout(() => img.classList.remove('chat-lb-anim-open'), 300);
        lb.classList.add('chat-lb-fadein');
        setTimeout(() => lb.classList.remove('chat-lb-fadein'), 250);

        document.getElementById('chat-lb-counter').textContent = `${_idx + 1} / ${_allUrls.length}`;
        document.getElementById('chat-lb-prev').classList.toggle('hidden', _idx === 0);
        document.getElementById('chat-lb-next').classList.toggle('hidden', _idx === _allUrls.length - 1);
    }

    function close() {
        const lb = document.getElementById('chat-lb');
        const img = document.getElementById('chat-lb-img');
        img.classList.add('chat-lb-anim-close');
        lb.classList.add('chat-lb-fadeout');
        setTimeout(() => {
            lb.style.display = 'none';
            lb.classList.remove('chat-lb-fadeout');
            img.classList.remove('chat-lb-anim-close');
            img.src = '';
            _allUrls = [];
        }, 200);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const lb = document.getElementById('chat-lb');
        const img = document.getElementById('chat-lb-img');

        document.getElementById('chat-lb-close')?.addEventListener('click', close);
        document.getElementById('chat-lb-backdrop')?.addEventListener('click', close);
        document.getElementById('chat-lb-prev')?.addEventListener('click', () => _show(_idx - 1, -1));
        document.getElementById('chat-lb-next')?.addEventListener('click', () => _show(_idx + 1, 1));

        // Keyboard
        document.addEventListener('keydown', e => {
            if (!lb || lb.style.display === 'none') return;
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowLeft') _show(_idx - 1, -1);
            if (e.key === 'ArrowRight') _show(_idx + 1, 1);
        });

        // Touch swipe
        lb?.addEventListener('touchstart', e => { _touchStartX = e.touches[0].clientX; }, { passive: true });
        lb?.addEventListener('touchend', e => {
            const dx = e.changedTouches[0].clientX - _touchStartX;
            if (Math.abs(dx) > 50) dx < 0 ? _show(_idx + 1, 1) : _show(_idx - 1, -1);
        });

        // Mouse drag swipe
        let _mouseX = 0, _dragging = false;
        img?.addEventListener('mousedown', e => { _mouseX = e.clientX; _dragging = true; });
        document.addEventListener('mouseup', e => {
            if (!_dragging) return;
            _dragging = false;
            const dx = e.clientX - _mouseX;
            if (Math.abs(dx) > 60) dx < 0 ? _show(_idx + 1, 1) : _show(_idx - 1, -1);
        });
    });

    return { open, close };
})();

function _parseMessageContent(text) {
    const IMG_RE = /https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi;

    // Split text into segments: plain text vs image URLs
    const segments = [];
    let lastIndex = 0;
    let m;
    IMG_RE.lastIndex = 0;
    while ((m = IMG_RE.exec(text)) !== null) {
        if (m.index > lastIndex) segments.push({ type: 'text', val: text.slice(lastIndex, m.index) });
        segments.push({ type: 'img', val: m[0] });
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) segments.push({ type: 'text', val: text.slice(lastIndex) });

    // Collect consecutive image groups — whitespace-only text segments between images are ignored
    let html = '';
    let i = 0;
    while (i < segments.length) {
        const seg = segments[i];
        if (seg.type === 'text') {
            const trimmed = seg.val.replace(/\s+/g, ' ').trim();
            if (trimmed) html += `<span>${escHtml(trimmed)}</span>`;
            i++;
        } else {
            // Gather consecutive images, skipping whitespace-only text segments between them
            const imgs = [];
            while (i < segments.length) {
                if (segments[i].type === 'img') {
                    imgs.push(segments[i].val);
                    i++;
                } else if (!segments[i].val.trim()) {
                    i++; // skip blank separators
                } else {
                    break;
                }
            }
            const count = imgs.length;
            const urlsJson = JSON.stringify(imgs).replace(/"/g, '&quot;');
            const imgHtml = (url, idx) => `<div class="msg-img-wrap"><img class="msg-img" src="${url}" alt="" loading="lazy" onerror="this.closest('.msg-img-wrap').style.display='none'" onclick="(function(el){var c=el.closest('[data-imgs]');if(c)_chatLb.open(JSON.parse(c.dataset.imgs),${idx});})(this)"></div>`;
            if (count === 1) {
                html += `<div data-imgs="${urlsJson}">${imgHtml(imgs[0], 0)}</div>`;
            } else if (count === 2) {
                html += `<div class="msg-img-grid msg-img-grid-2" data-imgs="${urlsJson}">${imgHtml(imgs[0], 0)}${imgHtml(imgs[1], 1)}</div>`;
            } else {
                html += `<div class="msg-img-grid msg-img-grid-3" data-imgs="${urlsJson}">${imgHtml(imgs[0], 0)}<div class="msg-img-grid-3-right">${imgHtml(imgs[1], 1)}${imgHtml(imgs[2], 2)}</div></div>`;
            }
        }
    }
    return html;
}
function _fmtInstPlaytime(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0m';
    if (totalMinutes < 60) return `${totalMinutes}m`;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function timeAgo(date) {
    const diff = Math.floor((Date.now() - date) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm ago';
    if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
    if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
    return date.toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

let gcRefreshTimer = null;
let gcMyDbId = null;
let gcMyRole = 'player';
let gcReplyTo = null;
let _gcLastMsgId = 0;     // highest message id seen — used to skip full reloads
let _gcReacting  = false; // debounce flag for reactions

function gcIsMod() { return ['staff','owner','kitty'].includes(gcMyRole); }

async function gcInitUser() {
    try {
        [gcMyDbId, gcMyRole] = await Promise.all([
            window.electron.getMyDbId(),
            window.electron.getMyRole().then(r => r || 'player')
        ]);
    } catch(_) {}
}

function gcSetReply(msgId, username, message) {
    gcReplyTo = { id: msgId, username, message };
    const bar = document.getElementById('gc-reply-bar');
    if (!bar) return;
    bar.style.display = 'flex';
    bar.querySelector('.gc-reply-preview').textContent = `${username}: ${message.slice(0, 60)}${message.length > 60 ? '…' : ''}`;
}
function gcClearReply() {
    gcReplyTo = null;
    const bar = document.getElementById('gc-reply-bar');
    if (bar) bar.style.display = 'none';
}

async function loadGlobalChat(scroll = true) {
    const list = document.getElementById('gc-msg-list');
    if (!list) return;
    try {
        const res = await window.electron.getGlobalMessages();
        if (!res || !res.success) {
            console.error('[GlobalChat] getGlobalMessages failed:', res);
            list.innerHTML = `<div class="soc-chat-intro" style="color:#e74c3c;">Error: ${res ? res.message : 'No response'}</div>`;
            return;
        }

        const msgs = res.messages;
        if (!msgs.length) {
            list.innerHTML = `<div class="soc-divider"><span>Global Chat</span></div><div class="soc-chat-intro">No messages yet. Be the first!</div>`;
            return;
        }

        const myId = gcMyDbId || -1;
        const myName = currentUser ? currentUser.username : '';

        // Build my avatar once
        let myAvatar = `https://minotar.net/helm/${myName}/64`;
        if (currentUser) {
            const skinUrl = currentUser.skin_url
                ? (currentUser.skin_url.includes('http') ? currentUser.skin_url : `https://hexa-mc.fr/hexa/api/textures/skins/${currentUser.skin_url}`)
                : `https://hexa-mc.fr/hexa/api/textures/skins/${myName}.png`;
            myAvatar = await extractHeadAvatar(skinUrl).catch(() => myAvatar);
        }

        // Index messages by id for reply lookup + build role map from data
        const msgMap = {};
        const gcRoleMap = {};
        if (currentUser?.username) gcRoleMap[currentUser.username.toLowerCase()] = currentUser.role || 'player';
        msgs.forEach(m => {
            msgMap[m.id] = m;
            if (m.username && m.role) gcRoleMap[m.username.toLowerCase()] = m.role;
        });

        let html = `<div class="soc-divider"><span>Global Chat</span></div>`;
        let lastDate = '';

        for (const msg of msgs) {
            const d = new Date(msg.created_at);
            const dateLabel = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
            if (dateLabel !== lastDate) {
                lastDate = dateLabel;
                html += `<div class="soc-divider"><span>${dateLabel}</span></div>`;
            }

            const timeStr = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
            const isMine = msg.user_id === myId;
            const canEdit = isMine || gcIsMod();
            const canDel  = isMine || gcIsMod();
            const canPin  = gcIsMod();
            const nameColor = getRoleData(msg.role).color || 'var(--chat-author)';

            const avatarSrc = msg.skin_url
                ? (msg.skin_url.includes('http') ? msg.skin_url : `https://hexa-mc.fr/hexa/api/textures/skins/${msg.skin_url}`)
                : `https://hexa-mc.fr/hexa/api/textures/skins/${msg.username}.png`;

            // Reply preview
            let replyHtml = '';
            if (msg.reply_to && msgMap[msg.reply_to]) {
                const ref = msgMap[msg.reply_to];
                replyHtml = `<div class="gc-reply-ref" data-reply-id="${ref.id}">
                    <i class="fas fa-reply gc-reply-ref-icon"></i>
                    <span class="gc-reply-ref-author">${escapeHtml(ref.username)}</span>
                    <span class="gc-reply-ref-text">${escapeHtml(ref.message.slice(0, 60))}${ref.message.length > 60 ? '…' : ''}</span>
                </div>`;
            }

            // Reactions
            let reactsHtml = '';
            if (msg.reactions) {
                let reacts = {};
                try { reacts = JSON.parse(msg.reactions); } catch(_) {}
                const entries = Object.entries(reacts).filter(([,uids]) => uids.length > 0);
                if (entries.length) {
                    reactsHtml = `<div class="gc-reactions">` +
                        entries.map(([emoji, uids]) => {
                            const mine = uids.includes(myId);
                            return `<button class="gc-react-chip${mine ? ' mine' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">${emoji} <span>${uids.length}</span></button>`;
                        }).join('') +
                    `</div>`;
                }
            }

            // Toolbar (shown on hover, top-right)
            const toolbar = `<div class="gc-toolbar">
                <button class="gc-tb-btn" data-action="react" data-msg-id="${msg.id}" title="React"><i class="fas fa-smile"></i></button>
                <button class="gc-tb-btn" data-action="reply" data-msg-id="${msg.id}" data-username="${escapeHtml(msg.username)}" data-message="${escapeHtml(msg.message)}" title="Reply"><i class="fas fa-reply"></i></button>
                ${canEdit ? `<button class="gc-tb-btn" data-action="edit" data-msg-id="${msg.id}" data-message="${escapeHtml(msg.message)}" title="Edit"><i class="fas fa-pen"></i></button>` : ''}
                ${canPin  ? `<button class="gc-tb-btn${msg.pinned ? ' active' : ''}" data-action="pin" data-msg-id="${msg.id}" data-pinned="${msg.pinned ? 1 : 0}" title="${msg.pinned ? 'Unpin' : 'Pin'}"><i class="fas fa-thumbtack"></i></button>` : ''}
                ${canDel  ? `<button class="gc-tb-btn danger" data-action="delete" data-msg-id="${msg.id}" title="Delete"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;

            const gcMentioned = _processMentions(msg.message, myName);
            html += `
                <div class="soc-msg${msg.pinned ? ' gc-pinned' : ''}${isMine ? ' own' : ''}${gcMentioned === 'direct' ? ' msg-mentioned' : gcMentioned === 'everyone' ? ' msg-mentioned-everyone' : ''}" data-gc-id="${msg.id}" data-uid="${msg.user_id}">
                    ${toolbar}
                    <div class="soc-msg-content">
                        <img src="${isMine ? myAvatar : `https://minotar.net/helm/${msg.username}/64`}"
                             class="soc-msg-avatar-small gc-author-avatar"
                             data-skin="${avatarSrc}"
                             onerror="this.src='https://minotar.net/helm/Steve/64'">
                        <div class="soc-msg-body-col">
                            ${replyHtml}
                            <div class="soc-msg-header">
                                <span class="soc-msg-author" style="color:${nameColor};cursor:pointer;" data-uid="${msg.user_id}">${escapeHtml(msg.username)}</span>
                                ${buildRolePill(msg.role, msg.show_role_badge !== 0)}${buildCertBadge(msg.microsoft_id)}
                                <span class="soc-msg-time">${timeStr}</span>
                                ${msg.edited ? '<span class="gc-edited">(edited)</span>' : ''}
                                ${msg.pinned ? '<span class="gc-pin-badge"><i class="fas fa-thumbtack"></i></span>' : ''}
                            </div>
                            <div class="soc-msg-text" data-gc-id="${msg.id}">${_renderWithMentions(msg.message, myName, gcRoleMap)}</div>
                            ${reactsHtml}
                        </div>
                    </div>
                </div>`;
        }

        list.innerHTML = html;
        _jpparse(list);

        // Upgrade avatars async
        list.querySelectorAll('.gc-author-avatar').forEach(img => {
            extractHeadAvatar(img.dataset.skin).then(h => { img.src = h; }).catch(() => {});
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => {
                const uid = +img.closest('.soc-msg').dataset.uid;
                if (uid) openProfileOverlay(uid);
            });
        });
        list.querySelectorAll('.soc-msg-author[data-uid]').forEach(el => {
            el.addEventListener('click', () => openProfileOverlay(+el.dataset.uid));
        });

        // Reply ref scroll
        list.querySelectorAll('.gc-reply-ref').forEach(el => {
            el.addEventListener('click', () => {
                const target = list.querySelector(`[data-gc-id="${el.dataset.replyId}"]`);
                if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('gc-highlight'); setTimeout(() => target.classList.remove('gc-highlight'), 1200); }
            });
        });

        // Toolbar actions
        list.querySelectorAll('.gc-tb-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const msgId  = +btn.dataset.msgId;
                if (action === 'react') { gcOpenReactPicker(btn, msgId); }
                else if (action === 'reply') { gcSetReply(msgId, btn.dataset.username, btn.dataset.message); document.getElementById('gc-input-text')?.focus(); }
                else if (action === 'edit')  { gcStartEdit(msgId, btn.dataset.message); }
                else if (action === 'pin')   {
                    const r = await window.electron.pinGlobalMessage(msgId, +btn.dataset.pinned === 0);
                    if (r?.success) {
                        const row = list.querySelector(`[data-gc-id="${msgId}"]`);
                        if (row) {
                            const nowPinned = +btn.dataset.pinned === 0;
                            row.classList.toggle('gc-pinned', nowPinned);
                            btn.dataset.pinned = nowPinned ? '1' : '0';
                            btn.classList.toggle('active', nowPinned);
                            btn.title = nowPinned ? 'Unpin' : 'Pin';
                            const badge = row.querySelector('.gc-pin-badge');
                            if (nowPinned && !badge) {
                                row.querySelector('.soc-msg-header')?.insertAdjacentHTML('beforeend', '<span class="gc-pin-badge"><i class="fas fa-thumbtack"></i></span>');
                            } else if (!nowPinned && badge) badge.remove();
                        }
                    }
                }
                else if (action === 'delete'){ window.deleteGcMessage(msgId); }
            });
        });

        // React chips
        list.querySelectorAll('.gc-react-chip').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (_gcReacting) return;
                _gcReacting = true;
                const r = await window.electron.reactGlobalMessage(+btn.dataset.msgId, btn.dataset.emoji);
                _gcReacting = false;
                if (r?.success) gcPatchReactions(+btn.dataset.msgId, r.reactions);
            });
        });

        // Track highest message id for smart polling
        if (msgs.length) _gcLastMsgId = Math.max(...msgs.map(m => m.id));

        if (scroll) list.scrollTop = list.scrollHeight;
    } catch(e) {
        console.error('[GlobalChat]', e);
    }
}

// ── Shared emoji data (categories) ──────────────────────────
const HEXA_EMOJI_CATS = [
    { id: 'smileys', icon: 'fa-face-smile',     label: 'Smileys', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😋','😛','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
    { id: 'hands',   icon: 'fa-hand',           label: 'Mains',   emojis: ['👋','🤚','🖐','✋','🖖','👌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','💅','🤳','💪','🦾','🦵','🦶','👂','🦻','👃','🧠','👀','👁️','👅','🦷','💋'] },
    { id: 'people',  icon: 'fa-person',         label: 'Gens',    emojis: ['🧑','👦','👧','🧒','👶','👩','👨','🧔','👱','🧓','👴','👵','👮','👷','💂','🕵️','👨‍⚕️','👩‍⚕️','👨‍🌾','👩‍🌾','👨‍🍳','👩‍🍳','👨‍🎓','👩‍🎓','👨‍🏫','👩‍🏫','👨‍🚀','👩‍🚀','🧙','🧛','🧜','🧝','🧟','🧞','🧚','👼','🎅','🤶','🦸','🦹','🥷','🤺','🏇','⛷️','🏂','🏋️','🤼','🤸','🤺','🏊','🤽','🚵','🧘'] },
    { id: 'animals', icon: 'fa-paw',            label: 'Animaux', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢','🐍','🦎','🦕','🦖','🦎','🐊','🐸','🐲','🌵','🌲','🌳','🐋','🐳','🐬','🦭','🐟','🐠','🐡','🦈','🐙','🦑','🦐','🦞','🦀','🐚','🐠','🐬','🦁'] },
    { id: 'food',    icon: 'fa-utensils',       label: 'Bouffe',  emojis: ['🍎','🍊','🍋','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🥑','🍆','🥦','🥬','🥒','🌶️','🫑','🧄','🧅','🥔','🍠','🥐','🥖','🍞','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥙','🥪','🌮','🌯','🥗','🍿','🍱','🍘','🍙','🍚','🍛','🍜','🍝','🍠','🦪','🍣','🍤','🍙','🥟','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🧃','🥤','🍵','☕','🧋','🍺','🍷','🥂','🥃','🍸','🍹'] },
    { id: 'travel',  icon: 'fa-car',            label: 'Voyage',  emojis: ['🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵','🛺','🚲','🛴','🛹','🛼','🚁','🛸','✈️','🚀','🛶','⛵','🚤','🛥️','🛳️','⛴️','🚢','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝','🚞','🚋','🚌','🚍','🚎','🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏰','🗼','🗽','🗾','⛩️','🕌','🕍','⛪','🌋','🗻','🏔️','⛰️','🌄','🌅','🌆','🌇','🌉','🌃','🌌','🌠','🎆','🎇','🗺️'] },
    { id: 'objects', icon: 'fa-star',           label: 'Objets',  emojis: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💾','💿','📀','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🧭','⏱️','⏰','🕰️','⌛','⏳','📡','🔋','🔌','💡','🔦','🕯️','🗑️','🛢️','💰','💳','💎','⚖️','🔧','🔨','⚒️','🛠️','⛏️','🔩','🪛','🔫','🪃','🏹','🛡️','🪚','🔪','🪜','🧱','🪞','🪟','🛏️','🪑','🚽','🚿','🛁','🧴','🪒','🧹','🧺','🧻','🪣','🧼','🪥','🧽','🪤','🧲','🪝','🧯','🛒','🚪','🪜','📦','📫','📪','📬','📭','📮','🗳️','📝','📓','📔','📒','📕','📗','📘','📙','📚','📖','🔖','🏷️','💰','💴','💵','💶','💷','💸','🧾'] },
    { id: 'symbols', icon: 'fa-hashtag',        label: 'Symboles',emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','✡️','🔯','🪯','☯️','🛐','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂','▶️','⏩','⏭️','⏯️','◀️','⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️','🎦','🔅','🔆','📶','📳','📴','📵','📳','🔇','🔈','🔉','🔊','📣','📢','🔔','🔕','🎵','🎶','✔️','❎','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','🏁','🚩','🎌','🏴','🏳️','❗','❕','❓','❔','‼️','⁉️','🔱','⚜️','🔰','♻️','✅','🆑','🆒','🆓','🆕','🆖','🆗','🆘','🆙','🆚','🈴','🈺','🅰️','🅱️','🆎','🆑','🅾️','🆘'] },
    { id: 'gaming',  icon: 'fa-gamepad',        label: 'Gaming',  emojis: ['🎮','🕹️','👾','🎲','♟️','🧩','🎯','🎳','🏓','🏸','🥊','🥋','🥅','🏒','🏑','🏏','🏹','🎣','🤿','🎿','🛷','🥌','🪁','🎽','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️','🎀','🎁','🎟️','🎪','🎭','🎨','🖼️','🎰','🚂','🪄','🎤','🎧','🎼','🎹','🪘','🥁','🎷','🎺','🎸','🪕','🎻','🪗','🎬','📽️','🎥','📷','🔭','🔬','💊','🩺','🩹','💉','🩸','🧬','🦠','🧫','🧪'] },
];

// react picker (5 key emojis only — quick toolbar)
// ─────────────────────────────────────────────────────────────
// HEXA EMOJI PICKER — single shared panel, two modes:
//   mode='input'  → inserts into <input id=targetId>
//   mode='react'  → calls onReact(emoji) callback
// ─────────────────────────────────────────────────────────────
const _TWEMOJI_BASE = 'https://cdn.jsdelivr.net/npm/@twemoji/cdn@15.1.0/assets/72x72/';

function _emojiToTwemojiHex(emoji) {
    return [...emoji].map(c => c.codePointAt(0).toString(16)).filter(h => h !== 'fe0f').join('-');
}

// Pre-build HTML per category once, cache it
const _epHtmlCache = new Map();
function _epCatHtml(emojis) {
    if (_epHtmlCache.has(emojis)) return _epHtmlCache.get(emojis);
    const html = emojis.map(e => {
        const hex = _emojiToTwemojiHex(e);
        return `<button class="ep-btn" data-ep="${e}"><img class="ep-ei" src="${_TWEMOJI_BASE}${hex}.png" alt="${e}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${e}'}))"></button>`;
    }).join('');
    _epHtmlCache.set(emojis, html);
    return html;
}

// Replace emoji unicode in text with Twemoji <img> tags
function _jpparse(root) {
    const _replaceEmoji = (node) => {
        if (!node) return;
        const targets = node.querySelectorAll ? node.querySelectorAll('.soc-msg-text, .gc-react-chip') : [];
        const process = (el) => {
            el.innerHTML = el.innerHTML.replace(
                /(\p{Emoji_Presentation}|\p{Extended_Pictographic})(‍(\p{Emoji_Presentation}|\p{Extended_Pictographic}))*/gu,
                (match) => {
                    const hex = _emojiToTwemojiHex(match);
                    return `<img class="ep-inline" src="${_TWEMOJI_BASE}${hex}.png" alt="${match}" loading="lazy" onerror="this.style.display='none';this.insertAdjacentText('afterend','${match.replace(/'/g, "\\'")}')">`;
                }
            );
        };
        targets.forEach(process);
        if (node.classList?.contains('gc-react-chip') || node.classList?.contains('soc-msg-text')) process(node);
    };
    _replaceEmoji(root);
}

// Single panel instance
let _epPanel = null;
const _epState = { mode: 'input', cat: 'smileys', target: null, onReact: null, anchor: null };

function _epGetPanel() {
    if (_epPanel) return _epPanel;
    _epPanel = document.createElement('div');
    _epPanel.id = 'hexa-ep';
    _epPanel.className = 'ep-panel';
    _epPanel.innerHTML = `
        <div class="ep-tabs" id="ep-tabs"></div>
        <div id="ep-search-row" class="ep-search-row">
            <i class="fas fa-search ep-search-icon"></i>
            <input class="ep-search" id="ep-search" placeholder="Rechercher…" autocomplete="off" spellcheck="false">
        </div>
        <div class="ep-cat-label" id="ep-cat-label"></div>
        <div class="ep-grid" id="ep-grid"></div>`;
    document.body.appendChild(_epPanel);

    // Tabs — built once
    const tabsEl = _epPanel.querySelector('#ep-tabs');
    HEXA_EMOJI_CATS.forEach(cat => {
        const b = document.createElement('button');
        b.className = 'ep-tab';
        b.dataset.cat = cat.id;
        b.title = cat.label;
        b.innerHTML = `<i class="fas ${cat.icon}"></i>`;
        tabsEl.appendChild(b);
    });

    // Event delegation on tabs
    tabsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.ep-tab');
        if (btn) { e.stopPropagation(); _epSetCat(btn.dataset.cat); }
    });

    // Event delegation on grid — handles click AND hover swap
    const grid = _epPanel.querySelector('#ep-grid');
    grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.ep-btn');
        if (!btn) return;
        e.stopPropagation();
        _epPick(btn.dataset.ep);
    });
    grid.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('.ep-btn');
        if (!btn || !btn.dataset.noto) return;
        const img = btn.querySelector('.ep-ei');
        if (img && !img.dataset.orig) { img.dataset.orig = img.src; img.src = btn.dataset.noto; }
    });
    grid.addEventListener('mouseout', (e) => {
        const btn = e.target.closest('.ep-btn');
        if (!btn) return;
        const img = btn.querySelector('.ep-ei');
        if (img?.dataset.orig) { img.src = img.dataset.orig; delete img.dataset.orig; }
    });

    // Search
    _epPanel.querySelector('#ep-search').addEventListener('input', (e) => {
        e.stopPropagation();
        const q = e.target.value.trim();
        if (!q) { _epSetCat(_epState.cat); return; }
        document.getElementById('ep-cat-label').textContent = 'RÉSULTATS';
        // Show all — emoji text search not feasible without a name dict
        document.getElementById('ep-grid').innerHTML = _epCatHtml(HEXA_EMOJI_CATS.flatMap(c => c.emojis));
    });

    // Close on outside click — one permanent listener
    document.addEventListener('click', (e) => {
        if (!_epPanel.classList.contains('ep-open')) return;
        if (!_epPanel.contains(e.target) && !e.target.closest('[data-ep-anchor]')) {
            _epClose();
        }
    }, true);

    return _epPanel;
}

function _epSetCat(catId) {
    _epState.cat = catId;
    const cat = HEXA_EMOJI_CATS.find(c => c.id === catId);
    if (!cat) return;
    _epPanel.querySelectorAll('.ep-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === catId));
    document.getElementById('ep-cat-label').textContent = cat.label.toUpperCase();
    document.getElementById('ep-grid').innerHTML = _epCatHtml(cat.emojis);
    // Hide search row in react mode — only quick emojis used via full categories
}

function _epPick(emoji) {
    if (_epState.mode === 'react' && _epState.onReact) {
        _epClose();
        _epState.onReact(emoji);
    } else {
        const inp = document.getElementById(_epState.target);
        if (inp) { inp.value += emoji; inp.focus(); }
        _epClose();
    }
}

function _epClose() {
    _epPanel?.classList.remove('ep-open');
}

function _epPosition(anchor) {
    // Temporarily make panel measurable (off-screen, visible)
    _epPanel.style.visibility = 'hidden';
    _epPanel.style.display    = 'flex';
    const pw = _epPanel.offsetWidth  || 300;
    const ph = _epPanel.offsetHeight || 300;
    _epPanel.style.visibility = '';
    _epPanel.style.display    = '';

    const aRect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const GAP = 6;

    // Vertical: prefer above anchor, fallback below
    let top;
    if (aRect.top - ph - GAP >= 4) {
        top = aRect.top - ph - GAP;
    } else {
        top = Math.min(aRect.bottom + GAP, vh - ph - 4);
    }

    // Horizontal: center on anchor, clamp inside viewport
    let left = aRect.left + aRect.width / 2 - pw / 2;
    left = Math.max(4, Math.min(left, vw - pw - 4));

    _epPanel.style.top  = Math.round(top)  + 'px';
    _epPanel.style.left = Math.round(left) + 'px';
}

// Public — input bar
function hexaEpOpen(targetInputId, anchorBtn) {
    const panel = _epGetPanel();
    const isToggle = panel.classList.contains('ep-open') && _epState.mode === 'input' && _epState.target === targetInputId;
    if (isToggle) { _epClose(); return; }
    _epState.mode   = 'input';
    _epState.target = targetInputId;
    panel.querySelector('#ep-search-row').style.display = '';
    panel.querySelector('#ep-search').value = '';
    _epSetCat(_epState.cat);
    _epPosition(anchorBtn);
    panel.classList.add('ep-open');
}

// Public — reaction picker (reuses same panel, hides search)
function _openReactPickerFor(anchorBtn, msgId, onReact) {
    const panel = _epGetPanel();
    const isToggle = panel.classList.contains('ep-open') && _epState.mode === 'react' && _epState.anchor === anchorBtn;
    if (isToggle) { _epClose(); return; }
    _epState.mode    = 'react';
    _epState.onReact = onReact;
    _epState.anchor  = anchorBtn;
    panel.querySelector('#ep-search-row').style.display = 'none';
    _epSetCat(_epState.cat);
    _epPosition(anchorBtn);
    panel.classList.add('ep-open');
}

function gcOpenReactPicker(anchorBtn, msgId) {
    _openReactPickerFor(anchorBtn, msgId, async (emoji) => {
        if (_gcReacting) return;
        _gcReacting = true;
        const r = await window.electron.reactGlobalMessage(msgId, emoji);
        _gcReacting = false;
        if (r?.success) gcPatchReactions(msgId, r.reactions);
    });
}

window.hexaEpOpen = hexaEpOpen;

// Patch only the reactions row of a single message without full reload
function gcPatchReactions(msgId, reactionsJson) {
    const list = document.getElementById('gc-msg-list');
    if (!list) return;
    const row = list.querySelector(`[data-gc-id="${msgId}"]`);
    if (!row) return;
    let reacts = {};
    try { reacts = typeof reactionsJson === 'string' ? JSON.parse(reactionsJson) : (reactionsJson || {}); } catch(_) {}
    const myId = gcMyDbId || -1;
    const entries = Object.entries(reacts).filter(([,uids]) => uids.length > 0);
    let existing = row.querySelector('.gc-reactions');
    if (!entries.length) { if (existing) existing.remove(); return; }
    const html = entries.map(([emoji, uids]) => {
        const mine = uids.includes(myId);
        return `<button class="gc-react-chip${mine ? ' mine' : ''}" data-msg-id="${msgId}" data-emoji="${emoji}">${emoji} <span>${uids.length}</span></button>`;
    }).join('');
    if (!existing) {
        existing = document.createElement('div');
        existing.className = 'gc-reactions';
        row.querySelector('.soc-msg-body-col')?.appendChild(existing);
    }
    existing.innerHTML = html;
    _jpparse(existing);
    existing.querySelectorAll('.gc-react-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (_gcReacting) return;
            _gcReacting = true;
            const r = await window.electron.reactGlobalMessage(+btn.dataset.msgId, btn.dataset.emoji);
            _gcReacting = false;
            if (r?.success) gcPatchReactions(+btn.dataset.msgId, r.reactions);
        });
    });
}

// ── Inline edit — patches DOM directly, no full reload ───────────────────────
function gcStartEdit(msgId, currentText) {
    const textEl = document.querySelector(`#gc-msg-list .soc-msg-text[data-gc-id="${msgId}"]`);
    if (!textEl) return;
    const restore = () => { textEl.textContent = currentText; };
    textEl.innerHTML = `<div class="gc-edit-wrap">
        <input class="gc-edit-input" value="${escHtml(currentText)}" maxlength="300">
        <div class="gc-edit-actions">
            <button class="gc-edit-save">Save</button>
            <button class="gc-edit-cancel">Cancel</button>
        </div>
    </div>`;
    const inp = textEl.querySelector('.gc-edit-input');
    inp.focus(); inp.select();
    textEl.querySelector('.gc-edit-save').addEventListener('click', async () => {
        const val = inp.value.trim();
        if (!val) return;
        const r = await window.electron.editGlobalMessage(msgId, val);
        if (r?.success) {
            textEl.textContent = val;
            const header = textEl.closest('.soc-msg-body-col')?.querySelector('.soc-msg-header');
            if (header && !header.querySelector('.gc-edited')) {
                header.insertAdjacentHTML('beforeend', '<span class="gc-edited">(edited)</span>');
            }
        } else {
            restore();
            window.notify('error', 'Error', r ? r.message : 'Unable to edit');
        }
    });
    textEl.querySelector('.gc-edit-cancel').addEventListener('click', restore);
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textEl.querySelector('.gc-edit-save').click(); }
        if (e.key === 'Escape') restore();
    });
}

window.deleteGcMessage = async function(msgId) {
    const res = await window.electron.deleteGlobalMessage(msgId);
    if (res?.success) {
        document.querySelector(`#gc-msg-list [data-gc-id="${msgId}"]`)?.remove();
    } else {
        window.HexaAlert('Error', res ? res.message : 'Unable to delete.');
    }
};

async function sendGlobalChatMessage() {
    const input = document.getElementById('gc-input-text');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    // Client-side sanction check
    if (_mySanctions.ban || _mySanctions.restricted) { window.notify('error', 'Restricted', 'You cannot send messages.'); return; }
    if (_mySanctions.mute) { window.notify('error', 'Muted', 'You are currently muted.'); return; }

    // Block any / command from being sent as a message
    if (text.startsWith('/')) {
        const myRole = currentUser?.role || 'player';
        const isMod = ['staff', 'owner', 'kitty'].includes(myRole);

        // Sanction commands: /mute /restricted /ban <target> [duration] [reason]
        const sanctionMatch = text.match(/^\/(mute|restricted|ban)\s+(\S+)(?:\s+(\S+))?(?:\s+(.+))?$/i);
        if (sanctionMatch) {
            if (!isMod) { window.notify('error', 'Permission denied', 'Only moderators can use commands.'); input.value = ''; return; }
            input.value = '';
            const [, type, target, durationStr, reason] = sanctionMatch;
            const res = await window.electron.moderationSanction({ type: type.toLowerCase(), target, durationStr: durationStr || 'perm', reason: reason || '' });
            if (res?.success) {
                window.notify('success', 'Sanction applied', `${target} has been ${type.toLowerCase()}d (${res.duration})`);
            } else {
                window.notify('error', 'Moderation error', res?.message || res?.error || 'Unknown error');
                input.value = text;
            }
            return;
        }

        // Unsanction commands: /unmute /unrestricted /unban <target>
        const unsanctionMatch = text.match(/^\/(unmute|unrestricted|unban)\s+(\S+)$/i);
        if (unsanctionMatch) {
            if (!isMod) { window.notify('error', 'Permission denied', 'Only moderators can use commands.'); input.value = ''; return; }
            input.value = '';
            const [, cmd, target] = unsanctionMatch;
            const typeMap = { unmute: 'mute', unrestricted: 'restricted', unban: 'ban' };
            const type = typeMap[cmd.toLowerCase()];
            const res = await window.electron.moderationUnsanction({ type, target });
            if (res?.success) {
                window.notify('success', 'Sanction lifted', `${target}'s ${type} has been removed.`);
            } else {
                window.notify('error', 'Moderation error', res?.message || res?.error || 'Unknown error');
                input.value = text;
            }
            return;
        }

        // Incomplete / unknown command — never send as message
        if (isMod) window.notify('warning', 'Invalid syntax', 'Usage: /mute &lt;player&gt; [duration] [reason]');
        else window.notify('error', 'Unknown command', 'Commands are reserved for moderators.');
        return;
    }

    const replyId = gcReplyTo ? gcReplyTo.id : null;
    const replySnapshot = gcReplyTo;
    gcClearReply();

    // Optimistic: append message immediately with real avatar + role color
    const list = document.getElementById('gc-msg-list');
    const myName = currentUser ? currentUser.username : '?';
    const myRole = currentUser?.role || 'player';
    const nameColor = getRoleData(myRole).color || 'var(--text-color)';
    const avatarSrc = gcMyAvatarDataUrl || `https://minotar.net/helm/${myName}/64`;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    const tempId = 'gc-temp-' + Date.now();
    let replyHtml = '';
    if (replySnapshot) {
        replyHtml = `<div class="gc-reply-ref">
            <i class="fas fa-reply gc-reply-ref-icon"></i>
            <span class="gc-reply-ref-author">${escHtml(replySnapshot.username)}</span>
            <span class="gc-reply-ref-text">${escHtml(replySnapshot.message.slice(0, 60))}</span>
        </div>`;
    }
    if (list) {
        list.insertAdjacentHTML('beforeend', `
            <div class="soc-msg gc-optimistic own" data-gc-id="${tempId}">
                <div class="soc-msg-content">
                    <img src="${escHtml(avatarSrc)}" class="soc-msg-avatar-small" style="image-rendering:pixelated">
                    <div class="soc-msg-body-col">
                        ${replyHtml}
                        <div class="soc-msg-header">
                            <span class="soc-msg-author" style="color:${nameColor}">${escHtml(myName)}</span>
                            ${buildRolePill(myRole, currentUser?.show_role_badge !== 0)}${buildCertBadge(currentUser?.microsoft_id)}
                            <span class="soc-msg-time">${timeStr}</span>
                        </div>
                        <div class="soc-msg-text">${_parseMessageContent(text)}</div>
                    </div>
                </div>
            </div>`);
        list.scrollTop = list.scrollHeight;
    }

    try {
        const res = await window.electron.sendGlobalMessage(text, replyId);
        if (res?.success) {
            // Just swap temp id for real id — no full reload
            const tempEl = document.querySelector(`[data-gc-id="${tempId}"]`);
            if (tempEl && res.id) { tempEl.dataset.gcId = res.id; tempEl.classList.remove('gc-optimistic'); }
        } else {
            document.querySelector(`[data-gc-id="${tempId}"]`)?.remove();
            window.notify('error', 'Global chat error', res ? (res.message || res.error) : 'Unable to send');
            input.value = text;
        }
    } catch(e) {
        document.querySelector(`[data-gc-id="${tempId}"]`)?.remove();
        window.notify('error', 'Global chat error', e.message);
        input.value = text;
    }
    input.focus();
}

window.insertGcEmoji = function(char) {
    const inp = document.getElementById('gc-input-text');
    if (inp) { inp.value += char; inp.focus(); }
};

document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('gc-input-text');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGlobalChatMessage(); } });
});

// ── Mode toggle: DM ↔ Global ──────────────────────────────────

const SOC_MODE_KEY   = 'hexa_soc_mode'; // 'dm' | 'global'
const GC_RULES_KEY   = 'hexa_gc_rules_accepted';

window.gcAcceptRules = function() {
    localStorage.setItem(GC_RULES_KEY, '1');
    const modal = document.getElementById('gc-rules-modal');
    if (modal) modal.style.display = 'none';
};

function setSocMode(mode) {
    const viewDm     = document.getElementById('soc-view-dm');
    const viewGlobal = document.getElementById('soc-view-global');
    const btnDm      = document.getElementById('soc-mode-dm');
    const btnGlobal  = document.getElementById('soc-mode-global');
    if (!viewDm || !viewGlobal) return;

    if (mode === 'global') {
        viewDm.style.display     = 'none';
        viewGlobal.style.display = 'flex';
        btnDm?.classList.remove('active');
        btnGlobal?.classList.add('active');
        // update header to show "Chat Global"
        const nameEl = document.getElementById('soc-header-name');
        const picEl  = document.getElementById('soc-header-pic');
        const statusEl = document.getElementById('soc-header-status');
        if (nameEl) nameEl.textContent = 'Global Chat';
        if (picEl)  picEl.style.display = 'none';
        if (statusEl) { statusEl.textContent = 'Visible to all connected players'; statusEl.className = 'soc-header-status'; }
        // show rules popup on first access
        if (!localStorage.getItem(GC_RULES_KEY)) {
            const modal = document.getElementById('gc-rules-modal');
            if (modal) modal.style.display = 'flex';
        }
        // start polling — only reload when new messages exist
        loadGlobalChat(true);
        clearInterval(gcRefreshTimer);
        gcRefreshTimer = setInterval(async () => {
            try {
                const res = await window.electron.getGlobalMessages();
                if (!res?.success || !res.messages?.length) return;
                const latestId = Math.max(...res.messages.map(m => m.id));
                if (latestId > _gcLastMsgId) loadGlobalChat(false);
            } catch(_) {}
        }, 2000);
    } else {
        viewDm.style.display     = 'flex';
        viewGlobal.style.display = 'none';
        btnDm?.classList.add('active');
        btnGlobal?.classList.remove('active');
        // restore default header
        const nameEl = document.getElementById('soc-header-name');
        const statusEl = document.getElementById('soc-header-status');
        if (nameEl) nameEl.textContent = 'Select a friend';
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'soc-header-status'; }
        clearInterval(gcRefreshTimer);
    }
    localStorage.setItem(SOC_MODE_KEY, mode);
}

function initSocModeToggle() {
    document.getElementById('soc-mode-dm')?.addEventListener('click', () => setSocMode('dm'));
    document.getElementById('soc-mode-global')?.addEventListener('click', () => setSocMode('global'));
}
document.addEventListener('DOMContentLoaded', initSocModeToggle);


// ==========================================
// SOCIAL OVERLAY
// ==========================================

async function openSocialOverlay() {
    const overlay = document.getElementById('social-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    loadSocialHubUsers();
    await gcInitUser();
    // restore last mode (memory)
    const savedMode = localStorage.getItem(SOC_MODE_KEY) || 'dm';
    setSocMode(savedMode);
}
function closeSocialOverlay() {
    const overlay = document.getElementById('social-overlay');
    if (overlay) overlay.classList.remove('active');
    clearInterval(gcRefreshTimer);
}

const socialCloseBtn = document.getElementById('social-close-btn');
if (socialCloseBtn) socialCloseBtn.addEventListener('click', closeSocialOverlay);

// ==========================================
// USER POPUP MENU + LOGOUT LOGIC
// ==========================================

function doLogout() {
    localStorage.removeItem("hexa_saved_user");
    currentUser = null;
    gcMyAvatarDataUrl = null;
    gcMyDbId = null;
    gcMyRole = 'player';
    // Disable chat input so logged-out users can't type
    const gcInput = document.getElementById('gc-input-text');
    if (gcInput) { gcInput.disabled = true; gcInput.placeholder = 'Login to chat...'; }
    const loginOverlay = document.getElementById("login-overlay");
    if (loginOverlay) {
        loginOverlay.style.display = "flex";
        loginOverlay.offsetHeight;
        loginOverlay.style.opacity = "1";
        loginOverlay.style.pointerEvents = "auto";
        const loginSubmitBtn = document.getElementById("login-submit-btn");
        if (loginSubmitBtn) { loginSubmitBtn.disabled = false; loginSubmitBtn.innerText = "INITIALIZE SESSION"; }
        const usernameInput = document.getElementById("login-username");
        if (usernameInput) { usernameInput.value = ""; usernameInput.disabled = false; }
        const passwordInput = document.getElementById("login-password");
        if (passwordInput) { passwordInput.value = ""; passwordInput.disabled = false; }
        const errorObj = document.getElementById("login-error");
        if (errorObj) errorObj.innerText = "";
    }
}

const bottomUserStatus = document.getElementById("bottom-user-status");
const userPopupMenu = document.getElementById("user-popup-menu");

if (bottomUserStatus && userPopupMenu) {
    bottomUserStatus.addEventListener("click", (e) => {
        e.stopPropagation();
        userPopupMenu.classList.toggle('open');
    });

    document.getElementById('popup-profile').addEventListener('click', () => {
        userPopupMenu.classList.remove('open');
        if (currentUser) openProfileOverlay(currentUser.username);
    });

    document.getElementById('popup-social').addEventListener('click', () => {
        userPopupMenu.classList.remove('open');
        openSocialOverlay();
    });

    document.getElementById('popup-logout').addEventListener('click', () => {
        userPopupMenu.classList.remove('open');
        if (confirm("Are you sure you want to log out?")) doLogout();
    });

    document.addEventListener('click', (e) => {
        if (!bottomUserStatus.contains(e.target)) userPopupMenu.classList.remove('open');
    });
}


loadSocialHubUsers();


// ============================================================
// PLAYER PROFILE OVERLAY
// ============================================================

function badgeFaClass(badge) {
    const fa = badgeFaIcon(badge);
    return fa.startsWith('fab ') ? fa : `fas ${fa}`;
}

function renderBadgeFeat(b) {
    const rc = RARITY_COLOR[(b.rarity || '').toLowerCase()] || '#aaa';
    return `<div class="prof-badge-feat" data-rarity="${b.rarity || ''}" title="${escHtml(b.description || b.name)}">
        <div class="prof-badge-icon" style="filter:drop-shadow(0 0 6px ${rc});">${badgeIconHtml(b, '28px')}</div>
        <div class="prof-badge-name">${escHtml(b.name)}</div>
    </div>`;
}

function renderBadgeItem(b) {
    const rc = RARITY_COLOR[(b.rarity || '').toLowerCase()] || '#aaa';
    return `<div class="prof-badge-item" data-rarity="${b.rarity || ''}" title="${escHtml(b.description || b.name)}">
        <div class="prof-badge-icon" style="filter:drop-shadow(0 0 6px ${rc});">${badgeIconHtml(b, '28px')}</div>
        <div class="prof-badge-name">${escHtml(b.name)}</div>
        <div class="prof-badge-rarity">${(b.rarity || '').toUpperCase()}</div>
    </div>`;
}

async function openProfileOverlay(userId) {
    const overlay = document.getElementById('profile-overlay');
    if (!overlay) return;

    profSetTab('overview');
    overlay.classList.add('active');

    // ── Instant pre-fill for own profile ───────────────────────────────────
    const isSelfInstant = currentUser && (
        currentUser.username === String(userId) ||
        String(currentUser.dbId) === String(userId)
    );
    if (isSelfInstant && gcMyAvatarDataUrl) {
        document.getElementById('prof-avatar').src = gcMyAvatarDataUrl;
        document.getElementById('prof-username').textContent = currentUser.username;
    } else {
        document.getElementById('prof-username').textContent = '...';
        document.getElementById('prof-avatar').src = 'https://minotar.net/helm/Steve/128';
    }
    document.getElementById('prof-badges').innerHTML = '<div class="prof-no-badges"><i class="fas fa-spinner fa-spin"></i></div>';
    document.getElementById('prof-badges-featured').innerHTML = '';

    // Banner edit buttons — always hidden initially; shown after we know if isSelf
    const bannerEditBtns = document.getElementById('prof-banner-edit-btns');
    if (bannerEditBtns) { bannerEditBtns.style.display = 'none'; bannerEditBtns.style.opacity = '0'; }

    try {
        const res = await window.electron.fetchUserProfile(userId);
        if (!res || !res.success) {
            document.getElementById('prof-username').textContent = 'Profile not found';
            return;
        }
        const p = res.profile;

        // Apply equipped cosmetics background for this specific profile
        applyProfPanelCosmetics(p.id);

        // Filter displayed badges + deduplicate by id and name
        const seenIds = new Set();
        const seenNames = new Set();
        const badges = (res.badges || []).filter(b => {
            if (b.displayed == 0) return false; // loose equality catches 0, "0", false
            if (seenIds.has(b.id) || seenNames.has((b.name || '').toLowerCase())) return false;
            seenIds.add(b.id);
            seenNames.add((b.name || '').toLowerCase());
            return true;
        });

        // Avatar
        const rawSkinUrl = socAvatarUrl(p);
        const isSelf = currentUser && (currentUser.username === p.username || String(currentUser.dbId) === String(p.id));
        let avatarUrl;
        if (isSelf && gcMyAvatarDataUrl) {
            avatarUrl = gcMyAvatarDataUrl;
        } else {
            avatarUrl = await extractHeadAvatar(rawSkinUrl).catch(() => `https://minotar.net/helm/${p.username}/128`);
        }
        const avatarEl = document.getElementById('prof-avatar');
        avatarEl.src = avatarUrl;
        avatarEl.dataset.skinUrl = rawSkinUrl;
        avatarEl.dataset.capeUrl = '';

        // Banner
        const rd = getRoleData(p.role || 'player');
        const bannerColor = p.banner_color || rd.glow || rd.color || '#DA0037';
        const bannerEl = document.getElementById('prof-banner');
        bannerEl.style.background = bannerUrlToCss(p.banner_url,
            `linear-gradient(135deg, ${bannerColor}ee 0%, ${bannerColor}66 60%, ${bannerColor}22 100%)`
        );

        // Show banner edit buttons only for own profile
        if (bannerEditBtns) {
            bannerEditBtns.style.display = isSelf ? 'flex' : 'none';
            bannerEditBtns.style.opacity = '0';

            const profRemoveBtn = document.getElementById('prof-banner-remove-btn');
            if (p.banner_url && profRemoveBtn) profRemoveBtn.style.display = '';

            const profImgBtn = document.getElementById('prof-banner-img-btn');
            if (profImgBtn) profImgBtn.onclick = async () => {
                const filePath = await window.electron.openFileDialog({
                    title: 'Choose Banner Image',
                    filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp','gif'] }],
                    properties: ['openFile'],
                });
                if (!filePath) return;
                const dataUrl = await window.electron.fetchImageBase64(filePath);
                if (!dataUrl) return notify('error', 'Banner Error', 'Could not read file.');
                const saveRes = await window.electron.saveProfileBanner(dataUrl);
                if (saveRes && saveRes.success) {
                    bannerEl.style.background = `url(${dataUrl}) center/cover no-repeat`;
                    if (profRemoveBtn) profRemoveBtn.style.display = '';
                    notify('success', 'Banner updated!');
                } else {
                    notify('error', 'Banner Error', saveRes?.message || 'Unknown error');
                }
            };

            const profColorBtn = document.getElementById('prof-banner-color-btn');
            const profColorInput = document.getElementById('prof-banner-color-input');
            if (profColorBtn && profColorInput) profColorBtn.onclick = () => {
                profColorInput.onchange = async () => {
                    const color = profColorInput.value;
                    const saveRes = await window.electron.saveProfileBanner(`color:${color}`);
                    if (saveRes && saveRes.success) {
                        bannerEl.style.background = `linear-gradient(135deg, ${color}ee 0%, ${color}66 60%, ${color}22 100%)`;
                        if (profRemoveBtn) profRemoveBtn.style.display = 'none';
                        notify('success', 'Couleur mise à jour !');
                    }
                };
                profColorInput.click();
            };

            // Gradient picker (overlay)
            const profGradBtn    = document.getElementById('prof-banner-gradient-btn');
            const profGradPicker = document.getElementById('prof-banner-gradient-picker');
            const profGradTop    = document.getElementById('prof-gradient-top');
            const profGradBot    = document.getElementById('prof-gradient-bottom');
            const profGradStrip  = document.getElementById('prof-gradient-strip');
            const profGradApply  = document.getElementById('prof-gradient-apply');

            function profUpdateStrip() {
                if (profGradStrip) profGradStrip.style.background = `linear-gradient(to bottom, ${profGradTop.value}, ${profGradBot.value})`;
            }
            if (profGradBtn) profGradBtn.onclick = () => {
                profGradPicker.style.display = profGradPicker.style.display === 'none' ? '' : 'none';
            };
            if (profGradTop) profGradTop.addEventListener('input', () => {
                profUpdateStrip();
                bannerEl.style.background = `linear-gradient(to bottom, ${profGradTop.value}, ${profGradBot.value})`;
            });
            if (profGradBot) profGradBot.addEventListener('input', () => {
                profUpdateStrip();
                bannerEl.style.background = `linear-gradient(to bottom, ${profGradTop.value}, ${profGradBot.value})`;
            });
            if (profGradApply) profGradApply.onclick = async () => {
                const top = profGradTop.value;
                const bot = profGradBot.value;
                const saveRes = await window.electron.saveProfileBanner(`gradient:${top},${bot}`);
                if (saveRes && saveRes.success) {
                    bannerEl.style.background = `linear-gradient(to bottom, ${top}, ${bot})`;
                    if (profRemoveBtn) profRemoveBtn.style.display = 'none';
                    profGradPicker.style.display = 'none';
                    notify('success', 'Gradient appliqué !');
                }
            };

            if (profRemoveBtn) profRemoveBtn.onclick = async () => {
                const saveRes = await window.electron.saveProfileBanner('');
                if (saveRes && saveRes.success) {
                    bannerEl.style.background = `linear-gradient(135deg, ${bannerColor}ee 0%, ${bannerColor}66 60%, ${bannerColor}22 100%)`;
                    profRemoveBtn.style.display = 'none';
                    notify('success', 'Bannière supprimée.');
                }
            };

            // Pre-fill gradient pickers if already set
            if (p.banner_url && p.banner_url.startsWith('gradient:') && profGradTop && profGradBot) {
                const [t, b] = p.banner_url.slice(9).split(',');
                profGradTop.value = t || '#DA0037';
                profGradBot.value = b || '#000000';
                profUpdateStrip();
            }
        }

        // Avatar glow from role
        const avatarWrap = document.getElementById('prof-avatar-wrap');
        const avatarGlow = document.getElementById('prof-avatar-glow');
        if (rd.glow && p.role !== 'player') {
            avatarGlow.style.boxShadow = `0 0 20px 4px ${rd.glow}88`;
            avatarGlow.style.border = `2px solid ${rd.glow}66`;
            avatarWrap.classList.add('has-glow');
        } else {
            avatarWrap.classList.remove('has-glow');
        }

        // Status dot
        const statusDot = document.getElementById('prof-status-dot');
        if (statusDot) {
            const raw = (p.status || 'offline').toLowerCase();
            const cls = raw === 'online' ? 'online' : raw === 'inactive' ? 'idle' : 'offline';
            statusDot.className = `prof-status-dot ${cls}`;
        }

        // Username + role tag + cert badge
        document.getElementById('prof-username').textContent = p.username;
        const rolePillEl = document.getElementById('prof-role-pill');
        if (p.role && p.role !== 'player' && rd.faIcon && p.show_role_badge !== 0) {
            rolePillEl.style.cssText = `display:inline-flex;align-items:center;gap:5px;color:${rd.color};`;
            rolePillEl.innerHTML = `<i class="fas ${rd.faIcon}"></i> ${rd.label}`;
        } else {
            rolePillEl.style.display = 'none';
        }
        // Cert badge (Premium / Microsoft linked)
        let certEl = document.getElementById('prof-cert-badge');
        if (!certEl) {
            certEl = document.createElement('span');
            certEl.id = 'prof-cert-badge';
            document.querySelector('.prof-name-row').appendChild(certEl);
        }
        certEl.innerHTML = buildCertBadge(p.microsoft_id);
        certEl.style.display = p.microsoft_id ? '' : 'none';

        // Title / meta
        const titleEl = document.getElementById('prof-title');
        titleEl.textContent = p.title || '';
        titleEl.style.display = p.title ? '' : 'none';

        const pronounsEl = document.getElementById('prof-pronouns');
        if (p.pronouns) { pronounsEl.textContent = p.pronouns; pronounsEl.style.display = ''; }
        else { pronounsEl.style.display = 'none'; }
        const locationEl = document.getElementById('prof-location');
        if (p.location) { locationEl.querySelector('span').textContent = p.location; locationEl.style.display = ''; }
        else { locationEl.style.display = 'none'; }

        // Bio — show edit button only for own profile
        const bioText = document.getElementById('prof-bio');
        bioText.textContent = p.bio || 'No bio yet.';
        document.getElementById('prof-edit-bio-btn').style.display = isSelf ? '' : 'none';
        document.getElementById('prof-panel').dataset.profDbId = p.id;

        // Featured badges (overview — first 6) — role badge first if show_role_badge
        const showRoleBadge = p.show_role_badge !== 0 && p.show_role_badge !== false;
        const featEl = document.getElementById('prof-badges-featured');
        const roleBadgeFeat = showRoleBadge ? buildRoleBadgeHtml(p.role, 'feat') : '';
        const featBadges = badges.slice(0, roleBadgeFeat ? 5 : 6);
        const featHtml = roleBadgeFeat + featBadges.map(renderBadgeFeat).join('');
        featEl.innerHTML = featHtml || '<div class="prof-no-badges">No badges yet.</div>';

        // All badges tab — role badge first if show_role_badge
        const badgesEl = document.getElementById('prof-badges');
        const roleBadgeItem = showRoleBadge ? buildRoleBadgeHtml(p.role, 'item') : '';
        const allHtml = roleBadgeItem + badges.map(renderBadgeItem).join('');
        badgesEl.innerHTML = allHtml || '<div class="prof-no-badges">No badges yet.</div>';

        // Stats overview
        const _ptMins = p.total_playtime || 0;
        const playtimeH = Math.floor(_ptMins / 60);
        const playtimeM = _ptMins % 60;
        const playtimeFmt = playtimeH > 0
            ? (playtimeM > 0 ? `${playtimeH}h ${playtimeM}m` : `${playtimeH}h`)
            : `${playtimeM}m`;
        document.getElementById('prof-stat-playtime').textContent = playtimeFmt;
        document.getElementById('prof-stat-badges').textContent = badges.length;
        const roleEl = document.getElementById('prof-stat-role');
        roleEl.textContent = rd.label;
        roleEl.style.color = rd.color;

        // Member since
        const memberEl = document.getElementById('prof-member-since');
        if (p.created_at) {
            const d = new Date(p.created_at);
            memberEl.textContent = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        } else {
            memberEl.textContent = '—';
        }

        // Stats full tab
        const statsBig = document.getElementById('prof-stats-big');
        statsBig.innerHTML = [
            { icon: 'fa-clock',       val: playtimeFmt,           label: 'Play Time' },
            { icon: 'fa-medal',       val: badges.length,         label: 'Badges' },
            { icon: 'fa-shield-alt',  val: rd.label,              label: 'Role', color: rd.color },
            { icon: 'fa-calendar-alt',val: memberEl.textContent,  label: 'Member Since' },
        ].map(s => `
            <div class="prof-stat-big">
                <i class="fas ${s.icon} prof-stat-big-icon"></i>
                <div class="prof-stat-big-value" ${s.color ? `style="color:${s.color}"` : ''}>${s.val}</div>
                <div class="prof-stat-big-label">${s.label}</div>
            </div>`).join('');

        // Recent activity
        const activityList = document.getElementById('prof-activity-list');
        activityList.innerHTML = '<div class="prof-activity-empty"><i class="fas fa-spinner fa-spin"></i></div>';
        window.electron.getRecentActivity(p.id).then(ar => {
            if (!ar || !ar.activities || !ar.activities.length) {
                activityList.innerHTML = '<div class="prof-activity-empty"><i class="fas fa-gamepad"></i> No recent activity.</div>';
                return;
            }
            activityList.innerHTML = ar.activities.map(a => {
                const when = timeAgo(new Date(a.created_at));
                return `<div class="prof-activity-item">
                    <div class="prof-activity-icon">${a.icon || '<i class="fas fa-circle"></i>'}</div>
                    <div class="prof-activity-body">
                        <div class="prof-activity-label">${escHtml(a.label)}</div>
                        ${a.detail ? `<div class="prof-activity-detail">${escHtml(a.detail)}</div>` : ''}
                    </div>
                    <div class="prof-activity-time">${when}</div>
                </div>`;
            }).join('');
        }).catch(() => {
            activityList.innerHTML = '<div class="prof-activity-empty"><i class="fas fa-gamepad"></i> No recent activity.</div>';
        });

        // Discord linked account
        const discordEl = document.getElementById('prof-discord-linked');
        if (discordEl) {
            if (p.discord_id) {
                const dAvatar = p.discord_avatar
                    ? `<img src="${escHtml(p.discord_avatar)}" class="prof-discord-avatar" alt="">`
                    : `<span class="prof-discord-avatar prof-discord-avatar-placeholder"><i class="fab fa-discord"></i></span>`;
                discordEl.innerHTML = `
                    <div class="prof-discord-row">
                        ${dAvatar}
                        <div class="prof-discord-info">
                            <span class="prof-discord-label"><i class="fab fa-discord" style="color:#5865F2;margin-right:4px;"></i>Discord</span>
                            <span class="prof-discord-name">${escHtml(p.discord_username || p.discord_id)}</span>
                        </div>
                    </div>`;
                discordEl.style.display = '';
            } else {
                discordEl.style.display = 'none';
            }
        }

        // Action buttons
        const msgBtn = document.getElementById('prof-btn-message');
        const addBtn = document.getElementById('prof-btn-add');
        msgBtn.onclick = () => { closeProfileOverlay(); openSocialOverlay(); window.setSocial(p.username, '', avatarUrl, p.status || 'offline', null, p.id); };

        if (!isSelf) {
            const relation = friendRelationCache[p.id];
            if (relation === 'accepted') {
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fas fa-user-check"></i> Friends';
            } else if (relation === 'sent') {
                addBtn.disabled = true;
                addBtn.innerHTML = '<i class="fas fa-clock"></i> Pending';
            } else if (relation === 'pending') {
                addBtn.disabled = false;
                addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Accept';
                addBtn.onclick = async () => {
                    addBtn.disabled = true;
                    await acceptFriendRequest(p.username);
                    addBtn.innerHTML = '<i class="fas fa-user-check"></i> Friends';
                };
            } else {
                addBtn.disabled = false;
                addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Add Friend';
                addBtn.onclick = async () => {
                    addBtn.disabled = true;
                    addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    await sendFriendRequest(p.username);
                    addBtn.innerHTML = '<i class="fas fa-clock"></i> Pending';
                    friendRelationCache[p.id] = 'sent';
                };
            }
        }
        msgBtn.style.display = isSelf ? 'none' : '';
        addBtn.style.display = isSelf ? 'none' : '';

        // Load equipped cosmetics tab
        loadProfCosmetics(p.id);

    } catch(e) {
        console.error('[Profile]', e);
        document.getElementById('prof-username').textContent = 'Error';
    }
}
window.openProfileOverlay = openProfileOverlay;

async function loadProfCosmetics(userId) {
    const grid = document.getElementById('prof-cosmetics-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
        const r = await fetch(`https://hexa-mc.fr/hexa/api/cosmetics/equipped/${encodeURIComponent(userId)}`);
        const d = await r.json();
        const items = d.equipped || [];
        if (!items.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;text-align:center;padding:20px;"><i class="fas fa-box-open" style="display:block;font-size:22px;margin-bottom:6px;opacity:.3;"></i>No cosmetics equipped.</div>';
            return;
        }
        grid.innerHTML = '';
        items.forEach(c => {
            const card = document.createElement('div');
            card.style.cssText = 'border-radius:8px;overflow:hidden;border:1px solid var(--border-color);background:var(--surface-1);';
            const bg = cosPreviewCss(c);
            const isHolo = c.type === 'holo_effect';
            const rc = RARITY_COLORS[c.rarity] || '#aaa';
            card.innerHTML = `
                <div style="height:44px;background:${bg};background-size:300% 300%;${isHolo ? 'animation:holo-shimmer 4s linear infinite;' : ''}"></div>
                <div style="padding:5px 7px;">
                    <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-color);">${escHtml(c.name || '')}</div>
                    <div style="font-size:8px;font-weight:700;color:${rc};">${(c.rarity || '').toUpperCase()}</div>
                </div>`;
            grid.appendChild(card);
        });
    } catch(_) {
        grid.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">Failed to load cosmetics.</div>';
    }
}

function profSetTab(tabName) {
    document.querySelectorAll('.prof-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.prof-nav-btn').forEach(b => b.classList.remove('active'));
    const tab = document.getElementById(`prof-tab-${tabName}`);
    if (tab) tab.classList.add('active');
    const btn = document.querySelector(`[data-prof-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
}

function closeProfileOverlay() {
    const overlay = document.getElementById('profile-overlay');
    if (overlay) overlay.classList.remove('active');
    const panel = document.getElementById('prof-panel');
    if (panel) { panel.classList.remove('expanded','prof-collapsing','has-prof-bg',..._HOLO_CLASSES); panel.style.removeProperty('background'); }
    const border = document.getElementById('prof-panel-border');
    if (border) border.classList.remove('expanded-wrap','collapsing-wrap');
    _applyAvatarGlow(null);
    const expandBtn = document.getElementById('prof-expand-btn');
    if (expandBtn) { expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>'; expandBtn.title = 'Expand'; }
    profDestroySkin3D();
}
window.closeProfileOverlay = closeProfileOverlay;

// ── Profile 3D skin viewer ─────────────────────────────────
let profSkinViewer = null;

function profDestroySkin3D() {
    if (profSkinViewer) {
        try { profSkinViewer.dispose(); } catch(_) {}
        profSkinViewer = null;
    }
}

function profInitSkin3D(skinUrl, capeUrl) {
    if (typeof skinview3d === 'undefined') return;
    profDestroySkin3D();
    const canvas = document.getElementById('prof-skin-canvas');
    const panel  = document.getElementById('prof-skin-panel');
    if (!canvas || !panel) return;

    const w = panel.clientWidth  || 260;
    const h = panel.clientHeight || 460;

    profSkinViewer = new skinview3d.SkinViewer({
        canvas,
        width: w,
        height: h,
        renderScale: window.devicePixelRatio || 1,
    });

    if (skinUrl) profSkinViewer.loadSkin(skinUrl).catch(() => {});
    if (capeUrl) profSkinViewer.loadCape(capeUrl).catch(() => {});

    profSkinViewer.camera.position.set(0, 14, 55);
    profSkinViewer.zoom = 0.85;
    profSkinViewer.animation = new skinview3d.WalkingAnimation();
    profSkinViewer.animation.speed = 0.6;

    // Orbit controls
    try {
        if (skinview3d.createOrbitControls) {
            const ctrl = skinview3d.createOrbitControls(profSkinViewer);
            ctrl.enableRotate = true; ctrl.enableZoom = true; ctrl.enablePan = false;
        }
    } catch(_) {}
}

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('prof-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileOverlay);
    const backdrop = document.getElementById('prof-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeProfileOverlay);

    // Expand / collapse — fullscreen with smooth animations
    const expandBtn = document.getElementById('prof-expand-btn');
    if (expandBtn) expandBtn.addEventListener('click', () => {
        const panel  = document.getElementById('prof-panel');
        const border = document.getElementById('prof-panel-border');
        const isExpanded = border.classList.contains('expanded-wrap');

        if (!isExpanded) {
            border.classList.add('expanded-wrap');
            panel.classList.add('expanded');
            expandBtn.innerHTML = '<i class="fas fa-compress-alt"></i>';
            expandBtn.title = 'Collapse';
            setTimeout(() => {
                const skinUrl = document.getElementById('prof-avatar')?.dataset?.skinUrl;
                const capeUrl = document.getElementById('prof-avatar')?.dataset?.capeUrl;
                profInitSkin3D(skinUrl, capeUrl);
            }, 450);
        } else {
            profDestroySkin3D();
            border.classList.add('collapsing-wrap');
            panel.classList.add('prof-collapsing');
            expandBtn.innerHTML = '<i class="fas fa-expand-alt"></i>';
            expandBtn.title = 'Expand';
            setTimeout(() => {
                border.classList.remove('expanded-wrap', 'collapsing-wrap');
                panel.classList.remove('expanded', 'prof-collapsing');
            }, 280);
        }
    });

    // Nav tab buttons
    document.querySelectorAll('.prof-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => profSetTab(btn.dataset.profTab));
    });

    // Bio edit
    const editBioBtn = document.getElementById('prof-edit-bio-btn');
    const bioView    = document.getElementById('prof-bio');
    const bioEditWrap= document.getElementById('prof-bio-edit');
    const bioInput   = document.getElementById('prof-bio-input');
    const bioCounter = document.getElementById('prof-bio-counter');
    const bioCancelBtn = document.getElementById('prof-bio-cancel');
    const bioSaveBtn   = document.getElementById('prof-bio-save');

    function profOpenBioEdit() {
        bioInput.value = bioView.textContent === 'No bio yet.' ? '' : bioView.textContent;
        bioCounter.textContent = bioInput.value.length + '/300';
        bioView.style.display = 'none';
        bioEditWrap.style.display = '';
        bioInput.focus();
    }
    function profCloseBioEdit() {
        bioEditWrap.style.display = 'none';
        bioView.style.display = '';
    }

    if (editBioBtn) editBioBtn.addEventListener('click', profOpenBioEdit);
    if (bioCancelBtn) bioCancelBtn.addEventListener('click', profCloseBioEdit);
    if (bioInput) bioInput.addEventListener('input', () => {
        bioCounter.textContent = bioInput.value.length + '/300';
    });
    if (bioSaveBtn) bioSaveBtn.addEventListener('click', async () => {
        const newBio = bioInput.value.trim();
        bioSaveBtn.disabled = true;
        bioSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        const res = await window.electron.saveProfileBio(newBio).catch(() => ({ success: false }));
        bioSaveBtn.disabled = false;
        bioSaveBtn.textContent = 'Save';
        if (res && res.success) {
            bioView.textContent = newBio || 'No bio yet.';
            profCloseBioEdit();
        } else {
            bioSaveBtn.textContent = 'Error — retry';
        }
    });
});


// ============================================================
// ─── DM NOTIFICATION (bottom-left) ───────────────────────────────────────────
function _notifyDm(senderName, isBot, skinUrl) {
    const rawSkin = isBot ? null
        : skinUrl ? (skinUrl.includes('http') ? skinUrl : `https://hexa-mc.fr/hexa/api/textures/skins/${skinUrl}`)
        : `https://hexa-mc.fr/hexa/api/textures/skins/${encodeURIComponent(senderName)}.png`;

    const toast = window.notify('info', senderName, 'Sent you a message', { duration: 5000, avatar: rawSkin || 'assets/default.png' });
    if (toast && rawSkin) {
        extractHeadAvatar(rawSkin).then(head => {
            const img = toast.querySelector('.toast-avatar');
            if (img) img.src = head;
        }).catch(() => {});
    }
}

// SYSTEME DE NOTIFICATIONS TEMPS RÉEL (SSE)
// ============================================================
function initSSE() {
    if (typeof currentUser === 'undefined' || !currentUser || !currentUser.username) {
        setTimeout(initSSE, 1000); // Retry if user not loaded yet
        return;
    }
    
    console.log(`🔌 Connexion au flux social pour : ${currentUser.username}...`);
    const eventSource = new EventSource(`https://hexa-mc.fr/api/events/social?username=${currentUser.username}`);
    
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
            console.log(`[NOTICE] Friend request from ${data.from}`);
            new Notification("New friend request", {
                body: `${data.from} wants to add you as a friend!`
            });
            loadSocialHubUsers(); // Recharge la liste
        } catch(err){}
    });
    
    eventSource.addEventListener('new_dm', (e) => {
        try {
            const evData = e.data ? JSON.parse(e.data) : {};
            const senderId   = evData.senderId   ? String(evData.senderId)   : null;
            const senderName = evData.senderName || 'Someone';
            const senderSkin = evData.senderSkin || null;
            const isBot      = !!evData.isBot;

            if (isBot) {
                // Bot (Hexa) message — refresh Hexa conv if open, otherwise badge + notify
                const hexaConvOpen = document.querySelector('.soc-user[data-friend-id="__hexa__"]')?.classList.contains('active');
                if (hexaConvOpen) {
                    window.electron.getHexaMessages().then(r => {
                        if (!r?.messages?.length) return;
                        const latest = Math.max(...r.messages.map(m => m.id));
                        if (latest <= _hexaLastMsgId) return;
                        const newMsgs = r.messages.filter(m => m.id > _hexaLastMsgId);
                        _hexaLastMsgId = latest;
                        const l = document.getElementById('soc-msg-list');
                        if (l) { _appendHexaMessages(newMsgs, l); l.scrollTop = l.scrollHeight; }
                    }).catch(() => {});
                } else {
                    _incUnread('__hexa__');
                    _notifyDm('Hexa', true, null);
                }
                return;
            }

            // Regular DM from a friend
            const isThisConvOpen = currentChatFriendId && senderId && String(currentChatFriendId) === senderId;

            if (isThisConvOpen) {
                // Conv is open — append immediately
                window.electron.getMessages(currentChatFriendId).then(r => {
                    if (!r?.success || !r.messages?.length) return;
                    const latest = Math.max(...r.messages.map(m => m.id));
                    if (latest <= dmLastKnownId) return;
                    const newMsgs = r.messages.filter(m => m.id > dmLastKnownId);
                    dmLastKnownId = latest;
                    const map = {};
                    r.messages.forEach(m => { map[m.id] = m; });
                    _appendDmMessages(newMsgs, map, currentChatFriendId, currentChatFriendName, currentChatFriendAva);
                }).catch(() => {});
            } else {
                // Different conv or none open — badge + notify
                if (senderId) _incUnread(senderId);
                _notifyDm(senderName, false, senderSkin);
            }
        } catch(err){}
    });
    
    eventSource.addEventListener('cosmetic_update', (e) => {
        try {
            const data = JSON.parse(e.data);
            // Always refresh own inventory (settings panel)
            loadLauncherInventory();
            // If a profile overlay is open and it's this user, refresh its background + cosmetics tab
            const panel = document.getElementById('prof-panel');
            const openId = panel?.dataset?.profDbId;
            if (openId && document.getElementById('profile-overlay')?.classList.contains('active')) {
                applyProfPanelCosmetics(openId);
                loadProfCosmetics(openId);
            }
        } catch(err) {}
    });

    eventSource.onerror = function() {
        eventSource.close();
        setTimeout(initSSE, 3000);
    };
}

// Initialiser le système SSE (au lieu de recharger en boucle)
initSSE();
// === CHAT SYSTEM ===
const ChatSystem = {
    messages: [],
    isOpen: false,
    serverUrl: "https://hexa-mc.fr",
    
    get username() {
        return (typeof currentUser !== 'undefined' && currentUser) ? currentUser.username : 'Guest';
    },

    get avatar() {
        if (typeof currentUser !== 'undefined' && currentUser) {
            // Priority 1: Hexa Custom Skin (if enabled in future backend)
            // Priority 2: Minotar
            // Note: If you have a custom skin upload feature, check that URL first.
            if(currentUser.skin) {
                 return currentUser.skin;
            }
            if(API_BASE_URL) {
                 return `${API_BASE_URL}/hexa/api/textures/skins/${currentUser.username}.png`;
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
        
        // Revised HTML injection for consistency with theme
        div.innerHTML = `
            <div class="chat-container">
                <div class="chat-header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="assets/logo.svg" style="width:24px; height:24px;" onerror="this.src='https://minotar.net/helm/Steve/24'">
                        <span style="font-weight:800; font-family:'Montserrat',sans-serif; letter-spacing:1px;">SOCIAL HUB</span>
                    </div>
                    <button id="close-chat-btn" style="background:none; border:none; color:inherit; cursor:pointer; font-size:20px; opacity:0.6;">&times;</button>
                </div>
                
                <div class="chat-messages" id="chat-messages-area">
                    <div class="chat-msg system">
                        <span class="msg-content" style="color:var(--text-color); opacity:0.6; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px; text-align:center; width:100%; display:block;">Bienvenue sur le chat global !</span>
                    </div>
                </div>

                <div class="chat-input-area">
                    <button id="emoji-btn" style="background:none; border:none; cursor:pointer; font-size:20px; color:inherit; opacity:0.6;">☺</button>
                    <input type="text" id="chat-input" placeholder="Write a message..." autocomplete="off">
                    <button id="send-chat-btn" style="background:var(--accent-color); border:none; color:var(--bg-color); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.1);">
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
            // Use CSS class for floating button to respect theme? Or hardcode primary color?
            // User requested consistency. Let's use accent-color logic but via inline for now as it's injected.
            // Wait, I can use a class.
            floatBtn.className = 'float-chat-btn'; // New class
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
    document.getElementById('chat-attach-popup')?.classList.remove('mode-screenshots');
    document.getElementById('attach-menu-view').style.display = 'flex';
    document.getElementById('attach-list-view').style.display = 'none';
    document.getElementById('attach-footer').style.display = 'none';
    const list = document.getElementById('attach-list-content');
    if (list) { list.innerHTML = ''; }
    document.getElementById('attach-title').innerText = 'ATTACHMENT';
};

// Close popup when clicking outside
document.addEventListener('click', (e) => {
    const p = document.getElementById('chat-attach-popup');
    const btn = document.getElementById('btn-soc-plus');
    if (p && p.style.display !== 'none') {
        if (!p.contains(e.target) && (!btn || !btn.contains(e.target))) {
            toggleAttachPopup(false);
        }
    }
});

window.showAttachModpacks = async function() {
    const list = document.getElementById('attach-list-content');
    const view = document.getElementById('attach-list-view');
    const menu = document.getElementById('attach-menu-view');
    const footer = document.getElementById('attach-footer');
    const title = document.getElementById('attach-title');
    
    if(list) {
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '8px';
    }
    
    menu.style.display = 'none';
    view.style.display = 'block';
    footer.style.display = 'block';
    title.innerText = 'SELECT MODPACK';
    list.innerHTML = '';
    
    const allInstances = [...OFFICIAL_INSTANCES, ...LibraryManager.instances];
    
    if (allInstances.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#888;">No modpacks found.</div>';
        return;
    }

    allInstances.forEach(inst => {
        const item = document.createElement('div');
        item.className = 'attach-item';
        item.innerHTML = `
            <img src="${inst.icon || 'assets/logo.svg'}" style="width:32px; height:32px; object-fit:contain;">
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:12px;">${inst.name}</div>
                <div style="font-size:10px; color:#666;">${inst.version} • ${inst.loader || 'Vanilla'}</div>
            </div>
            <i class="fas fa-paper-plane" style="color:#888;"></i>
        `;
        item.onclick = async () => {
             toggleAttachPopup(false);
             
             let modCount = '?';
             try {
                const pathToCheck = inst.folder || inst.path; 
                const content = await window.electron.getInstanceContent(pathToCheck);
                if(content && content.mods) modCount = content.mods.length;
             } catch(e) { console.error("Share stats error", e); }

             const msg = `Check out this modpack: ${inst.name} (${inst.version}) - ${modCount} Mods`;
             const inp = document.getElementById('soc-input-text');
             if(inp) { inp.value = msg; inp.focus(); }
        };
        list.appendChild(item);
    });
};



const _pendingImages = []; // [{ url, id }]
let _pendingImgCounter = 0;

function _renderPendingImages() {
    const preview = document.getElementById('soc-img-preview');
    if (!preview) return;
    if (_pendingImages.length === 0) { preview.style.display = 'none'; preview.innerHTML = ''; return; }
    preview.style.display = 'block';
    preview.innerHTML = _pendingImages.map(p => `
        <div class="soc-img-preview-inner" data-pending-id="${p.id}">
            <img src="${p.url}" alt="preview">
            <button class="soc-img-preview-remove" onclick="window._removePendingImage(${p.id})" title="Retirer"><i class="fas fa-times"></i></button>
        </div>`).join('');
}

window._removePendingImage = function(id) {
    const idx = _pendingImages.findIndex(p => p.id === id);
    if (idx !== -1) _pendingImages.splice(idx, 1);
    _renderPendingImages();
};

window._clearPendingImage = function() {
    _pendingImages.length = 0;
    _renderPendingImages();
};

async function uploadScreenshot(data, name) {
    const MAX_IMAGES = 3;
    // Count pending + in-flight uploads (spinners)
    const inFlight = document.querySelectorAll('#soc-img-preview .soc-img-uploading').length;
    if (_pendingImages.length + inFlight >= MAX_IMAGES) {
        window.notify?.('warning', 'Limite atteinte', `Maximum ${MAX_IMAGES} images par message.`);
        return;
    }
    // Add a spinner placeholder immediately
    const placeholderId = ++_pendingImgCounter;
    const preview = document.getElementById('soc-img-preview');
    if (preview) {
        preview.style.display = 'block';
        const spin = document.createElement('div');
        spin.className = 'soc-img-preview-inner soc-img-uploading';
        spin.dataset.pendingId = placeholderId;
        spin.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
        preview.appendChild(spin);
    }

    try {
        const result = await window.electron.uploadChatScreenshot({ data, filename: name });

        // Remove spinner
        preview?.querySelector(`[data-pending-id="${placeholderId}"]`)?.remove();

        if (result?.success) {
            _pendingImages.push({ url: result.url, id: ++_pendingImgCounter });
            _renderPendingImages();
            document.getElementById('soc-input-text')?.focus();
        } else {
            window.HexaAlert?.('Upload Failed', result?.error || result?.message || 'Unknown error');
            if (_pendingImages.length === 0 && preview) preview.style.display = 'none';
        }
    } catch(e) {
        console.error('Upload error', e);
        preview?.querySelector(`[data-pending-id="${placeholderId}"]`)?.remove();
        if (_pendingImages.length === 0 && preview) preview.style.display = 'none';
        window.HexaAlert?.('Upload Error', e.message);
    }
}

window.uploadScreenshot = uploadScreenshot;

window.showAttachScreenshots = async function() {
    const list = document.getElementById('attach-list-content');
    const view = document.getElementById('attach-list-view');
    const menu = document.getElementById('attach-menu-view');
    const footer = document.getElementById('attach-footer');
    const title = document.getElementById('attach-title');
    const loader = document.getElementById('attach-list-loader');

    document.getElementById('chat-attach-popup')?.classList.add('mode-screenshots');
    menu.style.display = 'none';
    view.style.display = 'flex';
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
            list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-subtle); font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">No screenshots found</div>';
            return;
        }

        allScreenshots.forEach(shot => {
            const item = document.createElement('div');
            item.className = 'attach-item';
            item.innerHTML = `
                <div class="attach-img-wrap">
                    <img src="${shot.data}" alt="${escHtml(shot.name)}" loading="lazy">
                </div>
                <div class="attach-item-meta">
                    <div class="attach-item-name">${escHtml(shot.name)}</div>
                    <div class="attach-item-sub">${escHtml(shot.instanceName)}</div>
                </div>`;
            item.onclick = () => window.uploadScreenshot(shot.data, shot.name);
            list.appendChild(item);
        });

    } catch(e) {
        if(loader) loader.style.display = 'none';
        list.style.display = 'block';
        list.innerHTML = `<div style="padding:20px; color:red;">Error: ${e.message}</div>`;
    }
};

// ─── @ Mention system ────────────────────────────────────────────────────────
const _atMention = (() => {
    let _active = false;
    let _query = '';
    let _selIdx = 0;
    let _candidates = [];

    // Build username→role map from rendered messages
    function _getRoleMap() {
        // Merge global cache + current user
        const map = Object.assign({}, _userRoleCache);
        if (currentUser?.username) map[currentUser.username.toLowerCase()] = currentUser.role || 'player';
        if (currentChatFriendName) map[currentChatFriendName.toLowerCase()] = map[currentChatFriendName.toLowerCase()] || 'player';
        return map;
    }

    const ROLE_ORDER = ['owner', 'admin', 'staff', 'kitty', 'player'];
    function _roleRank(role) { const i = ROLE_ORDER.indexOf(role || 'player'); return i === -1 ? 99 : i; }

    // Get participants for current context
    function _getParticipants() {
        const roleMap = _getRoleMap();
        const users = [];

        const isDM = _activeInput?.id === 'soc-input-text';
        if (isDM) {
            // DM: only the two participants, no @everyone
            if (currentUser?.username)
                users.push({ username: currentUser.username, role: currentUser.role || 'player' });
            if (currentChatFriendName)
                users.push({ username: currentChatFriendName, role: roleMap[currentChatFriendName.toLowerCase()] || 'player' });
            return users;
        } else {
            // Global chat: users visible in DOM + role from cache
            const seen = new Set();
            if (currentUser?.username) {
                seen.add(currentUser.username.toLowerCase());
                users.push({ username: currentUser.username, role: currentUser.role || 'player' });
            }
            document.querySelectorAll('#gc-msg-list .soc-msg-author').forEach(el => {
                const name = el.textContent.trim();
                if (!name || seen.has(name.toLowerCase())) return;
                seen.add(name.toLowerCase());
                const role = _userRoleCache[name.toLowerCase()] || 'player';
                users.push({ username: name, role });
            });

            // Sort by role rank then alpha
            users.sort((a, b) => {
                const rd = _roleRank(a.role) - _roleRank(b.role);
                return rd !== 0 ? rd : a.username.toLowerCase().localeCompare(b.username.toLowerCase());
            });
        }

        // everyone always first
        users.unshift({ username: 'everyone', id: null, everyone: true, role: null });
        return users;
    }

    let _activeInput = null; // which input triggered the popup
    let _mode = 'at'; // 'at' or 'cmd'

    function _popupFor(inp) {
        if (!inp) return null;
        return document.getElementById(inp.id === 'gc-input-text' ? 'at-popup-gc' : 'at-popup');
    }

    function _render() {
        const popup = _popupFor(_activeInput);
        if (!popup) return;
        if (!_active || _candidates.length === 0) { popup.style.display = 'none'; popup.classList.remove('at-open'); return; }
        if (popup.style.display === 'none') {
            popup.style.display = 'block';
            popup.classList.remove('at-open');
            void popup.offsetWidth;
            popup.classList.add('at-open');
        }
        popup.innerHTML = _candidates.map((u, i) => {
            const rd = u.everyone ? null : getRoleData(u.role || 'player');
            const color = u.everyone ? '#aaa' : (rd?.color || '#aaa');
            const icon = u.everyone ? 'fa-users' : (rd?.faIcon || 'fa-user');
            return `<div class="at-item${i === _selIdx ? ' at-selected' : ''}" data-idx="${i}">
                <span class="at-role-icon" style="color:${color}"><i class="fas ${icon}"></i></span>
                <span class="at-name" style="color:${color}">${u.everyone ? 'everyone' : escHtml(u.username)}</span>
                ${!u.everyone && u.role && u.role !== 'player' ? `<span class="at-tag" style="color:${color}">${rd.label}</span>` : ''}
            </div>`;
        }).join('');
        popup.querySelectorAll('.at-item').forEach(el => {
            el.addEventListener('mousedown', e => { e.preventDefault(); _pick(+el.dataset.idx); });
        });
    }

    function _pick(idx) {
        const u = _candidates[idx];
        if (!u || !_activeInput) return;
        const val = _activeInput.value;
        if (_mode === 'slash') {
            // Complete the command name + space, ready for pseudo
            _activeInput.value = u.username + ' ';
        } else if (_mode === 'cmd') {
            const cmdMatch = val.match(/^(\/(?:mute|restricted|ban|unmute|unrestricted|unban)\s+)\S*$/i);
            if (cmdMatch) _activeInput.value = cmdMatch[1] + u.username + ' ';
        } else {
            const atPos = val.lastIndexOf('@');
            _activeInput.value = val.slice(0, atPos) + '@' + u.username + ' ';
        }
        _activeInput.focus();
        _close();
        // After completing a slash command, immediately trigger cmd mode for pseudo
        if (_mode === 'slash') _activeInput.dispatchEvent(new Event('input'));
    }

    function _close() {
        _active = false;
        _candidates = [];
        ['at-popup', 'at-popup-gc'].forEach(id => {
            const p = document.getElementById(id);
            if (p) { p.style.display = 'none'; p.classList.remove('at-open'); }
        });
    }

    const COMMANDS = [
        { name: 'mute',         icon: 'fa-microphone-slash', color: '#f5a623', desc: '<player> [duration] [reason]' },
        { name: 'restricted',   icon: 'fa-lock',             color: '#e74c3c', desc: '<player> [duration] [reason]' },
        { name: 'ban',          icon: 'fa-ban',              color: '#c0392b', desc: '<player> [duration] [reason]' },
        { name: 'unmute',       icon: 'fa-microphone',       color: '#2ecc71', desc: '<player>' },
        { name: 'unrestricted', icon: 'fa-lock-open',        color: '#2ecc71', desc: '<player>' },
        { name: 'unban',        icon: 'fa-circle-check',     color: '#2ecc71', desc: '<player>' },
    ];

    function _renderCommands(query) {
        const popup = _popupFor(_activeInput);
        if (!popup) return;
        const myRole = currentUser?.role || 'player';
        if (!['staff', 'owner', 'kitty'].includes(myRole)) { _close(); return; }
        const filtered = COMMANDS.filter(c => c.name.startsWith(query));
        if (!filtered.length) { _close(); return; }
        _active = true;
        _mode = 'slash';
        _candidates = filtered.map(c => ({ username: '/' + c.name, _cmd: c }));
        if (_selIdx >= _candidates.length) _selIdx = 0;
        if (popup.style.display === 'none') {
            popup.style.display = 'block';
            popup.classList.remove('at-open');
            void popup.offsetWidth;
            popup.classList.add('at-open');
        }
        popup.innerHTML = filtered.map((c, i) => `
            <div class="at-item${i === _selIdx ? ' at-selected' : ''}" data-idx="${i}">
                <span class="at-role-icon" style="color:${c.color}"><i class="fas ${c.icon}"></i></span>
                <span class="at-name" style="color:${c.color}">/${c.name}</span>
                <span class="at-tag">${c.desc}</span>
            </div>`).join('');
        popup.querySelectorAll('.at-item').forEach(el => {
            el.addEventListener('mousedown', e => { e.preventDefault(); _pick(+el.dataset.idx); });
        });
    }

    function _onInput(e) {
        const inp = e.target;
        const val = inp.value;
        const cur = inp.selectionStart;
        const before = val.slice(0, cur);

        // Mode slash : /cmd en cours de saisie (pas encore d'espace)
        const slashOnly = before.match(/^\/([\w]*)$/);
        if (slashOnly) {
            _activeInput = inp;
            _selIdx = 0;
            _renderCommands(slashOnly[1].toLowerCase());
            return;
        }

        // Mode commande : /mute|/restricted|/ban suivi d'un seul mot (le pseudo)
        const cmdMatch = before.match(/^(\/(?:mute|restricted|ban|unmute|unrestricted|unban)\s+)([\w.]*)$/i);
        if (cmdMatch) {
            _query = cmdMatch[2].toLowerCase();
            _activeInput = inp;
            _mode = 'cmd';
            _active = true;
            _selIdx = 0;
            // Pour les commandes on cherche dans tous les users connus
            const roleMap = _getRoleMap();
            const seen = new Set();
            const all = [];
            Object.entries(_userRoleCache).forEach(([nameLower, role]) => {
                if (!seen.has(nameLower)) { seen.add(nameLower); all.push({ username: nameLower, role }); }
            });
            document.querySelectorAll('#gc-msg-list .soc-msg-author').forEach(el => {
                const name = el.textContent.trim();
                if (!name || seen.has(name.toLowerCase())) return;
                seen.add(name.toLowerCase());
                all.push({ username: name, role: _userRoleCache[name.toLowerCase()] || 'player' });
            });
            // Fix casing from DOM
            all.forEach(u => {
                const domEl = [...document.querySelectorAll('#gc-msg-list .soc-msg-author, #soc-msg-list .soc-msg-author')]
                    .find(el => el.textContent.trim().toLowerCase() === u.username.toLowerCase());
                if (domEl) u.username = domEl.textContent.trim();
            });
            all.sort((a, b) => {
                const rd = _roleRank(a.role) - _roleRank(b.role);
                return rd !== 0 ? rd : a.username.toLowerCase().localeCompare(b.username.toLowerCase());
            });
            _candidates = _query ? all.filter(u => u.username.toLowerCase().startsWith(_query)) : all.slice(0, 10);
            _render();
            return;
        }

        // Mode @ mention
        _mode = 'at';
        const atPos = before.lastIndexOf('@');
        if (atPos === -1 || (atPos > 0 && !/\s/.test(val[atPos - 1]))) { _close(); return; }
        _query = before.slice(atPos + 1).toLowerCase();
        if (_query.includes(' ')) { _close(); return; }
        _activeInput = inp;
        _active = true;
        _selIdx = 0;
        const all = _getParticipants();
        _candidates = all.filter(u => u.username.toLowerCase().startsWith(_query));
        _render();
    }

    function _onKeydown(e) {
        if (!_active) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); _selIdx = (_selIdx + 1) % _candidates.length; _render(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); _selIdx = (_selIdx - 1 + _candidates.length) % _candidates.length; _render(); }
        else if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); _pick(_selIdx); }
        else if (e.key === 'Escape') _close();
    }

    function _attachTo(inputId) {
        const inp = document.getElementById(inputId);
        if (!inp) return;
        inp.addEventListener('input', _onInput);
        inp.addEventListener('keydown', _onKeydown, true);
        inp.addEventListener('blur', () => setTimeout(_close, 150));
    }

    document.addEventListener('DOMContentLoaded', () => {
        _attachTo('soc-input-text');
        _attachTo('gc-input-text');
        _applySanctionUI();
    });

    return { close: _close, getRoleMap: _getRoleMap };
})();

// Parse @mentions — returns 'direct' (named mention), 'everyone', or null
function _processMentions(text, myUsername) {
    if (!myUsername) return null;
    const mentioned = text.match(/@([\w.]+)/g)?.map(m => m.slice(1).toLowerCase()) || [];
    if (mentioned.includes(myUsername.toLowerCase())) return 'direct';
    if (mentioned.includes('everyone')) return 'everyone';
    return null;
}

function _getMentionColor(name) {
    if (name.toLowerCase() === 'everyone') return '#aaa';
    const key = name.toLowerCase();
    // Current user — always reliable
    if (currentUser && key === currentUser.username?.toLowerCase()) {
        return getRoleData(currentUser.role || 'player').color;
    }
    // Global user role cache (populated at login from /api/users)
    if (_userRoleCache[key]) return getRoleData(_userRoleCache[key]).color;
    return '#aaa';
}

function _renderBotCard(text) {
    const m = text.match(/^\[HEXA_BOT:([A-Za-z0-9+/=]+)\]$/);
    if (!m) return null;
    try {
        const data = JSON.parse(atob(m[1]));

        if (data.kind === 'mod_feedback') {
            if (data.success) {
                const icons = { mute: 'fa-microphone-slash', restricted: 'fa-lock', ban: 'fa-ban' };
                const labels = { mute: 'Muted', restricted: 'Restricted', ban: 'Banned' };
                const colors = { mute: '#f5a623', restricted: '#e74c3c', ban: '#c0392b' };
                const icon = icons[data.type] || 'fa-shield-halved';
                const label = labels[data.type] || data.type;
                const color = colors[data.type] || '#aaa';
                const expiresLine = data.expires
                    ? new Date(data.expires).toLocaleString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'Permanent';
                return `<div class="hexa-bot-card">
                    <div class="hexa-bot-card-header" style="border-left:3px solid ${color}">
                        <i class="fas ${icon}" style="color:${color}"></i>
                        <span class="hexa-bot-card-title" style="color:${color}">Action confirmed — ${label}</span>
                        <span class="hexa-bot-card-badge">MOD</span>
                    </div>
                    <div class="hexa-bot-card-body">
                        <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Player</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>
                        <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Reason</span><span class="hexa-bot-card-val">${escHtml(data.reason || 'No reason provided')}</span></div>
                        <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Duration</span><span class="hexa-bot-card-val">${escHtml(data.duration)}</span></div>
                        <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Expires</span><span class="hexa-bot-card-val">${expiresLine}</span></div>
                    </div>
                </div>`;
            } else {
                return `<div class="hexa-bot-card">
                    <div class="hexa-bot-card-header" style="border-left:3px solid #e74c3c">
                        <i class="fas fa-circle-xmark" style="color:#e74c3c"></i>
                        <span class="hexa-bot-card-title" style="color:#e74c3c">Action failed</span>
                        <span class="hexa-bot-card-badge">MOD</span>
                    </div>
                    <div class="hexa-bot-card-body">
                        <div class="hexa-bot-card-row hexa-bot-card-note"><i class="fas fa-triangle-exclamation"></i> ${escHtml(data.error || 'Unknown error')}</div>
                        ${data.target ? `<div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Target</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>` : ''}
                    </div>
                </div>`;
            }
        }

        if (data.kind === 'mod_feedback_lift') {
            if (data.success) {
                const icons = { mute: 'fa-microphone', restricted: 'fa-lock-open', ban: 'fa-circle-check' };
                const labels = { mute: 'Unmuted', restricted: 'Restriction lifted', ban: 'Unbanned' };
                const icon = icons[data.type] || 'fa-circle-check';
                const label = labels[data.type] || 'Sanction lifted';
                return `<div class="hexa-bot-card">
                    <div class="hexa-bot-card-header" style="border-left:3px solid #2ecc71">
                        <i class="fas ${icon}" style="color:#2ecc71"></i>
                        <span class="hexa-bot-card-title" style="color:#2ecc71">Action confirmed — ${label}</span>
                        <span class="hexa-bot-card-badge">MOD</span>
                    </div>
                    <div class="hexa-bot-card-body">
                        <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Player</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>
                    </div>
                </div>`;
            } else {
                return `<div class="hexa-bot-card">
                    <div class="hexa-bot-card-header" style="border-left:3px solid #e74c3c">
                        <i class="fas fa-circle-xmark" style="color:#e74c3c"></i>
                        <span class="hexa-bot-card-title" style="color:#e74c3c">Action failed</span>
                        <span class="hexa-bot-card-badge">MOD</span>
                    </div>
                    <div class="hexa-bot-card-body">
                        <div class="hexa-bot-card-row hexa-bot-card-note"><i class="fas fa-triangle-exclamation"></i> ${escHtml(data.error || 'Unknown error')}</div>
                        ${data.target ? `<div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Target</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>` : ''}
                    </div>
                </div>`;
            }
        }

        if (data.kind === 'unsanction') {
            const icons = { mute: 'fa-microphone', restricted: 'fa-lock-open', ban: 'fa-circle-check' };
            const labels = { mute: 'Unmute', restricted: 'Restriction lifted', ban: 'Unban' };
            const icon = icons[data.type] || 'fa-circle-check';
            const label = labels[data.type] || 'Sanction lifted';
            return `<div class="hexa-bot-card">
                <div class="hexa-bot-card-header" style="border-left:3px solid #2ecc71">
                    <i class="fas ${icon}" style="color:#2ecc71"></i>
                    <span class="hexa-bot-card-title" style="color:#2ecc71">${label}</span>
                    <span class="hexa-bot-card-badge">HEXA</span>
                </div>
                <div class="hexa-bot-card-body">
                    <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Player</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>
                    <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Moderator</span><span class="hexa-bot-card-val">${escHtml(data.mod)}</span></div>
                    <div class="hexa-bot-card-row hexa-bot-card-note"><i class="fas fa-triangle-exclamation"></i> Please follow the rules to avoid further sanctions.</div>
                </div>
            </div>`;
        }

        const icons = { mute: 'fa-microphone-slash', restricted: 'fa-lock', ban: 'fa-ban' };
        const labels = { mute: 'Mute', restricted: 'Restriction', ban: 'Ban' };
        const colors = { mute: '#f5a623', restricted: '#e74c3c', ban: '#c0392b' };
        const icon = icons[data.type] || 'fa-shield-halved';
        const label = labels[data.type] || data.type;
        const color = colors[data.type] || '#aaa';
        const expiresLine = data.expires
            ? new Date(data.expires).toLocaleString('en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Permanent';
        return `<div class="hexa-bot-card">
            <div class="hexa-bot-card-header" style="border-left:3px solid ${color}">
                <i class="fas ${icon}" style="color:${color}"></i>
                <span class="hexa-bot-card-title" style="color:${color}">${label}</span>
                <span class="hexa-bot-card-badge">HEXA</span>
            </div>
            <div class="hexa-bot-card-body">
                <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Player</span><span class="hexa-bot-card-val">${escHtml(data.target)}</span></div>
                <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Reason</span><span class="hexa-bot-card-val">${escHtml(data.reason)}</span></div>
                <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Duration</span><span class="hexa-bot-card-val">${escHtml(data.duration)}</span></div>
                <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Expires</span><span class="hexa-bot-card-val">${expiresLine}</span></div>
                <div class="hexa-bot-card-row"><span class="hexa-bot-card-key">Moderator</span><span class="hexa-bot-card-val">${escHtml(data.mod)}</span></div>
            </div>
        </div>`;
    } catch(_) { return null; }
}

// roleMap: optional { username_lower: role } built from message data (avoids DOM dependency)
function _renderWithMentions(text, myUsername, roleMap) {
    const botCard = _renderBotCard(text);
    if (botCard) return botCard;
    return _parseMessageContent(text).replace(/@([\w.]+)/g, (m, name) => {
        const isMe = myUsername && (name.toLowerCase() === myUsername.toLowerCase() || name.toLowerCase() === 'everyone');
        let color;
        if (name.toLowerCase() === 'everyone') {
            color = '#aaa';
        } else if (roleMap && roleMap[name.toLowerCase()]) {
            color = getRoleData(roleMap[name.toLowerCase()]).color;
        } else {
            color = _getMentionColor(name);
        }
        return `<span class="at-mention${isMe ? ' at-mention-me' : ''}" style="color:${color};background:${color}22;">${m}</span>`;
    });
}

window.sendChatMessage = async function() {
    if (_mySanctions.ban || _mySanctions.restricted) { window.notify('error', 'Restricted', 'You cannot send messages.'); return; }
    const input = document.getElementById('soc-input-text');
    const pendingUrls = _pendingImages.map(p => p.url);
    if (!input || !currentChatFriendId || (!input.value.trim() && pendingUrls.length === 0)) return;
    const textPart = input.value.trim();
    if (textPart.startsWith('/')) { window.notify('warning', 'Commands unavailable', 'Commands can only be used in the global chat.'); input.value = ''; return; }
    const text = [textPart, ...pendingUrls].filter(Boolean).join('\n');
    input.value = '';
    window._clearPendingImage();
    const replyId = dmReplyTo ? dmReplyTo.id : null;
    const replySnapshot = dmReplyTo;
    dmClearReply();

    // Optimistic: append message immediately
    const list = document.getElementById('soc-msg-list');
    const myName = currentUser ? currentUser.username : '?';
    const myRole = currentUser?.role || 'player';
    const nameColor = getRoleData(myRole).color || 'var(--text-color)';
    const avatarSrc = gcMyAvatarDataUrl || `https://minotar.net/helm/${myName}/64`;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2,'0') + ':' + now.getMinutes().toString().padStart(2,'0');
    const tempId = 'dm-temp-' + Date.now();
    let replyHtml = '';
    if (replySnapshot) {
        replyHtml = `<div class="gc-reply-ref">
            <i class="fas fa-reply gc-reply-ref-icon"></i>
            <span class="gc-reply-ref-author">${escHtml(replySnapshot.username)}</span>
            <span class="gc-reply-ref-text">${escHtml(replySnapshot.message.slice(0, 60))}</span>
        </div>`;
    }
    if (list) {
        list.insertAdjacentHTML('beforeend', `
            <div class="soc-msg gc-optimistic own" data-dm-id="${tempId}">
                <div class="soc-msg-content">
                    <img src="${escHtml(avatarSrc)}" class="soc-msg-avatar-small" style="image-rendering:pixelated">
                    <div class="soc-msg-body-col">
                        ${replyHtml}
                        <div class="soc-msg-header">
                            <span class="soc-msg-author" style="color:${nameColor}">${escHtml(myName)}</span>
                            ${buildRolePill(myRole, currentUser?.show_role_badge !== 0)}${buildCertBadge(currentUser?.microsoft_id)}
                            <span class="soc-msg-time">${timeStr}</span>
                        </div>
                        <div class="soc-msg-text">${_parseMessageContent(text)}</div>
                    </div>
                </div>
            </div>`);
        list.scrollTop = list.scrollHeight;
    }

    try {
        const res = await window.electron.sendMessage(currentChatFriendId, text, replyId);
        // Server returns { success, id } on success or { error } on failure
        const ok = res?.success === true || res?.id > 0;
        if (ok) {
            if (res?.id) {
                list?.querySelector(`[data-dm-id="${tempId}"]`)?.setAttribute('data-dm-id', res.id);
                if (res.id > dmLastKnownId) dmLastKnownId = res.id; // prevent timer from re-appending
            }
        } else {
            list?.querySelector(`[data-dm-id="${tempId}"]`)?.remove();
            const errMsg = res?.error || res?.message || 'Unable to send';
            console.error('[DM send failed]', res);
            window.notify?.('error', 'DM error', errMsg);
            input.value = text;
        }
    } catch(e) {
        list?.querySelector(`[data-dm-id="${tempId}"]`)?.remove();
        console.error('[DM send exception]', e);
        window.notify?.('error', 'DM error', e.message);
        input.value = text;
    }
    input.focus();
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

/* === CONTEXT MENU LOGIC === */
let activeMenuId = null;

window.toggleUserMenu = function(e, userId, username) {
    if(e) e.stopPropagation();
    
    // Check if menu exists, create if not
    let menu = document.getElementById('soc-context-menu-global');
    if(!menu) {
        menu = document.createElement('div');
        menu.id = 'soc-context-menu-global';
        menu.className = 'hex-context-menu';
        document.body.appendChild(menu);
    }
    
    // Toggle check
    if(activeMenuId === userId && menu.classList.contains('open')) {
        menu.classList.remove('open');
        activeMenuId = null;
        return;
    }
    
    activeMenuId = userId;
    
    // Inject Content
    menu.innerHTML = `
        <div class="ctx-item" onclick="window.setSocial('${username}', '', '', '', null, '${userId}'); document.getElementById('soc-context-menu-global').classList.remove('open');">
            <i class="fas fa-comment"></i> Send a message
        </div>
        <div class="ctx-item">
            <i class="fas fa-user-circle"></i> View profile
        </div>
        <div class="ctx-divider"></div>
        <div class="ctx-item danger" onclick="window.electron.removeFriend('${userId}'); document.getElementById('soc-context-menu-global').classList.remove('open'); loadSocialHubUsers();">
            <i class="fas fa-user-minus"></i> Remove friend
        </div>
         <div class="ctx-item danger">
            <i class="fas fa-ban"></i> Block
        </div>
    `;
    
    // Position
    const rect = e.target.getBoundingClientRect();
    let top = rect.bottom + 5;
    let left = rect.right - 180; // Align right edge
    
    if(left < 10) left = 10;
    
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    
    // Show
    menu.classList.add('open');
};

// Global click to close
window.addEventListener('click', (e) => {
    const menu = document.getElementById('soc-context-menu-global');
    if(menu && menu.classList.contains('open') && !menu.contains(e.target)) {
        menu.classList.remove('open');
        activeMenuId = null;
    }
});
