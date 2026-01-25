// Debugging-freundliche Version: stellt sicher, dass init läuft und loggt alles
// Benötigt: JSZip (global JSZip)

(function () {
  // Utility: safe filename
  function safeFileName(name) {
    return (name || 'skinpack')
      .replace(/\s+/g, '-')
      .replace(/[^a-zA-Z0-9_\-\.]/g, '')
      .replace(/\-+/g, '-')
      .toLowerCase()
      .slice(0, 64) || 'skinpack';
  }

  // UUID generator with fallback
  function makeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    let bytes = new Array(16).fill(0).map(() => Math.floor(Math.random()*256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((b,i)=> (i===4||i===6||i===8||i===10? '-' : '') + b.toString(16).padStart(2,'0')).join('');
  }

  // Create or get a debug panel on the page to show init state and errors
  function ensureDebugPanel() {
    let panel = document.getElementById('mcbe-debug-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mcbe-debug-panel';
      panel.style.position = 'fixed';
      panel.style.right = '12px';
      panel.style.bottom = '12px';
      panel.style.zIndex = 99999;
      panel.style.background = 'rgba(0,0,0,0.6)';
      panel.style.color = '#fff';
      panel.style.padding = '8px 10px';
      panel.style.fontSize = '12px';
      panel.style.borderRadius = '6px';
      panel.style.maxWidth = '320px';
      panel.style.boxShadow = '0 6px 20px rgba(0,0,0,0.6)';
      panel.innerText = 'MCBE Debug: initializing...';
      document.body.appendChild(panel);
    }
    return panel;
  }

  const debugPanel = () => {
    try { return document.getElementById('mcbe-debug-panel') || ensureDebugPanel(); }
    catch (e) { return null; }
  };

  // Safe init function (called on DOMContentLoaded or immediately if document already ready)
  function init() {
    const panel = ensureDebugPanel();
    function log(msg) {
      console.log('[mcbe]', msg);
      if (panel) {
        panel.innerText = typeof msg === 'string' ? `MCBE Debug:\n${msg}` : `MCBE Debug:\n${JSON.stringify(msg)}`;
      }
    }

    try {
      log('init start');

      const form = document.getElementById('packForm');
      const statusEl = document.getElementById('status');
      const skinsContainer = document.getElementById('skinsContainer');
      const addSkinBtn = document.getElementById('addSkinBtn');
      const languageSelect = document.getElementById('language');

      // Report presence/absence of elements
      log({
        packForm: !!form,
        status: !!statusEl,
        skinsContainer: !!skinsContainer,
        addSkinBtn: !!addSkinBtn,
        languageSelect: !!languageSelect,
        jszip: typeof JSZip !== 'undefined'
      });

      if (!form) throw new Error('Element #packForm nicht gefunden');
      if (!skinsContainer) throw new Error('Element #skinsContainer nicht gefunden');
      if (!addSkinBtn) throw new Error('Element #addSkinBtn nicht gefunden');
      if (!languageSelect) throw new Error('Element #language nicht gefunden');

      // Ensure addSkinBtn is enabled and clickable
      addSkinBtn.disabled = false;
      addSkinBtn.style.pointerEvents = 'auto';
      addSkinBtn.style.cursor = 'pointer';

      // Populate languages (small set + you can extend)
      const LANGS = [
        "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
        "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
        "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO"
      ];
      languageSelect.innerHTML = '';
      LANGS.forEach(l => {
        const o = document.createElement('option');
        o.value = l;
        o.textContent = l;
        languageSelect.appendChild(o);
      });
      languageSelect.value = 'en_US';

      // Basic skin entry creation (keeps it simple)
      let skinIndex = 0;
      function createSkinEntry({name = ''} = {}) {
        const idx = ++skinIndex;
        const root = document.createElement('div');
        root.className = 'skin-entry';
        root.dataset.idx = idx;
        root.style.display = 'flex';
        root.style.justifyContent = 'space-between';
        root.style.gap = '8px';
        root.style.marginBottom = '8px';
        root.style.padding = '8px';
        root.style.border = '1px dashed rgba(255,255,255,0.06)';
        root.style.borderRadius = '6px';
        // left (inputs)
        const left = document.createElement('div');
        left.style.flex = '1';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Skin-Name';
        nameInput.value = name;
        nameInput.required = true;
        nameInput.style.width = '100%';
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png';
        fileInput.required = true;
        fileInput.style.marginTop = '6px';
        left.appendChild(nameInput);
        left.appendChild(fileInput);
        // right (remove)
        const right = document.createElement('div');
        right.style.display = 'flex';
        right.style.flexDirection = 'column';
        right.style.gap = '6px';
        const typeInput = document.createElement('input');
        typeInput.type = 'text';
        typeInput.value = 'free';
        typeInput.readOnly = true;
        typeInput.style.width = '110px';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Entfernen';
        remove.style.cursor = 'pointer';
        remove.addEventListener('click', () => {
          if (skinsContainer.contains(root)) skinsContainer.removeChild(root);
        });
        right.appendChild(typeInput);
        right.appendChild(remove);

        root.appendChild(left);
        root.appendChild(right);
        skinsContainer.appendChild(root);
        return {root, nameInput, fileInput, typeInput};
      }

      // create initial entry
      createSkinEntry();

      // attach click handler; also attach an inline onclick as fallback
      function safeAddSkinHandler() {
        try {
          createSkinEntry();
          log('Skin entry hinzugefügt');
        } catch (e) {
          console.error(e);
          log('Fehler beim Hinzufügen eines Skins: ' + (e && e.message));
        }
      }

      // Remove existing listeners by cloning node (safer if duplicate scripts attached)
      const cleanAddBtn = addSkinBtn.cloneNode(true);
      addSkinBtn.parentNode.replaceChild(cleanAddBtn, addSkinBtn);
      cleanAddBtn.addEventListener('click', safeAddSkinHandler);
      // also set onclick property (fallback)
      cleanAddBtn.onclick = safeAddSkinHandler;

      log('addSkinBtn listener attached');

      // minimal gatherSkins function
      function gatherSkins() {
        const entries = Array.from(skinsContainer.querySelectorAll('.skin-entry'));
        const skins = [];
        for (const e of entries) {
          const nameInput = e.querySelector('input[type="text"]');
          const fileInput = e.querySelector('input[type="file"]');
          if (!nameInput || !fileInput) continue;
          const name = nameInput.value.trim();
          const files = fileInput.files;
          if (!name || !files || files.length === 0) continue;
          skins.push({ name, file: files[0], type: 'free' });
        }
        return skins;
      }

      // form submit - lightweight (does not use JSZip here, just logs)
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const packName = (document.getElementById('packName') && document.getElementById('packName').value) || 'skinpack';
        const packDesc = (document.getElementById('packDesc') && document.getElementById('packDesc').value) || '';
        const lang = (document.getElementById('language') && document.getElementById('language').value) || 'en_US';
        const skins = gatherSkins();
        log({ action: 'submit', packName, packDesc, lang, skinsCount: skins.length });
        if (skins.length === 0) {
          if (statusEl) statusEl.textContent = 'Bitte mindestens einen Skin hinzufügen (Name + PNG)';
          return;
        }
        // If JSZip not available, inform the user
        if (typeof JSZip === 'undefined') {
          const msg = 'JSZip nicht geladen — ZIP-Erzeugung nicht möglich. Prüfe Netzwerk/Console.';
          log(msg);
          if (statusEl) statusEl.textContent = msg;
          return;
        }
        // otherwise call existing pack builder (if included) or do minimal feedback
        if (statusEl) statusEl.textContent = 'Alles bereit — JSZip vorhanden. Pack wird generiert (nicht in Debug-Skript).';
        // NOTE: In this debug version we do not re-implement full pack generation here.
      });

      log('init complete — UI ready');
    } catch (err) {
      console.error('MCBE init error', err);
      const panel = debugPanel();
      if (panel) panel.innerText = `MCBE Debug:\nFehler: ${err.message || err}`;
    }
  }

  // Run init either immediately if ready or on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // already ready
    try { init(); } catch (e) { console.error(e); }
  }

  // Global error handler to write to debug panel
  window.addEventListener('error', (ev) => {
    try {
      const p = ensureDebugPanel();
      p.innerText = `MCBE Debug:\nUncaught error: ${ev.message}`;
    } catch (e) {}
  });
})();
