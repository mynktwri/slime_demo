precision highp float;

// ============================================================
// STATIC UNIFORMS — set once in slimeMesh.js, never updated
// ============================================================

// uColor: kept declared for compatibility but the palette below
// drives color output instead. You can remove it from both places
// simultaneously if you want to fully decommission it.
uniform vec3  uColor;

// uOpacity: overall transparency of the slime surface.
// Default: 0.72 — Fresnel will modulate this down further at edges.
uniform float uOpacity;

// uLightDir: world-space direction toward the light source.
// Default: normalize(2, 2, 2) — upper-right-front.
uniform vec3  uLightDir;

// ============================================================
// PER-FRAME UNIFORMS — updated every frame in main.js animate()
// ============================================================

// uTime: accumulated seconds since page load. Drives shimmer animation.
uniform float uTime;

// ============================================================
// TUNABLE SHIMMER UNIFORMS
// All of these have defaults set in slimeMesh.js uniforms object.
// Adjust them there (or via window.slimeMesh.material.uniforms.X.value)
// to change the look without touching this shader.
// ============================================================

// uShimmerSpeed: how fast the shimmer pattern animates over time.
// Higher = faster sloshing. Default: 1.5
// Range: 0.0 (frozen) — 5.0 (frantic)
uniform float uShimmerSpeed;

// uShimmerScale: spatial frequency of the shimmer pattern in UV space.
// Higher = smaller, tighter blobs. Default: 4.0
// Range: 1.0 (huge blobs) — 12.0 (fine grain)
uniform float uShimmerScale;

// uShimmerIntensity: how strongly the shimmer drives the color palette.
// 0.0 = no shimmer, just diffuse lighting. 1.0 = fully shimmer-driven.
// Default: 0.8
uniform float uShimmerIntensity;

// uParallaxStrength: how much the view direction offsets shimmer UV coords.
// This creates the "see inside" illusion — different layers shift at
// different rates as you orbit the camera. Default: 0.15
// Range: 0.0 (flat, no parallax) — 0.4 (strong depth illusion)
uniform float uParallaxStrength;

// uFresnelPower: controls how sharply the Fresnel rim falls off.
// Low = soft gradual edge. High = sharp bright rim. Default: 2.0
// Range: 1.0 (very soft) — 6.0 (knife-edge rim)
uniform float uFresnelPower;

// uInnerGlow: brightness of the additive inner glow effect.
// Simulates light being trapped inside the slime volume.
// Default: 0.4. Range: 0.0 (no glow) — 1.5 (very luminous)
uniform float uInnerGlow;

// ============================================================
// VARYINGS — passed from slimeVert.glsl (vertex shader unchanged)
// ============================================================

varying vec2  vUv;        // Object-space UVs from BoxGeometry
varying vec3  vNormal;    // World-space surface normal
varying vec3  vWorldPos;  // World-space fragment position
varying vec3  vViewDir;   // Normalized direction from surface toward camera

// ============================================================
// COLOR PALETTE
//
// Bright/lit peaks:  #5353ad → vec3(0.325, 0.325, 0.678)  (blue-purple)
// Dark/shadow dips:  #000000 → vec3(0.0)                  (black)
//
// Everything in between is a mix() of these two.
// The shimmer value drives how far along the gradient each pixel lands.
// ============================================================

const vec3 COLOR_BRIGHT = vec3(0.325, 0.325, 0.678); // #5353ad — peaks of shimmer
const vec3 COLOR_DARK   = vec3(0.0,   0.0,   0.0  ); // #000000 — troughs / shadows

// ============================================================
// HELPER: goopyNoise
//
// Four-octave layered sin/cos noise. No hash tables, no lookup
// textures — pure math. The result is a smooth, organic float
// in approximately [0, 1] that evolves fluidly over time.
//
// Why sin/cos instead of Perlin?
//   WebGL ES 2.0 has no built-in noise(). A proper Simplex/Perlin
//   implementation is ~60 extra lines. Four sin/cos octaves are
//   visually indistinguishable after Bayer dithering quantizes to
//   8 levels, and they're faster to compile and run.
//
// Parameters:
//   uv  — 2D input coordinate (parallax-shifted UV)
//   t   — time, already scaled by uShimmerSpeed
//   scl — spatial scale, already multiplied by uShimmerScale
// ============================================================

float goopyNoise(vec2 uv, float t, float scl) {
    // Octave 1 — large, slow blobs with a diagonal cross-product feel
    float n1 = sin(uv.x * scl * 1.00 + t * 1.0)
             * cos(uv.y * scl * 0.87 + t * 0.73);

    // Octave 2 — medium blobs perpendicular to octave 1, slightly faster
    float n2 = sin(uv.y * scl * 1.30 + t * 1.4 + 1.57)
             * cos(uv.x * scl * 1.10 - t * 0.60);

    // Octave 3 — fine detail, faster ripple running diagonally
    float n3 = sin((uv.x + uv.y) * scl * 1.80 + t * 2.1 + 3.14)
             * 0.5;

    // Octave 4 — high-frequency shimmer sparkle, both axes beating
    float n4 = sin(uv.x * scl * 3.20 + t * 3.0)
             * sin(uv.y * scl * 2.90 - t * 2.5)
             * 0.3;

    // Sum of octaves, then remap from ~[-1.8, 1.8] to [0, 1]
    return (n1 + n2 + n3 + n4) * 0.25 + 0.5;
}

// ============================================================
// MAIN
// ============================================================

void main() {

    // --------------------------------------------------------
    // 1. NORMALIZE INTERPOLATED VECTORS
    //
    //    GPU interpolates varyings linearly across triangles,
    //    which means the magnitude drifts. Always renormalize
    //    before using as direction vectors.
    // --------------------------------------------------------
    vec3 N = normalize(vNormal);    // surface normal
    vec3 V = normalize(vViewDir);   // toward camera
    vec3 L = normalize(uLightDir);  // toward light

    // --------------------------------------------------------
    // 2. PARALLAX UV OFFSET — the "see inside" depth illusion
    //
    //    By shifting the shimmer sampling coordinates based on
    //    the view direction, different noise layers appear to
    //    move at different rates as the camera orbits. This
    //    creates the illusion of internal depth planes — like
    //    looking into a gel with visible internal structure.
    //
    //    Near layer: shifts forward in view-dir XY.
    //    Deep layer: shifts backward, 1.6× stronger — so it
    //                appears to be further "inside" the blob.
    //
    //    uParallaxStrength scales both layers. At 0 they collapse
    //    onto the same UV and the depth illusion disappears.
    // --------------------------------------------------------
    vec2 parallaxUV  = vUv + V.xy * uParallaxStrength;         // surface layer
    vec2 parallaxUV2 = vUv - V.xy * uParallaxStrength * 1.6;   // deep layer

    // Scaled time for speed control
    float t = uTime * uShimmerSpeed;

    // --------------------------------------------------------
    // 3. SAMPLE TWO SHIMMER LAYERS AT DIFFERENT DEPTHS
    //
    //    layerA → near surface: same time scale, full frequency
    //    layerB → deep inside:  slower time (0.67×), coarser
    //             frequency (0.65×) — appears to move slower
    //             and have bigger blobs, as if deeper inside.
    // --------------------------------------------------------
    float layerA = goopyNoise(parallaxUV,  t,         uShimmerScale);
    float layerB = goopyNoise(parallaxUV2, t * 0.67,  uShimmerScale * 0.65);

    // --------------------------------------------------------
    // 4. FRESNEL TERM
    //
    //    Measures how "grazing" the view angle is relative to
    //    the surface normal:
    //      fresnel = 0 at center (view hits surface head-on)
    //      fresnel = 1 at edges  (view grazes the surface)
    //
    //    Used to:
    //      a) Blend near/deep layers — edges show near layer (A),
    //         center shows deep layer (B), reinforcing depth.
    //      b) Modulate opacity — edges slightly more transparent,
    //         giving the translucent gel look.
    //      c) Mask the inner glow — glow shows at center (inverse
    //         Fresnel), where the view angle is direct.
    // --------------------------------------------------------
    float NdotV  = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdotV, uFresnelPower);

    // Blend layers: near-surface (A) at grazing edges,
    //               deep (B) at face center.
    float shimmerRaw = mix(layerB, layerA, fresnel);

    // Scale by user intensity
    float shimmer = shimmerRaw * uShimmerIntensity;

    // --------------------------------------------------------
    // 5. PHONG DIFFUSE + SPECULAR
    //
    //    Retain basic directional lighting so the 3D form still
    //    reads clearly. Diffuse contributes 30% to palette drive
    //    (shimmer contributes 70%), keeping shape readable without
    //    washing out the internal effect.
    //
    //    Specular shininess = 24 → moderately tight highlight,
    //    reads as wet/gooey without being a mirror.
    // --------------------------------------------------------

    // Lambertian diffuse in [0, 1]
    float diff = max(dot(N, L), 0.0);

    // Phong specular
    vec3  R         = reflect(-L, N);
    float specAngle = max(dot(V, R), 0.0);
    float spec      = pow(specAngle, 24.0) * 0.7;

    // --------------------------------------------------------
    // 6. COMPOSE FINAL COLOR
    //
    //    paletteDrive: combined shimmer + diffuse → [0, 1]
    //      0 → COLOR_DARK (black)
    //      1 → COLOR_BRIGHT (#5353ad)
    //    Shimmer (70%) drives the goopy internal pattern.
    //    Diffuse (30%) preserves the lit shape of the box.
    //
    //    innerGlowColor: additive brightening at the center
    //    where Fresnel is low (view hits surface directly).
    //    Simulates light trapped and scattered inside the gel.
    //
    //    specColor: white additive highlight for wet look.
    // --------------------------------------------------------
    float paletteDrive  = clamp(shimmer * 0.7 + diff * 0.3, 0.0, 1.0);
    vec3  baseColor     = mix(COLOR_DARK, COLOR_BRIGHT, paletteDrive);

    // Inner glow: strongest at center (1 - fresnel), modulated by shimmer
    float innerGlowMask = (1.0 - fresnel) * shimmerRaw;
    vec3  innerGlowColor = COLOR_BRIGHT * uInnerGlow * innerGlowMask;

    // Specular highlight
    vec3  specColor = vec3(spec);

    vec3 finalColor = baseColor + innerGlowColor + specColor;

    // --------------------------------------------------------
    // 7. OPACITY
    //
    //    uOpacity is the global cap. Fresnel reduces it slightly
    //    at grazing edges (factor 0.45) — thin edges of the blob
    //    become more transparent, reinforcing the translucent gel
    //    appearance. Center pixels stay near full uOpacity.
    // --------------------------------------------------------
    float alpha = uOpacity * (1.0 - fresnel * 0.45);
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(finalColor, alpha);
}
