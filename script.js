// Final script: validation, rotating previews, fullscreen interactive viewer, generation & download
// Benötigt: JSZip, THREE.js & OrbitControls (CDN, in index.html)

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

// Allowed dimensions for Minecraft skins (simplified)
const ALLOWED_SIZES = [
  { w: 64, h: 32 },
  { w: 64, h: 64 },
  { w: 128, h: 128 }
];

// ----------------- 3D Preview Helpers (Three.js) -----------------
function makeMiniRenderer(canvas, texture) {
  // canvas: HTMLCanvasElement to render into
  // texture: THREE.Texture
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, true);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  // light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.8));

  // simple character: head + body (two boxes) mapped with same texture (approx)
  const mat = new THREE.MeshStandardMaterial({ map: texture, skinning: false });

  // head
  const headGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.set(0, 1.6, 0);
  scene.add(head);

  // body
  const bodyGeo = new THREE.BoxGeometry(0.9, 1.2, 0.5);
  const body = new THREE.Mesh(bodyGeo, mat);
  body.position.set(0, 0.6, 0);
  scene.add(body);

  // rotate root
  const root = new THREE.Group();
  root.add(head);
  root.add(body);
  scene.add(root);

  // animate
  let running = true;
  function animate() {
    if (!running) return;
    root.rotation.y += 0.01; // slow rotate
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();

  return {
    dispose() {
      running = false;
      renderer.dispose();
    },
    renderer, scene, camera
  };
}

// Fullscreen viewer (bigger scene + orbit controls)
function openFullscreenViewer(imageUrl) {
  const overlay = document.getElementById('viewerOverlay');
  const box = document.getElementById('viewerBox');
  const canvasContainer = document.getElementById('viewerCanvasContainer');
  overlay.hidden = false;

  // create canvas
  canvasContainer.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight, true);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  const light = new THREE.DirectionalLight(0xffffff, 1.2);
  light.position.set(5, 10, 7);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0x404040, 0.9));

  const loader = new THREE.TextureLoader();
  loader.load(imageUrl, (tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;

    const mat = new THREE.MeshStandardMaterial({ map: tex, skinning: false });
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat);
    head.position.set(0, 1.6, 0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.8), mat);
    body.position.set(0, 0.2, 0);

    const root = new THREE.Group();
    root.add(head);
    root.add(body);
    scene.add(root);

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

    // close handler: click outside viewerBox (overlay) closes
    function closeViewer() {
      running = false;
      controls.dispose();
      try { renderer.dispose(); } catch(e) {}
      overlay.hidden = true;
      canvasContainer.innerHTML = '';
      overlay.removeEventListener('click', overlayClickHandler);
      window.removeEventListener('resize', onResize);
    }

    function overlayClickHandler(ev) {
      // if click is directly on overlay (outside the viewer box), close
      if (ev.target === overlay) closeViewer();
    }
    overlay.addEventListener('click', overlayClickHandler);

    function onResize() {
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight, true);
      camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
      camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', onResize);
  });
}

// ----------------- Validation -----------------
async function validateSkinFile(file) {
  // Check extension & type
  if (!file) return { ok: false, msg: 'Keine Datei' };
  const nameLower = (file.name || '').toLowerCase();
  if (!nameLower.endsWith('.png') && file.type !== 'image/png') {
    return { ok: false, msg: 'Nur PNG-Dateien sind erlaubt.' };
  }
  // Check dimensions
  const url = URL.createObjectURL(file);
  const img = new Image();
  const p = new Promise((resolve) => {
    img.onload = () => {
      const w = img.width, h = img.height;
      URL.revokeObjectURL(url);
      const ok = ALLOWED_SIZES.some(s => s.w === w && s.h === h);
      if (!ok) resolve({ ok: false, msg: `Ungültige Bildgröße ${w}×${h}. Erlaubt: ${ALLOWED_SIZES.map(s => s.w + '×' + s.h).join(', ')}` });
      else resolve({ ok: true, width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ ok: false, msg: 'Bild konnte nicht geladen werden.' }); };
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

let skinsData = []; // array of skin objects {id, name, safeName, buffer, uploadedFile, textureFile, type, geometry}
let generatedPack = null;

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

  // fill language select
  LANGS.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; languageSelect.appendChild(o); });
  languageSelect.value = 'en_US';
  languageSelect.addEventListener('change', () => setStatus(`Sprache: ${languageSelect.value}`));

  // create skin DOM entry with 3D preview
  async function createSkinEntry(skin, openFileDialog = false) {
    const entryEl = document.createElement('div');
    entryEl.className = 'skin-entry';
    entryEl.dataset.id = skin.id;

    // preview canvas for Three.js
    const previewWrap = document.createElement('div'); previewWrap.className = 'preview';
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 200;
    canvas.style.width = '100%'; canvas.style.height = '100%';
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
      if (!valid.ok) {
        alert(valid.msg);
        fileInput.value = '';
        return;
      }
      // store uploaded file and update preview
      skin.uploadedFile = f;
      try { URL.revokeObjectURL(canvas._lastSrc || ''); } catch(e) {}
      const objUrl = URL.createObjectURL(f);
      canvas._lastSrc = objUrl;
      // create Three texture and re-init mini renderer
      const tex = new THREE.TextureLoader().load(objUrl, (t) => {
        t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      });
      // dispose old renderer if any
      if (canvas._renderer && canvas._renderer.dispose) canvas._renderer.dispose();
      // create new mini renderer
      const mini = makeMiniRenderer(canvas, new THREE.CanvasTexture(await (await f.arrayBuffer()).then(b => new Blob([b])).then(b => { /* placeholder */ return new Image(); })));
      // Actually create texture from file bytes: simpler -> use texture loader with objUrl (already loaded above)
      // For safety, replace mini by one using texture loader result
      if (canvas._renderer && canvas._renderer.dispose) canvas._renderer.dispose();
      const texture = new THREE.TextureLoader().load(objUrl);
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
      const r = makeMiniRenderer(canvas, texture);
      canvas._renderer = r;
    });

    const small = document.createElement('small'); small.className = 'muted'; small.textContent = 'Typ: free • Geometrie: humanoid.customSlim';
    middle.appendChild(nameInput); middle.appendChild(fileInput); middle.appendChild(small);

    // right
    const right = document.createElement('div'); right.className = 'right';
    const typeInput = document.createElement('input'); typeInput.type = 'text'; typeInput.value = skin.type || 'free'; typeInput.readOnly = true;
    const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.className = 'ghost'; removeBtn.textContent = 'Entfernen';
    removeBtn.addEventListener('click', () => {
      skinsData = skinsData.filter(s => s.id !== skin.id);
      if (entryEl.parentNode) entryEl.parentNode.removeChild(entryEl);
    });
    right.appendChild(typeInput); right.appendChild(removeBtn);

    entryEl.appendChild(previewWrap); entryEl.appendChild(middle); entryEl.appendChild(right);
    skinsContainer.appendChild(entryEl);

    // init preview renderer using existing buffer or uploadedFile
    let textureUrl = null;
    if (skin.uploadedFile) textureUrl = URL.createObjectURL(skin.uploadedFile);
    else if (skin.buffer) {
      textureUrl = bufferToObjectUrl(skin.buffer);
    }
    if (textureUrl) {
      const texture = new THREE.TextureLoader().load(textureUrl);
      texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
      const mini = makeMiniRenderer(canvas, texture);
      canvas._renderer = mini;
      canvas._lastSrc = textureUrl;
    } else {
      // generate placeholder buffer -> texture
      const placeholder = new Image();
      createPlaceholderSkinPNG(64,64,true).then(ab => {
        const url = bufferToObjectUrl(ab);
        const texture = new THREE.TextureLoader().load(url);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        const mini = makeMiniRenderer(canvas, texture);
        canvas._renderer = mini;
        canvas._lastSrc = url;
      });
    }

    // clicking the preview opens fullscreen viewer with that skin's texture
    previewWrap.addEventListener('click', () => {
      let urlToOpen = canvas._lastSrc;
      if (!urlToOpen && skin.uploadedFile) urlToOpen = URL.createObjectURL(skin.uploadedFile);
      if (!urlToOpen && skin.buffer) urlToOpen = bufferToObjectUrl(skin.buffer);
      if (urlToOpen) openFullscreenViewer(urlToOpen);
    });

    // If openFileDialog is requested (user clicked "Skin hinzufügen"), open the file picker now
    if (openFileDialog) {
      // small delay to ensure element is in DOM and focus is allowed (user gesture)
      setTimeout(() => {
        try { fileInput.click(); } catch (e) { console.warn('fileInput.click() failed', e); }
      }, 10);
    }
  }

  // add new skin entry with placeholder
  async function addNewSkinEntry(openFileDialog = false) {
    const name = `Skin-${randHex(4)}`;
    const safeName = safeFileName(name);
    const buf = await createPlaceholderSkinPNG(64, 64, true);
    const s = { id: makeUUID(), name, safeName, buffer: buf, uploadedFile: null, textureFile: `skin-${skinsData.length + 1}.png`, type: 'free', geometry: 'geometry.humanoid.customSlim' };
    skinsData.push(s);
    await createSkinEntry(s, openFileDialog);
  }

  // pre-generate placeholders and populate first two skins
  async function preGeneratePlaceholders() {
    setStatus('Erzeuge Platzhalter...');
    const packBase = `skinpack-${randHex(6)}`;
    const packName = `Pack ${randHex(4)}`;
    const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
    generatedPack = { packBase, packName, packDesc, lang: languageSelect.value || 'en_US' };
    document.getElementById('packName').value = generatedPack.packName;
    document.getElementById('packDesc').value = generatedPack.packDesc;
    // create two placeholders
    skinsData = [];
    await addNewSkinEntry(false);
    await addNewSkinEntry(false);
    setStatus('Platzhalter erstellt. Du kannst Skins hochladen oder weitere hinzufügen.');
    // auto-download if checked
    if (autoDownloadCheckbox && autoDownloadCheckbox.checked) {
      // small delay so UI is visible
      setTimeout(() => buildPackAndDownload({ autoFilename: `${generatedPack.packBase}.mcpack` }), 400);
    }
  }

  // build pack using current UI state
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
          // validate
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
          buffer = await createPlaceholderSkinPNG(64,64,true);
        }
        idx++;
        finalSkins.push({ name: s.name || `skin-${idx}`, safeName: s.safeName || safeFileName(s.name || `skin-${idx}`), buffer, textureFile: `skin-${idx}.PNG`, type: s.type || 'free', geometry: s.geometry || 'geometry.humanoid.customSlim' });
      }

      if (finalSkins.length === 0) { setStatus('Bitte mindestens einen Skin einfügen.'); return; }

      // manifest
      const packUuid = makeUUID(); const moduleUuid = makeUUID();
      const manifest = { format_version: 2, header: { name: packName, description: packDesc, uuid: packUuid, version:[1,0,0], min_engine_version:[1,20,0] }, modules:[{ type:"skin_pack", uuid:moduleUuid, version:[1,0,0] }] };

      // skins.json
      const skinsJson = { skins: finalSkins.map(s => ({ localization_name: `${safePack}.skin.${s.safeName}`, geometry: s.geometry, texture: s.textureFile, type: s.type })), serialize_name: safePack, localization_name: packName };

      // texts
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
    // create new entry and open file dialog immediately (user gesture)
    addNewSkinEntry(true).catch(e => { console.error('addNewSkinEntry failed', e); setStatus('Fehler beim Hinzufügen eines Skins'); });
  });

  regenBtn.addEventListener('click', async () => {
    setStatus('Neues Platzhalterbild wird erzeugt...');
    for (const s of skinsData) { if (!s.uploadedFile) s.buffer = await createPlaceholderSkinPNG(64,64,true); }
    // refresh previews by clearing and re-creating DOM entries
    const copy = skinsData.slice();
    skinsData = copy;
    skinsContainer.innerHTML = '';
    for (const s of copy) await createSkinEntry(s, false);
    setStatus('Platzhalter aktualisiert.');
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    await buildPackAndDownload();
  });

  // viewer overlay click closes if clicked outside viewer box
  const overlay = document.getElementById('viewerOverlay');
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) { overlay.hidden = true; const container = document.getElementById('viewerCanvasContainer'); container.innerHTML = ''; }
  });

  // ----------------- Start -----------------
  preGeneratePlaceholders().catch(e => { console.error('preGenerate failed', e); setStatus('Fehler beim Start'); });
});
