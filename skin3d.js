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
    // Create an advanced Minecraft player model with dual layers (inner + outer)
    // Compatible with humanoid.customSlim geometry
    this.playerModel = new THREE.Group();
    
    // Create body parts with dual layers
    this.createBodyPart('head', 8, 8, 8, 0, 12, 0);
    this.createBodyPart('body', 8, 12, 4, 0, 6, 0);
    this.createBodyPart('rightArm', 3, 12, 4, -5.5, 6, 0);  // Slim arms (3 units)
    this.createBodyPart('leftArm', 3, 12, 4, 5.5, 6, 0);    // Slim arms (3 units)
    this.createBodyPart('rightLeg', 4, 12, 4, -2, -6, 0);
    this.createBodyPart('leftLeg', 4, 12, 4, 2, -6, 0);
    
    this.scene.add(this.playerModel);
  }
  
  createBodyPart(name, width, height, depth, x, y, z) {
    // Create a group for this body part to hold both inner and outer layers
    const partGroup = new THREE.Group();
    partGroup.name = name;
    partGroup.position.set(x, y, z);
    
    // Inner layer
    const innerGeometry = new THREE.BoxGeometry(width, height, depth);
    const innerMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x888888,
      transparent: true,
      alphaTest: 0.5
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMesh.name = name + 'Inner';
    partGroup.add(innerMesh);
    
    // Outer layer (slightly larger by 0.5 units for overlay effect)
    const outerGeometry = new THREE.BoxGeometry(width + 0.5, height + 0.5, depth + 0.5);
    const outerMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x888888,
      transparent: true,
      alphaTest: 0.5
    });
    const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
    outerMesh.name = name + 'Outer';
    partGroup.add(outerMesh);
    
    this.playerModel.add(partGroup);
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
    // Apply texture to all body parts with dual layers (inner and outer)
    
    const bodyParts = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    
    // Track old texture to dispose it only once after all materials are updated
    let oldTexture = null;
    
    bodyParts.forEach((partName, index) => {
      const partGroup = this.playerModel.getObjectByName(partName);
      if (partGroup) {
        // Get inner and outer meshes
        const innerMesh = partGroup.getObjectByName(partName + 'Inner');
        const outerMesh = partGroup.getObjectByName(partName + 'Outer');
        
        // Save reference to old texture from first part that has one
        if (index === 0 && innerMesh && innerMesh.material && innerMesh.material.map) {
          oldTexture = innerMesh.material.map;
        }
        
        // Update inner layer
        if (innerMesh) {
          if (innerMesh.material) {
            innerMesh.material.dispose();
          }
          innerMesh.material = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5
          });
          innerMesh.material.map.needsUpdate = true;
          
          // Apply UV mapping for inner layer
          this.applyUVMapping(innerMesh, partName, false);
        }
        
        // Update outer layer
        if (outerMesh) {
          if (outerMesh.material) {
            outerMesh.material.dispose();
          }
          outerMesh.material = new THREE.MeshLambertMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.5
          });
          outerMesh.material.map.needsUpdate = true;
          
          // Apply UV mapping for outer layer
          this.applyUVMapping(outerMesh, partName, true);
        }
      }
    });
    
    // Dispose old texture once after all materials are updated
    if (oldTexture && oldTexture !== texture) {
      oldTexture.dispose();
    }
  }
  
  /**
   * Helper function to set UV coordinates for a box geometry
   * Maps standard Minecraft 64x64 skin texture format to all 6 faces
   * @param {THREE.BufferGeometry} geometry - The box geometry to apply UVs to
   * @param {Object} uvMap - UV coordinates for each face {right, left, top, bottom, front, back}
   */
  setUVs(geometry, uvMap) {
    const uvArray = [];
    // Box geometry has 6 faces, each face has 2 triangles (4 vertices)
    // Order: right, left, top, bottom, front, back
    const faceOrder = ['right', 'left', 'top', 'bottom', 'front', 'back'];
    
    faceOrder.forEach(face => {
      const coords = uvMap[face];
      if (coords) {
        // Each face has 4 UV coordinates in order: bottom-left, bottom-right, top-right, top-left
        // We need to split into 2 triangles for Three.js
        // Triangle 1: vertices 0, 1, 3
        uvArray.push(coords[0][0], coords[0][1]);  // bottom-left
        uvArray.push(coords[1][0], coords[1][1]);  // bottom-right
        uvArray.push(coords[3][0], coords[3][1]);  // top-left
        
        // Triangle 2: vertices 1, 2, 3
        uvArray.push(coords[1][0], coords[1][1]);  // bottom-right
        uvArray.push(coords[2][0], coords[2][1]);  // top-right
        uvArray.push(coords[3][0], coords[3][1]);  // top-left
      }
    });
    
    geometry.setAttribute('uv', new Float32BufferAttribute(uvArray, 2));
    geometry.attributes.uv.needsUpdate = true;
  }
  
  applyUVMapping(mesh, partName, isOuter) {
    // Apply proper UV mapping for Minecraft skin format (64x32, 64x64, or 128x128)
    const geometry = mesh.geometry;
    if (!geometry.attributes.uv) return;
    
    // Minecraft skin UV coordinates for each body part
    // Format: [u, v] where u,v are in range 0-1
    // For outer layers, we use the second layer coordinates (offset in the texture)
    const uvMappings = {
      head: {
        inner: {
          // Head inner layer is at position (0, 0) in the texture
          right:  [[16/64, 8/64], [24/64, 8/64], [24/64, 16/64], [16/64, 16/64]],
          left:   [[0/64, 8/64], [8/64, 8/64], [8/64, 16/64], [0/64, 16/64]],
          top:    [[8/64, 0/64], [16/64, 0/64], [16/64, 8/64], [8/64, 8/64]],
          bottom: [[16/64, 0/64], [24/64, 0/64], [24/64, 8/64], [16/64, 8/64]],
          front:  [[8/64, 8/64], [16/64, 8/64], [16/64, 16/64], [8/64, 16/64]],
          back:   [[24/64, 8/64], [32/64, 8/64], [32/64, 16/64], [24/64, 16/64]]
        },
        outer: {
          // Head outer layer (hat) is at position (32, 0) in the texture
          right:  [[48/64, 8/64], [56/64, 8/64], [56/64, 16/64], [48/64, 16/64]],
          left:   [[32/64, 8/64], [40/64, 8/64], [40/64, 16/64], [32/64, 16/64]],
          top:    [[40/64, 0/64], [48/64, 0/64], [48/64, 8/64], [40/64, 8/64]],
          bottom: [[48/64, 0/64], [56/64, 0/64], [56/64, 8/64], [48/64, 8/64]],
          front:  [[40/64, 8/64], [48/64, 8/64], [48/64, 16/64], [40/64, 16/64]],
          back:   [[56/64, 8/64], [64/64, 8/64], [64/64, 16/64], [56/64, 16/64]]
        }
      },
      body: {
        inner: {
          // Body inner layer (8x12x4)
          right:  [[28/64, 20/64], [32/64, 20/64], [32/64, 32/64], [28/64, 32/64]],
          left:   [[16/64, 20/64], [20/64, 20/64], [20/64, 32/64], [16/64, 32/64]],
          top:    [[20/64, 16/64], [28/64, 16/64], [28/64, 20/64], [20/64, 20/64]],
          bottom: [[28/64, 16/64], [36/64, 16/64], [36/64, 20/64], [28/64, 20/64]],
          front:  [[20/64, 20/64], [28/64, 20/64], [28/64, 32/64], [20/64, 32/64]],
          back:   [[32/64, 20/64], [40/64, 20/64], [40/64, 32/64], [32/64, 32/64]]
        },
        outer: {
          // Body outer layer (jacket) at position (16, 32) in the texture
          right:  [[28/64, 36/64], [32/64, 36/64], [32/64, 48/64], [28/64, 48/64]],
          left:   [[16/64, 36/64], [20/64, 36/64], [20/64, 48/64], [16/64, 48/64]],
          top:    [[20/64, 32/64], [28/64, 32/64], [28/64, 36/64], [20/64, 36/64]],
          bottom: [[28/64, 32/64], [36/64, 32/64], [36/64, 36/64], [28/64, 36/64]],
          front:  [[20/64, 36/64], [28/64, 36/64], [28/64, 48/64], [20/64, 48/64]],
          back:   [[32/64, 36/64], [40/64, 36/64], [40/64, 48/64], [32/64, 48/64]]
        }
      },
      rightArm: {
        inner: {
          // Right arm slim (3x12x4)
          right:  [[44/64, 20/64], [47/64, 20/64], [47/64, 32/64], [44/64, 32/64]],
          left:   [[40/64, 20/64], [43/64, 20/64], [43/64, 32/64], [40/64, 32/64]],
          top:    [[43/64, 16/64], [47/64, 16/64], [47/64, 20/64], [43/64, 20/64]],
          bottom: [[47/64, 16/64], [51/64, 16/64], [51/64, 20/64], [47/64, 20/64]],
          front:  [[43/64, 20/64], [47/64, 20/64], [47/64, 32/64], [43/64, 32/64]],
          back:   [[51/64, 20/64], [55/64, 20/64], [55/64, 32/64], [51/64, 32/64]]
        },
        outer: {
          // Right arm outer layer (sleeve) at position (40, 32) in the texture
          right:  [[44/64, 36/64], [47/64, 36/64], [47/64, 48/64], [44/64, 48/64]],
          left:   [[40/64, 36/64], [43/64, 36/64], [43/64, 48/64], [40/64, 48/64]],
          top:    [[43/64, 32/64], [47/64, 32/64], [47/64, 36/64], [43/64, 36/64]],
          bottom: [[47/64, 32/64], [51/64, 32/64], [51/64, 36/64], [47/64, 36/64]],
          front:  [[43/64, 36/64], [47/64, 36/64], [47/64, 48/64], [43/64, 48/64]],
          back:   [[51/64, 36/64], [55/64, 36/64], [55/64, 48/64], [51/64, 48/64]]
        }
      },
      leftArm: {
        inner: {
          // Left arm slim (3x12x4)
          right:  [[36/64, 52/64], [39/64, 52/64], [39/64, 64/64], [36/64, 64/64]],
          left:   [[32/64, 52/64], [35/64, 52/64], [35/64, 64/64], [32/64, 64/64]],
          top:    [[35/64, 48/64], [39/64, 48/64], [39/64, 52/64], [35/64, 52/64]],
          bottom: [[39/64, 48/64], [43/64, 48/64], [43/64, 52/64], [39/64, 52/64]],
          front:  [[35/64, 52/64], [39/64, 52/64], [39/64, 64/64], [35/64, 64/64]],
          back:   [[43/64, 52/64], [47/64, 52/64], [47/64, 64/64], [43/64, 64/64]]
        },
        outer: {
          // Left arm outer layer (sleeve) at position (48, 48) in the texture
          right:  [[52/64, 52/64], [55/64, 52/64], [55/64, 64/64], [52/64, 64/64]],
          left:   [[48/64, 52/64], [51/64, 52/64], [51/64, 64/64], [48/64, 64/64]],
          top:    [[51/64, 48/64], [55/64, 48/64], [55/64, 52/64], [51/64, 52/64]],
          bottom: [[55/64, 48/64], [59/64, 48/64], [59/64, 52/64], [55/64, 52/64]],
          front:  [[51/64, 52/64], [55/64, 52/64], [55/64, 64/64], [51/64, 64/64]],
          back:   [[59/64, 52/64], [63/64, 52/64], [63/64, 64/64], [59/64, 64/64]]
        }
      },
      rightLeg: {
        inner: {
          // Right leg (4x12x4)
          right:  [[4/64, 20/64], [8/64, 20/64], [8/64, 32/64], [4/64, 32/64]],
          left:   [[0/64, 20/64], [4/64, 20/64], [4/64, 32/64], [0/64, 32/64]],
          top:    [[4/64, 16/64], [8/64, 16/64], [8/64, 20/64], [4/64, 20/64]],
          bottom: [[8/64, 16/64], [12/64, 16/64], [12/64, 20/64], [8/64, 20/64]],
          front:  [[4/64, 20/64], [8/64, 20/64], [8/64, 32/64], [4/64, 32/64]],
          back:   [[12/64, 20/64], [16/64, 20/64], [16/64, 32/64], [12/64, 32/64]]
        },
        outer: {
          // Right leg outer layer at position (0, 32) in the texture
          right:  [[4/64, 36/64], [8/64, 36/64], [8/64, 48/64], [4/64, 48/64]],
          left:   [[0/64, 36/64], [4/64, 36/64], [4/64, 48/64], [0/64, 48/64]],
          top:    [[4/64, 32/64], [8/64, 32/64], [8/64, 36/64], [4/64, 36/64]],
          bottom: [[8/64, 32/64], [12/64, 32/64], [12/64, 36/64], [8/64, 36/64]],
          front:  [[4/64, 36/64], [8/64, 36/64], [8/64, 48/64], [4/64, 48/64]],
          back:   [[12/64, 36/64], [16/64, 36/64], [16/64, 48/64], [12/64, 48/64]]
        }
      },
      leftLeg: {
        inner: {
          // Left leg (4x12x4)
          right:  [[20/64, 52/64], [24/64, 52/64], [24/64, 64/64], [20/64, 64/64]],
          left:   [[16/64, 52/64], [20/64, 52/64], [20/64, 64/64], [16/64, 64/64]],
          top:    [[20/64, 48/64], [24/64, 48/64], [24/64, 52/64], [20/64, 52/64]],
          bottom: [[24/64, 48/64], [28/64, 48/64], [28/64, 52/64], [24/64, 52/64]],
          front:  [[20/64, 52/64], [24/64, 52/64], [24/64, 64/64], [20/64, 64/64]],
          back:   [[28/64, 52/64], [32/64, 52/64], [32/64, 64/64], [28/64, 64/64]]
        },
        outer: {
          // Left leg outer layer at position (0, 48) in the texture
          right:  [[4/64, 52/64], [8/64, 52/64], [8/64, 64/64], [4/64, 64/64]],
          left:   [[0/64, 52/64], [4/64, 52/64], [4/64, 64/64], [0/64, 64/64]],
          top:    [[4/64, 48/64], [8/64, 48/64], [8/64, 52/64], [4/64, 52/64]],
          bottom: [[8/64, 48/64], [12/64, 48/64], [12/64, 52/64], [8/64, 52/64]],
          front:  [[4/64, 52/64], [8/64, 52/64], [8/64, 64/64], [4/64, 64/64]],
          back:   [[12/64, 52/64], [16/64, 52/64], [16/64, 64/64], [12/64, 64/64]]
        }
      }
    };
    
    const mapping = uvMappings[partName];
    if (mapping) {
      const layer = isOuter ? mapping.outer : mapping.inner;
      this.setUVs(geometry, layer);
    }
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
