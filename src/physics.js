/**
 * Spring-Mass Physics System
 * Custom Verlet integrator with gravity, damping, spring forces, and constraints.
 * No external libraries — full control over sliminess.
 */

// Physics constants (defaults)
const GRAVITY_DEFAULT = 0.0;
const DAMPING_DEFAULT = 0.8;
const SPRING_K_DEFAULT = 200;
const SHEAR_K = 60;
const DRAG_K_DEFAULT = 300;
const SUBSTEPS_DEFAULT = 2;
const FLOOR_Y = -1.0;
const FLOOR_DAMPING = 0.8;

export class Physics {
  constructor(geometry) {
    // Store geometry reference for updates
    this.geometry = geometry;

    // Extract position buffer from geometry
    const positionAttribute = geometry.attributes.position;
    this.positions = positionAttribute.array;
    this.numParticles = this.positions.length / 3;

    // Previous positions for Verlet integration
    this.prevPositions = new Float32Array(this.positions);

    // Accumulated forces
    this.forces = new Float32Array(this.numParticles * 3);

    // Physics parameters (instance variables for dynamic updates)
    this.GRAVITY = GRAVITY_DEFAULT;
    this.DAMPING = DAMPING_DEFAULT;
    this.SPRING_K = SPRING_K_DEFAULT;
    this.DRAG_K = DRAG_K_DEFAULT;
    this.SUBSTEPS = SUBSTEPS_DEFAULT;
    this.restLengthMode = 'dist'; // 'dist', 'dist/2', 'dist/3', 'dist/4'

    // Wall bounds (1.5x the cube half-size for a 2x2x2 cube at origin)
    this.cubeHalfSize = 1.0;
    this.wallScale = 1.5;
    this.wallBound = this.cubeHalfSize * this.wallScale; // ±1.5

    // Build spring constraints
    this.springs = [];
    this.buildSprings();

    // Identify and pin corner vertices
    this.pinnedIndices = new Set();
    this.pinCorners();

    // Calculate collision radii (average neighbor distance / 3)
    this.collisionRadii = this.calculateCollisionRadii();

    console.log(`Physics initialized: ${this.numParticles} particles, ${this.springs.length} springs, ${this.pinnedIndices.size} pinned corners`);
  }

  /**
   * Identify and pin the top 4 corner vertices
   * Top corners are at (±1, 1, ±1) in the BoxGeometry(2, 2, 2, 7, 7, 7)
   */
  pinCorners() {
    const tolerance = 0.01; // Allow floating-point error

    for (let i = 0; i < this.numParticles; i++) {
      const x = this.positions[i * 3];
      const y = this.positions[i * 3 + 1];
      const z = this.positions[i * 3 + 2];

      // Check if x and z are at ±1, and y is at +1 (top corners only)
      if (Math.abs(Math.abs(x) - 1.0) < tolerance &&
          Math.abs(y - 1.0) < tolerance &&
          Math.abs(Math.abs(z) - 1.0) < tolerance) {
        this.pinnedIndices.add(i);
      }
    }

    console.log(`Pinned corner indices: ${Array.from(this.pinnedIndices).join(', ')}`);
  }

  /**
   * Build structural and shear springs
   * Scans all vertex pairs and creates springs based on distance
   */
  buildSprings() {
    this.springs = [];
    const springSet = new Set();

    const edgeLen = 2.0 / 7.0;
    const restLengthMultiplier = this.getRestLengthMultiplier();

    // O(N²) scan to find springs
    for (let i = 0; i < this.numParticles; i++) {
      for (let j = i + 1; j < this.numParticles; j++) {
        const dist = this.getDistance(i, j);

        // Structural springs: nearby particles
        if (dist < edgeLen * 1.1) {
          const springKey = `${i}-${j}`;
          if (!springSet.has(springKey)) {
            const RL = restLengthMultiplier==1.0 ? dist : dist * restLengthMultiplier
            this.springs.push({
              p1: i,
              p2: j,
              restLength: RL,
              type: 'structural',
            });
            springSet.add(springKey);
          }
        }

        // Shear springs: diagonal neighbors
        if (dist < edgeLen * Math.sqrt(2) * 1.1 && dist > edgeLen * 1.05) {
          const springKey = `shear-${i}-${j}`;
          if (!springSet.has(springKey)) {
            this.springs.push({
              p1: i,
              p2: j,
              restLength: dist * restLengthMultiplier,
              type: 'shear',
            });
            springSet.add(springKey);
          }
        }
      }
    }
  }

  getRestLengthMultiplier() {
    switch (this.restLengthMode) {
      case 'dist/2': return 0.5;
      case 'dist/3': return 0.333333;
      case 'dist/4': return 0.25;
      case 'dist':
      default: return 1.0;
    }
  }

  /**
   * Get Euclidean distance between two particles
   */
  getDistance(i, j) {
    const x1 = this.positions[i * 3],
      y1 = this.positions[i * 3 + 1],
      z1 = this.positions[i * 3 + 2];
    const x2 = this.positions[j * 3],
      y2 = this.positions[j * 3 + 1],
      z2 = this.positions[j * 3 + 2];

    const dx = x2 - x1,
      dy = y2 - y1,
      dz = z2 - z1;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Calculate collision radius for each vertex (average neighbor distance / 3)
   */
  calculateCollisionRadii() {
    const radii = new Float32Array(this.numParticles);

    for (let i = 0; i < this.numParticles; i++) {
      let sumDist = 0;
      let count = 0;

      for (const spring of this.springs) {
        if (spring.p1 === i || spring.p2 === i) {
          const other = spring.p1 === i ? spring.p2 : spring.p1;
          const dist = this.getDistance(i, other);
          sumDist += dist;
          count++;
        }
      }

      radii[i] = count > 0 ? sumDist / count / 2 : 0.1;
    }

    return radii;
  }

  /**
   * Set geometry reference for GPU buffer updates
   */
  setGeometry(geom) {
    this.geometry = geom;
  }

  /**
   * Main physics update loop
   * @param {number} dt - Delta time in seconds
   * @param {number} grabbedIndex - Index of grabbed particle (-1 if none)
   * @param {THREE.Vector3} dragTarget - 3D target position for grabbed particle
   */
  update(dt, grabbedIndex, dragTarget) {
    // Use substeps for stability
    const subDt = dt / this.SUBSTEPS;

    for (let substep = 0; substep < this.SUBSTEPS; substep++) {
      // Clear forces
      this.forces.fill(0);

      // Apply gravity to all particles
      for (let i = 0; i < this.numParticles; i++) {
        this.forces[i * 3 + 1] = this.GRAVITY; // y-component
      }

      // Apply spring forces
      this.applySprings();

      // Apply drag force to grabbed particle
      if (grabbedIndex >= 0) {
        this.applyDrag(grabbedIndex, dragTarget);
      }

      // Verlet integration step
      this.integrateVerlet(subDt);

      // Floor constraint
      this.enforceFloorConstraint();

      // Walls constraint
      this.enforceWallsConstraint();
    }

    // Update GPU buffer
    if (this.geometry) {
      const positionAttribute = this.geometry.attributes?.position;
      if (positionAttribute) {
        positionAttribute.needsUpdate = true;
      }

      // Recompute normals for lighting
      this.geometry.computeVertexNormals();
    }
  }

  /**
   * Apply spring forces using Hooke's law
   */
  applySprings() {
    let structuralCount = 0;
    let shearCount = 0;

    for (const spring of this.springs) {
      const p1 = spring.p1;
      const p2 = spring.p2;

      // Get positions
      const x1 = this.positions[p1 * 3],
        y1 = this.positions[p1 * 3 + 1],
        z1 = this.positions[p1 * 3 + 2];
      const x2 = this.positions[p2 * 3],
        y2 = this.positions[p2 * 3 + 1],
        z2 = this.positions[p2 * 3 + 2];

      // Displacement vector
      const dx = x2 - x1,
        dy = y2 - y1,
        dz = z2 - z1;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist < 0.0001) continue; // Avoid division by zero (changed from return to continue)

      // Use current SPRING_K for structural springs, or SHEAR_K for shear springs
      const k = spring.type === 'structural' ? this.SPRING_K : SHEAR_K;
      if (spring.type === 'structural') structuralCount++;
      else shearCount++;

      // Spring force magnitude: F = K * (distance - restLength)
      const forceMagnitude = k * (dist - spring.restLength);

      // Normalized direction
      const dirX = dx / dist,
        dirY = dy / dist,
        dirZ = dz / dist;

      // Apply forces (Newton's 3rd law: equal and opposite)
      const fx = forceMagnitude * dirX,
        fy = forceMagnitude * dirY,
        fz = forceMagnitude * dirZ;

      // Force on p1 (toward p2 if stretched, away if compressed)
      this.forces[p1 * 3] += fx;
      this.forces[p1 * 3 + 1] += fy;
      this.forces[p1 * 3 + 2] += fz;

      // Force on p2 (opposite direction)
      this.forces[p2 * 3] -= fx;
      this.forces[p2 * 3 + 1] -= fy;
      this.forces[p2 * 3 + 2] -= fz;
    }

    // Debug log (first frame only)
    if (structuralCount > 0 && !this._loggedSpringInfo) {
      console.log(`[Physics] Applying springs: ${structuralCount} structural (k=${this.SPRING_K}), ${shearCount} shear (k=${SHEAR_K})`);
      this._loggedSpringInfo = true;
    }
  }

  /**
   * Apply drag force when particle is grabbed
   */
  applyDrag(index, dragTarget) {
    const px = this.positions[index * 3],
      py = this.positions[index * 3 + 1],
      pz = this.positions[index * 3 + 2];

    // Displacement toward drag target
    const dx = dragTarget.x - px,
      dy = dragTarget.y - py,
      dz = dragTarget.z - pz;

    // Spring-like drag force
    this.forces[index * 3] += dx * this.DRAG_K;
    this.forces[index * 3 + 1] += dy * this.DRAG_K;
    this.forces[index * 3 + 2] += dz * this.DRAG_K;
  }

  /**
   * Verlet integration step
   * x_new = x + (x - x_prev) * damping + force * dt²
   * Pinned corners remain fixed
   */
  integrateVerlet(dt) {
    const dtSq = dt * dt;

    for (let i = 0; i < this.numParticles; i++) {
      // Skip pinned corners
      if (this.pinnedIndices.has(i)) {
        continue;
      }

      const idx = i * 3;

      // Current velocity = (current - previous) * damping
      const vx = (this.positions[idx] - this.prevPositions[idx]) * this.DAMPING;
      const vy = (this.positions[idx + 1] - this.prevPositions[idx + 1]) * this.DAMPING;
      const vz = (this.positions[idx + 2] - this.prevPositions[idx + 2]) * this.DAMPING;

      // Store current position in previous
      this.prevPositions[idx] = this.positions[idx];
      this.prevPositions[idx + 1] = this.positions[idx + 1];
      this.prevPositions[idx + 2] = this.positions[idx + 2];

      // New position = current + velocity + acceleration * dt²
      const mass = 1.0; // Assume unit mass
      this.positions[idx] += vx + (this.forces[idx] / mass) * dtSq;
      this.positions[idx + 1] += vy + (this.forces[idx + 1] / mass) * dtSq;
      this.positions[idx + 2] += vz + (this.forces[idx + 2] / mass) * dtSq;
    }
  }

  /**
   * Enforce floor constraint
   * Particles below floor bounce up with energy loss
   * Pinned corners are exempt (they're already constrained)
   */
  enforceFloorConstraint() {
    for (let i = 0; i < this.numParticles; i++) {
      // Skip pinned corners
      if (this.pinnedIndices.has(i)) {
        continue;
      }

      const idx = i * 3 + 1; // y component

      if (this.positions[idx] < FLOOR_Y) {
        // Clamp position
        this.positions[idx] = FLOOR_Y;

        // Kill upward velocity (bounce reversal + damping)
        const vy = this.positions[idx] - this.prevPositions[idx];
        this.prevPositions[idx] = this.positions[idx] + vy * FLOOR_DAMPING;
      }
    }
  }

  /**
   * Enforce wall constraints on all 6 sides
   * Particles that exceed bounds bounce back with energy loss
   */
  enforceWallsConstraint() {
    for (let i = 0; i < this.numParticles; i++) {
      // Skip pinned corners
      if (this.pinnedIndices.has(i)) {
        continue;
      }

      const bound = this.wallBound;

      // X walls
      if (this.positions[i * 3] > bound) {
        this.positions[i * 3] = bound;
        const vx = this.positions[i * 3] - this.prevPositions[i * 3];
        this.prevPositions[i * 3] = this.positions[i * 3] + vx * FLOOR_DAMPING;
      } else if (this.positions[i * 3] < -bound) {
        this.positions[i * 3] = -bound;
        const vx = this.positions[i * 3] - this.prevPositions[i * 3];
        this.prevPositions[i * 3] = this.positions[i * 3] + vx * FLOOR_DAMPING;
      }

      // Y walls
      if (this.positions[i * 3 + 1] > bound) {
        this.positions[i * 3 + 1] = bound;
        const vy = this.positions[i * 3 + 1] - this.prevPositions[i * 3 + 1];
        this.prevPositions[i * 3 + 1] = this.positions[i * 3 + 1] + vy * FLOOR_DAMPING;
      }

      // Z walls
      if (this.positions[i * 3 + 2] > bound) {
        this.positions[i * 3 + 2] = bound;
        const vz = this.positions[i * 3 + 2] - this.prevPositions[i * 3 + 2];
        this.prevPositions[i * 3 + 2] = this.positions[i * 3 + 2] + vz * FLOOR_DAMPING;
      } else if (this.positions[i * 3 + 2] < -bound) {
        this.positions[i * 3 + 2] = -bound;
        const vz = this.positions[i * 3 + 2] - this.prevPositions[i * 3 + 2];
        this.prevPositions[i * 3 + 2] = this.positions[i * 3 + 2] + vz * FLOOR_DAMPING;
      }
    }
  }

  /**
   * Update physics parameter dynamically
   */
  updateParameter(name, value) {
    switch (name) {
      case 'DAMPING':
        this.DAMPING = Math.max(0.01, Math.min(1.0, value));
        break;
      case 'SPRING_K':
        this.SPRING_K = Math.max(50, Math.min(1000, value));
        // No need to update springs—they reference this.SPRING_K dynamically
        break;
      case 'SUBSTEPS':
        this.SUBSTEPS = Math.max(2, Math.min(10, Math.round(value)));
        break;
      case 'GRAVITY':
        this.GRAVITY = Math.max(-9.8, Math.min(0, value));
        break;
      case 'DRAG_K':
        this.DRAG_K = Math.max(200, Math.min(500, value));
        break;
    }
  }

  /**
   * Update rest length mode and rebuild springs
   */
  updateRestLength(mode) {
    this.restLengthMode = mode;
    this.buildSprings();
  }

  /**
   * Reset velocity of a particle (used when releasing a drag)
   */
  resetVelocity(index) {
    const idx = index * 3;
    this.prevPositions[idx] = this.positions[idx];
    this.prevPositions[idx + 1] = this.positions[idx + 1];
    this.prevPositions[idx + 2] = this.positions[idx + 2];
  }
}

// Export singleton
let physicsInstance = null;

export function initPhysics(geometry) {
  physicsInstance = new Physics(geometry);
  return physicsInstance;
}

export function update(dt, grabbedIndex, dragTarget) {
  if (!physicsInstance) {
    console.warn('Physics not initialized');
    return;
  }
  physicsInstance.update(dt, grabbedIndex, dragTarget);
}

export function getPhysics() {
  return physicsInstance;
}
