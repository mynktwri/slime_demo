import * as THREE from 'three';
import { Renderer } from './renderer.js';
import { Interaction } from './interaction.js';
import slimeMeshInstance from './slimeMesh.js';
import { initPhysics, update as physicsUpdate } from './physics.js';
import postprocessInstance from './postprocess.js';
import { Settings } from './settings.js';
import { StarsSystem } from './starsSystem.js';
import { VertexOverlay } from './vertexOverlay.js';

// Initialize renderer
const canvas = document.querySelector('canvas') || createCanvas();
const renderer = new Renderer(canvas);

// // Debug cube disabled - replaced with slime mesh at origin
// const debugGeom = new THREE.BoxGeometry(2, 2, 2);
// const debugMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
// const debugCube = new THREE.Mesh(debugGeom, debugMat);
// debugCube.position.set(0, 0, 0);
// renderer.addToScene(debugCube);
// console.log('Debug cube added at origin (green wireframe)');

// Initialize interaction system
const interaction = new Interaction(renderer.camera, renderer.webglRenderer);

// Add a temporary debug cube to verify rendering works
const debugGeom = new THREE.BoxGeometry(1, 1, 1);
const debugMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
const debugCube = new THREE.Mesh(debugGeom, debugMat);
debugCube.position.set(0, 0, 0);
renderer.addToScene(debugCube);
console.log('DEBUG: Added red wireframe cube to verify rendering');

// Initialize slime mesh and add to scene
const slimeMesh = slimeMeshInstance.getMesh();
const geometry = slimeMeshInstance.getGeometry();
renderer.addToScene(slimeMesh);

console.log('=== SLIME MESH DEBUG ===');
console.log('Slime mesh added to scene:');
console.log('  Mesh object:', slimeMesh);
console.log('  Position:', slimeMesh.position);
console.log('  Visible:', slimeMesh.visible);
console.log('  Geometry:', geometry);
console.log('  Geometry vertices:', geometry.attributes.position.count);
console.log('  Geometry indices:', geometry.index ? geometry.index.count : 'none');
console.log('  Material type:', slimeMesh.material.type);
console.log('  Material uniforms:', Object.keys(slimeMesh.material.uniforms));
console.log('  Material side:', slimeMesh.material.side);
console.log('  Material transparent:', slimeMesh.material.transparent);
console.log('  Material depthWrite:', slimeMesh.material.depthWrite);
console.log('  Scene children:', renderer.scene.children.length);
console.log('  Camera position:', renderer.camera.position);
console.log('  Camera far:', renderer.camera.far);
console.log('======================');

// Initialize physics with geometry
const physics = initPhysics(geometry);

// Initialize stars system after physics so the position buffer is ready.
// Pass the geometry — StarsSystem reads geometry.attributes.position.array
// directly, which is the same Float32Array physics writes to every frame.
const starsSystem = new StarsSystem(renderer.scene, geometry);

// Initialize vertex overlay for visualizing grabbed vertices
const vertexOverlay = new VertexOverlay(renderer.scene, geometry, physics);

// Initialize postprocess system
const postprocess = postprocessInstance;

// Initialize settings UI
const settings = new Settings(physics);

// Expose systems globally for debugging
window.renderer = renderer;
window.interaction = interaction;
window.physics = physics;
window.slimeMesh = slimeMeshInstance;
window.postprocess = postprocess;
window.settings = settings;
window.starsSystem = starsSystem;
window.vertexOverlay = vertexOverlay;

console.log('Slime Demo fully initialized');
console.log('Renderer ready with 320x240 render target + dithering');
console.log('Physics initialized with spring-mass Verlet integration');
console.log('Postprocess pipeline ready (dithering shader active)');

// Animation loop
let lastTime = Date.now();
let elapsedTime = 0;
let frameCount = 0;

function animate() {
  const now = Date.now();
  const deltaTime = (now - lastTime) / 1000; // Convert to seconds
  lastTime = now;
  elapsedTime += deltaTime;
  frameCount++;

  // Update slime mesh uniforms
  if (slimeMesh && slimeMesh.material && slimeMesh.material.uniforms) {
    slimeMesh.updateMatrixWorld(true); // Force update

    // Set all matrices explicitly
    slimeMesh.material.uniforms.uModelMatrix.value.copy(slimeMesh.matrixWorld);
    slimeMesh.material.uniforms.uViewMatrix.value.copy(renderer.camera.matrixWorldInverse);
    slimeMesh.material.uniforms.uProjectionMatrix.value.copy(renderer.camera.projectionMatrix);

    // Compute normal matrix (inverse transpose of model matrix)
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(slimeMesh.matrixWorld);
    const mat4NormalMatrix = new THREE.Matrix4().setFromMatrix3(normalMatrix);
    slimeMesh.material.uniforms.uNormalMatrix.value.copy(mat4NormalMatrix);

    // Update camera position and accumulated time for lighting effects
    slimeMesh.material.uniforms.uCameraPos.value.copy(renderer.camera.position);
    slimeMesh.material.uniforms.uTime.value = elapsedTime;

    // Update grab deformation uniforms
    slimeMesh.material.uniforms.uGrabbedIndex.value = interaction.grabbedIndex >= 0 ? interaction.grabbedIndex : -1;
    if (interaction.grabbedIndex >= 0) {
      slimeMesh.material.uniforms.uGrabPoint.value.copy(interaction.dragTarget);
      slimeMesh.material.uniforms.uGrabDeformRadius.value = physics.collisionRadii[interaction.grabbedIndex] || 0.15;
    }

    // Debug first few frames
    if (frameCount <= 3) {
      console.log(`Frame ${frameCount}:`);
      console.log('  Camera:', renderer.camera.position);
      console.log('  Model matrix:', slimeMesh.matrixWorld.elements.slice(0, 4));
      console.log('  Shader compiled:', slimeMesh.material.program !== undefined);
    }
  }

  // Update physics with grabbed particle info
  if (interaction.grabbedIndex === null) {
    interaction.grabbedIndex = -1; // Default to -1 when not grabbed
  }
  physicsUpdate(deltaTime, interaction.grabbedIndex, interaction.dragTarget);

  // Move each star sprite to its assigned vertex's current physics position
  starsSystem.update();

  // Update vertex overlay to show grabbed vertices
  vertexOverlay.update(interaction.grabbedIndex);

  // Render scene to low-res render target
  const renderTarget = postprocess.getRenderTarget();
  renderer.webglRenderer.setRenderTarget(renderTarget);
  renderer.webglRenderer.clear();
  renderer.webglRenderer.render(renderer.scene, renderer.camera);

  if (frameCount <= 3) {
    console.log(`Frame ${frameCount} render:`);
    console.log('  Render target:', renderTarget);
    console.log('  Scene objects to render:', renderer.scene.children.length);
    console.log('  Slime mesh visible:', slimeMesh.visible);
  }

  // Composite with dithering to screen
  renderer.webglRenderer.setRenderTarget(null);
  renderer.webglRenderer.clear();
  renderer.webglRenderer.render(postprocess.getQuadScene(), postprocess.getQuadCamera());

  requestAnimationFrame(animate);
}

// Helper function to create canvas if not present
function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.margin = '0';
  canvas.style.padding = '0';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.imageRendering = 'pixelated';
  document.body.style.imageRendering = 'crisp-edges';
  document.body.appendChild(canvas);
  return canvas;
}

// Initialize and start animation loop
console.log('Starting animation loop...');
animate();
