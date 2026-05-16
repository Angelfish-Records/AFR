import type { AmbientTheme } from "./types";
import { createProgram, makeFullscreenTriangle } from "./gl";

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;

void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.63, -1.14, 1.14, 1.63) * p;
    a *= 0.5;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.65;
  float w = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    w *= 2.05;
    a *= 0.55;
    p = mat2(0.86, -0.50, 0.50, 0.86) * p;
  }

  return v;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p * 1.1 + vec2(t * 0.2, -t * 0.17));
  float b = fbm(p * 1.1 + vec2(-t * 0.16, t * 0.22));
  vec2 g = vec2(a - 0.5, b - 0.5);
  return vec2(g.y, -g.x);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.055;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 a = p * 1.10;
  float adv = 0.14 + 0.18 * e;

  for (int i = 0; i < 5; i++) {
    vec2 f = flow(a, t);
    a += f * adv * 0.045;
    adv *= 0.86;
  }

  float U = fbm(a * 1.45 + vec2(0.0, t * 0.85));
  float V = fbm(a * 1.45 + vec2(12.3, -t * 0.82));

  float diff = abs(U - V);
  float front = smoothstep(0.09, 0.34, diff);

  float veinBase = ridged(a * 2.1 + vec2(t * 0.28, -t * 0.18));
  float veins = smoothstep(0.44 - 0.06 * e, 0.94, veinBase);
  veins *= 0.28 + 0.62 * front;

  float thickness = smoothstep(0.16, 0.58, veins) * (0.42 + 0.38 * e);

  float edge = smoothstep(0.30, 0.90, abs(veinBase - 0.5));
  edge *= 0.045 + 0.075 * e;

   // Launch-brand derived palette:
  // #bb4c5f becomes buried claret / rose-oxide tissue.
  // #f1e568 becomes restrained pollen-gold signal glints.
  vec3 deep = vec3(0.018, 0.010, 0.018);
  vec3 skin = vec3(0.120, 0.040, 0.060);
  vec3 vein = vec3(0.420, 0.145, 0.205);
  vec3 hl = vec3(0.780, 0.700, 0.360);

  float body = smoothstep(0.22, 0.98, fbm(a * 1.05 - vec2(t * 0.18, t * 0.14)));

  vec3 col = mix(deep, skin, body);
  col = mix(col, vein, thickness);
    col += hl * edge * (0.26 + 0.22 * front);

    float mott = fbm(a * 3.0 + vec2(-t * 0.42, t * 0.31));
  col *= 0.84 + 0.16 * mott;

  // Fragmented soft lightning: narrow distance-to-curve strokes, not clouds.
  vec2 boltP = p * 1.65;
  float boltT = uTime * 0.72;

  float lightning = 0.0;
  float lightningGlow = 0.0;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);

    vec2 q = boltP;
    q.x += boltT * (0.16 + fi * 0.045) + fi * 1.73;
    q.y += sin(q.x * (2.4 + fi * 0.7) + boltT * (1.1 + fi * 0.2)) * 0.13;
    q.y += sin(q.x * (6.7 + fi * 1.2) - boltT * (1.8 + fi * 0.35)) * 0.035;

    // Keep only sparse broken horizontal fragments.
    float cell = floor(q.x * 3.2);
    float gateNoise = hash(vec2(cell, fi * 17.0 + floor(boltT * 1.35)));
    float fragmentGate = step(0.72, gateNoise);

    float localX = fract(q.x * 3.2);
    float taper = smoothstep(0.04, 0.18, localX) * smoothstep(0.96, 0.68, localX);

    float dist = abs(q.y);
    float core = smoothstep(0.018, 0.0035, dist);
    float glow = smoothstep(0.090, 0.010, dist);

    float branch =
      smoothstep(0.010, 0.0025, abs(q.y - 0.105 * sin(q.x * 9.0 + boltT * 2.4)))
      * step(0.84, hash(vec2(cell + 9.0, fi * 23.0)));

    float flicker = 0.62 + 0.38 * hash(vec2(cell, floor(uTime * 9.0) + fi));

    lightning += (core + branch * 0.72) * fragmentGate * taper * flicker;
    lightningGlow += glow * fragmentGate * taper * flicker;
  }

  float lightningMask =
    smoothstep(0.28, 0.74, fbm(p * 0.85 + vec2(-boltT * 0.05, boltT * 0.035)));

  vec3 spellGold = vec3(1.00, 0.84, 0.30);
  col += spellGold * (lightning * 0.42 + lightningGlow * 0.10) * lightningMask;

  float r = length(p);
  float vig = smoothstep(1.35, 0.18, r);
  col *= 0.44 + 0.76 * vig;

    col *= 0.88 + 0.18 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createReactionVeinsAmbientTheme(): AmbientTheme {
  let program: WebGLProgram | null = null;
  let tri: { vao: WebGLVertexArrayObject; buf: WebGLBuffer } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "reaction-veins-ambient",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);
      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uEnergy, opts.energy);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose(gl) {
      if (tri) {
        gl.deleteBuffer(tri.buf);
        gl.deleteVertexArray(tri.vao);
        tri = null;
      }

      if (program) {
        gl.deleteProgram(program);
        program = null;
      }

      uRes = null;
      uTime = null;
      uEnergy = null;
    },
  };
}
