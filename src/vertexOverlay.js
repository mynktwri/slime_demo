import * as THREE from 'three';

const POOL_SIZE = 50;
const SPRITE_SIZE = 0.08;
const RADIUS_MULTIPLIER = 5;

function makeXTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(6, 6);
  ctx.lineTo(26, 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, 6);
  ctx.lineTo(6, 26);
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}

export class VertexOverlay {
  constructor(scene, geometry, physics) {
    this._positions = geometry.attributes.position.array;
    this._physics = physics;

    const tex = makeXTexture();
    this._group = new THREE.Group();
    this._pool = [];

    for (let i = 0; i < POOL_SIZE; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xff0000,
        depthWrite: false,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(SPRITE_SIZE);
      sprite.visible = false;
      this._group.add(sprite);
      this._pool.push(sprite);
    }

    scene.add(this._group);
  }

  update(grabbedIndex) {
    for (const s of this._pool) s.visible = false;

    if (grabbedIndex < 0) return;

    const pos = this._positions;
    const radius = (this._physics.collisionRadii[grabbedIndex] || 0.15) * RADIUS_MULTIPLIER;
    const r2 = radius * radius;
    const gx = pos[grabbedIndex * 3];
    const gy = pos[grabbedIndex * 3 + 1];
    const gz = pos[grabbedIndex * 3 + 2];

    let slot = 0;
    const n = pos.length / 3;
    for (let i = 0; i < n && slot < POOL_SIZE; i++) {
      const dx = pos[i * 3] - gx;
      const dy = pos[i * 3 + 1] - gy;
      const dz = pos[i * 3 + 2] - gz;
      if (dx * dx + dy * dy + dz * dz <= r2) {
        this._pool[slot].position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        this._pool[slot].visible = true;
        slot++;
      }
    }
  }

  dispose() {
    this._pool[0]?.material.map?.dispose();
    for (const s of this._pool) s.material.dispose();
    this._group.parent?.remove(this._group);
  }
}
