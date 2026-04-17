uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uNormalMatrix;
uniform vec3 uCameraPos;
uniform float uTime;

uniform int uGrabbedIndex;
uniform vec3 uGrabPoint;
uniform float uGrabDeformRadius;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  vUv = uv;

  // Transform normal to world space
  vNormal = normalize(mat3(uNormalMatrix) * normal);

  // Transform position to world space
  vec3 worldPos = (uModelMatrix * vec4(position, 1.0)).xyz;

  // Apply grab deformation: bulge outward from grab point
  if (gl_VertexID == uGrabbedIndex) {
    vec3 toVertex = normalize(worldPos - uGrabPoint);
    worldPos += toVertex * uGrabDeformRadius;
  }

  vWorldPos = worldPos;

  // View direction for Fresnel effect
  vViewDir = normalize(uCameraPos - vWorldPos);

  // Transform to clip space
  vec4 clipPos = uProjectionMatrix * uViewMatrix * vec4(vWorldPos, 1.0);

  // Apply vertex snapping in clip space for PS1 effect
  float gridSize = 160.0; // Grid resolution
  clipPos.xy = floor(clipPos.xy * gridSize) / gridSize;

  gl_Position = clipPos;
}
