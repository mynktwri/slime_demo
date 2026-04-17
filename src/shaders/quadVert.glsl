varying vec2 vUv;

void main() {
  // Standard fullscreen quad: map geometry UVs to vary from 0 to 1
  vUv = uv;

  // Position is already in clip space (PlaneGeometry maps to -1 to 1)
  gl_Position = vec4(position, 1.0);
}
