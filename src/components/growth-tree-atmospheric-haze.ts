import * as THREE from "three";
import { ISLAND_TERRAIN_CONFIG } from "./growth-tree-island-geometry";

export type AtmosphericHazeParameters = {
  density: number;
  opacity: number;
  scale: number;
  driftSpeed: number;
  morphSpeed: number;
};

export const ATMOSPHERIC_HAZE_CONFIG: AtmosphericHazeParameters = {
  density: 1,
  opacity: 1,
  scale: 2.15,
  driftSpeed: .028,
  morphSpeed: .012
};

export const HORIZON_WISP_ANGLES = {
  primary: 16,
  secondary: -12,
  tertiary: 24
} as const;

const HAZE_VERTEX_SHADER = `
  varying vec3 vHazeDirection;

  void main() {
    vHazeDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HAZE_FRAGMENT_SHADER = `
  uniform float hazeTime;
  uniform float hazeDensity;
  uniform float hazeOpacity;
  uniform float hazeScale;
  uniform float hazeDriftSpeed;
  uniform float hazeMorphSpeed;
  varying vec3 vHazeDirection;

  float hazeHash31(vec3 point) {
    return fract(sin(dot(point, vec3(127.1, 311.7, 74.7))) * 43758.5453);
  }

  float hazeNoise3(vec3 point) {
    vec3 cell = floor(point);
    vec3 local = fract(point);
    vec3 blend = local * local * (3.0 - 2.0 * local);
    float x00 = mix(hazeHash31(cell), hazeHash31(cell + vec3(1.0, 0.0, 0.0)), blend.x);
    float x10 = mix(hazeHash31(cell + vec3(0.0, 1.0, 0.0)), hazeHash31(cell + vec3(1.0, 1.0, 0.0)), blend.x);
    float x01 = mix(hazeHash31(cell + vec3(0.0, 0.0, 1.0)), hazeHash31(cell + vec3(1.0, 0.0, 1.0)), blend.x);
    float x11 = mix(hazeHash31(cell + vec3(0.0, 1.0, 1.0)), hazeHash31(cell + vec3(1.0, 1.0, 1.0)), blend.x);
    return mix(mix(x00, x10, blend.y), mix(x01, x11, blend.y), blend.z);
  }

  float hazeFbm(vec3 point) {
    float result = hazeNoise3(point) * 0.56;
    result += hazeNoise3(point * 2.03 + 7.4) * 0.29;
    result += hazeNoise3(point * 4.11 - 3.2) * 0.15;
    return result;
  }

  float horizonWispLayer(
    float horizonU,
    float height,
    float angleSlope,
    float cycles,
    float phase,
    vec3 noisePoint
  ) {
    float curveWarp = (hazeFbm(noisePoint) - 0.5) * 0.58;
    float slantedField = horizonU * cycles -
      height / max(abs(angleSlope), 0.08) * sign(angleSlope) +
      curveWarp + phase;
    float lineDistance = abs(fract(slantedField) - 0.5);
    float softLine = 1.0 - smoothstep(0.065, 0.19, lineDistance);
    float wispRetentionFloor = 0.32;
    float brokenSections = smoothstep(
      wispRetentionFloor,
      0.57,
      hazeFbm(noisePoint * 0.71 + 9.3)
    );
    float wispIntensityNoise = hazeFbm(
      noisePoint * 0.29 + vec3(phase * 0.17, 14.2, -6.8)
    );
    float wispFaintFloor = 0.18;
    float wispStrongCeiling = 1.0;
    float wispLocalIntensity = mix(
      wispFaintFloor,
      wispStrongCeiling,
      smoothstep(0.22, 0.78, wispIntensityNoise)
    );
    return softLine * brokenSections * wispLocalIntensity;
  }

  float topWispLayer(
    float horizonU,
    float height,
    float diagonalSlope,
    float phase,
    vec3 noisePoint
  ) {
    float curveWarp = (hazeFbm(noisePoint) - 0.5) * 0.72;
    float diagonalField = horizonU * 3.0 +
      height / diagonalSlope + curveWarp + phase;
    float lineDistance = abs(fract(diagonalField) - 0.5);
    float softLine = 1.0 - smoothstep(0.06, 0.20, lineDistance);
    float brokenSections = smoothstep(
      0.34,
      0.59,
      hazeFbm(noisePoint * 0.62 - 7.8)
    );
    float wispIntensityNoise = hazeFbm(
      noisePoint * 0.26 + vec3(-9.4, phase * 0.13, 11.7)
    );
    float wispLocalIntensity = mix(
      0.18,
      1.0,
      smoothstep(0.2, 0.8, wispIntensityNoise)
    );
    return softLine * brokenSections * wispLocalIntensity;
  }

  void main() {
    vec3 direction = normalize(vHazeDirection);
    vec3 driftOffset = vec3(
      hazeTime * hazeDriftSpeed,
      0.0,
      -hazeTime * hazeDriftSpeed * 0.63
    );
    float domainWarp = hazeNoise3(
      direction * 1.37 + vec3(
        hazeTime * hazeMorphSpeed,
        -hazeTime * hazeMorphSpeed * 0.41,
        hazeTime * hazeMorphSpeed * 0.27
      )
    );
    vec3 samplePoint = direction * hazeScale + driftOffset +
      (domainWarp - 0.5) * vec3(1.24, 0.52, 1.12);

    float horizonShift = (hazeNoise3(
      direction * 1.62 + driftOffset * 0.38
    ) - 0.5) * 0.11;
    float horizonDistance = abs(direction.y - (0.045 + horizonShift));
    float horizonBand = 1.0 - smoothstep(0.035, 0.25, horizonDistance);
    float spreadBand = 1.0 - smoothstep(0.055, 0.31, horizonDistance);
    float wispBand = 1.0 - smoothstep(0.075, 0.37, horizonDistance);
    float horizonU = atan(direction.z, direction.x) / 6.2831853 + 0.5;

    // A low-frequency mask creates separate cloud banks and true sky gaps.
    // 低频遮罩形成相互分离的云簇，并保留真正透明的天空间隔。
    float clusterField = hazeFbm(direction * 1.18 + driftOffset * 0.31 + 2.6);
    float cloudClusterMask = smoothstep(0.47, 0.66, clusterField);
    float transparentGap = smoothstep(
      0.39,
      0.59,
      hazeFbm(direction * 0.83 - driftOffset * 0.19 + 13.1)
    );

    // A small amount of volume remains behind the filaments, but never drives
    // the silhouette. / 仅保留少量体积底色，不再由团状核心决定轮廓。
    float cloudCore = smoothstep(
      0.61,
      0.79,
      hazeFbm(samplePoint) + hazeNoise3(samplePoint * 2.8) * 0.12
    ) * horizonBand;
    float cloudSpread = smoothstep(
      0.48,
      0.73,
      hazeFbm(samplePoint * 0.78 + 6.7)
    ) * spreadBand;
    float cloudCoreWeight = 0.12;

    vec3 horizonNoisePoint = direction * (hazeScale * 2.15) +
      driftOffset * 0.82 + (domainWarp - 0.5) * 0.74;
    float horizonWispA = horizonWispLayer(
      horizonU,
      direction.y,
      ${Math.tan(16 * Math.PI / 180).toFixed(4)},
      4.0,
      hazeTime * hazeDriftSpeed * 0.34,
      horizonNoisePoint
    );
    float horizonWispB = horizonWispLayer(
      horizonU,
      direction.y,
      ${Math.tan(-12 * Math.PI / 180).toFixed(4)},
      5.0,
      3.7 - hazeTime * hazeDriftSpeed * 0.27,
      horizonNoisePoint * 1.31 + 4.8
    );
    float horizonWispC = horizonWispLayer(
      horizonU,
      direction.y,
      ${Math.tan(24 * Math.PI / 180).toFixed(4)},
      6.0,
      8.1 + hazeTime * hazeDriftSpeed * 0.19,
      horizonNoisePoint * 1.67 - 5.3
    );
    float horizonWisps = clamp(
      horizonWispA * 0.68 + horizonWispB * 0.34 + horizonWispC * 0.22,
      0.0,
      1.0
    ) * wispBand;
    float cloudWisps = horizonWisps;

    // A time-independent filament layer is visible on the first rendered
    // frame. Dynamic noise still provides the stronger moving clouds.
    // 与时间无关的细云丝保证首帧可见，较浓的云仍由动态噪声控制。
    float baseWispPhase = 1.35;
    vec3 baseHorizonNoisePoint = direction * (hazeScale * 1.84) + 21.7;
    float baseHorizonGap = mix(
      0.38,
      1.0,
      smoothstep(
        0.36,
        0.62,
        hazeFbm(direction * 0.91 + vec3(4.6, -2.1, 8.4))
      )
    );
    float baseHorizonWispA = horizonWispLayer(
      horizonU,
      direction.y,
      ${Math.tan(16 * Math.PI / 180).toFixed(4)},
      3.0,
      baseWispPhase,
      baseHorizonNoisePoint
    );
    float baseHorizonWispB = horizonWispLayer(
      horizonU,
      direction.y,
      ${Math.tan(-12 * Math.PI / 180).toFixed(4)},
      4.0,
      4.15,
      baseHorizonNoisePoint * 1.27 - 5.9
    );
    float baseHorizonWisps = clamp(
      baseHorizonWispA * 0.72 + baseHorizonWispB * 0.38,
      0.0,
      1.0
    ) * wispBand * baseHorizonGap;

    // Upper-sky filaments live spatially above the normal view and naturally
    // enter frame at the maximum upward camera angle. Their dominant diagonal
    // descends across the sky. / 顶部云丝在最大仰角时自然进入画面，主走向斜下。
    float topSkyMask = smoothstep(0.24, 0.43, direction.y) *
      (1.0 - smoothstep(0.88, 0.99, direction.y));
    vec3 topNoisePoint = direction * (hazeScale * 1.72) +
      driftOffset * 0.43 + (domainWarp - 0.5) * 0.91 + 12.4;
    float topWispA = topWispLayer(
      horizonU,
      direction.y,
      -0.46,
      hazeTime * hazeDriftSpeed * 0.16,
      topNoisePoint
    );
    float topWispB = topWispLayer(
      horizonU,
      direction.y,
      0.61,
      5.2 - hazeTime * hazeDriftSpeed * 0.11,
      topNoisePoint * 1.39 - 3.6
    );
    float topBreaks = smoothstep(
      0.43,
      0.65,
      hazeFbm(topNoisePoint * 0.58 + 17.2)
    );
    float topWisps = clamp(topWispA * 0.76 + topWispB * 0.30, 0.0, 1.0) *
      topSkyMask * topBreaks;

    vec3 baseTopNoisePoint = direction * (hazeScale * 1.48) - 16.3;
    float baseTopGap = mix(
      0.34,
      1.0,
      smoothstep(0.38, 0.64, hazeFbm(direction * 0.86 + 18.9))
    );
    float baseTopWispA = topWispLayer(
      horizonU,
      direction.y,
      -0.46,
      2.4,
      baseTopNoisePoint
    );
    float baseTopWispB = topWispLayer(
      horizonU,
      direction.y,
      0.61,
      6.7,
      baseTopNoisePoint * 1.33 + 3.1
    );
    float baseTopWisps = clamp(
      baseTopWispA * 0.68 + baseTopWispB * 0.32,
      0.0,
      1.0
    ) * topSkyMask * baseTopGap;

    float dynamicHorizonAlpha = cloudClusterMask * transparentGap * (
      cloudCore * cloudCoreWeight + cloudSpread * 0.18 + horizonWisps * 0.86
    );
    float dynamicCloudAlpha = dynamicHorizonAlpha + topWisps * 0.62;
    float baseWispOpacityCeiling = 0.25;
    float baseCloudAlpha = clamp(
      baseHorizonWisps * baseWispOpacityCeiling + baseTopWisps * 0.20,
      0.0,
      baseWispOpacityCeiling
    );
    float cloudLayers = clamp(baseCloudAlpha + dynamicCloudAlpha, 0.0, 1.0);
    float alpha = cloudLayers * hazeDensity * hazeOpacity;

    vec3 cloudColor = vec3(1.0);
    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

export function createAtmosphericHaze(): THREE.Mesh<
  THREE.SphereGeometry,
  THREE.ShaderMaterial
> {
  const geometry = new THREE.SphereGeometry(55, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      hazeTime: { value: 0 },
      hazeDensity: { value: ATMOSPHERIC_HAZE_CONFIG.density },
      hazeOpacity: { value: ATMOSPHERIC_HAZE_CONFIG.opacity },
      hazeScale: { value: ATMOSPHERIC_HAZE_CONFIG.scale },
      hazeDriftSpeed: { value: ATMOSPHERIC_HAZE_CONFIG.driftSpeed },
      hazeMorphSpeed: { value: ATMOSPHERIC_HAZE_CONFIG.morphSpeed }
    },
    vertexShader: HAZE_VERTEX_SHADER,
    fragmentShader: HAZE_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide
  });
  const haze = new THREE.Mesh(geometry, material);
  haze.name = "growth-atmospheric-haze";
  haze.position.set(
    ISLAND_TERRAIN_CONFIG.worldX,
    0,
    ISLAND_TERRAIN_CONFIG.worldZ
  );
  haze.frustumCulled = false;
  haze.renderOrder = -1000;
  return haze;
}

export function updateAtmosphericHaze(
  material: THREE.ShaderMaterial,
  elapsedSeconds: number
): void {
  material.uniforms.hazeTime.value = elapsedSeconds;
}

export function setAtmosphericHazeParameters(
  material: THREE.ShaderMaterial,
  parameters: Partial<AtmosphericHazeParameters>
): void {
  if (parameters.density !== undefined) {
    material.uniforms.hazeDensity.value = parameters.density;
  }
  if (parameters.opacity !== undefined) {
    material.uniforms.hazeOpacity.value = parameters.opacity;
  }
  if (parameters.scale !== undefined) {
    material.uniforms.hazeScale.value = parameters.scale;
  }
  if (parameters.driftSpeed !== undefined) {
    material.uniforms.hazeDriftSpeed.value = parameters.driftSpeed;
  }
  if (parameters.morphSpeed !== undefined) {
    material.uniforms.hazeMorphSpeed.value = parameters.morphSpeed;
  }
}
