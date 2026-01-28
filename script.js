// Kombinierte Version - Fix für "Skin hinzufügen" & Sprach-Auswahl
// - Wenn auf "Skin hinzufügen" geklickt wird, wird zusätzlich direkt der Dateiauswahl-Dialog geöffnet.
// - Sprache Select hat nun Pointer-Events und einen Change-Handler (sichtbares Feedback).
// - Mehr Logging in der Konsole zur Fehlersuche.
//
// Benötigt: JSZip (global JSZip)

import { Skin3DRenderer, validateSkinFile } from './skin3d.js';

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

// Kombiniere Basis-Skin und Overlay zu finalem Skin (Base64)
async function combineSkinLayers(baseSkinBuffer, overlayBuffer = null) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');

      // Load base skin
      const baseImg = new Image();
      const baseUrl = bufferToObjectUrl(baseSkinBuffer);
      
      baseImg.onload = () => {
        // Draw base skin
        ctx.drawImage(baseImg, 0, 0, 64, 64);
        URL.revokeObjectURL(baseUrl);
        
        // If overlay exists, draw it on top
        if (overlayBuffer) {
          const overlayImg = new Image();
          const overlayUrl = bufferToObjectUrl(overlayBuffer);
          
          overlayImg.onload = () => {
            ctx.drawImage(overlayImg, 0, 0, 64, 64);
            URL.revokeObjectURL(overlayUrl);
            
            // Convert to base64
            const base64 = canvas.toDataURL('image/png');
            resolve(base64);
          };
          
          overlayImg.onerror = () => {
            URL.revokeObjectURL(overlayUrl);
            reject(new Error('Fehler beim Laden des Overlay-Skins'));
          };
          
          overlayImg.src = overlayUrl;
        } else {
          // No overlay, just return base64 of base skin
          const base64 = canvas.toDataURL('image/png');
          resolve(base64);
        }
      };
      
      baseImg.onerror = () => {
        URL.revokeObjectURL(baseUrl);
        reject(new Error('Fehler beim Laden des Basis-Skins'));
      };
      
      baseImg.src = baseUrl;
    } catch (e) {
      reject(e);
    }
  });
}

// Convert base64 data URL to ArrayBuffer
async function dataURLToArrayBuffer(dataURL) {
  const response = await fetch(dataURL);
  return await response.arrayBuffer();
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
let hasGeneratedInitialPlaceholders = false; // Track if initial placeholders were generated

// ----------------- localStorage Functions -----------------
// Convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

async function saveFormToLocalStorage() {
  try {
    const packNameInput = document.getElementById('packName');
    const packDescInput = document.getElementById('packDesc');
    const languageSelect = document.getElementById('language');
    
    // Convert skin PNG data to base64 for storage
    const skinsWithPNG = await Promise.all(skinsData.map(async s => {
      let pngBase64 = null;
      
      // Get PNG data from uploaded file or buffer
      if (s.uploadedFile) {
        const buffer = await s.uploadedFile.arrayBuffer();
        pngBase64 = arrayBufferToBase64(buffer);
      } else if (s.buffer) {
        pngBase64 = arrayBufferToBase64(s.buffer);
      }
      
      return {
        id: s.id,
        name: s.name,
        safeName: s.safeName,
        type: s.type,
        geometry: s.geometry,
        pngBase64: pngBase64 // Store PNG as base64
      };
    }));
    
    const formData = {
      packName: packNameInput?.value || '',
      packDesc: packDescInput?.value || '',
      language: languageSelect?.value || 'en_US',
      skins: skinsWithPNG,
      timestamp: Date.now()
    };
    
    localStorage.setItem('multiNotizenV5', JSON.stringify(formData));
    console.log('[mcbe] Form data saved to localStorage (including PNG data)');
  } catch (e) {
    console.warn('[mcbe] Failed to save to localStorage:', e);
  }
}

async function loadFormFromLocalStorage() {
  try {
    const saved = localStorage.getItem('multiNotizenV5');
    if (!saved) return null;
    
    const formData = JSON.parse(saved);
    
    // Convert base64 PNG data back to ArrayBuffer
    if (formData.skins) {
      for (const skin of formData.skins) {
        if (skin.pngBase64) {
          skin.buffer = base64ToArrayBuffer(skin.pngBase64);
          delete skin.pngBase64; // Clean up
        }
      }
    }
    
    console.log('[mcbe] Loaded form data from localStorage (including PNG data)');
    return formData;
  } catch (e) {
    console.warn('[mcbe] Failed to load from localStorage:', e);
    return null;
  }
}

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
    saveFormToLocalStorage();
  });
  
  // Auto-save form fields on change
  const packNameInput = document.getElementById('packName');
  const packDescInput = document.getElementById('packDesc');
  
  if (packNameInput) {
    packNameInput.addEventListener('input', () => saveFormToLocalStorage());
  }
  if (packDescInput) {
    packDescInput.addEventListener('input', () => saveFormToLocalStorage());
  }

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
    
    // Load the combined texture
    loadCombinedSkinTexture(zoomRenderer, skin).catch(e => {
      console.warn('[mcbe] Failed to load combined skin texture in zoom:', e);
    });
    
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

  // Helper function to load combined skin texture into renderer
  async function loadCombinedSkinTexture(renderer3D, skin) {
    try {
      let skinBuffer;
      
      if (skin.uploadedFile) {
        skinBuffer = await skin.uploadedFile.arrayBuffer();
      } else if (skin.buffer) {
        skinBuffer = skin.buffer;
      } else {
        return; // No texture to load
      }
      
      // For now, we just use the base skin (no overlay implementation yet)
      // In the future, you could add overlay support here
      const combinedBase64 = await combineSkinLayers(skinBuffer, null);
      await renderer3D.loadSkinTexture(combinedBase64);
    } catch (e) {
      console.warn('[mcbe] Failed to load combined skin texture:', e);
    }
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
      
      // Load combined skin texture if available
      loadCombinedSkinTexture(renderer3D, skin);
      
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
      saveFormToLocalStorage();
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
          
          // Update 3D preview with combined skin
          if (skin.renderer3D) {
            try {
              await loadCombinedSkinTexture(skin.renderer3D, skin);
            } catch (e) {
              console.warn('[mcbe] Failed to update 3D preview:', e);
            }
          }
          
          setStatus(`Skin "${skin.name}" erfolgreich hochgeladen (64x64px).`);
          await saveFormToLocalStorage();
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
      saveFormToLocalStorage();
    });

    right.appendChild(typeInput);
    right.appendChild(removeBtn);

    entry.appendChild(previewWrap);
    entry.appendChild(middle);
    entry.appendChild(right);

    skinsContainer.appendChild(entry);

    // Return useful references
    return { entry, fileInput, nameInput };
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
    saveFormToLocalStorage();
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
  async function preGeneratePlaceholders(forceRegenerate = false) {
    // Try to load from localStorage first
    if (!forceRegenerate) {
      const savedData = await loadFormFromLocalStorage();
      if (savedData) {
        setStatus('Lade gespeicherte Daten...');
        
        // Restore form fields
        const pn = document.getElementById('packName');
        const pd = document.getElementById('packDesc');
        if (pn) pn.value = savedData.packName || '';
        if (pd) pd.value = savedData.packDesc || '';
        if (languageSelect) languageSelect.value = savedData.language || 'en_US';
        
        // Restore skins with PNG data
        skinsData = [];
        for (const savedSkin of savedData.skins || []) {
          // Use saved buffer if available, otherwise create placeholder
          const buf = savedSkin.buffer || await createPlaceholderSkinPNG(64, 64, true);
          
          skinsData.push({
            id: savedSkin.id || makeUUID(),
            name: savedSkin.name || `Skin-${randHex(4)}`,
            safeName: savedSkin.safeName || safeFileName(savedSkin.name),
            buffer: buf,
            uploadedFile: null,
            textureFile: `skin-${skinsData.length + 1}.png`,
            type: savedSkin.type || 'free',
            geometry: savedSkin.geometry || 'geometry.humanoid.customSlim'
          });
        }
        
        if (skinsData.length > 0) {
          populateFormFromGenerated();
          setStatus('Gespeicherte Daten geladen (inkl. PNG-Dateien).');
          hasGeneratedInitialPlaceholders = true;
          return;
        }
      }
    }
    
    // Generate new placeholders
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
    await saveFormToLocalStorage();
    hasGeneratedInitialPlaceholders = true;
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
    if (confirm('Möchten Sie alle Daten löschen und neu generieren? Dies kann nicht rückgängig gemacht werden.')) {
      // Clear all localStorage
      localStorage.clear();
      // Reload the page
      location.reload();
    }
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await buildPackAndDownload();
  });

  // ----------------- Comments System -----------------
  let comments = [];
  
  // Load comments from localStorage
  function loadComments() {
    try {
      const saved = localStorage.getItem('mcbe_comments');
      if (saved) {
        comments = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[mcbe] Failed to load comments:', e);
    }
  }
  
  // Save comments to localStorage
  function saveComments() {
    try {
      localStorage.setItem('mcbe_comments', JSON.stringify(comments));
    } catch (e) {
      console.warn('[mcbe] Failed to save comments:', e);
    }
  }
  
  // Render comments
  function renderComments() {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    
    if (comments.length === 0) {
      commentsList.innerHTML = '<p class="muted">Noch keine Kommentare. Sei der Erste!</p>';
      return;
    }
    
    commentsList.innerHTML = comments.map(comment => {
      const date = new Date(comment.timestamp);
      const dateStr = date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      
      let repliesHTML = '';
      if (comment.replies && comment.replies.length > 0) {
        repliesHTML = comment.replies.map(reply => {
          const replyDate = new Date(reply.timestamp);
          const replyDateStr = replyDate.toLocaleDateString('de-DE') + ' ' + replyDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="comment comment-reply">
              <div class="comment-header">
                <span class="comment-author">${escapeHtml(reply.name)}</span>
                <span class="comment-date">${replyDateStr}</span>
              </div>
              <div class="comment-text">${escapeHtml(reply.text)}</div>
            </div>
          `;
        }).join('');
      }
      
      return `
        <div class="comment" data-id="${comment.id}">
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(comment.name)}</span>
            <span class="comment-date">${dateStr}</span>
          </div>
          <div class="comment-text">${escapeHtml(comment.text)}</div>
          <div class="comment-actions">
            <button type="button" class="reply-btn" data-id="${comment.id}">Antworten</button>
          </div>
          ${repliesHTML}
          <div class="reply-form-container" data-id="${comment.id}" style="display: none;"></div>
        </div>
      `;
    }).join('');
    
    // Add event listeners for reply buttons
    document.querySelectorAll('.reply-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const commentId = e.target.dataset.id;
        showReplyForm(commentId);
      });
    });
  }
  
  // Escape HTML to prevent XSS
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Show reply form
  function showReplyForm(commentId) {
    const container = document.querySelector(`.reply-form-container[data-id="${commentId}"]`);
    if (!container) return;
    
    container.style.display = 'block';
    container.innerHTML = `
      <div class="reply-form">
        <h4 style="margin: 0 0 8px 0; font-size: 14px; color: var(--muted);">Antwort schreiben</h4>
        <input type="text" class="reply-name" placeholder="Dein Name" required />
        <textarea class="reply-text" rows="3" placeholder="Deine Antwort..." required></textarea>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="submit-reply" style="flex: 1;">Absenden</button>
          <button type="button" class="cancel-reply" style="flex: 1; background: transparent; color: var(--muted);">Abbrechen</button>
        </div>
      </div>
    `;
    
    container.querySelector('.submit-reply').addEventListener('click', () => {
      const nameInput = container.querySelector('.reply-name');
      const textInput = container.querySelector('.reply-text');
      
      if (!nameInput.value.trim() || !textInput.value.trim()) {
        alert('Bitte Name und Text eingeben.');
        return;
      }
      
      addReply(commentId, nameInput.value.trim(), textInput.value.trim());
      container.style.display = 'none';
    });
    
    container.querySelector('.cancel-reply').addEventListener('click', () => {
      container.style.display = 'none';
    });
  }
  
  // Add reply
  function addReply(commentId, name, text) {
    const comment = comments.find(c => c.id === commentId);
    if (!comment) return;
    
    if (!comment.replies) {
      comment.replies = [];
    }
    
    comment.replies.push({
      id: makeUUID(),
      name,
      text,
      timestamp: Date.now()
    });
    
    saveComments();
    renderComments();
    setStatus('Antwort hinzugefügt.');
  }
  
  // Send email notification via EmailJS
  async function sendEmailNotification(commentData) {
    // Check if emailjs is available
    if (typeof emailjs === 'undefined') {
      console.warn('[mcbe] EmailJS not loaded - skipping email notification');
      return;
    }
    
    try {
      // Template parameters for EmailJS
      // You need to create a template in EmailJS dashboard
      // Template should have variables: from_name, message, reply_to
      const templateParams = {
        from_name: commentData.name,
        message: commentData.text,
        reply_to: 'noreply@example.com', // Change this to actual email
        to_name: 'Minecraft-Julian'
      };
      
      // Replace 'service_hlviq2s' and 'template_e2w76gj' with actual values from EmailJS
      await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams);
      console.log('[mcbe] Email notification sent successfully');
    } catch (error) {
      console.warn('[mcbe] Failed to send email notification:', error);
      // Don't show error to user - notification failure shouldn't block comment posting
    }
  }
  
  // Add new comment
  async function addComment(name, text) {
    const newComment = {
      id: makeUUID(),
      name,
      text,
      timestamp: Date.now(),
      replies: []
    };
    
    comments.unshift(newComment); // Add to beginning
    saveComments();
    renderComments();
    
    // Send email notification asynchronously
    sendEmailNotification(newComment).catch(e => {
      console.warn('[mcbe] Email notification error:', e);
    });
    
    setStatus('Kommentar hinzugefügt.');
  }
  
  // Initialize comments system
  const submitCommentBtn = document.getElementById('submitComment');
  if (submitCommentBtn) {
    submitCommentBtn.addEventListener('click', () => {
      const nameInput = document.getElementById('commentName');
      const textInput = document.getElementById('commentText');
      
      if (!nameInput || !textInput) return;
      
      const name = nameInput.value.trim();
      const text = textInput.value.trim();
      
      if (!name || !text) {
        alert('Bitte Name und Kommentar eingeben.');
        return;
      }
      
      addComment(name, text);
      
      // Clear form
      nameInput.value = '';
      textInput.value = '';
    });
  }
  
  // Load and render comments on page load
  loadComments();
  renderComments();

  // ----------------- Start -----------------
  preGeneratePlaceholders().catch(e => {
    console.error('[mcbe] preGeneratePlaceholders failed', e);
    setStatus('Fehler beim Erzeugen der Platzhalter: ' + (e && e.message));
  });
});
