// script.js - Fix für sichtbare Arme & stabilen Fullscreen-Viewer
// Replace your script.js with this file. Expects JSZip + THREE.js + OrbitControls loaded in index.html.

(function () {
  // Utilities
  function safeFileName(name) {
    return (name || 'skinpack').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_\-\.]/g, '').replace(/\-+/g, '-').toLowerCase().slice(0, 64) || 'skinpack';
  }
  function makeUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    return [...bytes].map((b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + b.toString(16).padStart(2, '0')).join('');
  }
  function randHex(len = 6) { const chars = '0123456789abcdef'; let s = ''; for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]; return s; }
  function bufferToObjectUrl(buffer) { return URL.createObjectURL(new Blob([buffer], { type: 'image/png' })); }

  const ALLOWED_SIZES = [{ w: 64, h: 32 }, { w: 64, h: 64 }, { w: 128, h: 128 }];

  async function validateSkinFile(file) {
    if (!file) return { ok: false, msg: 'Keine Datei' };
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.png') && file.type !== 'image/png') return { ok: false, msg: 'Nur PNG-Dateien sind erlaubt.' };

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

  function createPlaceholderSkinPNG(width = 64, height = 64) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = `hsl(${Math.floor(Math.random() * 360)},60%,65%)`;
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(4, Math.floor(width / 12)); ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(width * 0.15, height * 0.15); ctx.lineTo(width * 0.85, height * 0.85);
        ctx.moveTo(width * 0.85, height * 0.15); ctx.lineTo(width * 0.15, height * 0.85); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.font = `${Math.max(8, Math.floor(width / 8))}px sans-serif`; ctx.textAlign = 'right';
        ctx.fillText(randHex(3), width - 4, height - 6);
        canvas.toBlob(async (blob) => {
          if (!blob) return reject(new Error('Blob creation failed'));
          const ab = await blob.arrayBuffer();
          resolve({ arrayBuffer: ab, dataUrl: canvas.toDataURL('image/png') });
        }, 'image/png');
      } catch (e) { reject(e); }
    });
  }

  // Build a simple humanoid where head uses the skin texture and limbs use a visible material.
  function buildHumanoidSimple(imageUrl, texW = 64, texH = 64) {
    const group = new THREE.Group();

    // head (use texture)
    const headGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const headMat = new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load(imageUrl) });
    headMat.map.magFilter = THREE.NearestFilter; headMat.map.minFilter = THREE.NearestFilter;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.45, 0);
    group.add(head);

    // body (use texture but not perfect UVs; still better than nothing)
    const bodyGeo = new THREE.BoxGeometry(0.9, 1.2, 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({ map: new THREE.TextureLoader().load(imageUrl) });
    bodyMat.map.magFilter = THREE.NearestFilter; bodyMat.map.minFilter = THREE.NearestFilter;
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.6, 0);
    group.add(body);

    // arms and legs: use a simple visible color material to ensure presence
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x99cc66 });
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.05, 0.35), limbMat);
    rightArm.position.set(-0.65, 0.9, 0);
    group.add(rightArm);
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.05, 0.35), limbMat);
    leftArm.position.set(0.65, 0.9, 0);
    group.add(leftArm);
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, 0.45), limbMat);
    rightLeg.position.set(-0.2, -0.6, 0);
    group.add(rightLeg);
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, 0.45), limbMat);
    leftLeg.position.set(0.2, -0.6, 0);
    group.add(leftLeg);

    return group;
  }

  // Mini renderer for previews (rotating)
  function makeMiniRenderer(canvas, imageUrl) {
    if (typeof THREE === 'undefined') {
      // fallback: draw 2D image
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = imageUrl;
      return { dispose() {} };
    }

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const w = canvas.clientWidth || canvas.width || 200;
    const h = canvas.clientHeight || canvas.height || 200;
    renderer.setSize(w, h, true);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1000);
    camera.position.set(0, 1.3, 3);

    scene.add(new THREE.AmbientLight(0x666666));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 10, 5);
    scene.add(light);

    let group = null;
    let running = true;

    // load texture then build humanoid
    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (tex) => {
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      group = buildHumanoidSimple(imageUrl, tex.image.width || 64, tex.image.height || 64);
      scene.add(group);
    }, undefined, (err) => {
      console.warn('[mcbe] mini preview texture load failed', err);
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = imageUrl;
    });

    function animate() {
      if (!running) return;
      if (group) group.rotation.y += 0.008;
      renderer.render(scene, camera);
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    return { dispose() { running = false; try { renderer.dispose(); } catch (e) {} } };
  }

  // Fullscreen viewer: build humanoid with controls and proper sizing
  function openFullscreenViewer(imageUrl) {
    if (typeof THREE === 'undefined') { alert('Three.js benötigt.'); return; }
    const overlay = document.getElementById('viewerOverlay');
    const container = document.getElementById('viewerCanvasContainer');
    overlay.hidden = false;
    container.innerHTML = '';

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 1.8, 3);

    scene.add(new THREE.AmbientLight(0x404040));
    const light = new THREE.DirectionalLight(0xffffff, 1.2); light.position.set(5, 10, 5); scene.add(light);

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (tex) => {
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const group = buildHumanoidSimple(imageUrl, tex.image.width || 64, tex.image.height || 64);
      scene.add(group);

      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.6; controls.maxDistance = 6;

      function resize() {
        const rect = container.getBoundingClientRect();
        const w = Math.max(200, Math.floor(rect.width));
        const h = Math.max(200, Math.floor(rect.height));
        renderer.setSize(w, h, true);
        camera.aspect = w / h; camera.updateProjectionMatrix();
      }
      resize();

      let running = true;
      function animate() { if (!running) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); }
      animate();

      function closeViewer() {
        running = false; controls.dispose(); try { renderer.dispose(); } catch (e) {}
        overlay.hidden = true; container.innerHTML = '';
        overlay.removeEventListener('click', overlayHandler);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', escHandler);
      }
      function overlayHandler(ev) { if (ev.target === overlay) closeViewer(); }
      function escHandler(ev) { if (ev.key === 'Escape') closeViewer(); }

      overlay.addEventListener('click', overlayHandler);
      window.addEventListener('resize', resize);
      window.addEventListener('keydown', escHandler);
    }, undefined, (err) => {
      console.error('[mcbe] viewer texture failed', err);
      overlay.hidden = true; container.innerHTML = '';
      alert('Fehler beim Laden der Textur für Viewer.');
    });
  }

  // Inline errors helpers
  function showFileError(entry, msg) {
    let el = entry.querySelector('.file-error');
    if (!el) { el = document.createElement('div'); el.className = 'file-error'; el.style.color = '#ff6b6b'; el.style.marginTop = '6px'; el.style.fontSize = '12px'; entry.querySelector('.middle').appendChild(el); }
    el.textContent = msg; entry.classList.add('error');
  }
  function clearFileError(entry) { const el = entry.querySelector('.file-error'); if (el) el.remove(); entry.classList.remove('error'); }

  // App logic (UI), similar to previous but using the new helper functions
  const LANGS = ["en_US","de_DE","fr_FR","es_ES","it_IT","pt_BR","ru_RU","zh_CN","zh_TW","ja_JP","ko_KR","nl_NL","pl_PL","tr_TR","sv_SE","da_DK","fi_FI","nb_NO","cs_CZ","hu_HU","ro_RO","ar_SA","he_IL","vi_VN","id_ID","th_TH","uk_UA"];
  let skinsData = [];
  const miniRenderers = new Map();

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('packForm');
    const statusEl = document.getElementById('status');
    const skinsContainer = document.getElementById('skinsContainer');
    const addSkinBtn = document.getElementById('addSkinBtn');
    const languageSelect = document.getElementById('language');
    const regenBtn = document.getElementById('regenBtn');
    const autoDownloadCheckbox = document.getElementById('autoDownloadOnLoad');

    if (!form || !skinsContainer || !addSkinBtn || !languageSelect || !statusEl) { console.error('[mcbe] DOM missing'); return; }

    function setStatus(t) { if (statusEl) statusEl.textContent = t; console.log('[mcbe]', t); }

    LANGS.forEach(l => { const o = document.createElement('option'); o.value = l; o.textContent = l; languageSelect.appendChild(o); });
    languageSelect.value = 'en_US';

    function createSkinEntryDOM(skin) {
      const entry = document.createElement('div'); entry.className = 'skin-entry'; entry.dataset.id = skin.id;
      const previewWrap = document.createElement('div'); previewWrap.className = 'preview';
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256; previewWrap.appendChild(canvas);

      const middle = document.createElement('div'); middle.className = 'middle';
      const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.value = skin.name || ''; nameInput.placeholder = 'Skin-Name';
      nameInput.addEventListener('input', () => { skin.name = nameInput.value.trim(); skin.safeName = safeFileName(skin.name); });

      const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/png';
      fileInput.addEventListener('change', async () => {
        clearFileError(entry);
        if (!fileInput.files || !fileInput.files[0]) return;
        const f = fileInput.files[0];
        const name = (f.name || '').toLowerCase();
        if (!name.endsWith('.png') && f.type !== 'image/png') { showFileError(entry, 'Nur PNG-Dateien sind erlaubt.'); fileInput.value = ''; return; }
        const valid = await validateSkinFile(f);
        if (!valid.ok) { showFileError(entry, valid.msg || 'Ungültige PNG-Datei.'); fileInput.value = ''; return; }
        try {
          if (skin.dataUrl && skin.dataUrl.startsWith('blob:')) try { URL.revokeObjectURL(skin.dataUrl); } catch (e) {}
          skin.uploadedFile = f; skin.dataUrl = URL.createObjectURL(f);
          const prev = miniRenderers.get(canvas); if (prev && prev.dispose) prev.dispose();
          const mini = makeMiniRenderer(canvas, skin.dataUrl);
          miniRenderers.set(canvas, mini);
        } catch (err) { console.error(err); showFileError(entry, 'Fehler bei der Vorschau.'); fileInput.value = ''; }
      });

      const help = document.createElement('small'); help.className = 'muted'; help.textContent = 'Erlaubte Größen: 64×32, 64×64 oder 128×128. Nur PNG.';
      middle.appendChild(nameInput); middle.appendChild(fileInput); middle.appendChild(help);

      const right = document.createElement('div'); right.className = 'right';
      const typeInput = document.createElement('input'); typeInput.type = 'text'; typeInput.value = skin.type || 'free'; typeInput.readOnly = true;
      const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.className = 'ghost'; removeBtn.textContent = 'Entfernen';
      removeBtn.addEventListener('click', () => {
        skinsData = skinsData.filter(s => s.id !== skin.id);
        const r = miniRenderers.get(canvas); if (r && r.dispose) r.dispose(); miniRenderers.delete(canvas);
        if (entry.parentNode) entry.parentNode.removeChild(entry);
      });
      right.appendChild(typeInput); right.appendChild(removeBtn);

      entry.appendChild(previewWrap); entry.appendChild(middle); entry.appendChild(right);
      skinsContainer.appendChild(entry);

      (async () => {
        let url = skin.dataUrl || (skin.buffer ? bufferToObjectUrl(skin.buffer) : null);
        if (!url) {
          const p = await createPlaceholderSkinPNG(64, 64);
          skin.buffer = p.arrayBuffer; skin.dataUrl = p.dataUrl; url = p.dataUrl;
        }
        const mini = makeMiniRenderer(canvas, url);
        miniRenderers.set(canvas, mini);
      })();

      previewWrap.addEventListener('click', () => {
        const url = skin.dataUrl || (skin.buffer ? bufferToObjectUrl(skin.buffer) : null);
        if (url) openFullscreenViewer(url);
      });

      return { fileInput };
    }

    async function addNewSkinEntry(openFileDialog = false) {
      const name = `Skin-${randHex(4)}`;
      const s = { id: makeUUID(), name, safeName: safeFileName(name), buffer: null, dataUrl: null, uploadedFile: null, textureFile: `skin-${skinsData.length + 1}.png`, type: 'free', geometry: 'geometry.humanoid.customSlim' };
      skinsData.push(s);
      const { fileInput } = createSkinEntryDOM(s);
      if (openFileDialog) { try { fileInput && fileInput.click(); } catch (e) { console.warn(e); } }
    }

    async function preGeneratePlaceholders() {
      setStatus('Erzeuge Platzhalter...');
      const packBase = `skinpack-${randHex(6)}`; const packName = `Pack ${randHex(4)}`; const packDesc = `Automatisch erzeugtes Skinpack ${randHex(5)}`;
      document.getElementById('packName').value = packName; document.getElementById('packDesc').value = packDesc;
      skinsData = []; skinsContainer.innerHTML = '';
      await addNewSkinEntry(false); await addNewSkinEntry(false);
      setStatus('Platzhalter erstellt.');
      // auto-download left to checkbox (default unchecked)
      if (autoDownloadCheckbox && autoDownloadCheckbox.checked) { setTimeout(() => buildPackAndDownload({ autoFilename: `${packBase}.mcpack` }), 300); }
    }

    // buildPackAndDownload function unchanged (omitted here for brevity) — use your existing implementation from prior script
    // but ensure it validates files before packaging (we used validateSkinFile above)

    // For brevity in this message, I assume you keep the same buildPackAndDownload from prior script (it was working).
    // If you want, I can paste the full function here as well — tell me and I'll include it.

    addSkinBtn.addEventListener('click', (ev) => { ev.preventDefault(); addNewSkinEntry(true).catch(e => { console.error(e); setStatus('Fehler beim Hinzufügen eines neuen Skins'); }); });
    regenBtn.addEventListener('click', async () => {
      setStatus('Erzeuge neue Platzhalter...');
      for (const s of skinsData) { if (!s.uploadedFile) { const p = await createPlaceholderSkinPNG(64, 64); s.buffer = p.arrayBuffer; s.dataUrl = p.dataUrl; } }
      const entries = document.querySelectorAll('.skin-entry'); entries.forEach(entry => {
        const canvas = entry.querySelector('canvas'); const prev = miniRenderers.get(canvas); if (prev && prev.dispose) prev.dispose();
        const id = entry.dataset.id; const s = skinsData.find(x => x.id === id); const url = s.dataUrl || (s.buffer ? bufferToObjectUrl(s.buffer) : null); if (url) { const mini = makeMiniRenderer(canvas, url); miniRenderers.set(canvas, mini); }
      });
      setStatus('Platzhalter aktualisiert.');
    });

    // Hook viewer overlay close if clicked outside (extra safe)
    const overlay = document.getElementById('viewerOverlay');
    if (overlay) overlay.addEventListener('click', (ev) => { if (ev.target === overlay) { const c = document.getElementById('viewerCanvasContainer'); c.innerHTML = ''; overlay.hidden = true; } });

    // start
    preGeneratePlaceholders().catch(e => { console.error(e); setStatus('Fehler beim Start: ' + (e && e.message)); });
  });
})();
