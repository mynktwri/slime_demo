uniform sampler2D tDiffuse;
uniform vec2 uResolution;

varying vec2 vUv;

// Bayer 4x4 dithering matrix (normalized to [0, 1])
const mat4 bayerMatrix = mat4(
  vec4(0.0625, 0.5625, 0.1875, 0.6875),
  vec4(0.8125, 0.3125, 0.9375, 0.4375),
  vec4(0.25, 0.75, 0.0, 0.5),
  vec4(1.0, 0.5, 0.875, 0.375)
);

// Quantize color to discrete levels with dithering
vec3 dither(vec3 color, vec2 pixelCoord) {
  // Get integer pixel coordinates (mod 4 for 4x4 Bayer matrix)
  int x = int(mod(pixelCoord.x, 4.0));
  int y = int(mod(pixelCoord.y, 4.0));

  // Read dither threshold from Bayer matrix
  float threshold = bayerMatrix[y][x];

  // Quantize to LEVELS (8) discrete steps per channel
  // Higher LEVELS = smoother; lower = more posterized
  const float LEVELS = 16.0;
  const float invLevels = 1.0 / LEVELS;

  // Apply dithering: quantize with threshold offset
  vec3 quantized = floor(color * LEVELS + threshold) * invLevels;

  // Clamp to valid range
  return clamp(quantized, 0.0, 1.0);
}

void main() {
  // Sample the rendered scene
  vec3 color = texture2D(tDiffuse, vUv).rgb;

  // Get integer pixel coordinates in render target space
  vec2 pixelCoord = vUv * uResolution;

  // Apply dithering
  vec3 dithered = dither(color, pixelCoord);

  // Output with full opacity
  gl_FragColor = vec4(dithered, 1.0);
}
