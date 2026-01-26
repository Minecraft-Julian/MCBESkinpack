// Platzhalter-X Variante - Validation, Vorschau, Fullscreen-Viewer mit Drag-Rotation,
// Mehrere Skins, Sprache-Auswahl, Vor-Erzeugung beim Laden, JSZip-Pack-Generierung.

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
  const chars = '0123456789abcdef'; let s = ''; for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s;
}
function bufferToObjectUrl(buffer) { const blob = new Blob([buffer], { type: 'image/png' }); return URL.createObjectURL(blob); }

// Allowed dimensions for skins
const ALLOWED_SIZES = [{ w:64,h:32},{ w:64,h:64},{ w:128,h:128 }];

// Create placeholder PNG with big "X" (returns ArrayBuffer)
function createPlaceholderSkinPNG(width = 64, height = 64) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');

      // background
      const bg = `hsl(${Math.floor(Math.random()*360)},60%,70%)`;
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,width,height);

      // big X
      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(6, Math.floor(width/10));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(width*0.15, height*0.15);
      ctx.lineTo(width*0.85, height*0.85);
      ctx.moveTo(width*0.85, height*0.15);
      ctx.lineTo(width*0.15, height*0.85);
      ctx.stroke();

      // small hex label
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${Math.max(8, Math.floor(width/8))}px sans-serif`;
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

// Validate uploaded file: PNG extension/type + dimensions
async function validateSkinFile(file) {
  if (!file) return { ok:false, msg:'Keine Datei' };
  const name = (file.name || '').toLowerCase();
  if (!name.endsWith('.png') && file.type !== 'image/png') return { ok:false, msg:'Nur PNG-Dateien sind erlaubt.' };

  const url = URL.createObjectURL(file);
  const img = new Image();
  const p = new Promise(resolve => {
    img.onload = () => {
      const w = img.width, h = img.height;
      URL.revokeObjectURL(url);
      const ok = ALLOWED_SIZES.some(s => s.w === w && s.h === h);
      if (!ok) resolve({ ok:false, msg:`Ungültige Bildgröße ${w}×${h}. Erlaubt: ${ALLOWED_SIZES.map(s=>s.w+'×'+s.h).join(', ')}` });
      else resolve({ ok:true, width:w, height:h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ ok:false, msg:'Bild konnte nicht geladen werden.' }); };
  });
  img.src = url;
  return p;
}

// ----------------- App Logic -----------------
const LANGS = [
  "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
  "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
  "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO",
  "ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA"
];

let skinsData = []; // { id, name, safeName, buffer, uploadedFile, textureFile, type, geometry }

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('packForm');
  const statusEl = document.getElementById('status');
  const skinsContainer = document.getElementById('skinsContainer');
  const addSkinBtn = document.getElementById('addSkinBtn');
  const languageSelect = document.getElementById('language');
  const regenBtn = document.getElementById('regenBtn');
  const autoDownloadCheckbox = document.getElementById('autoDownloadOnLoad');
  const viewerOverlay = document.getElementById('viewerOverlay');
  const viewerImage = document.getElementById('viewerImage');

  if (!form || !skinsContainer || !addSkinBtn || !languageSelect || !statusEl) {
    console.error('DOM elements missing');
    return;
  }

  function setStatus(t) { statusEl.textContent = t; console.log('[mcbe]', t); }

  // fill languages
  LANGS.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; languageSelect.appendChild(o); });
  languageSelect.value = 'en_US';
  languageSelect.addEventListener('change', () => setStatus(`Sprache: ${languageSelect.value}`));

  // create skin entry DOM and return file input reference
  function createSkinEntryDOM(skin) {
    const entry = document.createElement('div');
    entry.className = 'skin-entry';
    entry.dataset.id = skin.id;

    // preview img
    const previewWrap = document.createElement('div');
    previewWrap.className = 'preview';
    const img = document.createElement('img');
    img.alt = skin.name || 'preview';
    if (skin.uploadedFile) img.src = URL.createObjectURL(skin.uploadedFile);
    else if (skin.buffer) img.src = bufferToObjectUrl(skin.buffer);
    previewWrap.appendChild(img);

    // middle
    const middle = document.createElement('div'); middle.className = 'middle';
    const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.value = skin.name || ''; nameInput.placeholder = 'Skin-Name';
    nameInput.addEventListener('input', () => { skin.name = nameInput.value.trim(); skin.safeName = safeFileName(skin.name); });

    const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/png';
    fileInput.addEventListener('change', async () => {
      if (!fileInput.files || !fileInput.files[0]) return;
      const f = fileInput.files[0];
      const valid = await validateSkinFile(f);
      if (!valid.ok) { alert(valid.msg); fileInput.value = ''; return; }
      // accepted
      skin.uploadedFile = f;
      // update preview
      try { URL.revokeObjectURL(img.src); } catch(e) {}
      img.src = URL.createObjectURL(f);
    });

    const small = document.createElement('small'); small.className = 'muted'; small.textContent = 'Typ: free • Geometrie: humanoid.customSlim';
    middle.appendChild(nameInput); middle.appendChild(fileInput); middle.appendChild(small);

    // right
    const right = document.createElement('div'); right.className = 'right';
    const typeInput = document.createElement('input'); typeInput.type = 'text'; typeInput.value = skin.type || 'free'; typeInput.readOnly = true;
    const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.className = 'ghost'; removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      skinsData = skinsData.filter(s => s.id !== skin.id);
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    });
    right.appendChild(typeInput); right.appendChild(removeBtn);

    entry.appendChild(previewWrap); entry.appendChild(middle); entry.appendChild(right);
    skinsContainer.appendChild(entry);

    // clicking preview opens fullscreen viewer
    previewWrap.addEventListener('click', () => {
      // open viewer with current image src (uploaded or buffer)
      let src = img.src;
      if (!src && skin.uploadedFile) src = URL.createObjectURL(skin.uploadedFile);
      if (!src && skin.buffer) src = bufferToObjectUrl(skin.buffer);
      if (src) openFullscreenViewer(src);
    });

    return { fileInput, img };
  }

  // add new skin (with placeholder); optionally open file dialog immediately
  async function addNewSkinEntry(openFileDialog = false) {
    const name = `Skin-${randHex(4)}`;
    const safeName = safeFileName(name);
    const buf = await createPlaceholderSkinPNG(64,64);
    const s = { id: makeUUID(), name, safeName, buffer: buf, uploadedFile: null, textureFile: `skin-${skinsData.length + 1}.png`, type:'free', geometry:'geometry.humanoid.customSlim' };
    skinsData.push(s);
    const { fileInput } = createSkinEntryDOM(s);
    if (openFileDialog) {
      // user gesture context -> try to open file picker
      setTimeout(() => { try { fileInput && fileInput.click(); } catch(e) { console.warn('fileInput.click failed', e); } }, 10);
    }
  }

  // pre-generate placeholders and fill form
  async function preGeneratePlaceholders() {
    setStatus('Erzeuge Platzhalter...');
    const packBase = `skinpack-${randHex(6)}`;
    const packName = `Pack ${randHex(4)}`;
    const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
    // set form values
    document.getElementById('packName').value = packName;
    document.getElementById('packDesc').value = packDesc;
    // create two placeholders
    skinsData = [];
    skinsContainer.innerHTML = '';
    await addNewSkinEntry(false);
    await addNewSkinEntry(false);
    setStatus('Platzhalter erstellt. Du kannst Skins hochladen oder weitere hinzufügen.');
    if (autoDownloadCheckbox && autoDownloadCheckbox.checked) {
      setTimeout(() => buildPackAndDownload({ autoFilename: `${packBase}.mcpack` }), 300);
    }
  }

  // Fullscreen viewer with drag-rotation (rotateY)
  function openFullscreenViewer(imageSrc) {
    const overlay = viewerOverlay;
    const img = viewerImage;
    img.src = imageSrc;
    img.style.transform = 'rotateY(0deg)'; // reset
    img.dataset.rot = '0';
    overlay.hidden = false;

    let dragging = false;
    let lastX = 0;
    function onPointerDown(ev) {
      dragging = true;
      lastX = ev.clientX || ev.touches && ev.touches[0].clientX;
      img.style.cursor = 'grabbing';
      ev.preventDefault();
    }
    function onPointerMove(ev) {
      if (!dragging) return;
      const x = ev.clientX || ev.touches && ev.touches[0].clientX;
      const dx = x - lastX;
      lastX = x;
      let rot = parseFloat(img.dataset.rot || '0');
      rot += dx * 0.5; // sensitivity
      img.dataset.rot = String(rot);
      img.style.transform = `rotateY(${rot}deg)`;
    }
    function onPointerUp() {
      dragging = false;
      img.style.cursor = 'grab';
    }
    function onOverlayClick(ev) {
      if (ev.target === overlay) closeViewer();
    }
    function onKeyDown(ev) {
      if (ev.key === 'Escape') closeViewer();
    }
    function closeViewer() {
      overlay.hidden = true;
      img.src = '';
      overlay.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      overlay.removeEventListener('click', onOverlayClick);
      window.removeEventListener('keydown', onKeyDown);
    }

    overlay.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    overlay.addEventListener('click', onOverlayClick);
    window.addEventListener('keydown', onKeyDown);
  }

  // build pack from UI and download
  async function buildPackAndDownload(options = {}) {
    try {
      setStatus('Erzeuge Skinpack...');
      if (typeof JSZip === 'undefined') { setStatus('JSZip nicht geladen'); return; }

      const packName = (document.getElementById('packName').value.trim()) || `Pack-${randHex(4)}`;
      const packDesc = (document.getElementById('packDesc').value.trim()) || '';
      const lang = document.getElementById('language').value || 'en_US';
      const safePack = safeFileName(packName) || `skinpack-${randHex(4)}`;

      // collect skins in DOM order
      const entries = Array.from(document.querySelectorAll('.skin-entry'));
      const finalSkins = [];
      let idx = 0;
      for (const entry of entries) {
        const id = entry.dataset.id;
        const s = skinsData.find(x => x.id === id);
        if (!s) continue;
        const fileInput = entry.querySelector('input[type="file"]');
        let buffer = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const v = await validateSkinFile(fileInput.files[0]);
          if (!v.ok) { alert(v.msg); return; }
          buffer = await fileInput.files[0].arrayBuffer();
        } else if (s.uploadedFile) {
          const v = await validateSkinFile(s.uploadedFile);
          if (!v.ok) { alert(v.msg); return; }
          buffer = await s.uploadedFile.arrayBuffer();
        } else if (s.buffer) {
          buffer = s.buffer;
        } else {
          buffer = await createPlaceholderSkinPNG(64,64);
        }
        idx++;
        finalSkins.push({ name: s.name || `skin-${idx}`, safeName: s.safeName || safeFileName(s.name || `skin-${idx}`), buffer, textureFile: `skin-${idx}.PNG`, type: s.type || 'free', geometry: s.geometry || 'geometry.humanoid.customSlim' });
      }

      if (finalSkins.length === 0) { setStatus('Bitte mindestens einen Skin einfügen.'); return; }

      // manifest (format_version: 2)
      const packUuid = makeUUID();
      const moduleUuid = makeUUID();
      const manifest = { format_version: 2, header: { name: packName, description: packDesc, uuid: packUuid, version:[1,0,0], min_engine_version:[1,20,0] }, modules:[{ type:"skin_pack", uuid:moduleUuid, version:[1,0,0] }] };

      // skins.json
      const skinsJson = { skins: finalSkins.map(s => ({ localization_name: `${safePack}.skin.${s.safeName}`, geometry: s.geometry, texture: s.textureFile, type: s.type })), serialize_name: safePack, localization_name: packName };

      // texts/lang.lang
      const lines = []; lines.push(`${safePack}.pack.title=${packName}`); finalSkins.forEach(s => lines.push(`${safePack}.skin.${s.safeName}=${s.name}`));
      const langContents = lines.join('\n');

      // build zip
      setStatus('Erzeuge ZIP...');
      const zip = new JSZip(); const root = zip.folder(`${safePack}.mcpack`);
      root.file('manifest.json', JSON.stringify(manifest, null, 2));
      root.file('skins.json', JSON.stringify(skinsJson, null, 2));
      for (let i = 0; i < finalSkins.length; i++) {
        root.file(finalSkins[i].textureFile, finalSkins[i].buffer, { binary: true });
      }
      const textsFolder = root.folder('texts'); textsFolder.file(`${lang}.lang`, langContents);

      setStatus('Packe Dateien (ZIP)...');
      const contentBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const filename = options.autoFilename || `${safePack}.mcpack`;
      const url = URL.createObjectURL(contentBlob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

      setStatus(`Fertig — Download gestartet: ${filename}`);
    } catch (err) {
      console.error(err);
      setStatus('Fehler: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // ----------------- Event Listeners -----------------
  addSkinBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    // create entry + open file dialog in user gesture
    addNewSkinEntry(true).catch(e => { console.error('addNewSkinEntry failed', e); setStatus('Fehler beim Hinzufügen eines Skins'); });
  });

  regenBtn.addEventListener('click', async () => {
    setStatus('Erzeuge neue Platzhalter...');
    // replace buffers for skins without uploadedFile
    for (const s of skinsData) { if (!s.uploadedFile) s.buffer = await createPlaceholderSkinPNG(64,64); }
    // refresh DOM
    const copy = skinsData.slice();
    skinsData = copy;
    skinsContainer.innerHTML = '';
    for (const s of copy) createSkinEntryDOM(s);
    setStatus('Platzhalter aktualisiert.');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await buildPackAndDownload();
  });

  // viewer overlay close on outside click or ESC
  viewerOverlay.addEventListener('click', (ev) => {
    if (ev.target === viewerOverlay) { viewerOverlay.hidden = true; viewerImage.src = ''; }
  });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { viewerOverlay.hidden = true; viewerImage.src = ''; } });

  // ----------------- Start -----------------
  preGeneratePlaceholders().catch(e => { console.error('pre-generate failed', e); setStatus('Fehler beim Start'); });
});
