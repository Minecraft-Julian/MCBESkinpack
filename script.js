// script.js - Fixes: complete model (head/body/arms/legs), robust viewer init, upload validation
// Replace existing script.js with this file (expects JSZip, THREE.js, OrbitControls loaded)

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

  // Compute offset/repeat for a pixel region (u,v,w,h) inside texture texW/texH.
  function computeOffsetRepeat(u, v, w, h, texW, texH) {
    const repeatX = w / texW;
    const repeatY = h / texH;
    const offsetX = u / texW;
    const offsetY = 1 - (v + h) / texH; // convert top-left to bottom-left
    return { offset: [offsetX, offsetY], repeat: [repeatX, repeatY] };
  }

  // Create a box mesh with per-face materials that sample different regions of the same texture.
  function makeBoxWithFaceRegions(imageUrl, texW, texH, regions) {
    // regions: array of 6 {u,v,w,h} for faces: +X,-X,+Y,-Y,+Z,-Z
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = regions.map(reg => {
      const tex = new THREE.TextureLoader().load(imageUrl);
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const cr = computeOffsetRepeat(reg.u, reg.v, reg.w, reg.h, texW, texH);
      tex.offset.set(cr.offset[0], cr.offset[1]);
      tex.repeat.set(cr.repeat[0], cr.repeat[1]);
      tex.wrapS = THREE.ClampToEdgeWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
      return new THREE.MeshStandardMaterial({ map: tex, skinning: false });
    });
    return new THREE.Mesh(geometry, materials);
  }

  // Build the full humanoid (head, body, arms, legs) with approximate UV mapping for 64x64 skins.
  function buildHumanoidGroup(textureUrl, texW = 64, texH = 64) {
    const group = new THREE.Group();

    // Head regions (64x64 layout)
    const headRegions = [
      { u: 16, v: 8, w: 8, h: 8 }, // right
      { u: 0, v: 8, w: 8, h: 8 },  // left
      { u: 8, v: 0, w: 8, h: 8 },  // top
      { u: 24, v: 0, w: 8, h: 8 }, // bottom (note: bottom is at u=24 in some layouts; fallback)
      { u: 8, v: 8, w: 8, h: 8 },  // front
      { u: 24, v: 8, w: 8, h: 8 }  // back
    ];
    const head = makeBoxWithFaceRegions(textureUrl, texW, texH, headRegions);
    head.scale.set(0.9, 0.9, 0.9);
    head.position.set(0, 1.45, 0);
    group.add(head);

    // Body regions (approximate)
    const bodyRegions = [
      { u: 20, v: 20, w: 8, h: 12 }, // right
      { u: 36, v: 52, w: 8, h: 12 }, // left (fallback)
      { u: 20, v: 16, w: 8, h: 4 },  // top
      { u: 28, v: 20, w: 8, h: 4 },  // bottom (fallback)
      { u: 20, v: 20, w: 8, h: 12 }, // front
      { u: 32, v: 20, w: 8, h: 12 }  // back
    ];
    const body = makeBoxWithFaceRegions(textureUrl, texW, texH, bodyRegions);
    body.scale.set(0.9, 1.2, 0.5);
    body.position.set(0, 0.6, 0);
    group.add(body);

    // Right arm (approximate mapping)
    const armRegions = [
      { u: 44, v: 20, w: 4, h: 12 }, // right
      { u: 44, v: 20, w: 4, h: 12 }, // left (reuse)
      { u: 44, v: 16, w: 4, h: 4 },  // top
      { u: 48, v: 16, w: 4, h: 4 },  // bottom
      { u: 44, v: 20, w: 4, h: 12 }, // front
      { u: 48, v: 20, w: 4, h: 12 }  // back
    ];
    const rightArm = makeBoxWithFaceRegions(textureUrl, texW, texH, armRegions);
    rightArm.scale.set(0.35, 1.05, 0.35);
    rightArm.position.set(-0.65, 0.9, 0);
    group.add(rightArm);

    // Left arm: mirror (use same regions)
    const leftArm = makeBoxWithFaceRegions(textureUrl, texW, texH, armRegions);
    leftArm.scale.set(0.35, 1.05, 0.35);
    leftArm.position.set(0.65, 0.9, 0);
    group.add(leftArm);

    // Right leg
    const legRegions = [
      { u: 4, v: 20, w: 4, h: 12 },
      { u: 4, v: 20, w: 4, h: 12 },
      { u: 8, v: 16, w: 4, h: 4 },
      { u: 12, v: 16, w: 4, h: 4 },
      { u: 4, v: 20, w: 4, h: 12 },
      { u: 8, v: 20, w: 4, h: 12 }
    ];
    const rightLeg = makeBoxWithFaceRegions(textureUrl, texW, texH, legRegions);
    rightLeg.scale.set(0.45, 1.05, 0.45);
    rightLeg.position.set(-0.2, -0.6, 0);
    group.add(rightLeg);

    // Left leg
    const leftLeg = makeBoxWithFaceRegions(textureUrl, texW, texH, legRegions);
    leftLeg.scale.set(0.45, 1.05, 0.45);
    leftLeg.position.set(0.2, -0.6, 0);
    group.add(leftLeg);

    return group;
  }

  // Mini renderer that rotates the full humanoid
  function makeMiniRenderer(canvas, imageUrl, texW = 64, texH = 64) {
    if (typeof THREE === 'undefined') {
      // fallback draw image on 2D canvas
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); };
      img.src = imageUrl;
      return { dispose() {} };
    }

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const width = canvas.clientWidth || canvas.width || 200;
    const height = canvas.clientHeight || canvas.height || 200;
    renderer.setSize(width, height, true);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 1.3, 3);

    scene.add(new THREE.AmbientLight(0x666666));
    const light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(5, 10, 5);
    scene.add(light);

    let group = null;
    let running = true;

    // load texture then build model
    const texLoader = new THREE.TextureLoader();
    texLoader.load(imageUrl, (tex) => {
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      group = buildHumanoidGroup(imageUrl, texW, texH);
      scene.add(group);
    }, undefined, (err) => {
      // if texture fails, still show placeholder by drawing image 2D
      console.warn('[mcbe] mini texture load failed', err);
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
    // start animation loop
    requestAnimationFrame(animate);

    return {
      dispose() { running = false; try { renderer.dispose(); } catch (e) {} }
    };
  }

  // Fullscreen viewer (OrbitControls)
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

    const light = new THREE.DirectionalLight(0xffffff, 1.2); light.position.set(5, 10, 7); scene.add(light);
    scene.add(new THREE.AmbientLight(0x404040, 0.9));

    const loader = new THREE.TextureLoader();
    loader.load(imageUrl, (tex) => {
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
      const group = buildHumanoidGroup(imageUrl, tex.image.width || 64, tex.image.height || 64);
      scene.add(group);

      const controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enablePan = false; controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 1.6; controls.maxDistance = 6;

      function size() {
        const rect = container.getBoundingClientRect();
        const w = Math.max(100, Math.floor(rect.width));
        const h = Math.max(100, Math.floor(rect.height));
        renderer.setSize(w, h, true);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      size();

      let running = true;
      function animate() { if (!running) return; controls.update(); renderer.render(scene, camera); requestAnimationFrame(animate); }
      animate();

      function closeViewer() {
        running = false; controls.dispose(); try { renderer.dispose(); } catch (e) {}
        overlay.hidden = true; container.innerHTML = '';
        overlay.removeEventListener('click', overlayHandler);
        window.removeEventListener('resize', size);
        window.removeEventListener('keydown', escHandler);
      }
      function overlayHandler(ev) { if (ev.target === overlay) closeViewer(); }
      function escHandler(ev) { if (ev.key === 'Escape') closeViewer(); }

      overlay.addEventListener('click', overlayHandler);
      window.addEventListener('resize', size);
      window.addEventListener('keydown', escHandler);
    }, undefined, (err) => {
      console.error('[mcbe] viewer texture failed', err);
      overlay.hidden = true; container.innerHTML = '';
      alert('Fehler beim Laden der Textur für Viewer.');
    });
  }

  // Inline error helpers
  function showFileError(entry, msg) {
    let el = entry.querySelector('.file-error');
    if (!el) { el = document.createElement('div'); el.className = 'file-error'; el.style.color = '#ff6b6b'; el.style.marginTop = '6px'; el.style.fontSize = '12px'; entry.querySelector('.middle').appendChild(el); }
    el.textContent = msg; entry.classList.add('error');
  }
  function clearFileError(entry) { const el = entry.querySelector('.file-error'); if (el) el.remove(); entry.classList.remove('error'); }

  // App logic
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
    function setStatus(t) { if (statusEl) statusEl.textContent = t; }

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
          if (skin.dataUrl && skin.dataUrl.startsWith('blob:')) try { URL.revokeObjectURL(skin.dataUrl); } catch(e){}
          skin.uploadedFile = f; skin.dataUrl = URL.createObjectURL(f);
          const prev = miniRenderers.get(canvas); if (prev && prev.dispose) prev.dispose();
          const mini = makeMiniRenderer(canvas, skin.dataUrl, valid.width, valid.height);
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
        const mini = makeMiniRenderer(canvas, url, 64, 64);
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
      // Only auto-download if checkbox is checked (default should be unchecked)
      if (autoDownloadCheckbox && autoDownloadCheckbox.checked) {
        setTimeout(() => buildPackAndDownload({ autoFilename: `${packBase}.mcpack` }), 300);
      }
    }

    async function buildPackAndDownload(options = {}) {
      try {
        setStatus('Erzeuge Skinpack...');
        if (typeof JSZip === 'undefined') { setStatus('JSZip nicht geladen'); return; }

        const packName = (document.getElementById('packName').value || '').trim() || `Pack-${randHex(4)}`;
        const packDesc = (document.getElementById('packDesc').value || '').trim() || '';
        const lang = (document.getElementById('language').value) || 'en_US';
        const safePack = safeFileName(packName) || `skinpack-${randHex(4)}`;
        const rootFolderName = `${safePack}.mcpack/`;
        const packUuid = makeUUID();
        const moduleUuid = makeUUID();

        const finalSkins = []; const entries = Array.from(document.querySelectorAll('.skin-entry')); let idx = 0;
        for (const entry of entries) {
          const id = entry.dataset.id; const s = skinsData.find(x => x.id === id); if (!s) continue;
          const fileInput = entry.querySelector('input[type="file"]'); let fileBuffer = null;
          if (fileInput && fileInput.files && fileInput.files[0]) {
            const v = await validateSkinFile(fileInput.files[0]); if (!v.ok) { alert(v.msg); return; }
            fileBuffer = await fileInput.files[0].arrayBuffer();
          } else if (s.uploadedFile) {
            const v = await validateSkinFile(s.uploadedFile); if (!v.ok) { alert(v.msg); return; }
            fileBuffer = await s.uploadedFile.arrayBuffer();
          } else if (s.buffer) { fileBuffer = s.buffer; } else { const p = await createPlaceholderSkinPNG(64, 64); fileBuffer = p.arrayBuffer; }
          idx++;
          finalSkins.push({ name: s.name || `skin-${idx}`, safeName: s.safeName || safeFileName(s.name || `skin-${idx}`), buffer: fileBuffer, textureFile: `skin-${idx}.PNG`, type: s.type || 'free', geometry: s.geometry || 'geometry.humanoid.customSlim', uuid: makeUUID() });
        }

        if (finalSkins.length === 0) { setStatus('Bitte mindestens einen Skin einfügen.'); return; }

        const manifest = { format_version: 2, header: { name: packName, description: packDesc, uuid: packUuid, version: [1, 0, 0], min_engine_version: [1, 20, 0] }, modules: [{ type: "skin_pack", uuid: moduleUuid, version: [1, 0, 0] }] };

        const skinsJson = { skins: finalSkins.map(s => ({ localization_name: `${safePack}.skin.${s.safeName}`, geometry: s.geometry, texture: s.textureFile, type: s.type })), serialize_name: safePack, localization_name: packName };

        const lines = []; lines.push(`${safePack}.pack.title=${packName}`); finalSkins.forEach(s => lines.push(`${safePack}.skin.${s.safeName}=${s.name}`));
        const langContents = lines.join('\n');

        setStatus('Erzeuge ZIP-Struktur mit JSZip...');
        const zip = new JSZip(); const root = zip.folder(rootFolderName);
        root.file('manifest.json', JSON.stringify(manifest, null, 2)); root.file('skins.json', JSON.stringify(skinsJson, null, 2));
        for (let i = 0; i < finalSkins.length; i++) { root.file(finalSkins[i].textureFile, finalSkins[i].buffer, { binary: true }); }
        const textsFolder = root.folder('texts'); textsFolder.file(`${lang}.lang`, langContents);

        setStatus('Packe Dateien (ZIP)...'); const contentBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        const filename = options.autoFilename || `${safePack}.mcpack`; const url = URL.createObjectURL(contentBlob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        setStatus(`Fertig — Download gestartet: ${filename}`);
      } catch (err) { console.error('[mcbe] build error', err); setStatus('Fehler: ' + (err && err.message ? err.message : String(err))); }
    }

    // events
    addSkinBtn.addEventListener('click', (ev) => { ev.preventDefault(); addNewSkinEntry(true).catch(e => { console.error(e); setStatus('Fehler beim Hinzufügen eines neuen Skins (Konsole prüfen).'); }); });
    regenBtn.addEventListener('click', async () => {
      setStatus('Erzeuge neue Platzhalter...');
      for (const s of skinsData) { if (!s.uploadedFile) { const p = await createPlaceholderSkinPNG(64, 64); s.buffer = p.arrayBuffer; s.dataUrl = p.dataUrl; } }
      const entries = document.querySelectorAll('.skin-entry'); entries.forEach(entry => {
        const canvas = entry.querySelector('canvas'); const prev = miniRenderers.get(canvas); if (prev && prev.dispose) prev.dispose();
        const id = entry.dataset.id; const s = skinsData.find(x => x.id === id); const url = s.dataUrl || (s.buffer ? bufferToObjectUrl(s.buffer) : null); if (url) { const mini = makeMiniRenderer(canvas, url); miniRenderers.set(canvas, mini); }
      });
      setStatus('Neue Platzhalter wurden erzeugt.');
    });

    form.addEventListener('submit', async (ev) => { ev.preventDefault(); await buildPackAndDownload(); });

    document.getElementById('viewerOverlay').addEventListener('click', (ev) => {
      if (ev.target.id === 'viewerOverlay') { const container = document.getElementById('viewerCanvasContainer'); container.innerHTML = ''; ev.currentTarget.hidden = true; }
    });

    // start
    preGeneratePlaceholders().catch(e => { console.error(e); setStatus('Fehler beim Erzeugen der Platzhalter: ' + (e && e.message)); });
  });
})();
