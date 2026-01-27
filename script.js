// Kombinierte Version - Fix für "Skin hinzufügen" & Sprach-Auswahl
// - Wenn auf "Skin hinzufügen" geklickt wird, wird zusätzlich direkt der Dateiauswahl-Dialog geöffnet.
// - Sprache Select hat nun Pointer-Events und einen Change-Handler (sichtbares Feedback).
// - Mehr Logging in der Konsole zur Fehlersuche.
//
// Benötigt: JSZip (global JSZip)

// ----------------- Utilities -----------------
function safeFileName(name) {
  return (name || 'skinpack')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '')
    .replace(/\-+/g, '-')
    .toLowerCase()
    .slice(0, 64) || 'skinpack';
}

function makeUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
}

function randHex(len = 6) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function bufferToObjectUrl(buffer) {
  const blob = new Blob([buffer], { type: 'image/png' });
  return URL.createObjectURL(blob);
}

// Erzeuge Platzhalter-Skin (Canvas) -> Promise<ArrayBuffer>
function createPlaceholderSkinPNG(width = 64, height = 64, drawX = true) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      const bg = `hsl(${Math.floor(Math.random() * 360)}, 60%, 65%)`;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      if (drawX) {
        ctx.strokeStyle = '#111';
        ctx.lineWidth = Math.max(4, Math.floor(width / 12));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(width * 0.15, height * 0.15);
        ctx.lineTo(width * 0.85, height * 0.85);
        ctx.moveTo(width * 0.85, height * 0.15);
        ctx.lineTo(width * 0.15, height * 0.85);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${Math.max(8, Math.floor(width / 8))}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(randHex(3), width - 4, height - 6);

      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Blob creation failed'));
        const ab = await blob.arrayBuffer();
        resolve(ab);
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

// ----------------- Globals & Config -----------------
const LANGS = [
  "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
  "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
  "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO",
  "ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA"
];

let generatedPack = null;
let skinsData = []; // { id, name, safeName, buffer, uploadedFile, textureFile, type, geometry }

// ----------------- DOM & Init -----------------
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('packForm');
  const statusEl = document.getElementById('status');
  const skinsContainer = document.getElementById('skinsContainer');
  const addSkinBtn = document.getElementById('addSkinBtn');
  const languageSelect = document.getElementById('language');
  const regenBtn = document.getElementById('regenBtn');
  const autoDownloadCheckbox = document.getElementById('autoDownloadOnLoad');

  if (!form || !skinsContainer || !addSkinBtn || !languageSelect || !statusEl) {
    console.error('[mcbe] Missing required DOM elements', { form: !!form, skinsContainer: !!skinsContainer, addSkinBtn: !!addSkinBtn, languageSelect: !!languageSelect, statusEl: !!statusEl });
    if (statusEl) statusEl.textContent = 'Fehler: Seite nicht korrekt geladen (siehe Konsole).';
    return;
  }

  // ensure select is interactable
  languageSelect.style.pointerEvents = 'auto';
  languageSelect.tabIndex = 0;

  // populate language select
  LANGS.forEach(l => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    languageSelect.appendChild(o);
  });
  languageSelect.value = 'en_US';
  languageSelect.addEventListener('change', () => {
    setStatus(`Sprache gewählt: ${languageSelect.value}`);
    console.log('[mcbe] language changed:', languageSelect.value);
  });

  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
    console.log('[mcbe]', t);
  }

  // Create zoom modal for 3D skin preview
  function createZoomModal(skin, originalRenderer) {
    const modal = document.createElement('div');
    modal.className = 'skin-zoom-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', '3D Skin Vorschau');
    modal.setAttribute('aria-modal', 'true');
    
    const content = document.createElement('div');
    content.className = 'skin-zoom-content';
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'skin-zoom-close';
    closeBtn.innerHTML = '×';
    closeBtn.setAttribute('aria-label', 'Schließen');
    
    const canvas3DContainer = document.createElement('div');
    
    // Create a new 3D renderer for zoom mode
    const zoomRenderer = new Skin3DRenderer(canvas3DContainer, {
      width: 400,
      height: 400,
      autoRotate: false
    });
    
    // Enable orbit controls
    zoomRenderer.controls.enabled = true;
    
    // Load the same texture
    if (skin.uploadedFile) {
      zoomRenderer.loadSkinTexture(skin.uploadedFile).catch(e => {
        console.warn('[mcbe] Failed to load skin texture in zoom:', e);
      });
    } else if (skin.buffer) {
      const blob = new Blob([skin.buffer], { type: 'image/png' });
      zoomRenderer.loadSkinTexture(blob).catch(e => {
        console.warn('[mcbe] Failed to load texture in zoom:', e);
      });
    }
    
    const info = document.createElement('div');
    info.className = 'skin-zoom-info';
    info.textContent = 'Ziehen zum Drehen • Scrollrad zum Zoomen';
    
    const closeModal = () => {
      zoomRenderer.dispose();
      document.body.removeChild(modal);
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
    
    // Keyboard support
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    
    content.appendChild(closeBtn);
    content.appendChild(canvas3DContainer);
    content.appendChild(info);
    modal.appendChild(content);
    
    return modal;
  }

  // create DOM entry for skin and return fileInput so caller can open it
  function createSkinEntryDOM(skin) {
    const entry = document.createElement('div');
    entry.className = 'skin-entry';
    entry.dataset.id = skin.id;

    // Preview with 3D renderer
    const previewWrap = document.createElement('div');
    previewWrap.className = 'preview';
    previewWrap.setAttribute('role', 'button');
    previewWrap.setAttribute('tabindex', '0');
    previewWrap.setAttribute('aria-label', 'Klicken für 3D-Vorschau');
    
    // Create 3D renderer
    let renderer3D = null;
    try {
      renderer3D = new Skin3DRenderer(previewWrap, {
        width: 80,
        height: 80,
        autoRotate: true
      });
      
      // Load skin texture if available
      if (skin.uploadedFile) {
        renderer3D.loadSkinTexture(skin.uploadedFile).catch(e => {
          console.warn('[mcbe] Failed to load skin texture:', e);
        });
      } else if (skin.buffer) {
        const blob = new Blob([skin.buffer], { type: 'image/png' });
        renderer3D.loadSkinTexture(blob).catch(e => {
          console.warn('[mcbe] Failed to load placeholder texture:', e);
        });
      }
      
      // Store renderer reference
      skin.renderer3D = renderer3D;
      
      // Click handler for zoom mode
      const openZoomModal = () => {
        const modal = createZoomModal(skin, renderer3D);
        document.body.appendChild(modal);
      };
      
      previewWrap.addEventListener('click', openZoomModal);
      previewWrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openZoomModal();
        }
      });
      
    } catch (e) {
      console.error('[mcbe] Failed to create 3D renderer:', e);
      // Fallback to 2D image
      const img = document.createElement('img');
      img.alt = skin.name || 'preview';
      if (skin.uploadedFile) {
        img.src = URL.createObjectURL(skin.uploadedFile);
      } else if (skin.buffer) {
        img.src = bufferToObjectUrl(skin.buffer);
      }
      previewWrap.appendChild(img);
    }

    // middle
    const middle = document.createElement('div');
    middle.className = 'middle';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = skin.name || '';
    nameInput.placeholder = 'Skin-Name';
    nameInput.addEventListener('input', () => {
      skin.name = nameInput.value.trim();
      skin.safeName = safeFileName(skin.name);
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png';
    fileInput.style.cursor = 'pointer';
    fileInput.addEventListener('change', async () => {
      if (fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        
        // Validate file
        try {
          await validateSkinFile(file);
          
          skin.uploadedFile = file;
          
          // Update 3D preview
          if (skin.renderer3D) {
            try {
              await skin.renderer3D.loadSkinTexture(file);
            } catch (e) {
              console.warn('[mcbe] Failed to update 3D preview:', e);
            }
          }
          
          setStatus(`Skin "${skin.name}" erfolgreich hochgeladen (64x64px).`);
        } catch (error) {
          setStatus(`Fehler: ${error.message}`);
          fileInput.value = ''; // Reset file input
        }
      }
    });

    const small = document.createElement('small');
    small.className = 'muted';
    small.textContent = 'Typ: free • Geometrie: humanoid.customSlim';

    middle.appendChild(nameInput);
    middle.appendChild(fileInput);
    middle.appendChild(small);

    // right
    const right = document.createElement('div');
    right.className = 'right';
    const typeInput = document.createElement('input');
    typeInput.type = 'text';
    typeInput.value = skin.type || 'free';
    typeInput.readOnly = true;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'ghost';
    removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      // Cleanup 3D renderer
      if (skin.renderer3D) {
        skin.renderer3D.dispose();
      }
      skinsData = skinsData.filter(s => s.id !== skin.id);
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    });

    right.appendChild(typeInput);
    right.appendChild(removeBtn);

    entry.appendChild(previewWrap);
    entry.appendChild(middle);
    entry.appendChild(right);

    skinsContainer.appendChild(entry);

    // Return useful references
    return { entry, fileInput, img, nameInput };
  }

  // Add a new skin entry (optionally open the file dialog immediately)
  async function addNewSkinEntry(openFileDialog = false) {
    const name = `Skin-${randHex(4)}`;
    const safeName = safeFileName(name);
    const buf = await createPlaceholderSkinPNG(64, 64, true);
    const s = {
      id: makeUUID(),
      name,
      safeName,
      buffer: buf,
      uploadedFile: null,
      textureFile: `skin-${skinsData.length + 1}.png`,
      type: 'free',
      geometry: 'geometry.humanoid.customSlim'
    };
    skinsData.push(s);
    const { fileInput } = createSkinEntryDOM(s);
    // If requested, open the file picker immediately (must be in user gesture context)
    if (openFileDialog) {
      try {
        // Slight delay to ensure input is in DOM
        setTimeout(() => {
          fileInput && fileInput.click();
          console.log('[mcbe] triggered fileInput.click() for new skin entry');
        }, 10);
      } catch (e) {
        console.warn('[mcbe] could not open file dialog programmatically', e);
      }
    }
  }

  // Populate UI from generatedPack / skinsData
  function populateFormFromGenerated() {
    skinsContainer.innerHTML = '';
    skinsData.forEach((s) => createSkinEntryDOM(s));
    if (skinsData.length === 0) addNewSkinEntry();
  }

  // Pre-generate placeholders and pre-fill form
  async function preGeneratePlaceholders() {
    setStatus('Erzeuge Platzhalter für Skinpack...');
    const packBase = `skinpack-${randHex(6)}`;
    const packName = `Pack ${randHex(4)}`;
    const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
    const lang = languageSelect.value || 'en_US';

    const skinCount = 2;
    const tempSkins = [];
    for (let i = 0; i < skinCount; i++) {
      const name = `Skin-${randHex(4)}`;
      const safeName = safeFileName(name);
      const buf = await createPlaceholderSkinPNG(64, 64, true);
      tempSkins.push({
        id: makeUUID(),
        name,
        safeName,
        buffer: buf,
        uploadedFile: null,
        textureFile: `skin-${i + 1}.png`,
        type: 'free',
        geometry: 'geometry.humanoid.customSlim'
      });
    }

    generatedPack = { packBase, packName, packDesc, lang, skins: tempSkins };
    skinsData = tempSkins.map(s => ({ ...s }));
    // Fill form fields
    const pn = document.getElementById('packName');
    const pd = document.getElementById('packDesc');
    if (pn) pn.value = generatedPack.packName;
    if (pd) pd.value = generatedPack.packDesc;

    populateFormFromGenerated();
    setStatus('Platzhalter erzeugt.');
    // Auto-download handled elsewhere if desired
  }

  // Build & download (same as before)
  async function buildPackAndDownload(options = {}) {
    try {
      setStatus('Erzeuge Skinpack...');

      if (typeof JSZip === 'undefined') {
        setStatus('Fehler: JSZip nicht geladen.');
        return;
      }

      const packNameInput = document.getElementById('packName');
      const packDescInput = document.getElementById('packDesc');
      const langSelect = document.getElementById('language');

      const packName = (packNameInput && packNameInput.value.trim()) || (generatedPack && generatedPack.packName) || `Pack-${randHex(4)}`;
      const packDesc = (packDescInput && packDescInput.value.trim()) || (generatedPack && generatedPack.packDesc) || '';
      const lang = (langSelect && langSelect.value) || 'en_US';

      const safePack = safeFileName(packName) || `skinpack-${randHex(4)}`;
      const rootFolderName = `${safePack}.mcpack/`;
      const packUuid = makeUUID();
      const moduleUuid = makeUUID();

      // gather final skins in DOM order
      const finalSkins = [];
      const entries = Array.from(document.querySelectorAll('.skin-entry'));
      let idx = 0;
      for (const entry of entries) {
        const id = entry.dataset.id;
        const s = skinsData.find(x => x.id === id);
        if (!s) continue;
        const fileInput = entry.querySelector('input[type="file"]');
        let fileBuffer = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          fileBuffer = await fileInput.files[0].arrayBuffer();
        } else if (s.uploadedFile) {
          fileBuffer = await s.uploadedFile.arrayBuffer();
        } else if (s.buffer) {
          fileBuffer = s.buffer;
        } else {
          fileBuffer = await createPlaceholderSkinPNG(64,64,true);
        }
        idx++;
        finalSkins.push({
          name: s.name || `skin-${idx}`,
          safeName: s.safeName || safeFileName(s.name || `skin-${idx}`),
          buffer: fileBuffer,
          textureFile: `skin-${idx}.PNG`,
          type: s.type || 'free',
          geometry: s.geometry || 'geometry.humanoid.customSlim',
          uuid: makeUUID()
        });
      }

      if (finalSkins.length === 0) {
        setStatus('Bitte mindestens einen Skin einfügen.');
        return;
      }

      const manifest = {
        format_version: 2,
        header: {
          name: packName,
          description: packDesc,
          uuid: packUuid,
          version: [1, 0, 0],
          min_engine_version: [1, 20, 0]
        },
        modules: [
          {
            type: "skin_pack",
            uuid: moduleUuid,
            version: [1, 0, 0]
          }
        ]
      };

      const skinsJson = {
        skins: finalSkins.map(s => ({
          localization_name: `${safePack}.skin.${s.safeName}`,
          geometry: s.geometry,
          texture: s.textureFile,
          type: s.type
        })),
        serialize_name: safePack,
        localization_name: packName
      };

      const lines = [];
      lines.push(`${safePack}.pack.title=${packName}`);
      finalSkins.forEach(s => lines.push(`${safePack}.skin.${s.safeName}=${s.name}`));
      const langContents = lines.join('\n');

      setStatus('Erzeuge ZIP-Struktur mit JSZip...');
      const zip = new JSZip();
      const root = zip.folder(rootFolderName);
      root.file('manifest.json', JSON.stringify(manifest, null, 2));
      root.file('skins.json', JSON.stringify(skinsJson, null, 2));
      for (let i = 0; i < finalSkins.length; i++) {
        const f = finalSkins[i];
        root.file(f.textureFile, f.buffer, { binary: true });
      }
      const textsFolder = root.folder('texts');
      textsFolder.file(`${lang}.lang`, langContents);

      setStatus('Packe Dateien (ZIP)...');
      const contentBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const filename = options.autoFilename || `${safePack}.mcpack`;
      const url = URL.createObjectURL(contentBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus(`Fertig — Download gestartet: ${filename}`);
    } catch (err) {
      console.error('[mcbe] build error', err);
      setStatus('Fehler: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // ----------------- Event Listeners -----------------
  // When user clicks "Skin hinzufügen" -> create entry AND immediately open file picker
  addSkinBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    // create + open file dialog
    addNewSkinEntry(true).catch(e => {
      console.error('[mcbe] addNewSkinEntry failed', e);
      setStatus('Fehler beim Hinzufügen eines neuen Skins (Konsole prüfen).');
    });
  });

  regenBtn.addEventListener('click', async () => {
    setStatus('Erzeuge neue Platzhalter für Skins...');
    for (const s of skinsData) {
      if (!s.uploadedFile) {
        s.buffer = await createPlaceholderSkinPNG(64,64,true);
        
        // Update 3D preview
        if (s.renderer3D) {
          try {
            const blob = new Blob([s.buffer], { type: 'image/png' });
            await s.renderer3D.loadSkinTexture(blob);
          } catch (e) {
            console.warn('[mcbe] Failed to update 3D preview:', e);
          }
        }
      }
    }
    setStatus('Neue Platzhalter wurden erzeugt.');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await buildPackAndDownload();
  });

  // ----------------- Start -----------------
  preGeneratePlaceholders().catch(e => {
    console.error('[mcbe] preGeneratePlaceholders failed', e);
    setStatus('Fehler beim Erzeugen der Platzhalter: ' + (e && e.message));
  });
});
