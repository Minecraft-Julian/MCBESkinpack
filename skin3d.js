// 3D Skin Preview using Three.js
// Improved renderer with dual layers and correct UV mapping

import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

const { Vector2, Float32BufferAttribute } = THREE;

/**
 * Set the UV mapping for a box geometry.
 */
function setUVs(box, u, v, width, height, depth, textureWidth, textureHeight) {
    const toFaceVertices = (x1, y1, x2, y2) => [
        new Vector2(x1 / textureWidth, 1.0 - y2 / textureHeight),
        new Vector2(x2 / textureWidth, 1.0 - y2 / textureHeight),
        new Vector2(x2 / textureWidth, 1.0 - y1 / textureHeight),
        new Vector2(x1 / textureWidth, 1.0 - y1 / textureHeight),
    ];

    const top = toFaceVertices(u + depth, v, u + width + depth, v + depth);
    const bottom = toFaceVertices(u + width + depth, v, u + width * 2 + depth, v + depth);
    const left = toFaceVertices(u, v + depth, u + depth, v + depth + height);
    const front = toFaceVertices(u + depth, v + depth, u + width + depth, v + depth + height);
    const right = toFaceVertices(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
    const back = toFaceVertices(u + width + depth * 2, v + depth, u + width * 2 + depth * 2, v + height + depth);

    const uvAttr = box.attributes.uv;
    // Order: Right, Left, Top, Bottom, Front, Back
    const uvRight = [right[3], right[2], right[0], right[1]];
    const uvLeft = [left[3], left[2], left[0], left[1]];
    const uvTop = [top[3], top[2], top[0], top[1]];
    const uvBottom = [bottom[0], bottom[1], bottom[3], bottom[2]];
    const uvFront = [front[3], front[2], front[0], front[1]];
    const uvBack = [back[3], back[2], back[0], back[1]];

    const newUVData = [];
    for (const uvArray of [uvRight, uvLeft, uvTop, uvBottom, uvFront, uvBack]) {
        for (const uv of uvArray) {
            newUVData.push(uv.x, uv.y);
        }
    }
    uvAttr.set(new Float32Array(newUVData));
    uvAttr.needsUpdate = true;
}

function setSkinUVs(box, u, v, width, height, depth) {
    setUVs(box, u, v, width, height, depth, 64, 64);
}

export class Skin3DRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.width = options.width || 200;
    this.height = options.height || 200;
    this.autoRotate = options.autoRotate !== false;
    this.isSlim = options.isSlim !== false; // Default to slim
    
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.playerModel = null;
    this.animationId = null;
    
    this.layer1Material = new THREE.MeshLambertMaterial({ side: THREE.FrontSide });
    this.layer2Material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
    
    this.init();
  }
  
  init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1724);
    
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
    this.camera.position.set(0, 8, 24);
    this.camera.lookAt(0, 8, 0);
    
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
    
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = true;
    this.controls.enablePan = false;
    this.controls.enabled = false;
    this.controls.target.set(0, 8, 0);
    
    this.createPlayerModel();
    this.animate();
  }
  
  createPlayerModel() {
    this.playerModel = new THREE.Group();
    const armW = this.isSlim ? 3 : 4;
    
    // Head
    const headBox = new THREE.BoxGeometry(8, 8, 8);
    setSkinUVs(headBox, 0, 0, 8, 8, 8);
    const headMesh = new THREE.Mesh(headBox, this.layer1Material);
    const head2Box = new THREE.BoxGeometry(9, 9, 9);
    setSkinUVs(head2Box, 32, 0, 8, 8, 8);
    const head2Mesh = new THREE.Mesh(head2Box, this.layer2Material);
    
    const headGroup = new THREE.Group();
    headGroup.add(headMesh, head2Mesh);
    headMesh.position.y = 4;
    head2Mesh.position.y = 4;
    headGroup.position.y = 12;
    headGroup.name = 'head';
    this.playerModel.add(headGroup);
    
    // Body
    const bodyBox = new THREE.BoxGeometry(8, 12, 4);
    setSkinUVs(bodyBox, 16, 16, 8, 12, 4);
    const bodyMesh = new THREE.Mesh(bodyBox, this.layer1Material);
    const body2Box = new THREE.BoxGeometry(8.5, 12.5, 4.5);
    setSkinUVs(body2Box, 16, 32, 8, 12, 4);
    const body2Mesh = new THREE.Mesh(body2Box, this.layer2Material);
    
    const bodyGroup = new THREE.Group();
    bodyGroup.add(bodyMesh, body2Mesh);
    bodyMesh.position.y = 6;
    body2Mesh.position.y = 6;
    bodyGroup.position.y = 0;
    bodyGroup.name = 'body';
    this.playerModel.add(bodyGroup);
    
    // Arms & Legs
    const parts = [
        { name: 'rightArm', w: armW, h: 12, d: 4, u1: 44, v1: 20, u2: 44, v2: 36, x: -(4 + armW/2), y: 6 },
        { name: 'leftArm',  w: armW, h: 12, d: 4, u1: 36, v1: 52, u2: 52, v2: 52, x: (4 + armW/2),  y: 6 },
        { name: 'rightLeg', w: 4,    h: 12, d: 4, u1: 4,  v1: 20, u2: 4,  v2: 36, x: -2,            y: -6 },
        { name: 'leftLeg',  w: 4,    h: 12, d: 4, u1: 20, v1: 52, u2: 24, v2: 52, x: 2,             y: -6 }
    ];

    parts.forEach(p => {
        const b1 = new THREE.BoxGeometry(p.w, p.h, p.d);
        setSkinUVs(b1, p.u1, p.v1, p.w, p.h, p.d);
        const m1 = new THREE.Mesh(b1, this.layer1Material);
        
        const b2 = new THREE.BoxGeometry(p.w + 0.5, p.h + 0.5, p.d + 0.5);
        setSkinUVs(b2, p.u2, p.v2, p.w, p.h, p.d);
        const m2 = new THREE.Mesh(b2, this.layer2Material);
        
        const group = new THREE.Group();
        group.add(m1, m2);
        m1.position.y = 6;
        m2.position.y = 6;
        group.position.set(p.x, p.y, 0);
        group.name = p.name;
        this.playerModel.add(group);
    });
    
    this.scene.add(this.playerModel);
  }
  
  loadSkinTexture(imageSource) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      const url = imageSource instanceof Blob ? URL.createObjectURL(imageSource) : imageSource;
      
      loader.load(url, (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          this.layer1Material.map = texture;
          this.layer2Material.map = texture;
          this.layer1Material.needsUpdate = true;
          this.layer2Material.needsUpdate = true;
          resolve(texture);
      }, undefined, reject);
    });
  }
  
  animate() {
    this.animationId = requestAnimationFrame(() => this.animate());
    if (this.autoRotate && this.playerModel && !this.controls.enabled) {
      this.playerModel.rotation.y += 0.01;
    }
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.animationId) cancelAnimationFrame(this.animationId);
    if (this.renderer) {
      this.renderer.dispose();
      this.container.removeChild(this.renderer.domElement);
    }
  }
}