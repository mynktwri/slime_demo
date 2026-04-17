import * as THREE from 'three';

export class Interaction {
  constructor(camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Interaction state for physics to consume
    this.grabbedIndex = null;
    this.dragTarget = new THREE.Vector3();

    // Drag plane geometry for raycasting against mouse movement
    this.dragPlaneGeometry = new THREE.PlaneGeometry(100, 100);
    this.dragPlane = new THREE.Mesh(
      this.dragPlaneGeometry,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.dragPlane.position.z = 0;

    this.isMouseDown = false;
    this.previousDragTarget = new THREE.Vector3();

    // Camera orbit controls state (right-click)
    this.isRightMouseDown = false;
    this.previousMouseX = 0;
    this.previousMouseY = 0;
    this.cameraOrbitCenter = new THREE.Vector3(0, 0, 0); // Center point to orbit around

    // Spherical coordinates for camera position
    this.spherical = new THREE.Spherical();
    this.spherical.setFromVector3(this.camera.position);

    // Rotation speeds (in radians per pixel)
    this.rotationSpeed = 0.01;

    // Zoom settings
    this.zoomSpeed = 0.1; // Multiplier for scroll wheel
    this.minZoom = 0.5; // Minimum distance from orbit center
    this.maxZoom = 15; // Maximum distance from orbit center

    // Event listeners
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('wheel', (e) => this.onMouseWheel(e), { passive: false });
    window.addEventListener('contextmenu', (e) => e.preventDefault()); // Disable context menu
  }

  onMouseMove(event) {
    // Update normalized mouse coordinates
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // Right-click camera rotation
    if (this.isRightMouseDown) {
      const deltaX = event.clientX - this.previousMouseX;
      const deltaY = event.clientY - this.previousMouseY;

      // Update spherical coordinates based on mouse delta
      this.spherical.theta -= deltaX * this.rotationSpeed; // Horizontal rotation
      this.spherical.phi -= deltaY * this.rotationSpeed; // Vertical rotation

      // Clamp vertical angle to prevent flipping
      this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi));

      // Convert back to Cartesian coordinates
      const position = new THREE.Vector3();
      position.setFromSpherical(this.spherical);
      position.add(this.cameraOrbitCenter);
      this.camera.position.copy(position);

      // Look at the orbit center
      this.camera.lookAt(this.cameraOrbitCenter);
    } else if (this.isMouseDown) {
      // Left-click: Raycast against drag plane to get 3D position
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObject(this.dragPlane);

      if (intersects.length > 0) {
        this.dragTarget.copy(intersects[0].point);
        // console.log('Dragging to:', this.dragTarget);
      }
    }

    this.previousMouseX = event.clientX;
    this.previousMouseY = event.clientY;
  }

  onMouseDown(event) {
    // Detect which mouse button was pressed
    if (event.button === 2) {
      // Right-click: Start camera orbit
      this.isRightMouseDown = true;
      this.previousMouseX = event.clientX;
      this.previousMouseY = event.clientY;
      // Initialize spherical coordinates from current camera position
      this.spherical.setFromVector3(
        this.camera.position.clone().sub(this.cameraOrbitCenter)
      );
    } else if (event.button === 0) {
      // Left-click: Start mesh dragging
      this.isMouseDown = true;
      this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      // Raycast against available meshes
      if (window.slimeMesh) {
        const hit = this.raycastMesh(window.slimeMesh.getMesh());
        if (hit) {
          // Find closest vertex to hit point
          this.grabbedIndex = this.findClosestVertex(
            hit,
            window.slimeMesh.getGeometry()
          );

          // Setup drag plane at hit point, facing camera
          this.dragPlane.position.copy(hit.point);
          const planeNormal = this.camera.position
            .clone()
            .sub(hit.point)
            .normalize();
          this.dragPlane.lookAt(
            this.dragPlane.position.clone().add(planeNormal)
          );

          // console.log('Grabbed vertex:', this.grabbedIndex, 'at', hit.point);
        }
      }
    }
  }

  onMouseUp(event) {
    if (event.button === 2) {
      // Right-click released
      this.isRightMouseDown = false;
    } else if (event.button === 0) {
      // Left-click released
      this.isMouseDown = false;

      // Reset velocity of released vertex to prevent snapping back
      if (this.grabbedIndex !== null && window.physics) {
        window.physics.resetVelocity(this.grabbedIndex);
      }

      this.grabbedIndex = null;
      // console.log('Mouse up');
    }
  }

  onMouseWheel(event) {
    event.preventDefault();

    // Initialize spherical if needed
    this.spherical.setFromVector3(
      this.camera.position.clone().sub(this.cameraOrbitCenter)
    );

    // Zoom: positive deltaY = scroll down (zoom out), negative = scroll up (zoom in)
    this.spherical.radius *= 1 + (event.deltaY > 0 ? this.zoomSpeed : -this.zoomSpeed);

    // Clamp zoom distance
    this.spherical.radius = Math.max(this.minZoom, Math.min(this.maxZoom, this.spherical.radius));

    // Convert back to Cartesian coordinates
    const position = new THREE.Vector3();
    position.setFromSpherical(this.spherical);
    position.add(this.cameraOrbitCenter);
    this.camera.position.copy(position);

    // Look at the orbit center
    this.camera.lookAt(this.cameraOrbitCenter);
  }

  /**
   * Raycast against a provided mesh
   * @param {THREE.Mesh} mesh - The slime mesh to raycast against
   */
  raycastMesh(mesh) {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(mesh);

    if (intersects.length > 0) {
      return intersects[0];
    }
    return null;
  }

  /**
   * Find the closest vertex to a hit point
   * @param {Object} hit - Raycaster intersection result
   * @param {THREE.BufferGeometry} geometry - The mesh geometry
   * @returns {number} Index of closest vertex
   */
  findClosestVertex(hit, geometry) {
    const position = geometry.attributes.position;
    const posArray = position.array;

    let minDist = Infinity;
    let closestIdx = 0;

    const hitPoint = hit.point;

    // Search all vertices for closest one
    for (let i = 0; i < posArray.length; i += 3) {
      const vx = posArray[i];
      const vy = posArray[i + 1];
      const vz = posArray[i + 2];

      const dx = vx - hitPoint.x;
      const dy = vy - hitPoint.y;
      const dz = vz - hitPoint.z;
      const dist = dx * dx + dy * dy + dz * dz;

      if (dist < minDist) {
        minDist = dist;
        closestIdx = i / 3;
      }
    }

    return closestIdx;
  }

  dispose() {
    this.dragPlaneGeometry.dispose();
  }
}
