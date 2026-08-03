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
uniform float uAge;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

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
  float value = 0.0;
  float amplitude = 0.55;

  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p = mat2(1.58, -1.11, 1.11, 1.58) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged(vec2 p) {
  float value = 0.0;
  float amplitude = 0.62;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);
    value += amplitude * n;

    frequency *= 2.03;
    amplitude *= 0.55;
    p = mat2(0.82, -0.58, 0.58, 0.82) * p;
  }

  return value;
}

float cellularPolyp(vec2 p, float density) {
  vec2 grid = floor(p * density);
  vec2 cell = fract(p * density) - 0.5;

  float rnd = hash(grid);

  vec2 offset = vec2(
    hash(grid + 17.2) - 0.5,
    hash(grid + 43.7) - 0.5
  ) * 0.42;

  float radius = mix(
    0.18,
    0.34,
    hash(grid + 8.3)
  );

  float body =
    1.0 - smoothstep(
      radius * 0.25,
      radius,
      length(cell - offset)
    );

  float keep = smoothstep(
    0.34,
    0.82,
    rnd
  );

  return body * keep;
}

float travellingWave(vec2 p, float t, float e) {
  float surface =
    p.y * 0.85
    + fbm(p * 0.55) * 0.55
    + sin(p.x * 2.2) * 0.14;

  float phase = fract(
    surface - t * (0.16 + 0.54 * e)
  );

  float waveA =
    1.0 - smoothstep(
      0.0,
      0.060,
      abs(phase - 0.52)
    );

  float phaseB = fract(
    surface * 1.7
    + 0.28
    - t * (0.10 + 0.36 * e)
  );

  float waveB =
    1.0 - smoothstep(
      0.0,
      0.035,
      abs(phaseB - 0.50)
    );

  return waveA + waveB * 0.55;
}

vec3 iridescence(float phase) {
  return 0.5 + 0.5 * cos(
    phase + vec3(
      0.0,
      TAU / 3.0,
      TAU * 2.0 / 3.0
    )
  );
}

void main() {
  float time = max(uTime, 0.0);
  float age = clamp(uAge, 0.0, 720.0);
  float t = time * 0.10;

  // Autonomous ambient pulse. The deliberately mismatched periods prevent
  // the shimmer from settling into an obvious repeating rhythm.
  float shimmerBreath =
    0.5 + 0.5 * sin(time * 0.137 + 0.8);

  float shimmerDrift =
    0.5 + 0.5 * sin(time * 0.061 + 2.7);

  float shimmerTide =
    0.5 + 0.5 * sin(time * 0.023 + 4.4);

  float e = clamp(
    0.12
      + shimmerBreath * 0.10
      + shimmerDrift * 0.07
      + shimmerTide * 0.05,
    0.12,
    0.34
  );

  float ageProgress =
    1.0 - exp(-age * 0.0038);
  float approach =
    1.0 + 1.18 * ageProgress;

  vec2 p =
    (vUv - 0.5)
    * vec2(uRes.x / uRes.y, 1.0);

  float centreDistance = length(p);
  float verticalGradient = smoothstep(
    0.0,
    1.0,
    vUv.y
  );

  // Open, luminous water rather than a dark abyss.
  vec3 lowerWater = vec3(0.70, 0.94, 0.93);
  vec3 upperWater = vec3(0.97, 0.98, 0.91);

  vec3 col = mix(
    lowerWater,
    upperWater,
    verticalGradient
  );

  float atmosphericVariation = fbm(
    p * 1.25
      + vec2(t * 0.018, -t * 0.012)
  );

  col += vec3(0.05, 0.09, 0.10)
    * (atmosphericVariation - 0.5)
    * 0.24;

  // Broad shafts of warm light entering from above.
  float sunShaftField =
    sin(p.x * 3.4 - p.y * 0.85 + t * 0.18)
    + sin(p.x * 6.7 + p.y * 0.55 - t * 0.11)
      * 0.42;

  float sunShafts = smoothstep(
    0.42,
    1.32,
    sunShaftField
      + fbm(
        p * 2.4
          + vec2(t * 0.03, 0.0)
      ) * 0.72
  );

  sunShafts *= smoothstep(
    0.04,
    0.82,
    vUv.y
  );

  col += vec3(1.00, 0.91, 0.69)
    * sunShafts
    * (0.045 + 0.055 * e);

  // Stable distant reef structures, kept pale and atmospheric.
  vec2 deepP = p * 1.8;

  float deepBranches = smoothstep(
    0.72,
    1.10,
    ridged(
      vec2(
        deepP.x * 1.15,
        deepP.y * 1.6
          + fbm(deepP * 0.7)
      )
    )
  );

  float deepMask =
    1.0 - smoothstep(
      0.20,
      1.30,
      centreDistance
    );

  vec3 distantMint = vec3(0.34, 0.70, 0.67);
  vec3 distantLilac = vec3(0.58, 0.56, 0.78);

  float distantColourMix = fbm(
    deepP * 0.55 + 4.1
  );

  vec3 distantColour = mix(
    distantMint,
    distantLilac,
    distantColourMix
  );

  col += distantColour
    * deepBranches
    * deepMask
    * 0.075;

  vec2 wall = p * approach;
  wall.y += t * 0.038;

  // Slowly change the wall into a more enveloping radial reef.
  float r = length(wall);
  float angle = atan(wall.y, wall.x);

  // The raw atan() branch cut lies on the negative x-axis, which shows up
  // as a visible horizontal seam on the left side of the frame. Rotate that
  // cut into the bright upper part of the composition and locally ease off
  // the radialisation near the cut so the transition reads as continuous.
  const float RADIAL_SEAM_ROTATION = -0.5 * PI;

  float wrappedAngle = mod(
    angle + RADIAL_SEAM_ROTATION + TAU,
    TAU
  );

  vec2 radialized = vec2(
    (wrappedAngle / PI - 1.0) * 1.25,
    log(r + 1.18) * 1.55
  );

  vec2 wallDir = normalize(
    wall + vec2(0.0001, 0.0)
  );

  float seamBand = smoothstep(
    0.94,
    0.995,
    dot(wallDir, vec2(0.0, 1.0))
  );

  seamBand *= smoothstep(
    0.14,
    0.42,
    r
  );

  float radialMix =
    0.38 * ageProgress
    * (1.0 - 0.72 * seamBand);

  vec2 reef = mix(
    wall,
    radialized,
    radialMix
  );

  float surfaceWarp = fbm(
    reef * 0.78
      + vec2(t * 0.08, -t * 0.03)
  );

  reef += vec2(
    fbm(
      reef * 1.2
        + vec2(3.1, t * 0.05)
    ),
    fbm(
      reef * 1.2
        + vec2(-2.4, -t * 0.04)
    )
  ) * (0.035 + 0.035 * ageProgress);

  float skeletonNoise = ridged(
    vec2(
      reef.x * 1.75
        + surfaceWarp * 0.55,
      reef.y * 2.15
    )
  );

  float verticalRibs =
    1.0 - smoothstep(
      0.055,
      0.22,
      abs(
        fract(
          reef.x
            * (5.5 + 3.5 * ageProgress)
            + fbm(reef * 0.65) * 0.55
        ) - 0.5
      )
    );

  float branchLace = smoothstep(
    0.68,
    1.08,
    skeletonNoise
      + verticalRibs * 0.34
  );

  branchLace *=
    1.0 - smoothstep(
      0.16,
      1.62,
      centreDistance
    );

  float polypDensity =
    12.0 + 19.0 * ageProgress;

  float polypsA = cellularPolyp(
    reef
      + vec2(surfaceWarp * 0.22, 0.0),
    polypDensity
  );

  float polypsB = cellularPolyp(
    reef * 1.42
      + vec2(8.1, -3.4),
    polypDensity * 0.72
  ) * 0.62;

  float polyps = max(
    polypsA,
    polypsB
  );

  polyps *=
    1.0 - smoothstep(
      0.10,
      1.44,
      centreDistance
    );

  float wave = travellingWave(
    reef,
    t,
    e
  );

  float subsurface = smoothstep(
    0.42,
    0.96,
    fbm(
      reef * 1.1
        + vec2(-t * 0.06, t * 0.04)
    )
  );

  float glowPulse =
    wave * (0.28 + 0.92 * e);

  float softTissue = smoothstep(
    0.36,
    0.92,
    fbm(
      reef * 2.2
        + skeletonNoise
    )
  );

  vec3 warmPearl = vec3(1.00, 0.91, 0.79);
  vec3 coolPearl = vec3(0.77, 0.94, 0.98);
  vec3 seaGlass = vec3(0.28, 0.82, 0.72);
  vec3 lagoonCyan = vec3(0.27, 0.85, 0.96);
  vec3 coralPeach = vec3(1.00, 0.56, 0.48);
  vec3 petalPink = vec3(0.98, 0.61, 0.79);
  vec3 softLilac = vec3(0.67, 0.62, 0.96);
  vec3 sunlight = vec3(1.00, 0.96, 0.76);

  float colourField = fbm(
    reef * 0.9
      + vec2(t * 0.03, -t * 0.02)
  );

  vec3 livingColour = mix(
    seaGlass,
    lagoonCyan,
    smoothstep(
      0.18,
      0.66,
      colourField
    )
  );

  livingColour = mix(
    livingColour,
    coralPeach,
    smoothstep(
      0.65,
      0.94,
      colourField
        + polyps * 0.16
    )
  );

  livingColour = mix(
    livingColour,
    petalPink,
    smoothstep(
      0.74,
      1.10,
      fbm(reef * 1.35 - 7.2)
        + polyps * 0.12
    )
  );

  float iridescentPhase =
    reef.x * 5.2
    - reef.y * 3.7
    + skeletonNoise * 4.6
    + surfaceWarp * 5.0
    + t * 0.38;

  vec3 prism = iridescence(
    iridescentPhase
  );

  vec3 pearlPrism = mix(
    vec3(0.82, 0.90, 0.94),
    prism,
    0.38
  );

  float iridescentSheen =
    branchLace
    * smoothstep(
      0.20,
      0.88,
      0.5
        + 0.5 * sin(iridescentPhase)
    );

  float tissueVeil =
    softTissue
    * (
      1.0 - smoothstep(
        0.18,
        1.52,
        centreDistance
      )
    );

  col = mix(
    col,
    col * vec3(0.92, 1.02, 1.03),
    tissueVeil * 0.14
  );

  col += coolPearl
    * branchLace
    * (0.11 + 0.12 * ageProgress);

  col += warmPearl
    * branchLace
    * (0.11 + 0.11 * ageProgress);

  col += pearlPrism
    * iridescentSheen
    * (0.13 + 0.10 * ageProgress);

  col += livingColour
    * polyps
    * (0.22 + 0.25 * ageProgress);

  col += mix(
    lagoonCyan,
    sunlight,
    0.34
  )
    * polyps
    * glowPulse
    * 0.42;

  col += mix(
    softLilac,
    coolPearl,
    0.48
  )
    * subsurface
    * wave
    * (0.06 + 0.16 * e);

  col += sunlight
    * branchLace
    * wave
    * (0.06 + 0.13 * e);

  // Fine caustic lines crossing the reef face.
  float causticField =
    sin(
      reef.x * 12.0
        + reef.y * 5.0
        - t * 1.12
    )
    * sin(
      reef.x * 7.0
        - reef.y * 10.0
        + t * 0.76
    );

  float caustics = smoothstep(
    0.38,
    0.92,
    causticField
      + wave * 0.46
  );

  caustics *=
    branchLace * 0.72
    + polyps * 0.48;

  col += sunlight
    * caustics
    * (0.055 + 0.10 * e);

  // Sparse drifting translucent organisms.
  float microbeDensity =
    58.0 + 32.0 * ageProgress;

  vec2 microbeUv =
    (reef + 1.2) * microbeDensity;

  vec2 microbeId = floor(
    microbeUv
  );

  vec2 microbeCell =
    fract(microbeUv) - 0.5;

  float microbeSeed = hash(
    microbeId
  );

  vec2 microbeOffset = vec2(
    hash(microbeId + 17.2),
    hash(microbeId + 43.7)
  ) - 0.5;

  microbeOffset *= 0.44;

  float driftPhase =
    t
      * (
        0.34
        + 0.38
          * hash(microbeId + 29.1)
      )
    + microbeSeed * TAU;

  microbeOffset += vec2(
    sin(driftPhase),
    cos(driftPhase * 0.83)
  ) * 0.052;

  vec2 microbeDelta =
    microbeCell - microbeOffset;

  float microbeAngle =
    hash(microbeId + 71.3) * TAU;

  float microbeSin =
    sin(microbeAngle);

  float microbeCos =
    cos(microbeAngle);

  vec2 microbeLocal = vec2(
    microbeCos * microbeDelta.x
      + microbeSin * microbeDelta.y,
    -microbeSin * microbeDelta.x
      + microbeCos * microbeDelta.y
  );

  float microbeAspect = mix(
    1.15,
    2.15,
    hash(microbeId + 91.6)
  );

  microbeLocal.x *= microbeAspect;

  float microbeTheta = atan(
    microbeLocal.y,
    microbeLocal.x
  );

  float edgeWobble =
    1.0
    + 0.11
      * sin(
        microbeTheta * 3.0
          + driftPhase
          + hash(microbeId + 12.8)
            * TAU
      );

  float microbeDistance =
    length(microbeLocal)
    / edgeWobble;

  float microbeRadius = mix(
    0.095,
    0.190,
    hash(microbeId + 8.3)
  );

  float microbeBody =
    1.0 - smoothstep(
      microbeRadius * 0.38,
      microbeRadius,
      microbeDistance
    );

  float microbeHalo =
    1.0 - smoothstep(
      microbeRadius,
      microbeRadius * 2.45,
      microbeDistance
    );

  float microbeKeep = smoothstep(
    0.970,
    0.995,
    microbeSeed
  );

  float microbeDepthMask =
    1.0 - smoothstep(
      0.18,
      1.40,
      centreDistance
    );

  float microorganisms =
    microbeKeep
    * microbeDepthMask
    * (
      microbeBody
      + microbeHalo * 0.28
    );

  vec3 microorganismPrism =
    iridescence(
      microbeSeed * TAU
        + driftPhase * 0.18
    );

  vec3 microorganismColour = mix(
    vec3(0.72, 0.96, 0.92),
    mix(
      vec3(1.00, 0.76, 0.83),
      microorganismPrism,
      0.32
    ),
    microbeBody
  );

  col += microorganismColour
    * microorganisms
    * (
      0.065
      + 0.13 * wave
      + 0.10 * e
    );

  float foregroundBloom = smoothstep(
    0.72,
    1.0,
    branchLace
      + polyps * 0.42
  );

  col += mix(
    livingColour,
    warmPearl,
    0.28
  )
    * foregroundBloom
    * ageProgress
    * 0.055;

  // Edges recede into bright atmospheric haze rather than darkness.
  float centreClarity =
    1.0 - smoothstep(
      0.16,
      1.42,
      centreDistance
    );

  col *=
    0.92 + 0.10 * centreClarity;

  float edgeHaze = smoothstep(
    0.72,
    1.52,
    centreDistance
  );

  vec3 hazeColour = mix(
    vec3(0.76, 0.94, 0.94),
    vec3(0.98, 0.92, 0.82),
    verticalGradient
  );

  col = mix(
    col,
    hazeColour,
    edgeHaze * 0.18
  );

  col *= 0.98 + 0.10 * e;

  // Compress highlights without extinguishing the pastel spectrum.
  col = 1.0 - exp(-col * 1.12);
  col = pow(col, vec3(0.94));

  fragColor = vec4(col, 1.0);
}
`;

export function createReactionVeinsAmbientTheme(): AmbientTheme {
  let program: WebGLProgram | null = null;

  let tri: {
    vao: WebGLVertexArrayObject;
    buf: WebGLBuffer;
  } | null = null;

  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uAge: WebGLUniformLocation | null = null;

  let startedAtSeconds: number | null = null;

  return {
    // Preserve the public factory name and file path, but identify the
    // replacement accurately in WebGL diagnostics.
    name: "iridescent-coral-wall-ambient",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uAge = gl.getUniformLocation(program, "uAge");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      if (startedAtSeconds === null) {
        startedAtSeconds = opts.time;
      }

      const ageSeconds = Math.max(0, opts.time - startedAtSeconds);

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);

      gl.uniform1f(uTime, opts.time);

      gl.uniform1f(uAge, ageSeconds);

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
      uAge = null;
      startedAtSeconds = null;
    },
  };
}
