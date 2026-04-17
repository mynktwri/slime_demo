import * as THREE from 'three';

// Import shaders as raw text
import slimeVertSource from './shaders/slimeVert.glsl?raw';
import slimeFragSource from './shaders/goopyFrag.glsl?raw';

export class SlimeMesh {
  constructor() {
    // Create box geometry with 7x7x7 subdivisions = 512 vertices
    // This provides enough detail for visible deformation
    this.geometry = new THREE.BoxGeometry(2, 2, 2, 7, 7, 7);

    // Create shader material (THREE.ShaderMaterial auto-binds built-in attributes)
    this.material = new THREE.ShaderMaterial({
      vertexShader: slimeVertSource,
      fragmentShader: slimeFragSource,

      uniforms: {
        uModelMatrix: { value: new THREE.Matrix4() },
        uViewMatrix: { value: new THREE.Matrix4() },
        uProjectionMatrix: { value: new THREE.Matrix4() },
        uNormalMatrix: { value: new THREE.Matrix4() },
        uCameraPos: { value: new THREE.Vector3(0, 0, 2.5) },
        uLightDir: { value: new THREE.Vector3(2, 2, 2).normalize() },
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(0x7dd97d) },
        uOpacity: { value: 0.72 },

        // Grab deformation
        uGrabbedIndex: { value: -1 },
        uGrabPoint: { value: new THREE.Vector3(0, 0, 0) },
        uGrabDeformRadius: { value: 0.15 },

        // ---- Goopy shimmer tunables (all match uniform names in goopyFrag.glsl) ----

        // Animation speed — higher = faster sloshing internal pattern
        uShimmerSpeed:     { value: 1.5  },

        // UV spatial frequency — higher = smaller, tighter shimmer blobs
        uShimmerScale:     { value: 4.0  },

        // How strongly shimmer drives the color palette vs. flat lighting (0–1)
        uShimmerIntensity: { value: 0.8  },

        // View-direction UV offset strength — controls the "see inside" depth illusion
        // At 0 the layers collapse flat; at 0.3+ the effect becomes exaggerated
        uParallaxStrength: { value: 0.15 },

        // Fresnel falloff sharpness — low = soft gradual edge, high = sharp bright rim
        uFresnelPower:     { value: 2.0  },

        // Additive interior glow brightness — simulates light trapped inside the gel
        uInnerGlow:        { value: 0.4  },
      },

      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      wireframe: false,
    });

    // Create the mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);

    // Explicitly position at origin
    this.mesh.position.set(0, 0, 0);

    // Physics update function (set by physics module)
    this.update = null;
  }

  /**
   * Set the physics update function
   * @param {Function} updateFn - physics.update(dt, grabbedIndex, dragTarget)
   */
  setPhysicsUpdate(updateFn) {
    this.update = updateFn;
  }

  /**
   * Get the underlying Three.js mesh
   */
  getMesh() {
    return this.mesh;
  }

  /**
   * Get the geometry (for physics to access position buffer)
   */
  getGeometry() {
    return this.geometry;
  }

  /**
   * Dispose of resources
   */
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// Create and export singleton instance
const slimeMeshInstance = new SlimeMesh();
export const mesh = slimeMeshInstance.getMesh();
export const geometry = slimeMeshInstance.getGeometry();

export default slimeMeshInstance;
