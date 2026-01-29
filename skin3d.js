// 3D Skin Preview using Three.js
// Improved assembly and UV mapping for Minecraft skins

import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

/**
 * Helper function to set UV coordinates for a BoxGeometry
 * Based on the Minecraft texture layout.
 */
function setUVs(box, u, v, width, height, depth, textureWidth, textureHeight) {
    const toFaceVertices = (x1, y1, x2, y2) => [
        new THREE.Vector2(x1 / textureWidth, 1.0 - y2 / textureHeight),
        new THREE.Vector2(x2 / textureWidth, 1.0 - y2 / textureHeight),
        new THREE.Vector2(x2 / textureWidth, 1.0 - y1 / textureHeight),
        new THREE.Vector2(x1 / textureWidth, 1.0 - y1 / textureHeight),
    ];

    const top = toFaceVertices(u + depth, v, u + width + depth, v + depth);
    const bottom = toFaceVertices(u + width + depth, v, u + width * 2 + depth, v + depth);
    const left = toFaceVertices(u, v + depth, u + depth, v + depth + height);
    const front = toFaceVertices(u + depth, v + depth, u + width + depth, v + depth + height);
    const right = toFaceVertices(u + width + depth, v + depth, u + width + depth * 2, v + height + depth);
    const back = toFaceVertices(u + width + depth * 2, v + depth, u + width * 2 + depth * 2, v + height + depth);

    const uvAttr = box.attributes.uv;
    // Order in Three.js BoxGeometry: Right, Left, Top, Bottom, Front, Back
    const faces = [right, left, top, bottom, front, back];
    const newUVData = [];

    faces.forEach(face => {
        newUVData.push(face[3].x, face[3].y);
        newUVData.push(face[2].x, face[2].y);
        newUVData.push(face[0].x, face[0].y);
        newUVData.push(face[1].x, face[1].y);
    });

    uvAttr.set(new Float32Array(newUVData));
    uvAttr.needsUpdate = true;
}

export class Skin3DRenderer {
    constructor(container, options = {}) {
        this.container = container;
        this.width = options.width || 200;
        this.height = options.height || 200;
        this.autoRotate = options.autoRotate !== false;
        this.isSlim = options.isSlim !== false; 
        this.isZoomed = false;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.playerModel = null;
        this.animationId = null;
        
        this.init();
    }

    init() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f1724);
        
        this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 1000);
        this.camera.position.set(0, 8, 24);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
        this.scene.add(ambientLight);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.4);
        dirLight.position.set(5, 15, 10);
        this.scene.add(dirLight);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(0, 8, 0);
        this.controls.enabled = false;

        this.createPlayerModel();
        this.animate();
    }

    createBodyPart(name, w, h, d, u, v, isLayer2 = false) {
        const offset = isLayer2 ? 0.5 : 0;
        const geometry = new THREE.BoxGeometry(w + offset, h + offset, d + offset);
        
        setUVs(geometry, u, v, w, h, d, 64, 64);
        
        const material = new THREE.MeshLambertMaterial({
            transparent: true,
            alphaTest: 0.5,
            side: isLayer2 ? THREE.DoubleSide : THREE.FrontSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = isLayer2 ? `${name}Layer2` : name;
        return mesh;
    }

    createPlayerModel() {
        this.playerModel = new THREE.Group();
        const armW = this.isSlim ? 3 : 4;

        // Parts Definition: [name, w, h, d, u_inner, v_inner, u_outer, v_outer]
        const parts = [
            ['head', 8, 8, 8, 8, 0, 40, 0],
            ['body', 8, 12, 4, 20, 20, 20, 36],
            ['rightArm', armW, 12, 4, 44, 20, 44, 36],
            ['leftArm', armW, 12, 4, 36, 52, 52, 52],
            ['rightLeg', 4, 12, 4, 4, 20, 4, 36],
            ['leftLeg', 4, 12, 4, 20, 52, 4, 52]
        ];

        parts.forEach(([name, w, h, d, u1, v1, u2, v2]) => {
            const group = new THREE.Group();
            group.name = `${name}Group`;

            const inner = this.createBodyPart(name, w, h, d, u1, v1);
            const outer = this.createBodyPart(name, w, h, d, u2, v2, true);
            
            group.add(inner);
            group.add(outer);

            // Positioning
            if (name === 'head') group.position.y = 12 + 4;
            if (name === 'body') group.position.y = 6 + 4;
            if (name === 'rightArm') group.position.set(-(4 + armW/2), 6 + 4, 0);
            if (name === 'leftArm') group.position.set(4 + armW/2, 6 + 4, 0);
            if (name === 'rightLeg') group.position.set(-2, -6 + 4, 0);
            if (name === 'leftLeg') group.position.set(2, -6 + 4, 0);

            this.playerModel.add(group);
        });

        this.scene.add(this.playerModel);
    }

    applySkinTexture(texture) {
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        
        this.playerModel.traverse((child) => {
            if (child.isMesh) {
                child.material.map = texture;
                child.material.needsUpdate = true;
            }
        });
    }

    async loadSkinTexture(source) {
        const loader = new THREE.TextureLoader();
        const url = source instanceof File || source instanceof Blob ? URL.createObjectURL(source) : source;
        
        return new Promise((resolve, reject) => {
            loader.load(url, (tex) => {
                this.applySkinTexture(tex);
                resolve(tex);
            }, undefined, reject);
        });
    }

    setAutoRotate(enabled) {
        this.autoRotate = enabled;
    }

    enableZoomMode() {
        this.isZoomed = true;
        this.autoRotate = false;
        this.controls.enabled = true;
        
        // Resize to larger view
        this.resize(400, 400);
    }

    disableZoomMode() {
        this.isZoomed = false;
        this.autoRotate = true;
        this.controls.enabled = false;
        this.controls.reset();
        
        // Resize back to normal
        this.resize(this.width, this.height);
    }

    resize(width, height) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
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
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
            if (this.container && this.renderer.domElement) {
                this.container.removeChild(this.renderer.domElement);
            }
        }
        
        if (this.scene) {
            // Collect unique textures to dispose them only once
            const textures = new Set();
            
            this.scene.traverse((object) => {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    const materials = Array.isArray(object.material) ? object.material : [object.material];
                    materials.forEach(material => {
                        // Collect texture reference before disposing material
                        if (material.map) {
                            textures.add(material.map);
                        }
                        material.dispose();
                    });
                }
            });
            
            // Dispose each unique texture once
            textures.forEach(texture => texture.dispose());
        }
    }
}

// Validation utilities
export function validateSkinFile(file) {
  return new Promise((resolve, reject) => {
    // Check file type
    if (!file.type || file.type !== 'image/png') {
      reject(new Error('Nur PNG-Dateien sind erlaubt.'));
      return;
    }
    
    // Check file size (max 1MB)
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (file.size > maxSize) {
      reject(new Error('Datei ist zu groß (max. 1MB).'));
      return;
    }
    
    // Check dimensions
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      // Accept 64x32, 64x64, or 128x128 skin sizes
      const validSizes = [
        { width: 64, height: 32 },
        { width: 64, height: 64 },
        { width: 128, height: 128 }
      ];
      
      const isValidSize = validSizes.some(size => 
        img.width === size.width && img.height === size.height
      );
      
      if (!isValidSize) {
        reject(new Error(`Ungültige Abmessungen: ${img.width}x${img.height}px. Erforderlich: 64x32, 64x64 oder 128x128px.`));
        return;
      }
      
      resolve(true);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Fehler beim Laden des Bildes.'));
    };
    
    img.src = url;
  });
}