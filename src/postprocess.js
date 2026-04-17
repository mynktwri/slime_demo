import * as THREE from 'three';

// Import dithering shader
import quadVertSource from './shaders/quadVert.glsl?raw';
import ditheringFragSource from './shaders/ditheringFrag.glsl?raw';

/**
 * Postprocessing system: dithering + color quantization for PS1 look
 */
export class Postprocess {
  constructor(width = 320, height = 240) {
    this.width = width;
    this.height = height;

    // Create render target for low-res scene rendering
    this.renderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    // Create fullscreen quad for compositing
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);

    // Dithering material
    this.ditheringMaterial = new THREE.ShaderMaterial({
      vertexShader: quadVertSource,
      fragmentShader: ditheringFragSource,
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
      side: THREE.FrontSide,
    });

    // Quad mesh for rendering
    this.quadMesh = new THREE.Mesh(this.quadGeometry, this.ditheringMaterial);

    // Orthographic camera for quad rendering
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);

    // Scene for compositing
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quadMesh);

    console.log(
      `Postprocess initialized: ${width}x${height} render target with dithering`
    );
  }

  /**
   * Get the render target (for main loop to render scene into)
   */
  getRenderTarget() {
    return this.renderTarget;
  }

  /**
   * Get the quad scene (for final composite pass)
   */
  getQuadScene() {
    return this.quadScene;
  }

  /**
   * Get the quad camera
   */
  getQuadCamera() {
    return this.quadCamera;
  }

  /**
   * Get the dithering material (for adjusting uniforms)
   */
  getDitheringMaterial() {
    return this.ditheringMaterial;
  }

  /**
   * Dispose resources
   */
  dispose() {
    this.renderTarget.dispose();
    this.quadGeometry.dispose();
    this.ditheringMaterial.dispose();
  }
}

// Export singleton
const postprocessInstance = new Postprocess();
export default postprocessInstance;
