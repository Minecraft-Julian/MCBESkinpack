// Auto-Generator: erzeugt bei Seitenaufruf ein .mcpack (keine Benutzerinteraktion nötig)
// Benötigt: JSZip (global JSZip)

// Utility: sichere Dateinamen
function safeFileName(name) {
  return (name || 'skinpack')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_\-\.]/g, '')
    .replace(/\-+/g, '-')
    .toLowerCase()
    .slice(0, 64) || 'skinpack';
}

// UUID Generator (crypto.randomUUID() wenn vorhanden)
function makeUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  // kleiner RFC4122 v4 Fallback
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
}

// Random hex string
function randHex(len = 6) {
  const chars = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// Erzeuge ein Platzhalter-Skin als PNG via Canvas (Promise<ArrayBuffer>)
function createPlaceholderSkinPNG(width = 64, height = 64, color = null, drawX = true) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Hintergrundfarbe zufällig wenn nicht übergeben
      const bg = color || `hsl(${Math.floor(Math.random() * 360)}, 60%, 60%)`;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // optional: großes X (als Platzhalter, wie in deiner Beispielgrafik)
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

      // kleiner Text (kurzer Hash) zur Unterscheidung
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

// Statusanzeige
function setStatus(text) {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
  console.log('[mcbe]', text);
}

// Hauptfunktion: erstellt das Pack und startet Download
async function buildAndDownloadPack() {
  try {
    setStatus('Starte Erzeugung des Skinpacks...');

    if (typeof JSZip === 'undefined') {
      setStatus('Fehler: JSZip nicht geladen. ZIP-Erzeugung nicht möglich.');
      return;
    }

    // Pack-Metadaten (alles "X"-artige Werte werden hier zufällig erzeugt)
    const packBase = `skinpack-${randHex(6)}`;
    const packName = `Pack ${randHex(4)}`; // sichtbar name
    const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
    const lang = 'en_US'; // du kannst hier auch languages.json einlesen, standard: en_US

    setStatus(`Erzeuge Pack: ${packBase} (${packName})`);

    // Anzahl der Skins - wir erzeugen 2 (entspricht deinen beiden Beispielbildern)
    const skinCount = 2;
    const skins = [];
    for (let i = 0; i < skinCount; i++) {
      const skinName = `Skin-${randHex(4)}`;
      const safeSkinName = safeFileName(skinName);
      const textureFile = `skin-${i + 1}.png`;
      skins.push({
        name: skinName,
        safeName: safeSkinName,
        texture: textureFile,
        geometry: 'geometry.humanoid.customSlim',
        type: 'free'
      });
    }

    // Erzeuge Platzhalter-PNGs (ArrayBuffer)
    setStatus('Erzeuge Skin-PNGs als Platzhalter...');
    const skinBuffers = [];
    for (let i = 0; i < skins.length; i++) {
      const ab = await createPlaceholderSkinPNG(64, 64, null, true);
      skinBuffers.push(ab);
    }

    // UUIDs
    const packUuid = makeUUID();
    const moduleUuid = makeUUID();

    // manifest.json (format_version: 2, min_engine_version: 1.20.0)
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

    // skins.json (entsprechend deiner Beispielstruktur mit "skins" array)
    const skinsJson = {
      skins: skins.map(s => ({
        localization_name: `${packBase}.skin.${s.safeName}`,
        geometry: s.geometry,
        texture: s.texture,
        type: s.type
      })),
      serialize_name: packBase,
      localization_name: packName
    };

    // texts/<lang>.lang
    const lines = [];
    lines.push(`${packBase}.pack.title=${packName}`);
    skins.forEach(s => {
      lines.push(`${packBase}.skin.${s.safeName}=${s.name}`);
    });
    const langContents = lines.join('\n');

    // ZIP bauen
    setStatus('Erzeuge ZIP-Struktur mit JSZip...');
    const zip = new JSZip();
    const rootFolder = zip.folder(`${packBase}.mcpack`);

    rootFolder.file('manifest.json', JSON.stringify(manifest, null, 2));
    rootFolder.file('skins.json', JSON.stringify(skinsJson, null, 2));

    for (let i = 0; i < skinBuffers.length; i++) {
      const fname = skins[i].texture;
      rootFolder.file(fname, skinBuffers[i], { binary: true });
    }

    const textsFolder = rootFolder.folder('texts');
    textsFolder.file(`${lang}.lang`, langContents);

    setStatus('Packe Dateien (ZIP) — das kann einen Moment dauern...');
    const contentBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    // Download starten (.mcpack ist ZIP mit anderer Endung)
    const filename = `${packBase}.mcpack`;
    const url = URL.createObjectURL(contentBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // automatisch anklicken
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setStatus(`Fertig — Download gestartet: ${filename}`);
  } catch (err) {
    console.error('Fehler beim Erzeugen des Packs:', err);
    setStatus('Fehler: ' + (err && err.message ? err.message : String(err)));
  }
}

// Sofort beim Laden die Pack-Erzeugung anstoßen
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // kleine Verzögerung um DOM zu rendern & CDN zu laden
    setTimeout(buildAndDownloadPack, 300);
  });
} else {
  setTimeout(buildAndDownloadPack, 300);
}
