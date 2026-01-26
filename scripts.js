// Kombinierte Version:
// - Beim Laden: Platzhalter-Pack wird erzeugt (und optional automatisch heruntergeladen).
// - Formular wird mit den generierten Werten vorbefüllt.
// - Benutzer kann Skins hinzufügen/entfernen, Bild ersetzen und die Sprache wählen.
// - Beim Absenden: finaler .mcpack wird aus Formularwerten erzeugt (nur Client-side).
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

// Hilfsfunktion: ArrayBuffer -> ObjectURL für Preview
function bufferToObjectUrl(buffer) {
  const blob = new Blob([buffer], { type: 'image/png' });
  return URL.createObjectURL(blob);
}

// ----------------- Globals & Config -----------------
const LANGS = [
  "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
  "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
  "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO",
  "ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA"
];

let generatedPack = null; // enthält vor-generierte Packdaten
let skinsData = []; // { id, name, safeName, buffer (ArrayBuffer) | null, uploadedFile (File) | null }

// ----------------- DOM & Init -----------------
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('packForm');
  const statusEl = document.getElementById('status');
  const skinsContainer = document.getElementById('skinsContainer');
  const addSkinBtn = document.getElementById('addSkinBtn');
  const languageSelect = document.getElementById('language');
  const regenBtn = document.getElementById('regenBtn');
  const autoDownloadCheckbox = document.getElementById('autoDownloadOnLoad');

  // populate language select
  LANGS.forEach(l => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    languageSelect.appendChild(o);
  });
  languageSelect.value = 'en_US';

  // utility: status
  function setStatus(t) {
    if (statusEl) statusEl.textContent = t;
    console.log('[mcbe]', t);
  }

  // Erzeuge initiale Platzhalter-Daten (pack + 2 skins)
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

    generatedPack = {
      packBase,
      packName,
      packDesc,
      lang,
      skins: tempSkins
    };
    // copy to skinsData for UI manipulation
    skinsData = tempSkins.map(s => ({ ...s }));
    setStatus('Platzhalter erzeugt.');
    populateFormFromGenerated();
    // Auto-download wenn aktiviert
    if (autoDownloadCheckbox && autoDownloadCheckbox.checked) {
      // kleine Verzögerung, damit die UI sichtbar bleibt
      setTimeout(() => {
        buildPackAndDownload({ autoFilename: `${packBase}.mcpack` }).catch(e => console.error(e));
      }, 300);
    }
  }

  // Erzeuge DOM-Einträge für skinsData
  function populateFormFromGenerated() {
    skinsContainer.innerHTML = '';
    skinsData.forEach((s, idx) => {
      createSkinEntryDOM(s, idx);
    });
    // ensure at least one entry exists
    if (skinsData.length === 0) {
      addNewSkinEntry();
    }
  }

  // Erzeuge ein DOM-Element für einen Skin (mit Preview, Name, File-Input, Entfernen)
  function createSkinEntryDOM(skin, index) {
    const entry = document.createElement('div');
    entry.className = 'skin-entry';
    entry.dataset.id = skin.id;

    // Preview
    const previewWrap = document.createElement('div');
    previewWrap.className = 'preview';
    const img = document.createElement('img');
    img.alt = skin.name || 'preview';
    // set preview from uploaded file if exists else from buffer
    if (skin.uploadedFile) {
      img.src = URL.createObjectURL(skin.uploadedFile);
    } else if (skin.buffer) {
      img.src = bufferToObjectUrl(skin.buffer);
    } else {
      // fallback canvas
      createPlaceholderSkinPNG(64,64,true).then(ab => {
        img.src = bufferToObjectUrl(ab);
      });
    }
    previewWrap.appendChild(img);

    // middle (name + file input + info)
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
    fileInput.addEventListener('change', async () => {
      if (fileInput.files && fileInput.files[0]) {
        skin.uploadedFile = fileInput.files[0];
        // update preview
        img.src && URL.revokeObjectURL(img.src);
        img.src = URL.createObjectURL(skin.uploadedFile);
      }
    });

    const small = document.createElement('small');
    small.className = 'muted';
    small.textContent = 'Typ: free • Geometrie: humanoid.customSlim';

    middle.appendChild(nameInput);
    middle.appendChild(fileInput);
    middle.appendChild(small);

    // right (type + remove)
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
      // remove from skinsData and DOM
      skinsData = skinsData.filter(s => s.id !== skin.id);
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    });

    right.appendChild(typeInput);
    right.appendChild(removeBtn);

    entry.appendChild(previewWrap);
    entry.appendChild(middle);
    entry.appendChild(right);

    skinsContainer.appendChild(entry);
  }

  // Hinzufügen eines neuen (leeren) Skin-Eintrags (mit sofort generiertem Platzhalterbild)
  async function addNewSkinEntry() {
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
    createSkinEntryDOM(s, skinsData.length - 1);
  }

  // Build pack from current form values & skinsData and download
  async function buildPackAndDownload(options = {}) {
    try {
      setStatus('Erzeuge Skinpack...');

      if (typeof JSZip === 'undefined') {
        setStatus('Fehler: JSZip nicht geladen.');
        return;
      }

      // Read form values
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

      // gather final skins (prefer uploadedFile, otherwise buffer)
      const finalSkins = [];
      // read current DOM order to assign filenames sequentially
      const entries = Array.from(document.querySelectorAll('.skin-entry'));
      let idx = 0;
      for (const entry of entries) {
        const id = entry.dataset.id;
        const s = skinsData.find(x => x.id === id);
        if (!s) continue;
        // check if a file was uploaded in the DOM for this entry
        const fileInput = entry.querySelector('input[type="file"]');
        let fileBuffer = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          // read uploaded file
          fileBuffer = await fileInput.files[0].arrayBuffer();
        } else if (s.uploadedFile) {
          fileBuffer = await s.uploadedFile.arrayBuffer();
        } else if (s.buffer) {
          fileBuffer = s.buffer;
        } else {
          // create fallback placeholder
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

      // manifest.json (format_version: 2)
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

      // skins.json (ähnlich deiner Vorlage)
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

      // texts/<lang>.lang
      const lines = [];
      lines.push(`${safePack}.pack.title=${packName}`);
      finalSkins.forEach(s => {
        lines.push(`${safePack}.skin.${s.safeName}=${s.name}`);
      });
      const langContents = lines.join('\n');

      // Build ZIP
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

      // Download
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
      console.error(err);
      setStatus('Fehler: ' + (err && err.message ? err.message : String(err)));
    }
  }

  // ----------------- Event Listeners -----------------
  addSkinBtn.addEventListener('click', () => {
    addNewSkinEntry().catch(e => console.error(e));
  });

  regenBtn.addEventListener('click', async () => {
    // Erzeuge neue Platzhalter (überschreibt aktuelle generated pack, ersetzt nur previews if no uploaded files)
    setStatus('Erzeuge neue Platzhalter für Skins...');
    // für jede skin entry: wenn keine uploadedFile vorhanden, ersetze buffer und preview
    for (const s of skinsData) {
      if (!s.uploadedFile) {
        s.buffer = await createPlaceholderSkinPNG(64,64,true);
      }
    }
    // Update DOM previews
    const previews = document.querySelectorAll('.skin-entry');
    previews.forEach((entry) => {
      const id = entry.dataset.id;
      const s = skinsData.find(x => x.id === id);
      const img = entry.querySelector('.preview img');
      if (s && img && !s.uploadedFile && s.buffer) {
        img.src && URL.revokeObjectURL(img.src);
        img.src = bufferToObjectUrl(s.buffer);
      }
    });
    setStatus('Neue Platzhalter wurden erzeugt.');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await buildPackAndDownload();
  });

  // ----------------- Start -----------------
  // set default values in form from generatedPack after pre-generation
  // pre-generate placeholders and populate UI
  preGeneratePlaceholders().catch(e => {
    console.error('Pre-generate failed', e);
    setStatus('Fehler beim Erzeugen der Platzhalter: ' + (e && e.message));
  });

  // Fill packName and packDesc when generatedPack becomes available (poll briefly)
  const fillInterval = setInterval(() => {
    if (generatedPack) {
      const pn = document.getElementById('packName');
      const pd = document.getElementById('packDesc');
      if (pn && pd) {
        pn.value = generatedPack.packName;
        pd.value = generatedPack.packDesc;
      }
      clearInterval(fillInterval);
    }
  }, 150);
});
