import * as THREE from 'three';

// ============================================================
// CONFIGURATION
//
// All tunables live here at the top of the file. Change any
// value and reconstruct a StarsSystem to see the effect:
//   window.starsSystem.dispose();
//   window.starsSystem = new StarsSystem(window.renderer.scene, window.slimeMesh.getGeometry());
// ============================================================

const CONFIG = {
  // Number of star sprites to attach to interior-offset vertices.
  // Clamped at runtime to the total number of eligible vertices.
  // Default: 40
  STAR_COUNT: 40,

  // Base world-unit size of each sprite.
  // The slime cube spans [-1, 1] per axis (total width = 2 units).
  // Default: 0.08
  STAR_SIZE: 0.08,

  // Per-star random size variation added to STAR_SIZE.
  // Each star's final size = STAR_SIZE + random(−variance, +variance).
  // Default: 0.04
  STAR_SIZE_VARIANCE: 0.04,

  // How far inward from the vertex to place the star, in world units.
  // BoxGeometry has no interior vertices — every vertex sits on the outer
  // surface. This offset pushes each star inward along the face normal
  // so it appears inside the slime rather than on its surface.
  //
  // The slime box spans 2 units total (-1 to 1), so:
  //   0.1 = just below the surface
  //   0.3 = visibly inside (default)
  //   0.9 = near the center of the box
  INWARD_OFFSET: 0.3,

  // Threshold for detecting whether a coordinate is "on the surface" (at ±1.0).
  // Accounts for floating-point imprecision in BoxGeometry vertex positions.
  // Default: 0.001
  EDGE_TOLERANCE: 0.001,

  // Opacity of each star sprite (0 = invisible, 1 = fully opaque).
  // Default: 0.9
  STAR_OPACITY: 0.9,
};

// ============================================================
// STARS SYSTEM
//
// Attaches square white sprites (rotated 45° → diamond shape) to
// face-interior vertices of the slime mesh, offset inward so they
// appear INSIDE the slime volume rather than on its surface.
//
// WHY INWARD OFFSET:
//   BoxGeometry(2,2,2,7,7,7) is a hollow box — all of its vertices
//   sit on the 6 outer faces. There are no interior vertices.
//   To make stars look "inside" the slime, we:
//     1. Pick face-interior vertices (not on seam edges/corners).
//     2. Compute each vertex's inward face normal at construction time.
//     3. In update(), position the sprite at:
//          vertexPosition + inwardNormal * INWARD_OFFSET
//   The star tracks the vertex movement (physics deformation) but
//   is always rendered INWARD_OFFSET units below the surface.
//
// TRACKING:
//   Call update() once per frame after physicsUpdate() so sprite
//   positions follow the live physics-deformed vertex positions.
// ============================================================

export class StarsSystem {
  /**
   * @param {THREE.Scene}          scene    — scene to add sprites into
   * @param {THREE.BufferGeometry} geometry — the slime mesh geometry;
   *   geometry.attributes.position.array is the live physics buffer.
   */
  constructor(scene, geometry) {
    this._scene    = scene;
    this._geometry = geometry;

    // Direct reference to the physics position buffer.
    // Physics writes x,y,z triples in-place, so this Float32Array
    // always holds the current deformed vertex positions.
    this._physicsPositions = geometry.attributes.position.array;

    // Group holds all sprites for easy bulk removal
    this._group = new THREE.Group();
    this._group.name = 'StarsSystem';

    // Per-star data (parallel arrays, one entry per sprite):
    this._sprites       = [];  // THREE.Sprite instances
    this._vertexIndices = [];  // vertex index each sprite tracks
    this._inwardNormals = [];  // face inward normal [nx, ny, nz] per star

    // Track materials for GPU cleanup on dispose()
    this._materials = [];

    // Step 1: find eligible vertices — face-interior only (not on seam edges/corners)
    //         returns [{ vi, nx, ny, nz }, ...]
    const eligible = this._findFaceInteriorVertices();

    // Step 2: randomly pick up to STAR_COUNT without replacement
    const picked = this._pickRandom(eligible, CONFIG.STAR_COUNT);

    // Step 3: create a sprite for each picked vertex
    this._createStars(picked);

    scene.add(this._group);

    console.log(
      `[StarsSystem] ${picked.length} stars, each offset ${CONFIG.INWARD_OFFSET} units ` +
      `inward from their face vertex ` +
      `(${eligible.length} eligible out of ${this._physicsPositions.length / 3} total vertices)`
    );
  }

  // ----------------------------------------------------------
  // PRIVATE: find all face-interior vertex indices and their
  // inward face normals.
  //
  // Vertex classification by how many coordinates are at ±1:
  //   3 at ±1 → box corner  (excluded)
  //   2 at ±1 → box edge seam (excluded)
  //   1 at ±1 → face interior (✓ eligible)
  //   0 at ±1 → impossible in BoxGeometry
  //
  // For each eligible vertex, the ONE coordinate that is at ±1
  // tells us which face it's on. The inward normal points away
  // from that face toward the center of the box.
  //
  // Returns: Array of { vi, nx, ny, nz }
  // ----------------------------------------------------------

  _findFaceInteriorVertices() {
    const pos = this._physicsPositions;
    const numVertices = pos.length / 3;
    const tol = CONFIG.EDGE_TOLERANCE;
    const eligible = [];

    for (let i = 0; i < numVertices; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];

      // Check which coords land on a cube face (±1.0)
      const atX = Math.abs(Math.abs(x) - 1.0) < tol;
      const atY = Math.abs(Math.abs(y) - 1.0) < tol;
      const atZ = Math.abs(Math.abs(z) - 1.0) < tol;
      const count = (atX ? 1 : 0) + (atY ? 1 : 0) + (atZ ? 1 : 0);

      // Only face-interior: exactly one coord on a face plane
      if (count !== 1) continue;

      // Inward normal = flip the sign of whichever coordinate is at ±1.
      // e.g. vertex on +X face (x≈+1) → inward is (-1, 0, 0).
      let nx = 0, ny = 0, nz = 0;
      if (atX) nx = x > 0 ? -1 : 1;
      if (atY) ny = y > 0 ? -1 : 1;
      if (atZ) nz = z > 0 ? -1 : 1;

      eligible.push({ vi: i, nx, ny, nz });
    }

    return eligible;
  }

  // ----------------------------------------------------------
  // PRIVATE: pick n items from array without replacement.
  // Fisher-Yates partial shuffle — never repeats an index.
  // Returns a shallow copy containing at most n items.
  // ----------------------------------------------------------

  _pickRandom(array, n) {
    const pool = array.slice();
    const count = Math.min(n, pool.length);
    const result = [];

    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      result.push(pool[i]);
    }

    return result;
  }

  // ----------------------------------------------------------
  // PRIVATE: create one sprite per picked vertex entry.
  // ----------------------------------------------------------

  _createStars(entries) {
    const pos = this._physicsPositions;

    for (const { vi, nx, ny, nz } of entries) {
      const material = new THREE.SpriteMaterial({
        color:       0xffffff,
        opacity:     CONFIG.STAR_OPACITY,
        transparent: true,
        blending:    THREE.AdditiveBlending,  // glow on dark slime
        depthWrite:  false,                   // don't occlude transparent slime back faces
        rotation:    Math.PI / 4,             // 45° screen-space → diamond shape
      });
      this._materials.push(material);

      const sprite = new THREE.Sprite(material);

      // Initial position: vertex + inward offset so it's below the surface
      sprite.position.set(
        pos[vi * 3]     + nx * CONFIG.INWARD_OFFSET,
        pos[vi * 3 + 1] + ny * CONFIG.INWARD_OFFSET,
        pos[vi * 3 + 2] + nz * CONFIG.INWARD_OFFSET,
      );

      const variance = (Math.random() * 2 - 1) * CONFIG.STAR_SIZE_VARIANCE;
      const size = Math.max(0.01, CONFIG.STAR_SIZE + variance);
      sprite.scale.set(size, size, 1.0);

      this._group.add(sprite);
      this._sprites.push(sprite);
      this._vertexIndices.push(vi);
      this._inwardNormals.push([nx, ny, nz]);
    }
  }

  // ----------------------------------------------------------
  // PUBLIC: update — call once per frame after physicsUpdate().
  //
  // Reads current vertex positions from the physics buffer and
  // places each sprite at:
  //   vertexPosition + inwardNormal * INWARD_OFFSET
  //
  // The inward normal is fixed at construction time (it's the
  // original face normal). As the mesh deforms, the star follows
  // the vertex but stays offset inward, keeping it below the surface.
  //
  // Zero allocation — only Float32Array reads and Vector3 sets.
  // ----------------------------------------------------------

  update() {
    const pos    = this._physicsPositions;
    const offset = CONFIG.INWARD_OFFSET;

    for (let i = 0; i < this._sprites.length; i++) {
      const vi          = this._vertexIndices[i];
      const [nx, ny, nz] = this._inwardNormals[i];

      this._sprites[i].position.set(
        pos[vi * 3]     + nx * offset,
        pos[vi * 3 + 1] + ny * offset,
        pos[vi * 3 + 2] + nz * offset,
      );
    }
  }

  // ----------------------------------------------------------
  // PUBLIC: dispose — removes all sprites and frees GPU memory.
  //
  // After disposing, reconstruct to get stars back:
  //   window.starsSystem.dispose();
  //   window.starsSystem = new StarsSystem(window.renderer.scene, window.slimeMesh.getGeometry());
  // ----------------------------------------------------------

  dispose() {
    this._scene.remove(this._group);
    for (const mat of this._materials) mat.dispose();
    this._materials     = [];
    this._sprites       = [];
    this._vertexIndices = [];
    this._inwardNormals = [];
    this._group         = null;
    console.log('[StarsSystem] Disposed.');
  }
}

export default StarsSystem;
