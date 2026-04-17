import * as THREE from 'three';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);

    // Camera positioned to view the center with 60° FOV for better perspective
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.z = 2.5;

    // WebGL renderer with antialiasing disabled for pixelation
    this.webglRenderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.webglRenderer.setSize(window.innerWidth, window.innerHeight);
    this.webglRenderer.setPixelRatio(1); // Disable device pixel ratio for consistent pixelation

    // Lighting setup (do this before meshes are added)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2, 2, 2);
    directionalLight.target.position.set(0, 0, 0);
    this.scene.add(directionalLight);

    // Handle window resize
    window.addEventListener('resize', () => this.onWindowResize());
  }

  onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.webglRenderer.setSize(width, height);
  }

  addToScene(object) {
    this.scene.add(object);
  }

  removeFromScene(object) {
    this.scene.remove(object);
  }

  dispose() {
    this.webglRenderer.dispose();
  }
}
