// 3D Skin Preview using Three.js
// Creates a Minecraft player model with skin texture that can rotate

import * as THREE from './three.module.min.js';
import { OrbitControls } from './OrbitControls.js';

const { Float32BufferAttribute } = THREE;

export class Skin3DRenderer {
  constructor(container, options = {}) {
    this.container = container;
    this.width = options.width || 200;
    this.height = options.height || 200;
    this.autoRotate = options.autoRotate !== false;
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
    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f1724);
    
    // Camera
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      0.1,
      1000
    );
    this.camera.position.set(0, 8, 20);
    this.camera.lookAt(0, 8, 0);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, 5, -5);
    this.scene.add(directionalLight2);
    
    // OrbitControls (disabled by default, enabled in zoom mode)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = true;  // Enable zoom
    this.controls.enablePan = false;
    this.controls.enabled = false;  // Start disabled for small preview
    this.controls.target.set(0, 8, 0);
    this.controls.minDistance = 10;
    this.controls.maxDistance = 50;
    
    // Create player model
    this.createPlayerModel();
    
    // Start animation
    this.animate();
  }
  
  createPlayerModel() {
    // Create a simplified Minecraft player model (humanoid.customSlim compatible)
    this.playerModel = new THREE.Group();
    
    // Head (8x8x8)
    const headGeometry = new THREE.BoxGeometry(8, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 12;
    head.name = 'head';
    this.playerModel.add(head);
    
    // Body (8x12x4)
    const bodyGeometry = new THREE.BoxGeometry(8, 12, 4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 6;
    body.name = 'body';
    this.playerModel.add(body);
    
    // Right Arm (3x12x4 for slim model)
    const armGeometry = new THREE.BoxGeometry(3, 12, 4);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(-5.5, 6, 0);
    rightArm.name = 'rightArm';
    this.playerModel.add(rightArm);
    
    // Left Arm (3x12x4 for slim model)
    const leftArm = new THREE.Mesh(armGeometry, new THREE.MeshLambertMaterial({ color: 0x888888 }));
    leftArm.position.set(5.5, 6, 0);
    leftArm.name = 'leftArm';
    this.playerModel.add(leftArm);
    
    // Right Leg (4x12x4)
    const legGeometry = new THREE.BoxGeometry(4, 12, 4);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(-2, -6, 0);
    rightLeg.name = 'rightLeg';
    this.playerModel.add(rightLeg);
    
    // Left Leg (4x12x4)
    const leftLeg = new THREE.Mesh(legGeometry, new THREE.MeshLambertMaterial({ color: 0x888888 }));
    leftLeg.position.set(2, -6, 0);
    leftLeg.name = 'leftLeg';
    this.playerModel.add(leftLeg);
    
    this.scene.add(this.playerModel);
  }
  
  loadSkinTexture(imageSource) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      
      let textureUrl;
      if (typeof imageSource === 'string') {
        textureUrl = imageSource;
      } else if (imageSource instanceof File || imageSource instanceof Blob) {
        textureUrl = URL.createObjectURL(imageSource);
      } else {
        reject(new Error('Invalid image source'));
        return;
      }
      
      loader.load(
        textureUrl,
        (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          this.applySkinTexture(texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }
  
  applySkinTexture(texture) {
    // Apply UV mapping for Minecraft skin format (64x64, 64x32, or 128x128)
    // Apply texture to all body parts: head, body, arms, and legs
    
    const texturedParts = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    
    // Track old texture to dispose it only once after all materials are updated
    // Note: After first texture application, all parts share same texture
    let oldTexture = null;
    
    texturedParts.forEach((partName, index) => {
      const part = this.playerModel.getObjectByName(partName);
      if (part) {
        // Save reference to old texture from first part that has one
        // (all parts share same texture after initial texture application)
        if (index === 0 && part.material && part.material.map) {
          oldTexture = part.material.map;
        }
        
        // Dispose old material
        if (part.material) {
          part.material.dispose();
        }
        
        // Share the same texture across all body parts to save memory
        part.material = new THREE.MeshLambertMaterial({
          map: texture,
          transparent: true
        });
        part.material.map.needsUpdate = true;
        
        // Apply UV mapping
        this.applyUVMapping(part, partName);
      }
    });
    
    // Dispose old texture once after all materials are updated
    if (oldTexture && oldTexture !== texture) {
      oldTexture.dispose();
    }
  }
  
  applyUVMapping(mesh, partName) {
    // Apply proper UV mapping for Minecraft skin format (64x32, 64x64, or 128x128)
    const geometry = mesh.geometry;
    if (!geometry.attributes.uv) return;
    
    // Minecraft skin UV coordinates for each body part
    // Format: [u, v] where u,v are in range 0-1
    const uvMappings = {
      head: {
        // Head is 8x8x8 pixels at position (0, 0) and (32, 0) in the texture
        right:  [[16/64, 8/64], [24/64, 8/64], [24/64, 16/64], [16/64, 16/64]],
        left:   [[0/64, 8/64], [8/64, 8/64], [8/64, 16/64], [0/64, 16/64]],
        top:    [[8/64, 0/64], [16/64, 0/64], [16/64, 8/64], [8/64, 8/64]],
        bottom: [[16/64, 0/64], [24/64, 0/64], [24/64, 8/64], [16/64, 8/64]],
        front:  [[8/64, 8/64], [16/64, 8/64], [16/64, 16/64], [8/64, 16/64]],
        back:   [[24/64, 8/64], [32/64, 8/64], [32/64, 16/64], [24/64, 16/64]]
      },
      body: {
        // Body is 8x12x4 pixels
        right:  [[28/64, 20/64], [32/64, 20/64], [32/64, 32/64], [28/64, 32/64]],
        left:   [[16/64, 20/64], [20/64, 20/64], [20/64, 32/64], [16/64, 32/64]],
        top:    [[20/64, 16/64], [28/64, 16/64], [28/64, 20/64], [20/64, 20/64]],
        bottom: [[28/64, 16/64], [36/64, 16/64], [36/64, 20/64], [28/64, 20/64]],
        front:  [[20/64, 20/64], [28/64, 20/64], [28/64, 32/64], [20/64, 32/64]],
        back:   [[32/64, 20/64], [40/64, 20/64], [40/64, 32/64], [32/64, 32/64]]
      },
      rightArm: {
        // Right arm slim (3x12x4)
        right:  [[44/64, 20/64], [47/64, 20/64], [47/64, 32/64], [44/64, 32/64]],
        left:   [[40/64, 20/64], [43/64, 20/64], [43/64, 32/64], [40/64, 32/64]],
        top:    [[43/64, 16/64], [47/64, 16/64], [47/64, 20/64], [43/64, 20/64]],
        bottom: [[47/64, 16/64], [51/64, 16/64], [51/64, 20/64], [47/64, 20/64]],
        front:  [[43/64, 20/64], [47/64, 20/64], [47/64, 32/64], [43/64, 32/64]],
        back:   [[51/64, 20/64], [55/64, 20/64], [55/64, 32/64], [51/64, 32/64]]
      },
      leftArm: {
        // Left arm slim (3x12x4)
        right:  [[36/64, 52/64], [39/64, 52/64], [39/64, 64/64], [36/64, 64/64]],
        left:   [[32/64, 52/64], [35/64, 52/64], [35/64, 64/64], [32/64, 64/64]],
        top:    [[35/64, 48/64], [39/64, 48/64], [39/64, 52/64], [35/64, 52/64]],
        bottom: [[39/64, 48/64], [43/64, 48/64], [43/64, 52/64], [39/64, 52/64]],
        front:  [[35/64, 52/64], [39/64, 52/64], [39/64, 64/64], [35/64, 64/64]],
        back:   [[43/64, 52/64], [47/64, 52/64], [47/64, 64/64], [43/64, 64/64]]
      },
      rightLeg: {
        // Right leg (4x12x4)
        right:  [[4/64, 20/64], [8/64, 20/64], [8/64, 32/64], [4/64, 32/64]],
        left:   [[0/64, 20/64], [4/64, 20/64], [4/64, 32/64], [0/64, 32/64]],
        top:    [[4/64, 16/64], [8/64, 16/64], [8/64, 20/64], [4/64, 20/64]],
        bottom: [[8/64, 16/64], [12/64, 16/64], [12/64, 20/64], [8/64, 20/64]],
        front:  [[4/64, 20/64], [8/64, 20/64], [8/64, 32/64], [4/64, 32/64]],
        back:   [[12/64, 20/64], [16/64, 20/64], [16/64, 32/64], [12/64, 32/64]]
      },
      leftLeg: {
        // Left leg (4x12x4)
        right:  [[20/64, 52/64], [24/64, 52/64], [24/64, 64/64], [20/64, 64/64]],
        left:   [[16/64, 52/64], [20/64, 52/64], [20/64, 64/64], [16/64, 64/64]],
        top:    [[20/64, 48/64], [24/64, 48/64], [24/64, 52/64], [20/64, 52/64]],
        bottom: [[24/64, 48/64], [28/64, 48/64], [28/64, 52/64], [24/64, 52/64]],
        front:  [[20/64, 52/64], [24/64, 52/64], [24/64, 64/64], [20/64, 64/64]],
        back:   [[28/64, 52/64], [32/64, 52/64], [32/64, 64/64], [28/64, 64/64]]
      }
    };
    
    const mapping = uvMappings[partName];
    if (mapping) {
      const uvArray = [];
      // Box geometry has 6 faces, each face has 2 triangles (4 vertices)
      // Order: right, left, top, bottom, front, back
      const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
      
      faceOrder.forEach(face => {
        const coords = mapping[face];
        if (coords) {
          // Triangle 1: 0, 1, 2
          uvArray.push(coords[0][0], coords[0][1]);
          uvArray.push(coords[1][0], coords[1][1]);
          uvArray.push(coords[3][0], coords[3][1]);
          
          // Triangle 2: 1, 2, 3
          uvArray.push(coords[1][0], coords[1][1]);
          uvArray.push(coords[2][0], coords[2][1]);
          uvArray.push(coords[3][0], coords[3][1]);
        }
      });
      
      geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2));
    }
    
    geometry.attributes.uv.needsUpdate = true;
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
    
    // Auto-rotate when not in zoom mode
    if (this.autoRotate && this.playerModel) {
      this.playerModel.rotation.y += 0.01;
    }
    
    // Update controls
    if (this.controls.enabled) {
      this.controls.update();
    }
    
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