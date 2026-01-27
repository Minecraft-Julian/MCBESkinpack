// 3D Skin Preview using Three.js
// Creates a Minecraft player model with skin texture that can rotate

class Skin3DRenderer {
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
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enabled = false;
    this.controls.target.set(0, 8, 0);
    
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
    const armMaterial = new THREE.MeshLambertMaterial({ color: 0x777777 });
    const rightArm = new THREE.Mesh(armGeometry, armMaterial);
    rightArm.position.set(-5.5, 6, 0);
    rightArm.name = 'rightArm';
    this.playerModel.add(rightArm);
    
    // Left Arm (3x12x4 for slim model)
    const leftArm = new THREE.Mesh(armGeometry, armMaterial.clone());
    leftArm.position.set(5.5, 6, 0);
    leftArm.name = 'leftArm';
    this.playerModel.add(leftArm);
    
    // Right Leg (4x12x4)
    const legGeometry = new THREE.BoxGeometry(4, 12, 4);
    const legMaterial = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
    rightLeg.position.set(-2, -6, 0);
    rightLeg.name = 'rightLeg';
    this.playerModel.add(rightLeg);
    
    // Left Leg (4x12x4)
    const leftLeg = new THREE.Mesh(legGeometry, legMaterial.clone());
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
    // Apply UV mapping for Minecraft skin format (64x64)
    // This is a simplified version - a full implementation would map each part correctly
    
    const parts = ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg'];
    
    parts.forEach(partName => {
      const part = this.playerModel.getObjectByName(partName);
      if (part) {
        part.material = new THREE.MeshLambertMaterial({
          map: texture.clone(),
          transparent: true
        });
        part.material.map.needsUpdate = true;
        
        // Apply basic UV mapping
        this.applyUVMapping(part, partName);
      }
    });
  }
  
  applyUVMapping(mesh, partName) {
    // Simplified UV mapping for Minecraft skin
    // Full implementation would require proper UV coordinates for each face
    const geometry = mesh.geometry;
    if (!geometry.attributes.uv) return;
    
    const uvs = geometry.attributes.uv.array;
    
    // This is a basic mapping - you'd need to properly map each face
    // to the correct part of the 64x64 skin texture
    // For now, we just ensure the texture is applied
    
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
function validateSkinFile(file) {
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
