/**
 * GLSL for the Crimson Sanctum. Everything renders into the composer's linear HDR target, so no tone mapping
 * or color-space chunks here: the OutputPass does both, and the finish pass works on its sRGB result.
 */

const SDF = /* glsl */ `
float sdChamfer(vec2 p, vec2 b, float c) {
  vec2 q = abs(p) - b;
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
  float diag = (abs(p.x) + abs(p.y) - (b.x + b.y - c)) * 0.70710678;
  return max(box, diag);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}`;

/**
 * Panel bodies: a unit grid of shards (non-indexed, one centroid per triangle) that flies together as
 * `uAssemble` goes 0 → 1, rotating and settling with glowing seams. Positions are in CSS px (panel space).
 */
export const SHARD_VERTEX = /* glsl */ `
uniform vec2 uSize;
uniform float uAssemble;
uniform vec2 uOrigin;
uniform float uZ;
uniform float uGrow;
attribute vec3 aCenter;
attribute vec3 aRand;
attribute vec3 aBary;
varying vec2 vUv;
varying float vShard;
varying vec3 vBary;
void main() {
  float delay = clamp(distance(aCenter.xy, uOrigin) * 0.5 + aRand.x * 0.25, 0.0, 1.0) * 0.55;
  float k = clamp((uAssemble - delay) / 0.45, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - k, 3.0);
  vec2 size = uSize + uGrow;
  vec2 c = (aCenter.xy - 0.5) * size;
  vec2 d = (position.xy - aCenter.xy) * size;
  float a = (1.0 - e) * (aRand.y - 0.5) * 5.0;
  d = mat2(cos(a), -sin(a), sin(a), cos(a)) * d * (0.25 + 0.75 * e);
  vec3 drift = vec3((aRand.yz - 0.5) * vec2(size.x, size.y) * 0.9, 240.0 + aRand.x * 520.0) * (1.0 - e);
  vec3 p = vec3(c + d, uZ) + drift;
  vUv = position.xy;
  vShard = k;
  vBary = aBary;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

/**
 * Glass, frame and back slab in one shader (`uLayer` 0 = slab, 1 = glass). Status looks for code tablets:
 * 0 active (pulsing crimson), 1 scheduled (dim ember), 2 expired (ash), 3 used up (cracked), 4 disabled (dark).
 */
export const GLASS_FRAGMENT = /* glsl */ `
uniform vec2 uSize;
uniform float uCut;
uniform float uTime;
uniform float uLayer;
uniform float uHover;
uniform vec2 uPointer;
uniform float uPress;
uniform vec4 uRipple;
uniform vec3 uTone;
uniform float uStatus;
uniform float uPulse;
uniform float uFocus;
uniform float uAlert;
uniform float uAlpha;
varying vec2 vUv;
varying float vShard;
varying vec3 vBary;
${SDF}
vec2 cell(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(hash12(i + g), hash12(i + g + 17.3));
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return vec2(f1, f2);
}
void main() {
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdChamfer(p, uSize * 0.5, uCut);
  if (d > 0.75) discard;
  float aa = clamp(0.5 - d, 0.0, 1.0);
  float inner = max(-d, 0.0);
  float shown = smoothstep(0.0, 0.55, vShard);
  float seam = (1.0 - smoothstep(0.0, 0.05, min(vBary.x, min(vBary.y, vBary.z)))) * step(0.001, vShard) * (1.0 - vShard);
  float status = uStatus;
  float dim = status > 3.5 ? 0.25 : status > 1.5 && status < 2.5 ? 0.55 : 1.0;

  if (uLayer < 0.5) {
    vec3 slab = vec3(0.010, 0.003, 0.005) + uTone * exp(-inner / 5.0) * 0.35 * dim;
    gl_FragColor = vec4(slab + uTone * seam * 2.0, 0.97 * aa * shown * uAlpha);
    return;
  }

  vec3 base = mix(vec3(0.016, 0.005, 0.008), vec3(0.040, 0.011, 0.018), vUv.y);
  base += uTone * exp(-inner / 34.0) * 0.07 * dim;
  base *= 0.93 + 0.07 * step(0.5, fract(p.y / 3.0));
  if (status > 1.5 && status < 2.5) {
    float g = dot(base, vec3(0.333));
    base = mix(base, vec3(g) * vec3(1.0, 0.95, 0.96), 0.7);
    base += vec3(0.06, 0.05, 0.055) * step(0.985, hash12(floor(p / 2.0)));
  }

  float lit = 0.3 + 0.7 * uHover + uFocus * 0.5 + uAlert * 1.5;
  float rim = exp(-inner / 1.3);
  float frame = smoothstep(1.1, 0.0, abs(inner - 7.0));
  vec2 corner = abs(p) - (uSize * 0.5 - 30.0);
  float accent = step(0.0, corner.x) * step(0.0, corner.y);
  if (status > 0.5 && status < 1.5) frame *= step(0.45, fract((p.x - p.y) / 12.0 + uTime * 0.15));

  vec3 col = base;
  col += uTone * rim * (0.5 + 1.8 * lit) * dim;
  col += uTone * frame * (0.10 + 0.45 * lit + accent * 0.5) * dim;
  col += uTone * rim * uPulse * 1.6;
  col += uTone * frame * uPulse * 0.5;

  if (status > 2.5 && status < 3.5) {
    vec2 c = cell(p / 26.0 + 3.1);
    float crack = 1.0 - smoothstep(0.0, 0.05, c.y - c.x);
    float region = smoothstep(0.55, 0.2, length((vUv - vec2(0.68, 0.38)) * vec2(1.0, uSize.y / uSize.x)));
    col += uTone * crack * region * (0.9 + 0.5 * sin(uTime * 2.0 + p.x * 0.05));
    col *= 1.0 - crack * region * 0.2;
  }

  vec2 g = (vUv - uPointer) * uSize / max(uSize.x, uSize.y);
  col += vec3(1.0, 0.72, 0.78) * exp(-dot(g, g) * 10.0) * 0.12 * uHover * dim;
  float band = dot(vUv - 0.5, vec2(0.86, 0.5)) - (uPointer.x - 0.5) * 0.7 - (uPointer.y - 0.5) * 0.3;
  col += vec3(1.0, 0.82, 0.86) * exp(-band * band * 140.0) * (0.02 + 0.06 * uHover) * dim;

  float rt = uTime - uRipple.z;
  if (rt > 0.0 && rt < 0.9) {
    float r = length((vUv - uRipple.xy) * uSize) - rt * 700.0;
    col += uTone * exp(-r * r / 260.0) * (1.0 - rt / 0.9) * 0.9;
  }
  col += uTone * uPress * 0.12;
  col += uTone * seam * 3.0;

  float alpha = (0.84 + 0.16 * rim) * aa * shown * uAlpha;
  gl_FragColor = vec4(col, alpha);
}`;

/** Soft shadow under a lifted card: a blurred dark rectangle that spreads as the card rises. */
export const SHADOW_FRAGMENT = /* glsl */ `
uniform vec2 uSize;
uniform float uLift;
uniform float uAlpha;
varying vec2 vUv;
${SDF}
void main() {
  vec2 p = (vUv - 0.5) * (uSize + 80.0);
  float blur = 10.0 + uLift * 0.8;
  float d = sdChamfer(p, uSize * 0.5 - 4.0, 12.0);
  float a = 1.0 - smoothstep(-blur, blur, d);
  gl_FragColor = vec4(0.0, 0.0, 0.0, a * (0.35 + uLift * 0.012) * uAlpha);
}`;

export const SHADOW_VERTEX = /* glsl */ `
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = vec3(position.xy * (uSize + 80.0), position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

export const UV_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The summoning circle, traced clockwise by `uTrace`. */
export const SIGIL_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTrace;
uniform float uGlow;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float angle = fract(atan(p.x, p.y) / 6.2831853 + 1.0);
  float traced = smoothstep(uTrace, uTrace - 0.02, angle) * step(0.001, uTrace);
  float head = exp(-pow((angle - uTrace) * 60.0, 2.0)) * step(0.001, uTrace) * (1.0 - step(0.999, uTrace));
  float lines = texture2D(uMap, vUv).r;
  float fade = smoothstep(1.0, 0.7, r);
  float pulse = 0.8 + 0.2 * sin(uTime * 1.3 - r * 8.0);
  gl_FragColor = vec4(uColor * lines * fade * (traced * pulse * uGlow + head * 4.0), 1.0);
}`;

/** A strip of runes around a ring, with a highlight sweeping along it. */
export const RUNE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uLevel;
uniform float uSpeed;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float lines = texture2D(uMap, vec2(vUv.x + uTime * uSpeed, vUv.y)).r;
  float sweep = pow(0.5 + 0.5 * sin(vUv.x * 6.2831853 / 4.0 - uTime * 1.7), 12.0);
  gl_FragColor = vec4(uColor * lines * uLevel * (0.55 + 1.6 * sweep), 1.0);
}`;

/** Rays fanning out of the core: soft at the root, fading outward, flickering one by one. */
export const CROWN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
varying vec2 vUv;
varying float vRay;
void main() {
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float along = vUv.y;
  float flicker = 0.55 + 0.45 * sin(uTime * (0.6 + fract(vRay * 7.31) * 1.4) + vRay * 11.0);
  float a = pow(across, 3.0) * pow(1.0 - along, 1.6) * smoothstep(0.0, 0.12, along) * flicker * uLevel;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;

export const CROWN_VERTEX = /* glsl */ `
attribute float aRay;
varying vec2 vUv;
varying float vRay;
void main() {
  vUv = uv;
  vRay = aRay;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** Slow smoke: two drifting samples of tileable noise, faded at the plane's edges. */
export const SMOKE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uTime;
uniform float uLevel;
uniform vec3 uColor;
uniform vec2 uDrift;
varying vec2 vUv;
void main() {
  vec2 uv = vUv * 1.4;
  float a = texture2D(uMap, uv + uDrift * uTime).r;
  float b = texture2D(uMap, uv * 1.8 - uDrift.yx * uTime * 0.7 + 0.37).r;
  float s = smoothstep(0.35, 1.0, a * 0.6 + b * 0.6);
  vec2 m = smoothstep(0.0, 0.3, vUv) * smoothstep(1.0, 0.7, vUv);
  gl_FragColor = vec4(uColor * s * m.x * m.y * uLevel, 1.0);
}`;

/**
 * Embers and ash drifting through the whole chamber on an analytic curl field (divergence free, so they
 * swirl instead of bunching). `uPull` drags everything toward the core for the implosion.
 */
export const DUST_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uPixel;
uniform float uSize;
uniform float uAlpha;
uniform float uPull;
uniform vec3 uCore;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
vec3 curl(vec3 p) {
  return vec3(
    1.3 * cos(1.3 * p.y + 1.7) - 0.9 * cos(0.9 * p.z + 4.1),
    1.1 * cos(1.1 * p.z + 0.3) - 1.5 * cos(1.5 * p.x + 2.2),
    0.8 * cos(0.8 * p.x + 5.3) - 1.2 * cos(1.2 * p.y + 0.9)
  );
}
void main() {
  bool ash = aSeed.w > 0.74;
  vec3 box = vec3(17.0, 7.5, 17.0);
  float speed = ash ? -(0.12 + aSeed.x * 0.1) : 0.22 + aSeed.w * 0.4;
  vec3 p = (aSeed.xyz - 0.5) * 2.0 * box;
  p.y = mod(p.y + box.y + uTime * speed, 2.0 * box.y) - box.y;
  float life = (p.y + box.y) / (2.0 * box.y);
  if (ash) life = 1.0 - life;
  p += curl(p * 0.21 + vec3(0.0, uTime * 0.06, uTime * 0.03)) * (ash ? 0.85 : 0.55);
  p += curl(p * 0.63 + 7.3 + uTime * 0.11) * 0.16;
  p.y += 2.2;
  vec3 to = uCore - p;
  p += to * uPull * smoothstep(16.0, 0.0, length(to)) * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float edge = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.82, 1.0, life));
  float flicker = ash ? 1.0 : 0.55 + 0.45 * sin(uTime * (3.0 + aSeed.x * 7.0) + aSeed.z * 40.0);
  vAlpha = uAlpha * edge * flicker * (ash ? 0.3 : 1.0);
  vHeat = ash ? -1.0 : aSeed.w + uPull;
  gl_PointSize = (ash ? 2.4 + aSeed.x * 2.4 : 0.7 + aSeed.x * 1.7) * uSize * uPixel / -mv.z;
}`;

export const DUST_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uHot;
uniform vec3 uAsh;
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 color = vHeat < 0.0 ? uAsh : mix(uColor, uHot, a * a * (0.3 + vHeat * 0.7));
  gl_FragColor = vec4(color * a * vAlpha, 1.0);
}`;

/** Sparks thrown out of the core by the publish shockwave (`uAge` in seconds). */
export const BURST_VERTEX = /* glsl */ `
uniform float uAge;
uniform float uPixel;
uniform float uSize;
attribute vec3 aDir;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  float t = max(0.0, uAge - aSeed.w * 0.08);
  float speed = 3.0 + aSeed.x * 11.0;
  float life = 0.7 + aSeed.y * 1.6;
  vec3 p = aDir * speed * (1.0 - exp(-1.6 * t)) / 1.6 + vec3(0.0, -0.9 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = step(0.0001, t) * (1.0 - smoothstep(life * 0.3, life, t));
  vHeat = aSeed.z;
  gl_PointSize = (0.8 + aSeed.z * 2.2) * uSize * uPixel / -mv.z;
}`;

/** Energy arcs: ribbons along a jagged path that flicker out (`uLife` 1 → 0). */
export const ARC_VERTEX = /* glsl */ `
attribute float aSide;
attribute float aAlong;
varying float vSide;
varying float vAlong;
void main() {
  vSide = aSide;
  vAlong = aAlong;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const ARC_FRAGMENT = /* glsl */ `
uniform float uLife;
uniform float uTime;
uniform vec3 uColor;
varying float vSide;
varying float vAlong;
void main() {
  float core = exp(-vSide * vSide * 6.0);
  float flicker = step(0.25, fract(sin(floor(uTime * 40.0) * 12.9898 + vAlong * 3.0) * 43758.5453));
  float ends = smoothstep(0.0, 0.06, vAlong) * smoothstep(1.0, 0.94, vAlong);
  float a = core * ends * uLife * (0.6 + 0.4 * flicker);
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.85, 0.88), core * core * 0.6) * a * 3.0, 1.0);
}`;

/** Instanced timeline bars standing out of their panel: lit from the top, brighter when hovered. */
export const BAR_VERTEX = /* glsl */ `
attribute float aHot;
varying float vY;
varying float vHot;
varying vec3 vNormal;
void main() {
  vY = position.y;
  vHot = aHot;
  vNormal = normal;
  vec4 p = vec4(position, 1.0);
  #ifdef USE_INSTANCING
  p = instanceMatrix * p;
  #endif
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

export const BAR_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vY;
varying float vHot;
varying vec3 vNormal;
void main() {
  float top = step(0.5, vNormal.y);
  float front = step(0.5, vNormal.z);
  vec3 c = uColor * (0.12 + vY * 0.9) * (front * 0.9 + 0.35);
  c += uColor * top * 2.4;
  c += vec3(1.0, 0.8, 0.85) * vHot * (0.35 + top);
  gl_FragColor = vec4(c * uLevel, 1.0);
}`;

/** The reflective floor: a rippled reflection (when available), pools of crimson light and a faint sigil. */
export const FLOOR_VERTEX = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vProj;
varying vec3 vWorld;
void main() {
  vProj = textureMatrix * vec4(position, 1.0);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const FLOOR_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform sampler2D tDiffuse;
uniform sampler2D uSigil;
uniform float uTime;
uniform float uLevel;
uniform float uCharge;
uniform vec3 uRed;
uniform vec4 uPools[4];
varying vec4 vProj;
varying vec3 vWorld;
void main() {
  vec2 w = vWorld.xz;
  float dist = length(w);
  vec3 c = vec3(0.006, 0.002, 0.003);
  #ifdef REFLECT
  vec4 q = vProj;
  q.xy += vec2(sin(w.y * 2.3 + uTime * 0.4), cos(w.x * 1.9 - uTime * 0.3)) * 0.035 * q.w;
  c += texture2DProj(tDiffuse, q).rgb * color;
  #endif
  float pool = exp(-dist * dist / 30.0) * (0.35 + uCharge * 0.8);
  for (int i = 0; i < 4; i++) {
    vec2 o = w - uPools[i].xy;
    pool += exp(-dot(o, o) / uPools[i].z) * uPools[i].w;
  }
  c += uRed * pool * 0.22;
  vec2 s = w / 20.0 + 0.5;
  float sig = texture2D(uSigil, s).r * step(0.0, s.x) * step(s.x, 1.0) * step(0.0, s.y) * step(s.y, 1.0);
  c += uRed * sig * (0.10 + 0.05 * sin(uTime * 0.8) + uCharge * 0.3);
  float grid = smoothstep(0.03, 0.0, abs(fract(w.x / 2.0) - 0.5) - 0.47) + smoothstep(0.03, 0.0, abs(fract(w.y / 2.0) - 0.5) - 0.47);
  c += uRed * grid * 0.015;
  c *= exp(-dist * 0.045) * uLevel;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Shockwave ring around the core. */
export const WAVE_FRAGMENT = /* glsl */ `
uniform float uLife;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = exp(-pow((r - 0.92) * 22.0, 2.0)) + exp(-pow((r - 0.8) * 9.0, 2.0)) * 0.35;
  gl_FragColor = vec4(uColor * ring * uLife * 3.0, 1.0);
}`;

/**
 * The finish pass (after OutputPass, sRGB): heat/scanline distortion, glitch, a shockwave lens, chromatic
 * aberration, radial god rays toward the core, a flash, vignette and film grain.
 */
export const FINISH_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: [1, 1] },
    uTime: { value: 0 },
    uAberration: { value: 0.0018 },
    uGrain: { value: 0.035 },
    uVignette: { value: 0.55 },
    uDistort: { value: 0 },
    uGlitch: { value: 0 },
    uFlash: { value: 0 },
    uLight: { value: [0.5, 0.5] },
    uRays: { value: 0.6 },
    uShock: { value: [0.5, 0.5, 0] },
    uShockStrength: { value: 0 },
  },
  vertexShader: UV_VERTEX,
  fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uAberration;
uniform float uGrain;
uniform float uVignette;
uniform float uDistort;
uniform float uGlitch;
uniform float uFlash;
uniform vec2 uLight;
uniform float uRays;
uniform vec3 uShock;
uniform float uShockStrength;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  if (uDistort > 0.0) {
    uv.x += sin(uv.y * 90.0 + uTime * 14.0) * 0.0022 * uDistort;
    uv.y += sin(uv.x * 37.0 - uTime * 9.0) * 0.0014 * uDistort;
  }
  if (uGlitch > 0.0) {
    float row = floor(uv.y * 28.0);
    float n = hash(vec2(row, floor(uTime * 24.0)));
    uv.x += (n - 0.5) * 0.09 * uGlitch * step(0.62, n);
  }
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 dv = (uv - uShock.xy) * aspect;
  float dist = length(dv);
  float ring = exp(-pow((dist - uShock.z) * 16.0, 2.0)) * uShockStrength;
  uv -= dv / max(dist, 1e-4) / aspect * ring * 0.035;
  vec2 dir = uv - 0.5;
  float ca = uAberration * (0.35 + dot(dir, dir) * 2.4) + uGlitch * 0.008 + ring * 0.012;
  vec3 col = vec3(
    texture2D(tDiffuse, uv + dir * ca).r,
    texture2D(tDiffuse, uv).g,
    texture2D(tDiffuse, uv - dir * ca).b
  );
  #if RAYS > 0
  vec2 delta = (uLight - uv) / float(RAYS) * 0.8;
  vec2 s = uv + delta * hash(uv * uResolution + fract(uTime));
  float decay = 1.0;
  vec3 rays = vec3(0.0);
  for (int i = 0; i < RAYS; i++) {
    s += delta;
    rays += max(texture2D(tDiffuse, s).rgb - 0.3, 0.0) * decay;
    decay *= 0.93;
  }
  col += rays / float(RAYS) * uRays * vec3(1.0, 0.32, 0.38);
  #endif
  col += uFlash * vec3(1.0, 0.72, 0.76);
  float v = smoothstep(0.9, 0.25, length((vUv - 0.5) * vec2(1.05, 1.0)));
  col *= mix(1.0 - uVignette, 1.0, v);
  col *= 1.0 - (uDistort * 0.1 + uGlitch * 0.2) * step(0.5, fract(gl_FragCoord.y * 0.5));
  col += (hash(vUv * uResolution + fract(uTime * 7.0) * 91.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`,
};
