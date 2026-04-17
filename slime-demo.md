# Plan: PS1-Style 3D Slime Cube Demo

## Context
Build a Three.js interactive demo of a slime cube with jiggle physics and PS1 era aesthetics (vertex snapping, affine texture warping, pixelated rendering, dithering/color banding). The cube must deform on mouse drag and jiggle back when released. No external physics library — custom spring-mass system for full control over sliminess.

---

## File Structure

```
/home/mayank/practice/slime_demo/
├── index.html
├── package.json            # three + vite
├── vite.config.js          # assetsInclude: ['**/*.glsl']
└── src/
    ├── main.js             # entry: wires all modules + animation loop
    ├── renderer.js         # scene, camera, WebGLRenderTarget at 320×240
    ├── slimeMesh.js        # BoxGeometry(2,2,2,7,7,7) + ShaderMaterial
    ├── physics.js          # spring-mass Verlet integration
    ├── interaction.js      # raycasting, drag plane, grabbed particle
    ├── postprocess.js      # fullscreen quad + dithering ShaderMaterial
    └── shaders/
        ├── slimeVert.glsl  # vertex snapping + affine UV trick
        ├── slimeFrag.glsl  # diffuse/specular/fresnel + shimmer
        ├── quadVert.glsl   # passthrough for fullscreen quad
        └── ditheringFrag.glsl  # Bayer 4×4 dither + color banding
```

---

## Implementation Steps

### 1. Scaffold
- `package.json`: deps `three`, devDeps `vite`; `"type": "module"`
- `vite.config.js`: `assetsInclude: ['**/*.glsl']` so `?raw` imports work
- `index.html`: full-viewport canvas, `image-rendering: pixelated` on body
- `npm install`

### 2. Shaders (write first so imports resolve)

**`slimeVert.glsl`** — key PS1 effects:
```glsl
// 1. Vertex snapping (clip space, before perspective divide):
vec4 clipPos = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
vec2 halfGrid = vec2(uGridSize * 0.5);  // e.g. 160
vec2 snapped = floor((clipPos.xy / clipPos.w) * halfGrid + 0.5) / halfGrid;
clipPos.xy = snapped * clipPos.w;

// 2. Affine UV trick (multiplying by w before interpolation → hardware divides
//    by w, cancelling perspective correction → PS1 texture warping):
vUvAffine = uv * clipPos.w;
vW = clipPos.w;
gl_Position = clipPos;
```

**`slimeFrag.glsl`** — slime look:
```glsl
vec2 uv = vUvAffine / vW;  // recover affine UV
// diffuse N·L + specular Blinn-Phong + Fresnel rim + UV shimmer animation
```

**`ditheringFrag.glsl`** — PS1 posterize:
```glsl
// Bayer 4×4 matrix threshold per pixel (integer pixel coords, not UV floats)
// band() quantizes each channel to LEVELS=8 discrete steps with dither offset
```

### 3. `slimeMesh.js`
- `new THREE.BoxGeometry(2, 2, 2, 7, 7, 7)` — 7 subdivisions = 512 vertices; enough for visible deformation
- Build `ShaderMaterial` with uniforms: `uTime`, `uGridSize` (160), `uColor`, `uOpacity` (0.72), `uLightDir`, `uCameraPos`
- `transparent: true`, `depthWrite: false`, `side: THREE.DoubleSide`
- Export `{ mesh, geometry }`

### 4. `physics.js` — Spring-Mass Verlet
```
Constants: GRAVITY=-9.8, DAMPING=0.98, SPRING_K=180, SHEAR_K=60, DRAG_K=300, SUBSTEPS=4

Initialization:
  - positions  = geometry.attributes.position.array  (SHARED Float32Array — write here → GPU sees it)
  - prevPositions = positions.slice()
  - forces = new Float32Array(N*3)
  - buildSprings(): O(N²) pair scan, structural springs at d < edgeLen*1.1, shear at d < edgeLen*sqrt(2)*1.1

Per-frame update(dt, grabbedIndex, dragTarget):
  for substep in SUBSTEPS:
    1. forces.fill(0)
    2. gravity on all particles (y component)
    3. spring forces: F = K*(d - rest)*direction  (Newton 3rd law on both ends)
    4. if grabbedIndex >= 0: forces[grabbed] += (dragTarget - pos[grabbed]) * DRAG_K
    5. Verlet: vel = (curr - prev)*DAMPING; prev=curr; curr += vel + acc*subDt²
    6. floor constraint: if pos.y < -2.5, clamp and zero vertical velocity
  geometry.attributes.position.needsUpdate = true
  geometry.computeVertexNormals()
```

### 5. `interaction.js`
```
onMouseDown:
  - raycast against mesh → hit.face.{a,b,c} → find nearest vertex
  - grabbedIndex = that vertex
  - dragPlane = camera-facing plane through hit.point (NOT world-axis — prevents ray-parallel singularity)

onMouseMove:
  - ray.intersectPlane(dragPlane, dragTarget) → world 3D position the particle should chase

onMouseUp:
  - grabbedIndex = -1  (physics takes over, jiggle ensues)
```

### 6. `postprocess.js` — Fullscreen Quad (manual, not EffectComposer)
```js
// 320×240 render target with NearestFilter (pixelated upscale)
renderTarget = new THREE.WebGLRenderTarget(320, 240, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
});

// Fullscreen quad scene
quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
quadMesh   = PlaneGeometry(2,2) + ShaderMaterial(ditheringFrag)
// uniform tDiffuse = renderTarget.texture
// uniform uResolution = vec2(320, 240)
```

### 7. `renderer.js` + `main.js` — Animation Loop
```
scene setup: PerspectiveCamera(60, 320/240), ambient + directional lights

animate(time):
  dt = clock.getDelta()
  physics.update(dt, interaction.grabbedIndex, interaction.dragTarget)
  slimeMesh.uniforms.uTime = time * 0.001
  slimeMesh.uniforms.uCameraPos = camera.position

  // Render to low-res target
  renderer.setRenderTarget(renderTarget)
  renderer.render(scene, camera)
  renderer.setRenderTarget(null)

  // Composite dithered result to screen
  renderer.render(quadScene, quadCamera)
```

---

## Key Decisions & Rationale

| Decision | Why |
|---|---|
| Custom spring-mass, no Rapier | Rapier soft body is still experimental; custom gives full sliminess tuning |
| Manual render target, not EffectComposer | Avoids EffectComposer internal resolution fighting; simpler loop |
| `geometry.attributes.position.array` shared with physics | Zero-copy: physics writes directly into the GPU buffer |
| Camera-facing drag plane | Prevents singularity when mouse ray is nearly parallel to any world axis |
| Affine UV via `vUvAffine = uv * w` | Exploits hardware rasterizer to interpolate without perspective correction — authentic PS1 warp |
| `depthWrite: false` on slime | Translucent objects must not write depth or they'll occlude themselves incorrectly |

---

## Tuning Parameters

| Parameter | File | Effect |
|---|---|---|
| `uGridSize` (160) | slimeVert uniform | Lower = chunkier vertex snap wobble |
| `SPRING_K` (180) | physics.js | Higher = stiffer bounce; lower = mushy |
| `DAMPING` (0.98) | physics.js | Closer to 1.0 = longer jiggle; 0.95 = fast settle |
| `SUBSTEPS` (4) | physics.js | Raise if springs explode |
| `LEVELS` (8) | ditheringFrag.glsl | Lower = heavier banding |
| Subdivision (7) | slimeMesh.js BoxGeometry | Higher = smoother deform, more particles |

---

## Verification

1. `npm run dev` — no console errors, green cube visible
2. **PS1 vertex snap**: slight cube rotation → vertices visibly "pop" between positions
3. **Pixelation**: full-screen image is blocky (NearestFilter upscale working)
4. **Dithering**: reduce LEVELS to 4, see obvious color steps + Bayer pattern on flat areas
5. **Physics sanity**: `console.log(physics.positions.slice(0,6))` — values oscillate then converge, never go to Infinity
6. **Mouse grab**: click cube → `interaction.grabbedIndex >= 0`; drag → surface stretches; release → jiggle ripple propagates and settles
