// MCBE Skinpack Generator - client-side only
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
  // fallback RFC4122 v4-ish
  function rnd(n){ return Math.floor(Math.random()*n).toString(16).padStart(2,'0'); }
  let bytes = new Array(16).fill(0).map(() => Math.floor(Math.random()*256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b,i)=> (i===4||i===6||i===8||i===10? '-' : '') + b.toString(16).padStart(2,'0')).join('');
}

// DOM
const form = document.getElementById('packForm');
const statusEl = document.getElementById('status');

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  statusEl.textContent = 'Erzeuge Skinpack...';

  const packName = document.getElementById('packName').value.trim() || 'skinpack';
  const packDesc = document.getElementById('packDesc').value.trim() || '';
  const skinFileInput = document.getElementById('skinFile');
  const skinName = document.getElementById('skinName').value.trim() || 'skin';
  const skinType = document.getElementById('skinType').value.trim() || 'free';
  const lang = document.getElementById('language').value || 'en_US';

  if (!skinFileInput.files || skinFileInput.files.length === 0) {
    statusEl.textContent = 'Bitte eine Skin-PNG Datei auswählen.';
    return;
  }
  const skinFile = skinFileInput.files[0];

  try {
    // Read skin array buffer
    const skinArrayBuffer = await skinFile.arrayBuffer();

    // Prepare names and UUIDs
    const safePack = safeFileName(packName) || 'skinpack';
    const rootFolderName = `${safePack}.mcpack/`;
    const packUuid = makeUUID();
    const moduleUuid = makeUUID();
    const skinUuid = makeUUID();

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

    // skins.json - minimal helpful structure
    const skinsJson = {
      format_version: 1,
      "minecraft:skins": {
        description: {
          identifier: `${safePack}:skins`
        },
        skins: [
          {
            localization_name: `${safePack}.skin.${safeFileName(skinName)}`,
            texture: "skin.PNG",
            type: skinType,
            uuid: skinUuid
          }
        ]
      }
    };

    // texts/en_US.lang
    // The localization key used above: `${safePack}.skin.${safeFileName(skinName)}`
    // Also provide a pack title key
    const langEntries = [
      `${safePack}.pack.title=${packName}`,
      `${safePack}.skin.${safeFileName(skinName)}=${skinName}`
    ].join("\n");

    // Build ZIP with JSZip
    const zip = new JSZip();
    const root = zip.folder(rootFolderName);

    // Add manifest.json
    root.file('manifest.json', JSON.stringify(manifest, null, 2));

    // Add skins.json
    root.file('skins.json', JSON.stringify(skinsJson, null, 2));

    // Add skin PNG (binary)
    root.file('skin.PNG', skinArrayBuffer, { binary: true });

    // Add texts folder and en_US.lang
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