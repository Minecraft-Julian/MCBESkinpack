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
    this.isSlim = options.isSlim !== false; // Default to slim model (3px arms)
    
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
    // Create a Minecraft player model with proper proportions
    // Compatible with both Slim (3px arms) and Classic (4px arms) models
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
    
    // Arms - size depends on model type (Slim = 3px, Classic = 4px)
    const armWidth = this.isSlim ? 3 : 4;
    const armXOffset = this.isSlim ? 5.5 : 6;
    
    // Right Arm
    const rightArmGeometry = new THREE.BoxGeometry(armWidth, 12, 4);
    const rightArmMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const rightArm = new THREE.Mesh(rightArmGeometry, rightArmMaterial);
    rightArm.position.set(-armXOffset, 6, 0);
    rightArm.name = 'rightArm';
    this.playerModel.add(rightArm);
    
    // Left Arm
    const leftArmGeometry = new THREE.BoxGeometry(armWidth, 12, 4);
    const leftArmMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const leftArm = new THREE.Mesh(leftArmGeometry, leftArmMaterial);
    leftArm.position.set(armXOffset, 6, 0);
    leftArm.name = 'leftArm';
    this.playerModel.add(leftArm);
    
    // Right Leg (4x12x4)
    const rightLegGeometry = new THREE.BoxGeometry(4, 12, 4);
    const rightLegMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const rightLeg = new THREE.Mesh(rightLegGeometry, rightLegMaterial);
    rightLeg.position.set(-2, -6, 0);
    rightLeg.name = 'rightLeg';
    this.playerModel.add(rightLeg);
    
    // Left Leg (4x12x4)
    const leftLegGeometry = new THREE.BoxGeometry(4, 12, 4);
    const leftLegMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const leftLeg = new THREE.Mesh(leftLegGeometry, leftLegMaterial);
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
    // Apply texture to all body parts (head, body, arms, legs)
    
    const allParts = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    
    allParts.forEach(partName => {
      const part = this.playerModel.getObjectByName(partName);
      if (part) {
        // Dispose old material and texture to prevent memory leak
        if (part.material) {
          if (part.material.map) part.material.map.dispose();
          part.material.dispose();
        }
        
        part.material = new THREE.MeshLambertMaterial({
          map: texture.clone(),
          transparent: true
        });
        part.material.map.needsUpdate = true;
        
        // Apply UV mapping based on model type and part
        this.applyUVMapping(part, partName);
      }
    });
  }
  
  applyUVMapping(mesh, partName) {
    // Apply proper UV mapping for Minecraft skin format (64x32, 64x64, or 128x128)
    const geometry = mesh.geometry;
    if (!geometry.attributes.uv) return;
    
    // Minecraft skin UV coordinates for each body part
    // Format: [u, v] where u,v are in range 0-1
    // Using 64x64 texture coordinates (standard Minecraft skin format)
    
    // Determine arm UV mapping based on model type (Slim vs Classic)
    const rightArmUV = this.isSlim ? {
      // Right arm slim (3x12x4) - Old format for compatibility
      right:  [[44/64, 20/64], [47/64, 20/64], [47/64, 32/64], [44/64, 32/64]],
      left:   [[40/64, 20/64], [43/64, 20/64], [43/64, 32/64], [40/64, 32/64]],
      top:    [[43/64, 16/64], [47/64, 16/64], [47/64, 20/64], [43/64, 20/64]],
      bottom: [[47/64, 16/64], [51/64, 16/64], [51/64, 20/64], [47/64, 20/64]],
      front:  [[43/64, 20/64], [47/64, 20/64], [47/64, 32/64], [43/64, 32/64]],
      back:   [[51/64, 20/64], [55/64, 20/64], [55/64, 32/64], [51/64, 32/64]]
    } : {
      // Right arm classic (4x12x4)
      right:  [[44/64, 20/64], [48/64, 20/64], [48/64, 32/64], [44/64, 32/64]],
      left:   [[40/64, 20/64], [44/64, 20/64], [44/64, 32/64], [40/64, 32/64]],
      top:    [[44/64, 16/64], [48/64, 16/64], [48/64, 20/64], [44/64, 20/64]],
      bottom: [[48/64, 16/64], [52/64, 16/64], [52/64, 20/64], [48/64, 20/64]],
      front:  [[44/64, 20/64], [48/64, 20/64], [48/64, 32/64], [44/64, 32/64]],
      back:   [[52/64, 20/64], [56/64, 20/64], [56/64, 32/64], [52/64, 32/64]]
    };
    
    const leftArmUV = this.isSlim ? {
      // Left arm slim (3x12x4) - New format (64x64)
      right:  [[36/64, 52/64], [39/64, 52/64], [39/64, 64/64], [36/64, 64/64]],
      left:   [[32/64, 52/64], [35/64, 52/64], [35/64, 64/64], [32/64, 64/64]],
      top:    [[35/64, 48/64], [39/64, 48/64], [39/64, 52/64], [35/64, 52/64]],
      bottom: [[39/64, 48/64], [43/64, 48/64], [43/64, 52/64], [39/64, 52/64]],
      front:  [[35/64, 52/64], [39/64, 52/64], [39/64, 64/64], [35/64, 64/64]],
      back:   [[43/64, 52/64], [47/64, 52/64], [47/64, 64/64], [43/64, 64/64]]
    } : {
      // Left arm classic (4x12x4) - New format (64x64)
      right:  [[36/64, 52/64], [40/64, 52/64], [40/64, 64/64], [36/64, 64/64]],
      left:   [[32/64, 52/64], [36/64, 52/64], [36/64, 64/64], [32/64, 64/64]],
      top:    [[36/64, 48/64], [40/64, 48/64], [40/64, 52/64], [36/64, 52/64]],
      bottom: [[40/64, 48/64], [44/64, 48/64], [44/64, 52/64], [40/64, 52/64]],
      front:  [[36/64, 52/64], [40/64, 52/64], [40/64, 64/64], [36/64, 64/64]],
      back:   [[44/64, 52/64], [48/64, 52/64], [48/64, 64/64], [44/64, 64/64]]
    };
    
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
      rightArm: rightArmUV,
      leftArm: leftArmUV,
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
        // Left leg (4x12x4) - New format (64x64)
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
  
  setModelType(isSlim) {
    // Change model type between Slim (3px arms) and Classic (4px arms)
    if (this.isSlim === isSlim) return; // No change needed
    
    this.isSlim = isSlim;
    
    // Recreate the player model with new arm widths
    if (this.playerModel) {
      this.scene.remove(this.playerModel);
      // Dispose old model
      this.playerModel.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (object.material.map) object.material.map.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    this.createPlayerModel();
    
    // Reapply texture if one was loaded
    // The texture will be automatically reapplied when loadSkinTexture is called again
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
      this.scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
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
