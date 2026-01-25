// Erweiterte Version: mehrere Skins & große Sprachliste
// Benötigt: JSZip (global JSZip)

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
  function rnd(n){ return Math.floor(Math.random()*n).toString(16).padStart(2,'0'); }
  let bytes = new Array(16).fill(0).map(() => Math.floor(Math.random()*256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b,i)=> (i===4||i===6||i===8||i===10? '-' : '') + b.toString(16).padStart(2,'0')).join('');
}

// DOM refs
const form = document.getElementById('packForm');
const statusEl = document.getElementById('status');
const skinsContainer = document.getElementById('skinsContainer');
const addSkinBtn = document.getElementById('addSkinBtn');
const languageSelect = document.getElementById('language');

const LANGS = [
  "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
  "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
  "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO",
  "ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA","sr_RS",
  "hr_HR","lt_LT","lv_LV","sk_SK","sl_SI","el_GR","bg_BG"
];

// Populate language select
function populateLanguages() {
  LANGS.forEach(l => {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    languageSelect.appendChild(o);
  });
  languageSelect.value = 'en_US';
}

// Skin entry template
let skinIndex = 0;
function createSkinEntry({name = '', file = null} = {}) {
  const idx = skinIndex++;
  const root = document.createElement('div');
  root.className = 'skin-entry';
  root.dataset.idx = idx;

  const left = document.createElement('div');
  left.className = 'left';
  const right = document.createElement('div');
  right.className = 'right';

  // name
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Skin-Name';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'MeinSkin';
  nameInput.value = name;
  nameInput.required = true;

  // file
  const fileLabel = document.createElement('label');
  fileLabel.textContent = 'Skin PNG';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png';
  if (file) {
    // cannot set File programmatically; user will re-add if needed
  }

  // small helper
  const small = document.createElement('small');
  small.textContent = 'Empfohlen: 64×64 oder 64×32';

  left.appendChild(nameLabel);
  left.appendChild(nameInput);
  left.appendChild(fileLabel);
  left.appendChild(fileInput);
  left.appendChild(small);

  // type (fixed)
  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'Typ';
  const typeInput = document.createElement('input');
  typeInput.type = 'text';
  typeInput.value = 'free';
  typeInput.readOnly = true;

  // remove button
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ghost';
  removeBtn.textContent = 'Entfernen';
  removeBtn.addEventListener('click', () => {
    skinsContainer.removeChild(root);
  });

  right.appendChild(typeLabel);
  right.appendChild(typeInput);
  right.appendChild(removeBtn);

  root.appendChild(left);
  root.appendChild(right);

  skinsContainer.appendChild(root);

  return {root, nameInput, fileInput, typeInput};
}

// Initialize UI
populateLanguages();
createSkinEntry();

// Add skin button
addSkinBtn.addEventListener('click', () => createSkinEntry());

// Gather skins from DOM
function gatherSkins() {
  const entries = Array.from(skinsContainer.querySelectorAll('.skin-entry'));
  const skins = [];
  for (const e of entries) {
    const nameInput = e.querySelector('input[type="text"]');
    const fileInput = e.querySelector('input[type="file"]');
    const typeInput = e.querySelector('input[readonly]');
    const name = nameInput ? nameInput.value.trim() : '';
    const files = fileInput ? fileInput.files : null;
    if (!name || !files || files.length === 0) {
      // skip incomplete entries
      continue;
    }
    skins.push({
      name,
      file: files[0],
      type: typeInput ? (typeInput.value || 'free') : 'free'
    });
  }
  return skins;
}

// Form submit -> build pack
form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  statusEl.textContent = 'Erzeuge Skinpack...';

  const packName = document.getElementById('packName').value.trim() || 'skinpack';
  const packDesc = document.getElementById('packDesc').value.trim() || '';
  const lang = document.getElementById('language').value || 'en_US';

  const skins = gatherSkins();
  if (skins.length === 0) {
    statusEl.textContent = 'Bitte mindestens einen vollständigen Skin (Name + PNG) hinzufügen.';
    return;
  }

  try {
    // Read skin files into array buffers
    statusEl.textContent = 'Lese Skin-Dateien...';
    const skinBuffers = [];
    for (const s of skins) {
      const ab = await s.file.arrayBuffer();
      skinBuffers.push(ab);
    }

    // Prepare names and UUIDs
    const safePack = safeFileName(packName) || 'skinpack';
    const rootFolderName = `${safePack}.mcpack/`;
    const packUuid = makeUUID();
    const moduleUuid = makeUUID();

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

    // Build skins.json
    const skinsArray = [];
    for (let i = 0; i < skins.length; i++) {
      const s = skins[i];
      const skinUuid = makeUUID();
      const textureFileName = `skin-${i + 1}.PNG`; // e.g. skin-1.PNG
      const localizationKey = `${safePack}.skin.${safeFileName(s.name)}`;
      skinsArray.push({
        localization_name: localizationKey,
        texture: textureFileName,
        type: s.type || 'free',
        uuid: skinUuid
      });
    }

    const skinsJson = {
      format_version: 1,
      "minecraft:skins": {
        description: {
          identifier: `${safePack}:skins`
        },
        skins: skinsArray
      }
    };

    // texts/<lang>.lang
    // pack title + each skin entry
    const lines = [];
    lines.push(`${safePack}.pack.title=${packName}`);
    for (let i = 0; i < skins.length; i++) {
      const s = skins[i];
      const key = `${safePack}.skin.${safeFileName(s.name)}`;
      lines.push(`${key}=${s.name}`);
    }
    const langEntries = lines.join('\n');

    // Build ZIP with JSZip
    statusEl.textContent = 'Erzeuge ZIP-Struktur...';
    const zip = new JSZip();
    const root = zip.folder(rootFolderName);

    // Add manifest.json
    root.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Add skins.json
    root.file('skins.json', JSON.stringify(skinsJson, null, 2));

    // Add skin files
    for (let i = 0; i < skinBuffers.length; i++) {
      const fname = `skin-${i + 1}.PNG`;
      root.file(fname, skinBuffers[i], { binary: true });
    }

    // Add texts folder and chosen lang file
    const textsFolder = root.folder('texts');
    textsFolder.file(`${lang}.lang`, langEntries);

    // Generate the zip as blob
    statusEl.textContent = 'Packe Dateien...';
    const contentBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    // Create download (filename ends with .mcpack)
    const filename = `${safePack}.mcpack`;
    const url = URL.createObjectURL(contentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    statusEl.textContent = `Fertig: ${filename} — Download gestartet.`;
  } catch (err) {
    console.error(err);
    statusEl.textContent = `Fehler: ${err.message || err}`;
  }
});
