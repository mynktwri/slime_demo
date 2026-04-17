precision highp float;

uniform vec3 uColor;
uniform float uOpacity;
uniform vec3 uLightDir;
uniform float uTime;

varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vViewDir;

void main() {
  // Normalize interpolated vectors
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewDir);
  vec3 lightDir = normalize(uLightDir);

  // Ambient lighting
  vec3 ambient = uColor * 0.4;

  // Diffuse lighting (Lambertian)
  float diffIntensity = max(dot(normal, lightDir), 0.0);
  vec3 diffuse = uColor * diffIntensity * 0.8;

  // Specular lighting (Phong)
  vec3 reflectDir = reflect(-lightDir, normal);
  float specIntensity = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
  vec3 specular = vec3(1.0) * specIntensity * 0.6;

  // Fresnel rim lighting effect
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
  vec3 rimLight = vec3(0.3, 0.5, 0.3) * fresnel * 0.4;

  // UV shimmer - subtle animation based on world position and time
  float shimmer = sin(vUv.x * 8.0 + uTime * 2.0) * sin(vUv.y * 8.0 + uTime * 1.5) * 0.1;

  // Combine all lighting
  vec3 finalColor = ambient + diffuse + specular + rimLight + (uColor * shimmer * 0.1);

  // Apply opacity and gamma correction
  gl_FragColor = vec4(finalColor, uOpacity);
}
