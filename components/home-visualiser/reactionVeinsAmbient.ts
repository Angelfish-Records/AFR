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
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

const float PI = 3.14159265359;

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

  float radius = mix(0.18, 0.34, hash(grid + 8.3));
  float body = smoothstep(radius, radius * 0.25, length(cell - offset));
  float keep = smoothstep(0.34, 0.82, rnd);

  return body * keep;
}

float travellingWave(vec2 p, float t) {
  float surface = p.y * 0.85 + fbm(p * 0.55) * 0.55 + sin(p.x * 2.2) * 0.14;

  // Environmental light migration is autonomous. Audio may change how living
  // material fluoresces as a wave passes, but it must never displace the wave
  // itself. Keeping the original zero-energy rates preserves the ambient mood.
  float phase = fract(surface - t * 0.16);
  float waveA = smoothstep(0.060, 0.0, abs(phase - 0.52));

  float phaseB = fract(surface * 1.7 + 0.28 - t * 0.10);
  float waveB = smoothstep(0.035, 0.0, abs(phaseB - 0.50));

  return waveA + waveB * 0.55;
}

void main() {
  float time = max(uTime, 0.0);
  float t = time * 0.10;

  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  // BLOOM is material development, never camera movement or topology change.
  // Around 10% the reef should still match the mysterious nocturnal opening.
  // By the end, the same wall is more inhabited and fluorescent rather than
  // farther away, more skeletal, or spatially distorted.
  float bloomProgress = smoothstep(0.12, 0.96, trackProgress);
  float bloomLate = smoothstep(0.48, 0.94, trackProgress);

  float e = smoothstep(0.02, 0.98, clamp(uEnergy, 0.0, 1.0));
  float rms = smoothstep(0.02, 0.92, clamp(uRms, 0.0, 1.0));
  float bass = smoothstep(0.03, 0.94, clamp(uBass, 0.0, 1.0));
  float mid = smoothstep(0.03, 0.94, clamp(uMid, 0.0, 1.0));
  float treble = smoothstep(0.04, 0.94, clamp(uTreble, 0.0, 1.0));
  float spectralCentroid = clamp(uCentroid, 0.0, 1.0);

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  // Stable deep layer.
  vec2 deepP = p * 1.8;
  float deepBranches = smoothstep(
    0.72,
    1.10,
    ridged(vec2(deepP.x * 1.15, deepP.y * 1.6 + fbm(deepP * 0.7)))
  );
  float deepMask = smoothstep(1.25, 0.20, length(p));
  vec3 col = vec3(0.006, 0.012, 0.020);
  col += vec3(0.018, 0.070, 0.088) * deepBranches * deepMask;

  // ------------------------------------------------------------------
  // FRAMING / TOPOLOGY LOCK
  // ------------------------------------------------------------------
  // The reef is fixed in world space. Track progress and audio must not zoom,
  // radialize, rescale, re-seed, or otherwise move the wall. Autonomous scene
  // time belongs to water, migrating illumination and microorganisms instead.
  vec2 reef = p;

  // Preserve the opening-frame organic irregularity, but freeze the domain
  // deformation at its original t=0 form so the actual coral does not wobble.
  float surfaceWarp = fbm(reef * 0.78);
  reef += vec2(
    fbm(reef * 1.2 + vec2(3.1, 0.0)),
    fbm(reef * 1.2 + vec2(-2.4, 0.0))
  ) * 0.035;

  float skeletonNoise = ridged(vec2(
    reef.x * 1.75 + surfaceWarp * 0.55,
    reef.y * 2.15
  ));

  // Fixed spatial frequency: changing this over the track previously made the
  // wall visibly stretch and multiply like a zooming procedural grid.
  float verticalRibs = 1.0 - smoothstep(
    0.055,
    0.22,
    abs(fract(reef.x * 5.5 + fbm(reef * 0.65) * 0.55) - 0.5)
  );

  float branchLace = smoothstep(
    0.68,
    1.08,
    skeletonNoise + verticalRibs * 0.34
  );
  branchLace *= smoothstep(1.65, 0.16, length(p));

  float softTissue = smoothstep(
    0.36,
    0.92,
    fbm(reef * 2.2 + skeletonNoise)
  );
  float coralSurface = smoothstep(
    0.14,
    0.72,
    branchLace * 0.78 + softTissue * 0.46
  );

  // Stable polyp topology. The previous continuously increasing density moved
  // every cell boundary across the image, which read as zoom/field warping.
  const float POLYP_DENSITY = 12.0;
  vec2 polypUvA = reef + vec2(surfaceWarp * 0.22, 0.0);
  vec2 polypUvB = reef * 1.42 + vec2(8.1, -3.4);
  float polypsA = cellularPolyp(polypUvA, POLYP_DENSITY);
  float polypsB = cellularPolyp(polypUvB, POLYP_DENSITY * 0.72) * 0.62;
  float polyps = max(polypsA, polypsB);
  polyps *= smoothstep(1.45, 0.10, length(p));

  // Keep the dreamy ambient polyp field intact. A separate attached mask gives
  // the reef biological specificity without deleting the mysterious free light.
  float attachedPolyps = polyps * (0.18 + 0.82 * coralSurface);

  vec2 polypGridA = floor(polypUvA * POLYP_DENSITY);
  vec2 polypGridB = floor(polypUvB * (POLYP_DENSITY * 0.72));
  float polypSeedA = hash(polypGridA + vec2(61.7, 19.3));
  float polypSeedB = hash(polypGridB + vec2(61.7, 19.3));
  float polypFeatureSeed = polypsA >= polypsB ? polypSeedA : polypSeedB;

  float polypCup = max(
    0.0,
    smoothstep(0.08, 0.34, polyps) - smoothstep(0.50, 0.88, polyps)
  ) * attachedPolyps;

  float wave = travellingWave(reef, t);
  float subsurface = smoothstep(
    0.42,
    0.96,
    fbm(reef * 1.1 + vec2(-t * 0.06, t * 0.04))
  );

  // Audio changes local fluorescence only; it cannot move the wave or world.
  float glowPulse = wave * (0.30 + 0.18 * rms + 0.26 * mid);

  vec3 bone = vec3(0.24, 0.22, 0.18);
  vec3 shadowTeal = vec3(0.02, 0.16, 0.18);
  vec3 reefGreen = vec3(0.07, 0.52, 0.42);
  vec3 cyanGlow = vec3(0.22, 0.92, 0.88);
  vec3 blueGlow = vec3(0.12, 0.42, 0.98);
  vec3 coralPink = vec3(0.95, 0.30, 0.48);
  vec3 pearl = vec3(0.82, 0.98, 0.88);

  // Feature fluorescence: stable inhabitants carry stable pigment identities.
  // Music reveals those pigments transiently; it never creates new geometry.
  vec3 vermilion = vec3(1.00, 0.16, 0.08);
  vec3 hotMagenta = vec3(1.00, 0.08, 0.58);
  vec3 reefViolet = vec3(0.58, 0.24, 1.00);
  vec3 electricBlue = vec3(0.08, 0.52, 1.00);
  vec3 acidTeal = vec3(0.12, 1.00, 0.74);
  vec3 warmGold = vec3(1.00, 0.72, 0.20);

  // Pigment identity is fixed to the reef surface rather than drifting through
  // it with time. Water/light move; the organisms keep their colours.
  float colourField = fbm(reef * 0.9);
  vec3 livingColour = mix(
    reefGreen,
    cyanGlow,
    smoothstep(0.22, 0.72, colourField)
  );
  livingColour = mix(
    livingColour,
    coralPink,
    smoothstep(0.72, 1.04, colourField + polyps * 0.18)
  );

  vec3 warmFeature = mix(
    vermilion,
    hotMagenta,
    smoothstep(0.16, 0.78, polypFeatureSeed)
  );
  vec3 coolFeature = mix(
    reefViolet,
    electricBlue,
    smoothstep(0.18, 0.72, polypFeatureSeed)
  );
  coolFeature = mix(
    coolFeature,
    acidTeal,
    smoothstep(0.76, 0.98, polypFeatureSeed)
  );

  float pigmentTemperature = clamp(
    0.16
      + 0.72 * spectralCentroid
      + 0.12 * hash(polypGridA + 7.4),
    0.0,
    1.0
  );
  vec3 featureColour = mix(
    warmFeature,
    coolFeature,
    pigmentTemperature
  );
  float goldPick = smoothstep(
    0.958,
    0.994,
    polypFeatureSeed
  );
  featureColour = mix(
    featureColour,
    warmGold,
    goldPick * 0.78
  );

  // The previous thresholds were technically colourful but visually timid.
  // Compress the musical features so ordinary mid/treble activity can reveal
  // saturated pigment, while keeping the effect confined to stable organisms.
  float featureSelection = smoothstep(
    0.72,
    0.90,
    polypFeatureSeed
  );
  float midFlare = pow(
    max(mid, 0.0),
    0.58
  );
  float trebleFlare = pow(
    max(treble, 0.0),
    0.54
  );
  float fluorescenceAccess = mix(
    0.56,
    1.0,
    bloomProgress
  );
  float featureExcitation = clamp(
    0.08 * rms
      + 0.74 * midFlare
      + 0.72 * trebleFlare
      + 0.10 * e,
    0.0,
    1.35
  );
  float featureReveal = clamp(
    featureSelection
      * featureExcitation
      * fluorescenceAccess
      * 1.45,
    0.0,
    1.0
  );

  // BLOOM makes the same reef more alive, not more exposed. Hard skeletal
  // contrast recedes slightly while tissue and attached organisms gain body.
  col += shadowTeal
    * softTissue
    * (
      0.18
      + 0.035 * rms
      + 0.055 * bloomProgress
    );

  col += bone
    * branchLace
    * (
      0.22
      - 0.035 * bloomLate
    );

  vec3 polypBodyColour = mix(
    livingColour,
    featureColour,
    featureReveal * 0.92
  );
  vec3 polypGlowColour = mix(
    cyanGlow,
    featureColour,
    featureReveal
  );

  col += polypBodyColour
    * polyps
    * (
      0.32
      + 0.12 * bloomProgress
    );

  // A subtle encrusting tissue bloom makes late chapters lusher instead of
  // revealing more bone.
  col += mix(
    shadowTeal,
    reefGreen,
    0.62
  )
    * coralSurface
    * softTissue
    * bloomProgress
    * 0.085;

  col += bone
    * polypCup
    * (
      0.018
      + 0.018 * bloomProgress
    );

  col += polypGlowColour
    * polyps
    * glowPulse
    * (
      0.66
      + 0.10 * bloomProgress
    );

  // Broad illumination keeps moving at the original calm autonomous rate.
  col += blueGlow
    * subsurface
    * wave
    * (
      0.10
      + 0.12 * bass
      + 0.04 * rms
    );

  col += pearl
    * branchLace
    * wave
    * (
      0.055
      + 0.045 * treble
    );

  // Strong local fluorescence: this is deliberately capable of becoming
  // unmistakably vermilion, magenta, violet or blue for a moment. The mask is
  // attached to reef life, so the surrounding ocean remains dark and calm.
  float attachedFeature = attachedPolyps
    * featureSelection;

  col += featureColour
    * attachedFeature
    * featureExcitation
    * fluorescenceAccess
    * 1.18;

  col += featureColour
    * polypCup
    * featureSelection
    * (
      0.34 * midFlare
      + 0.52 * trebleFlare
    )
    * fluorescenceAccess;

  // Sparse coloured tissue flashes extend beyond circular polyp bodies without
  // turning the wall into a rainbow wash.
  float tissueFeatureSeed = noise(
    reef * 6.3
      + vec2(23.7, -11.4)
  );
  float tissueFeature = coralSurface
    * smoothstep(
      0.84,
      0.965,
      tissueFeatureSeed
    )
    * featureExcitation;
  vec3 tissueFeatureColour = mix(
    hotMagenta,
    reefViolet,
    spectralCentroid
  );
  col += tissueFeatureColour
    * tissueFeature
    * fluorescenceAccess
    * (
      0.12
      + 0.16 * bloomLate
    );

  // Rare branch-tip scintillation remains spatially fixed.
  float branchFeatureSeed = noise(
    reef * 7.5
      + vec2(41.2, -13.8)
  );
  float branchFeature = branchLace
    * smoothstep(
      0.88,
      0.975,
      branchFeatureSeed
    )
    * trebleFlare;
  vec3 branchFeatureColour = mix(
    hotMagenta,
    electricBlue,
    spectralCentroid
  );
  branchFeatureColour = mix(
    branchFeatureColour,
    warmGold,
    smoothstep(
      0.972,
      0.995,
      branchFeatureSeed
    ) * 0.72
  );
  col += branchFeatureColour
    * branchFeature
    * fluorescenceAccess
    * (
      0.10
      + 0.14 * e
    );

  // ------------------------------------------------------------------
  // FLOATING PARTICULATE / FOCAL DEPTH
  // ------------------------------------------------------------------
  // Restore the murky-water feeling by layering stable particulate at several
  // apparent focal depths. These layers drift autonomously through the water
  // column rather than warping the reef itself.
  //
  // Layer 1: reef-adjacent microorganisms (existing living bodies).
  const float microbeDensity = 58.0;
  vec2 microbeUv = (reef + 1.2) * microbeDensity;
  vec2 microbeId = floor(microbeUv);
  vec2 microbeCell = fract(microbeUv) - 0.5;

  float microbeSeed = hash(microbeId);

  vec2 microbeOffset = vec2(
    hash(microbeId + 17.2),
    hash(microbeId + 43.7)
  ) - 0.5;

  microbeOffset *= 0.44;

  float driftPhase =
    t * (0.34 + 0.38 * hash(microbeId + 29.1))
    + microbeSeed * PI * 2.0;

  microbeOffset += vec2(
    sin(driftPhase),
    cos(driftPhase * 0.83)
  ) * 0.052;

  vec2 microbeDelta = microbeCell - microbeOffset;

  float microbeAngle = hash(microbeId + 71.3) * PI * 2.0;
  float microbeSin = sin(microbeAngle);
  float microbeCos = cos(microbeAngle);

  vec2 microbeLocal = vec2(
    microbeCos * microbeDelta.x + microbeSin * microbeDelta.y,
    -microbeSin * microbeDelta.x + microbeCos * microbeDelta.y
  );

  float microbeAspect = mix(
    1.15,
    2.15,
    hash(microbeId + 91.6)
  );

  microbeLocal.x *= microbeAspect;

  float microbeTheta = atan(microbeLocal.y, microbeLocal.x);
  float edgeWobble = 1.0 + 0.11 * sin(
    microbeTheta * 3.0
      + driftPhase
      + hash(microbeId + 12.8) * PI * 2.0
  );

  float microbeDistance = length(microbeLocal) / edgeWobble;
  float microbeRadius = mix(
    0.095,
    0.190,
    hash(microbeId + 8.3)
  );

  float microbeBody = 1.0 - smoothstep(
    microbeRadius * 0.38,
    microbeRadius,
    microbeDistance
  );

  float microbeHalo = 1.0 - smoothstep(
    microbeRadius,
    microbeRadius * 2.45,
    microbeDistance
  );

  float microbeKeep = smoothstep(
    0.970,
    0.995,
    microbeSeed
  );

  float microbeDepthMask = smoothstep(
    1.4,
    0.18,
    length(p)
  );

  float microorganisms =
    microbeKeep
    * microbeDepthMask
    * (microbeBody + microbeHalo * 0.28);

  vec3 microorganismColour = mix(
    vec3(0.18, 0.66, 0.58),
    vec3(0.34, 0.98, 0.88),
    microbeBody
  );

  col += microorganismColour
    * microorganisms
    * (
      0.08
      + 0.26 * wave
      + 0.07 * treble
      + 0.04 * e
      + 0.025 * bloomProgress
    );

  float microbeAccentSeed = hash(
    microbeId
      + vec2(107.3, 53.1)
  );
  float microbeAccentPick = smoothstep(
    0.70,
    0.92,
    microbeAccentSeed
  );
  vec3 microbeAccentColour = mix(
    reefViolet,
    hotMagenta,
    hash(microbeId + vec2(31.4, 79.2))
  );
  col += microbeAccentColour
    * microorganisms
    * microbeAccentPick
    * trebleFlare
    * fluorescenceAccess
    * (
      0.16
      + 0.14 * bloomLate
    );

  // Layer 2: fine suspended silt farther from the lens.
  //
  // Motion contract: the lattice itself rides a persistent current, so new
  // particles continuously enter the frame. Individual particles only wobble
  // within a bounded radius around that current; they can never drift out of
  // the sampled neighborhood and make the layer disappear.
  const float siltDensity = 110.0;
  vec2 siltCurrent = vec2(0.032, -0.108);
  vec2 siltBaseUv =
    (p + vec2(1.37, -0.91) + siltCurrent * t)
    * siltDensity;
  vec2 siltBaseId = floor(siltBaseUv);
  vec2 siltBaseCell = fract(siltBaseUv) - 0.5;
  float suspendedSilt = 0.0;
  vec3 siltColour = vec3(0.0);

  for (int sy = -1; sy <= 1; sy += 1) {
    for (int sx = -1; sx <= 1; sx += 1) {
      vec2 siltNeighbor = vec2(
        float(sx),
        float(sy)
      );
      vec2 siltId =
        siltBaseId
        + siltNeighbor;
      vec2 siltCell =
        siltBaseCell
        - siltNeighbor;

      float siltSeed = hash(
        siltId
          + vec2(11.7, 83.4)
      );
      float siltRate =
        0.18
        + 0.18 * hash(
          siltId
            + vec2(19.6, 27.4)
        );
      float siltPhase =
        t * siltRate
        + siltSeed * PI * 2.0;

      vec2 siltOffset = (
        vec2(
          hash(
            siltId
              + vec2(7.2, 41.8)
          ),
          hash(
            siltId
              + vec2(63.5, 5.1)
          )
        )
        - 0.5
      ) * 0.34;

      float siltJitterAngle =
        hash(
          siltId
            + vec2(73.1, 28.4)
        ) * PI * 2.0;
      vec2 siltJitterDir = vec2(
        cos(siltJitterAngle),
        sin(siltJitterAngle)
      );
      vec2 siltJitterPerp = vec2(
        -siltJitterDir.y,
        siltJitterDir.x
      );

      siltOffset += siltJitterDir
        * sin(
          siltPhase
            + hash(
              siltId
                + vec2(32.1, 14.9)
            ) * PI * 2.0
        )
        * 0.036;

      siltOffset += siltJitterPerp
        * cos(
          siltPhase * 0.63
            + hash(
              siltId
                + vec2(81.6, 54.2)
            ) * PI * 2.0
        )
        * 0.026;

      siltOffset += vec2(
        sin(siltPhase * 0.81),
        cos(siltPhase * 0.67)
      ) * 0.022;

      vec2 siltDelta =
        siltCell
        - siltOffset;

      float siltSize = mix(
        0.032,
        0.068,
        hash(
          siltId
            + vec2(51.4, 9.7)
        )
      );

      float siltBody =
        1.0
        - smoothstep(
          siltSize * 0.20,
          siltSize,
          length(siltDelta)
        );

      float siltHalo =
        1.0
        - smoothstep(
          siltSize,
          siltSize * 1.9,
          length(siltDelta)
        );

      float siltKeep = smoothstep(
        0.84,
        0.975,
        siltSeed
      );

      float siltDepthMask = smoothstep(
        1.55,
        0.06,
        length(p)
      );

      float siltContribution =
        siltKeep
        * siltDepthMask
        * (
          siltBody
          + siltHalo * 0.28
        );

      vec3 siltParticleColour = mix(
        vec3(0.11, 0.26, 0.30),
        vec3(0.24, 0.78, 0.72),
        hash(
          siltId
            + vec2(91.1, 12.4)
        )
      );

      suspendedSilt +=
        siltContribution;

      siltColour +=
        siltParticleColour
        * siltContribution;
    }
  }

  siltColour /=
    max(
      suspendedSilt,
      1e-4
    );

  suspendedSilt = clamp(
    suspendedSilt,
    0.0,
    1.35
  );

  col += siltColour
    * suspendedSilt
    * (
      0.110
      + 0.050 * wave
      + 0.032 * treble
      + 0.034 * bloomProgress
    );

  // Layer 3: mid-distance motes ride a counter-current. Its horizontal
  // direction is intentionally opposite the fine silt, so the frame contains
  // visible crossing paths rather than one conveyor-belt direction.
  const float moteDensity = 46.0;
  vec2 moteCurrent = vec2(-0.104, -0.020);
  vec2 moteBaseUv =
    (
      p * 0.78
      + vec2(-0.84, 1.22)
      + moteCurrent * t
    )
    * moteDensity;
  vec2 moteBaseId = floor(moteBaseUv);
  vec2 moteBaseCell =
    fract(moteBaseUv)
    - 0.5;
  float midMotes = 0.0;
  vec3 moteColour = vec3(0.0);

  for (int my = -1; my <= 1; my += 1) {
    for (int mx = -1; mx <= 1; mx += 1) {
      vec2 moteNeighbor = vec2(
        float(mx),
        float(my)
      );
      vec2 moteId =
        moteBaseId
        + moteNeighbor;
      vec2 moteCell =
        moteBaseCell
        - moteNeighbor;

      float moteSeed = hash(
        moteId
          + vec2(14.2, 67.3)
      );

      float motePhase =
        t
          * (
            0.11
            + 0.18 * hash(
              moteId
                + vec2(48.6, 27.1)
            )
          )
        + moteSeed * PI * 2.0;

      vec2 moteOffset = (
        vec2(
          hash(
            moteId
              + vec2(75.1, 8.2)
          ),
          hash(
            moteId
              + vec2(32.4, 91.6)
          )
        )
        - 0.5
      ) * 0.32;

      float moteJitterAngle =
        hash(
          moteId
            + vec2(44.8, 58.9)
        ) * PI * 2.0;
      vec2 moteJitterDir = vec2(
        cos(moteJitterAngle),
        sin(moteJitterAngle)
      );
      vec2 moteJitterPerp = vec2(
        -moteJitterDir.y,
        moteJitterDir.x
      );

      moteOffset += moteJitterDir
        * sin(
          motePhase * 0.83
            + hash(
              moteId
                + vec2(25.7, 12.8)
            ) * PI * 2.0
        )
        * 0.050;

      moteOffset += moteJitterPerp
        * cos(
          motePhase * 0.59
            + hash(
              moteId
                + vec2(66.4, 21.3)
            ) * PI * 2.0
        )
        * 0.038;

      moteOffset += vec2(
        sin(motePhase * 0.91),
        cos(motePhase * 0.69)
      ) * 0.032;

      vec2 moteDelta =
        moteCell
        - moteOffset;

      vec2 moteStretch = vec2(
        1.0,
        mix(
          0.76,
          1.35,
          hash(
            moteId
              + vec2(2.5, 7.8)
          )
        )
      );

      float moteDistance =
        length(
          moteDelta
            * moteStretch
        );

      float moteSize = mix(
        0.085,
        0.175,
        hash(
          moteId
            + vec2(84.8, 16.3)
        )
      );

      float moteBody =
        1.0
        - smoothstep(
          moteSize * 0.18,
          moteSize,
          moteDistance
        );

      float moteHalo =
        1.0
        - smoothstep(
          moteSize,
          moteSize * 2.8,
          moteDistance
        );

      float moteKeep = smoothstep(
        0.88,
        0.982,
        moteSeed
      );

      float moteDepthMask = smoothstep(
        1.60,
        0.04,
        length(p)
      );

      float moteContribution =
        moteKeep
        * moteDepthMask
        * (
          moteBody * 0.62
          + moteHalo * 0.95
        );

      vec3 moteParticleColour = mix(
        vec3(0.14, 0.46, 0.42),
        vec3(0.30, 0.90, 0.82),
        hash(
          moteId
            + vec2(52.6, 31.4)
        )
      );

      moteParticleColour = mix(
        moteParticleColour,
        mix(
          reefViolet,
          hotMagenta,
          hash(
            moteId
              + vec2(9.2, 73.5)
          )
        ),
        smoothstep(
          0.955,
          0.992,
          moteSeed
        )
          * 0.32
          * trebleFlare
      );

      midMotes +=
        moteContribution;

      moteColour +=
        moteParticleColour
        * moteContribution;
    }
  }

  moteColour /=
    max(
      midMotes,
      1e-4
    );

  midMotes = clamp(
    midMotes,
    0.0,
    1.25
  );

  col += moteColour
    * midMotes
    * (
      0.145
      + 0.032 * wave
      + 0.032 * rms
      + 0.050 * bloomLate
    );

  // Layer 4: near-lens bokeh rides the fastest current and crosses the scene at
  // a third angle. Neighbor-cell sampling remains in place, which is what
  // removed the square/tile clipping artifacts.
  const float nearDensity = 22.0;
  vec2 nearCurrent = vec2(0.018, -0.094);
  vec2 nearBaseUv =
    (
      p * 0.52
      + vec2(0.43, -0.28)
      + nearCurrent * t
    )
    * nearDensity;
  vec2 nearBaseId =
    floor(nearBaseUv);
  vec2 nearBaseCell =
    fract(nearBaseUv)
    - 0.5;
  float nearBokeh = 0.0;
  vec3 nearColour = vec3(0.0);

  for (int ny = -1; ny <= 1; ny += 1) {
    for (int nx = -1; nx <= 1; nx += 1) {
      vec2 nearNeighbor = vec2(
        float(nx),
        float(ny)
      );
      vec2 nearId =
        nearBaseId
        + nearNeighbor;
      vec2 nearCell =
        nearBaseCell
        - nearNeighbor;

      float nearSeed = hash(
        nearId
          + vec2(61.4, 5.7)
      );

      float nearPhase =
        t
          * (
            0.07
            + 0.09 * hash(
              nearId
                + vec2(7.5, 43.9)
            )
          )
        + nearSeed * PI * 2.0;

      vec2 nearOffset = (
        vec2(
          hash(
            nearId
              + vec2(18.2, 95.4)
          ),
          hash(
            nearId
              + vec2(74.8, 24.7)
          )
        )
        - 0.5
      ) * 0.28;

      float nearJitterAngle =
        hash(
          nearId
            + vec2(58.2, 13.6)
        ) * PI * 2.0;
      vec2 nearJitterDir = vec2(
        cos(nearJitterAngle),
        sin(nearJitterAngle)
      );
      vec2 nearJitterPerp = vec2(
        -nearJitterDir.y,
        nearJitterDir.x
      );

      nearOffset += nearJitterDir
        * sin(
          nearPhase * 0.72
            + hash(
              nearId
                + vec2(92.8, 35.4)
            ) * PI * 2.0
        )
        * 0.060;

      nearOffset += nearJitterPerp
        * cos(
          nearPhase * 0.57
            + hash(
              nearId
                + vec2(14.6, 77.1)
            ) * PI * 2.0
        )
        * 0.046;

      nearOffset += vec2(
        sin(nearPhase * 0.78),
        cos(nearPhase * 0.61)
      ) * 0.032;

      vec2 nearDelta =
        nearCell
        - nearOffset;

      float nearDistance =
        length(
          nearDelta
            * vec2(
              mix(
                0.75,
                1.45,
                hash(
                  nearId
                    + vec2(12.9, 88.3)
                )
              ),
              1.0
            )
        );

      float nearSize = mix(
        0.14,
        0.32,
        hash(
          nearId
            + vec2(39.5, 72.1)
        )
      );

      float nearBody =
        1.0
        - smoothstep(
          nearSize * 0.10,
          nearSize,
          nearDistance
        );

      float nearHalo =
        1.0
        - smoothstep(
          nearSize,
          nearSize * 3.4,
          nearDistance
        );

      float nearKeep = smoothstep(
        0.93,
        0.986,
        nearSeed
      );

      float nearDepthMask = smoothstep(
        1.85,
        0.02,
        length(p)
      );

      float nearContribution =
        nearKeep
        * nearDepthMask
        * (
          nearBody * 0.30
          + nearHalo * 0.92
        );

      vec3 nearParticleColour = mix(
        vec3(0.12, 0.42, 0.40),
        vec3(0.32, 0.90, 0.84),
        hash(
          nearId
            + vec2(27.4, 56.2)
        )
      );

      nearParticleColour = mix(
        nearParticleColour,
        featureColour,
        smoothstep(
          0.975,
          0.994,
          nearSeed
        ) * 0.46
      );

      nearBokeh +=
        nearContribution;

      nearColour +=
        nearParticleColour
        * nearContribution;
    }
  }

  nearColour /=
    max(
      nearBokeh,
      1e-4
    );

  nearBokeh = clamp(
    nearBokeh,
    0.0,
    1.20
  );

  col += nearColour
    * nearBokeh
    * (
      0.165
      + 0.050 * wave
      + 0.040 * bloomLate
    );

  // Late-track richness is soft tissue and bioluminescent life, not exposed
  // skeleton. This remains a modest addition so the dark-water mood survives.
  float foregroundBloom = smoothstep(
    0.72,
    1.0,
    softTissue + polyps * 0.34
  );
  col += livingColour
    * foregroundBloom
    * bloomProgress
    * 0.055;

  float depthShade = smoothstep(1.42, 0.16, length(p));
  col *= 0.50 + 0.80 * depthShade;

  float vig = smoothstep(1.34, 0.30, length(p));
  col *= 0.62 + 0.64 * vig;

  // Preserve the original ambient exposure. Sustained level receives only a
  // slight body lift; transients remain local to organisms and tissue.
  col *= 0.90 + 0.035 * rms;

  fragColor = vec4(col, 1.0);
}
`;

type AmbientFeatures = Readonly<{
  trackProgress: number;
  energy: number;
  rms: number;
  bass: number;
  mid: number;
  treble: number;
  centroid: number;
}>;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function positivePulse(
  time: number,
  rate: number,
  phase: number,
  exponent: number,
): number {
  return Math.pow(
    Math.max(0, Math.sin(time * rate + phase)),
    exponent,
  );
}

/**
 * Ambient substitute for the BJR audio feature stream.
 *
 * The final Coral Reef Wall shader is preserved verbatim. AFR has no audio
 * source, so the homepage supplies independent, deliberately asynchronous
 * biological envelopes instead:
 * - RMS: sustained tissue body
 * - bass: deep subsurface phosphorescence
 * - mids: warm feature fluorescence
 * - treble: sharper scintillation
 * - centroid: very slow warm/cool pigment migration
 *
 * None of these signals move the reef, light-wave position, or particulate
 * topology. They only excite the material responsibilities already owned by
 * the finished BJR theme.
 */
function getAmbientFeatures(
  time: number,
  suppliedEnergy: number,
): AmbientFeatures {
  const slowBody =
    0.5 + 0.5 * Math.sin(time * 0.091 + 0.8);
  const deepTide =
    0.5 + 0.5 * Math.sin(time * 0.047 + 2.1);

  const midBloom =
    positivePulse(time, 0.073, 1.4, 4.5);
  const midEcho =
    positivePulse(time, 0.119, 4.8, 7.0);

  const trebleSpark =
    positivePulse(time, 0.173, 2.7, 7.0);
  const trebleEcho =
    positivePulse(time, 0.257, 5.1, 10.0);

  return {
    // Keep the homepage permanently in the lush-but-mysterious region of the
    // final BLOOM arc rather than inventing a fake song-length progression.
    trackProgress: 0.72,
    energy: clamp01(suppliedEnergy),
    rms: clamp01(
      0.20
        + 0.11 * slowBody
        + 0.035 * deepTide,
    ),
    bass: clamp01(
      0.20
        + 0.18 * deepTide
        + 0.05 * slowBody,
    ),
    mid: clamp01(
      0.14
        + 0.48 * midBloom
        + 0.18 * midEcho,
    ),
    treble: clamp01(
      0.12
        + 0.50 * trebleSpark
        + 0.22 * trebleEcho,
    ),
    centroid: clamp01(
      0.50
        + 0.24 * Math.sin(time * 0.019 + 1.3)
        + 0.10 * Math.sin(time * 0.037 + 4.6),
    ),
  };
}

export function createReactionVeinsAmbientTheme(): AmbientTheme {
  let program: WebGLProgram | null = null;

  let tri: {
    vao: WebGLVertexArrayObject;
    buf: WebGLBuffer;
  } | null = null;

  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uTrackProgress: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let uRms: WebGLUniformLocation | null = null;
  let uBass: WebGLUniformLocation | null = null;
  let uMid: WebGLUniformLocation | null = null;
  let uTreble: WebGLUniformLocation | null = null;
  let uCentroid: WebGLUniformLocation | null = null;

  let startedAtSeconds: number | null = null;

  return {
    name: "coral-reef-wall-ambient",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uTrackProgress = gl.getUniformLocation(program, "uTrackProgress");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
      uRms = gl.getUniformLocation(program, "uRms");
      uBass = gl.getUniformLocation(program, "uBass");
      uMid = gl.getUniformLocation(program, "uMid");
      uTreble = gl.getUniformLocation(program, "uTreble");
      uCentroid = gl.getUniformLocation(program, "uCentroid");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      if (startedAtSeconds === null) {
        startedAtSeconds = opts.time;
      }

      const ambientTime = Math.max(
        0,
        opts.time - startedAtSeconds,
      );

      const features = getAmbientFeatures(
        ambientTime,
        opts.energy,
      );

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, ambientTime);
      gl.uniform1f(uTrackProgress, features.trackProgress);
      gl.uniform1f(uEnergy, features.energy);
      gl.uniform1f(uRms, features.rms);
      gl.uniform1f(uBass, features.bass);
      gl.uniform1f(uMid, features.mid);
      gl.uniform1f(uTreble, features.treble);
      gl.uniform1f(uCentroid, features.centroid);

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
      uTrackProgress = null;
      uEnergy = null;
      uRms = null;
      uBass = null;
      uMid = null;
      uTreble = null;
      uCentroid = null;
      startedAtSeconds = null;
    },
  };
}
