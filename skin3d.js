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
    
    console.log('[mcbe 3D] Initializing 3D renderer');
    console.log('[mcbe 3D] WebGL available:', !!window.WebGLRenderingContext);
    
    // Camera - adjusted to center on new model position
    this.camera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      0.1,
      1000
    );
    this.camera.position.set(0, 2, 20);
    this.camera.lookAt(0, 2, 0);
    console.log('[mcbe 3D] Camera positioned at', this.camera.position);
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    console.log('[mcbe 3D] WebGL Renderer created, size:', this.width, 'x', this.height);
    
    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
    
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
    directionalLight2.position.set(-5, 5, -5);
    this.scene.add(directionalLight2);
    console.log('[mcbe 3D] Lights added to scene');
    
    // OrbitControls (disabled by default, enabled in zoom mode)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = true;  // Enable zoom
    this.controls.enablePan = false;
    this.controls.enabled = false;  // Start disabled for small preview
    this.controls.target.set(0, 2, 0);
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
    
    console.log('[mcbe 3D] Creating player model with proper positioning');
    
    // Head (8x8x8) - Center at y=1.35 * 8 = 10.8 (scaled to Minecraft units)
    const headGeometry = new THREE.BoxGeometry(8, 8, 8);
    const headMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 10.8; // Adjusted positioning
    head.name = 'head';
    this.playerModel.add(head);
    console.log('[mcbe 3D] Head positioned at y =', head.position.y);
    
    // Body (8x12x4) - positioned below head
    const bodyGeometry = new THREE.BoxGeometry(8, 12, 4);
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 4.8; // Head bottom (10.8 - 4) = 6.8, body center at 6.8 - 2 = 4.8
    body.name = 'body';
    this.playerModel.add(body);
    console.log('[mcbe 3D] Body positioned at y =', body.position.y);
    
    // Right Arm (3x12x4 for slim model) - lowered to shoulder level
    const armGeometry = new THREE.BoxGeometry(3, 12, 4);
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(-5.5, 4.8, 0); // At body level
    rightArm.name = 'rightArm';
    this.playerModel.add(rightArm);
    console.log('[mcbe 3D] Right arm positioned at x =', rightArm.position.x, 'y =', rightArm.position.y);
    
    // Left Arm (3x12x4 for slim model) - lowered to shoulder level
    const leftArm = new THREE.Mesh(armGeometry, armMaterial.clone());
    leftArm.position.set(5.5, 4.8, 0); // At body level
    leftArm.name = 'leftArm';
    this.playerModel.add(leftArm);
    console.log('[mcbe 3D] Left arm positioned at x =', leftArm.position.x, 'y =', leftArm.position.y);
    
    // Right Leg (4x12x4) - below body
    const legGeometry = new THREE.BoxGeometry(4, 12, 4);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(-2, -7.2, 0); // Body bottom (4.8 - 6) = -1.2, leg center at -1.2 - 6 = -7.2
    rightLeg.name = 'rightLeg';
    this.playerModel.add(rightLeg);
    console.log('[mcbe 3D] Right leg positioned at x =', rightLeg.position.x, 'y =', rightLeg.position.y);
    
    // Left Leg (4x12x4)
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial.clone());
    leftLeg.position.set(2, -7.2, 0);
    leftLeg.name = 'leftLeg';
    this.playerModel.add(leftLeg);
    console.log('[mcbe 3D] Left leg positioned at x =', leftLeg.position.x, 'y =', leftLeg.position.y);
    
    this.scene.add(this.playerModel);
    console.log('[mcbe 3D] Player model added to scene');
  }
  
  loadSkinTexture(imageSource) {
    return new Promise((resolve, reject) => {
      console.log('[mcbe 3D] Loading skin texture from source:', typeof imageSource);
      const loader = new THREE.TextureLoader();
      
      let textureUrl;
      if (typeof imageSource === 'string') {
        textureUrl = imageSource;
      } else if (imageSource instanceof File || imageSource instanceof Blob) {
        textureUrl = URL.createObjectURL(imageSource);
      } else {
        console.error('[mcbe 3D] Invalid image source type');
        reject(new Error('Invalid image source'));
        return;
      }
      
      console.log('[mcbe 3D] Loading texture from URL');
      
      loader.load(
        textureUrl,
        (texture) => {
          console.log('[mcbe 3D] Texture loaded successfully, size:', texture.image.width, 'x', texture.image.height);
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          this.applySkinTexture(texture);
          resolve(texture);
        },
        undefined,
        (error) => {
          console.error('[mcbe 3D] Failed to load texture:', error);
          reject(error);
        }
      );
    });
  }
  
  applySkinTexture(texture) {
    // Apply UV mapping for Minecraft skin format (64x64)
    // This is a simplified version - a full implementation would map each part correctly
    
    console.log('[mcbe 3D] Applying skin texture to model parts');
    const parts = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    
    parts.forEach(partName => {
      const part = this.playerModel.getObjectByName(partName);
      if (part) {
        console.log('[mcbe 3D] Applying texture to part:', partName);
        part.material = new THREE.MeshLambertMaterial({
          map: texture.clone(),
          transparent: true
        });
        part.material.map.needsUpdate = true;
        
        // Apply basic UV mapping
        this.applyUVMapping(part, partName);
      } else {
        console.warn('[mcbe 3D] Part not found:', partName);
      }
    });
    console.log('[mcbe 3D] Texture application completed');
  }
  
  applyUVMapping(mesh, partName) {
    // Apply proper UV mapping for Minecraft skin format (64x64)
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
      
      if (img.width !== 64 || img.height !== 64) {
        reject(new Error(`Ungültige Abmessungen: ${img.width}x${img.height}px. Erforderlich: 64x64px.`));
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

// Console command for testing WebGL rendering
window.testWebGL = function() {
  console.log('=== WebGL Rendering Test ===');
  console.log('WebGL Available:', !!window.WebGLRenderingContext);
  
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      console.log('WebGL Context: ✓ Successfully created');
      console.log('WebGL Vendor:', gl.getParameter(gl.VENDOR));
      console.log('WebGL Renderer:', gl.getParameter(gl.RENDERER));
      console.log('WebGL Version:', gl.getParameter(gl.VERSION));
      console.log('GLSL Version:', gl.getParameter(gl.SHADING_LANGUAGE_VERSION));
      console.log('Max Texture Size:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
      console.log('Max Viewport Dims:', gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      
      // Test if Three.js renderers are working
      const renderers = document.querySelectorAll('canvas');
      console.log('Total canvas elements found:', renderers.length);
      
      renderers.forEach((canvas, index) => {
        console.log(`Canvas ${index}:`, canvas.width, 'x', canvas.height);
      });
      
      return true;
    } else {
      console.error('WebGL Context: ✗ Failed to create context');
      return false;
    }
  } catch (e) {
    console.error('WebGL Test Error:', e);
    return false;
  }
};

console.log('[mcbe 3D] Console command available: testWebGL()');

