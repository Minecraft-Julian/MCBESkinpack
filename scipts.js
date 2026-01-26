// Verbesserte Version mit Three.js-Previews + Fullscreen-Viewer
// Validierung: PNG + erlaubte Auflösungen
// fileInput.click() bleibt synchron beim "Skin hinzufügen"
// Benötigt: JSZip, THREE.js & OrbitControls (CDN in index.html)

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

// Allowed sizes
const ALLOWED_SIZES = [{ w:64,h:32},{ w:64,h:64},{ w:128,h:128 }];

// Make placeholder PNG with big X => returns ArrayBuffer and dataURL helper
function createPlaceholderSkinPNG(width = 64, height = 64) {
  return new Promise((resolve, reject) => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');

      const bg = `hsl(${Math.floor(Math.random()*360)},60%,70%)`;
      ctx.fillStyle = bg; ctx.fillRect(0,0,width,height);

      ctx.strokeStyle = '#111';
      ctx.lineWidth = Math.max(6, Math.floor(width/10));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(width*0.15, height*0.15); ctx.lineTo(width*0.85, height*0.85);
      ctx.moveTo(width*0.85, height*0.15); ctx.lineTo(width*0.15, height*0.85);
      ctx.stroke();

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `${Math.max(8, Math.floor(width/8))}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(randHex(3), width - 4, height - 6);

      canvas.toBlob(async (blob) => {
        if (!blob) return reject(new Error('Blob creation failed'));
        const ab = await blob.arrayBuffer();
        const dataUrl = canvas.toDataURL('image/png');
        resolve({ arrayBuffer: ab, dataUrl });
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

// Validate uploaded file
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

// ----------------- Three.js mini renderer (rotating model) -----------------
function makeMiniRenderer(canvas, imageUrl) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, true);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.2, 2.6);

  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 5);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.8));

  // simple humanoid-like model: head + torso
  const group = new THREE.Group();

  const loader = new THREE.TextureLoader();
  const texture = loader.load(imageUrl);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
  const mat = new THREE.MeshStandardMaterial({ map: texture });

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat);
  head.position.set(0, 1.45, 0);
  group.add(head);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.5), mat);
  body.position.set(0, 0.65, 0);
  group.add(body);

  scene.add(group);

  let running = true;
  function animate() {
    if (!running) return;
    group.rotation.y += 0.01;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  return {
    dispose() {
      running = false;
      try { renderer.dispose(); } catch(e) {}
    },
    renderer, scene, camera
  };
}

// Fullscreen viewer using Three.js + OrbitControls
function openFullscreenViewer(imageUrl) {
  const overlay = document.getElementById('viewerOverlay');
  const container = document.getElementById('viewerCanvasContainer');
  overlay.hidden = false;
  container.innerHTML = '';

  const canvas = document.createElement('canvas');
  container.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight, true);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.9));

  const loader = new THREE.TextureLoader();
  loader.load(imageUrl, (tex) => {
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.MeshStandardMaterial({ map: tex });

    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,1.2), mat);
    head.position.set(0, 1.6, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2,1.6,0.8), mat);
    body.position.set(0, 0.0, 0);

    const group = new THREE.Group();
    group.add(head);
    group.add(body);
    scene.add(group);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.6;
    controls.maxDistance = 6;

    let running = true;
    function animate() {
      if (!running) return;
      controls.update();
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    animate();

    function closeViewer() {
      running = false;
      controls.dispose();
      try { renderer.dispose(); } catch(e) {}
      overlay.hidden = true;
      container.innerHTML = '';
      overlay.removeEventListener('click', overlayClickHandler);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
    }
    function overlayClickHandler(ev) {
      if (ev.target === overlay) closeViewer();
    }
    function onResize() {
      renderer.setSize(container.clientWidth, container.clientHeight, true);
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
    }
    function onKeyDown(ev) {
      if (ev.key === 'Escape') closeViewer();
    }

    overlay.addEventListener('click', overlayClickHandler);
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
  });
}

// ----------------- App Logic -----------------
const LANGS = [
  "en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU",
  "zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR",
  "sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO",
  "ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA"
];

let skinsData = []; // {id,name,safeName,buffer (ArrayBuffer),dataUrl(upload or placeholder),uploadedFile,textureFile,type,geometry}
let activeMiniRenderers = new Map();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('packForm');
  const statusEl = document.getElementById('status');
  const skinsContainer = document.getElementById('skinsContainer');
  const addSkinBtn = document.getElementById('addSkinBtn');
  const languageSelect = document.getElementById('language');
  const regenBtn = document.getElementById('regenBtn');
  const autoDownloadCheckbox = document.getElementById('autoDownloadOnLoad');

  if (!form || !skinsContainer || !addSkinBtn || !languageSelect || !statusEl) {
    console.error('DOM elements missing');
    return;
  }

  function setStatus(t) { statusEl.textContent = t; console.log('[mcbe]', t); }

  LANGS.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; languageSelect.appendChild(o); });
  languageSelect.value = 'en_US';
  languageSelect.addEventListener('change', () => setStatus(`Sprache: ${languageSelect.value}`));

  // create entry DOM and mini renderer
  function createSkinEntryDOM(skin) {
    const entry = document.createElement('div');
    entry.className = 'skin-entry';
    entry.dataset.id = skin.id;

    // preview canvas
    const previewWrap = document.createElement('div'); previewWrap.className = 'preview';
    const canvas = document.createElement('canvas');
    // set resolution for renderer
    canvas.width = 256; canvas.height = 256;
    previewWrap.appendChild(canvas);

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
      skin.uploadedFile = f;
      skin.dataUrl = URL.createObjectURL(f);
      try { // dispose old renderer
        const r = activeMiniRenderers.get(canvas);
        if (r && r.dispose) r.dispose();
      } catch(e){}
      const mini = makeMiniRenderer(canvas, skin.dataUrl);
      activeMiniRenderers.set(canvas, mini);
    });

    const small = document.createElement('small'); small.className = 'muted'; small.textContent = 'Typ: free • Geometrie: humanoid.customSlim';
    middle.appendChild(nameInput); middle.appendChild(fileInput); middle.appendChild(small);

    // right
    const right = document.createElement('div'); right.className = 'right';
    const typeInput = document.createElement('input'); typeInput.type = 'text'; typeInput.value = skin.type || 'free'; typeInput.readOnly = true;
    const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.className = 'ghost'; removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      skinsData = skinsData.filter(s => s.id !== skin.id);
      // dispose renderer
      const r = activeMiniRenderers.get(canvas);
      if (r && r.dispose) r.dispose();
      activeMiniRenderers.delete(canvas);
      if (entry.parentNode) entry.parentNode.removeChild(entry);
    });
    right.appendChild(typeInput); right.appendChild(removeBtn);

    entry.appendChild(previewWrap); entry.appendChild(middle); entry.appendChild(right);
    skinsContainer.appendChild(entry);

    // initialize mini renderer using dataUrl or placeholder
    const src = skin.dataUrl || (skin.buffer ? bufferToObjectUrl(skin.buffer) : null);
    (async () => {
      let textureUrl = src;
      if (!textureUrl) {
        const p = await createPlaceholderSkinPNG(64,64);
        skin.buffer = p.arrayBuffer;
        skin.dataUrl = p.dataUrl;
        textureUrl = p.dataUrl;
      }
      const mini = makeMiniRenderer(canvas, textureUrl);
      activeMiniRenderers.set(canvas, mini);
    })();

    // click preview opens fullscreen viewer with current skin texture
    previewWrap.addEventListener('click', () => {
      const url = skin.dataUrl || (skin.buffer ? bufferToObjectUrl(skin.buffer) : null) || null;
      if (url) openFullscreenViewer(url);
    });

    return { fileInput };
  }

  // add new skin: create DOM immediate and open file dialog synchronously if requested
  async function addNewSkinEntry(openFileDialog = false) {
    const name = `Skin-${randHex(4)}`;
    const safeName = safeFileName(name);
    // do NOT await placeholder yet; create shell so fileInput.click remains in gesture
    const s = { id: makeUUID(), name, safeName, buffer: null, dataUrl: null, uploadedFile: null, textureFile: `skin-${skinsData.length + 1}.png`, type:'free', geometry:'geometry.humanoid.customSlim' };
    skinsData.push(s);
    const { fileInput } = createSkinEntryDOM(s);
    if (openFileDialog) {
      try {
        fileInput && fileInput.click();
        console.log('[mcbe] fileInput.click() called');
      } catch (e) {
        console.warn('[mcbe] fileInput.click failed', e);
      }
    }
  }

  // pre-generate placehoders
  async function preGeneratePlaceholders() {
    setStatus('Erzeuge Platzhalter...');
    const packBase = `skinpack-${randHex(6)}`;
    const packName = `Pack ${randHex(4)}`;
    const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
    document.getElementById('packName').value = packName;
    document.getElementById('packDesc').value = packDesc;
    skinsData = [];
    skinsContainer.innerHTML = '';
    await addNewSkinEntry(false);
    await addNewSkinEntry(false);
    setStatus('Platzhalter erstellt. Du kannst Skins hochladen oder weitere hinzufügen.');
    if (autoDownloadCheckbox && autoDownloadCheckbox.checked) {
      setTimeout(() => buildPackAndDownload({ autoFilename: `${packBase}.mcpack` }), 300);
    }
  }

  // build pack
  async function buildPackAndDownload(options = {}) {
    try {
      setStatus('Erzeuge Skinpack...');
      if (typeof JSZip === 'undefined') { setStatus('JSZip nicht geladen'); return; }

      const packName = (document.getElementById('packName').value.trim()) || `Pack-${randHex(4)}`;
      const packDesc = (document.getElementById('packDesc').value.trim()) || '';
      const lang = document.getElementById('language').value || 'en_US';
      const safePack = safeFileName(packName) || `skinpack-${randHex(4)}`;

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
          const p = await createPlaceholderSkinPNG(64,64);
          buffer = p.arrayBuffer;
        }
        idx++;
        finalSkins.push({ name: s.name || `skin-${idx}`, safeName: s.safeName || safeFileName(s.name || `skin-${idx}`), buffer, textureFile: `skin-${idx}.PNG`, type: s.type || 'free', geometry: s.geometry || 'geometry.humanoid.customSlim' });
      }

      if (finalSkins.length === 0) { setStatus('Bitte mindestens einen Skin einfügen.'); return; }

      const packUuid = makeUUID();
      const moduleUuid = makeUUID();
      const manifest = { format_version: 2, header: { name: packName, description: packDesc, uuid: packUuid, version:[1,0,0], min_engine_version:[1,20,0] }, modules:[{ type:"skin_pack", uuid:moduleUuid, version:[1,0,0] }] };

      const skinsJson = { skins: finalSkins.map(s => ({ localization_name: `${safePack}.skin.${s.safeName}`, geometry: s.geometry, texture: s.textureFile, type: s.type })), serialize_name: safePack, localization_name: packName };

      const lines = []; lines.push(`${safePack}.pack.title=${packName}`); finalSkins.forEach(s => lines.push(`${safePack}.skin.${s.safeName}=${s.name}`));
      const langContents = lines.join('\n');

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

  // ----------------- events -----------------
  addSkinBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    addNewSkinEntry(true).catch(e => { console.error('addNewSkinEntry failed', e); setStatus('Fehler beim Hinzufügen eines Skins (Konsole prüfen)'); });
  });

  regenBtn.addEventListener('click', async () => {
    setStatus('Erzeuge neue Platzhalter...');
    for (const s of skinsData) { if (!s.uploadedFile) { const p = await createPlaceholderSkinPNG(64,64); s.buffer = p.arrayBuffer; s.dataUrl = p.dataUrl; } }
    // rebuild DOM
    const copy = skinsData.slice();
    skinsData = []; skinsContainer.innerHTML = '';
    for (const s of copy) { skinsData.push(s); createSkinEntryDOM(s); }
    setStatus('Platzhalter aktualisiert.');
  });

  form.addEventListener('submit', async (ev) => { ev.preventDefault(); await buildPackAndDownload(); });

  // viewer close on outside click and ESC handled inside openFullscreenViewer (overlay close)
  document.getElementById('viewerOverlay').addEventListener('click', (ev) => {
    if (ev.target.id === 'viewerOverlay') {
      const container = document.getElementById('viewerCanvasContainer'); container.innerHTML = ''; ev.currentTarget.hidden = true;
    }
  });

  // start
  preGeneratePlaceholders().catch(e => { console.error('pre-generate failed', e); setStatus('Fehler beim Start'); });
});