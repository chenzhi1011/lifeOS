import * as THREE from "three";
import {
  createWaterShoreDistanceTexture,
  createWaterSurfaceTexture,
  WATER_DEPTH_TEXTURE_CONFIG
} from "./growth-tree-water-texture";

export type WaterRippleParameters = {
  amplitude: number;
  speed: number;
  frequency: number;
};

export const WATER_RIPPLE_CONFIG: WaterRippleParameters = {
  amplitude: .13,
  speed: .9,
  frequency: 1
};

export type WaterSparkleParameters = {
  groupADensity: number;
  groupBDensity: number;
  sparkleIntensity: number;
  sparkleSpeed: number;
  crossfadeSpeed: number;
};

export const WATER_SPARKLE_CONFIG: WaterSparkleParameters = {
  groupADensity: .18,
  groupBDensity: .07,
  sparkleIntensity: .42,
  sparkleSpeed: .82,
  crossfadeSpeed: .46
};

type RippleUniform = { value: number };
type RippleUniforms = {
  time: RippleUniform;
  amplitude: RippleUniform;
  speed: RippleUniform;
  frequency: RippleUniform;
  sparkleGroupADensity: RippleUniform;
  sparkleGroupBDensity: RippleUniform;
  sparkleIntensity: RippleUniform;
  sparkleSpeed: RippleUniform;
  sparkleCrossfadeSpeed: RippleUniform;
  rainEnabled: RippleUniform;
  shoreDistanceMap: { value: THREE.DataTexture };
};

function rippleUniforms(material: THREE.MeshLambertMaterial): RippleUniforms {
  return material.userData.waterRippleUniforms as RippleUniforms;
}

/**
 * Keep geometry still; animate ambient texture and shoreline rings in pixels.
 * 几何保持静止；仅在像素颜色中生成基础水纹与岛岸扩散波。
 */
export function createWaterRippleMaterial(
  parameters: Partial<WaterRippleParameters> = {}
): THREE.MeshLambertMaterial {
  const values = { ...WATER_RIPPLE_CONFIG, ...parameters };
  const shoreDistanceTexture = createWaterShoreDistanceTexture();
  const material = new THREE.MeshLambertMaterial({
    color: "#FFFFFF",
    map: createWaterSurfaceTexture(),
    transparent: true,
    opacity: .96,
    flatShading: true
  });
  const uniforms: RippleUniforms = {
    time: { value: 0 },
    amplitude: { value: values.amplitude },
    speed: { value: values.speed },
    frequency: { value: values.frequency },
    sparkleGroupADensity: { value: WATER_SPARKLE_CONFIG.groupADensity },
    sparkleGroupBDensity: { value: WATER_SPARKLE_CONFIG.groupBDensity },
    sparkleIntensity: { value: WATER_SPARKLE_CONFIG.sparkleIntensity },
    sparkleSpeed: { value: WATER_SPARKLE_CONFIG.sparkleSpeed },
    sparkleCrossfadeSpeed: { value: WATER_SPARKLE_CONFIG.crossfadeSpeed },
    rainEnabled: { value: 1 },
    shoreDistanceMap: { value: shoreDistanceTexture }
  };
  material.userData.waterRippleUniform = uniforms.time;
  material.userData.waterRippleUniforms = uniforms;
  material.userData.waterShoreDistanceTexture = shoreDistanceTexture;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.waterRippleTime = uniforms.time;
    shader.uniforms.waterRippleAmplitude = uniforms.amplitude;
    shader.uniforms.waterRippleSpeed = uniforms.speed;
    shader.uniforms.waterRippleFrequency = uniforms.frequency;
    shader.uniforms.waterSparkleGroupADensity = uniforms.sparkleGroupADensity;
    shader.uniforms.waterSparkleGroupBDensity = uniforms.sparkleGroupBDensity;
    shader.uniforms.waterSparkleIntensity = uniforms.sparkleIntensity;
    shader.uniforms.waterSparkleSpeed = uniforms.sparkleSpeed;
    shader.uniforms.waterSparkleCrossfadeSpeed =
      uniforms.sparkleCrossfadeSpeed;
    shader.uniforms.waterRainEnabled = uniforms.rainEnabled;
    shader.uniforms.waterShoreDistanceMap = uniforms.shoreDistanceMap;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vWaterPosition;"
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvWaterPosition = position.xz;"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float waterRippleTime;
        uniform float waterRippleAmplitude;
        uniform float waterRippleSpeed;
        uniform float waterRippleFrequency;
        uniform sampler2D waterShoreDistanceMap;
        uniform float waterSparkleGroupADensity;
        uniform float waterSparkleGroupBDensity;
        uniform float waterSparkleIntensity;
        uniform float waterSparkleSpeed;
        uniform float waterSparkleCrossfadeSpeed;
        uniform float waterRainEnabled;
        varying vec2 vWaterPosition;

        float waterHash21(vec2 point) {
          point = fract(point * vec2(123.34, 456.21));
          point += dot(point, point + 45.32);
          return fract(point.x * point.y);
        }

        float waterValueNoise(vec2 point) {
          vec2 cell = floor(point);
          vec2 local = fract(point);
          vec2 blend = local * local * (3.0 - 2.0 * local);
          float corner00 = waterHash21(cell);
          float corner10 = waterHash21(cell + vec2(1.0, 0.0));
          float corner01 = waterHash21(cell + vec2(0.0, 1.0));
          float corner11 = waterHash21(cell + vec2(1.0, 1.0));
          return mix(
            mix(corner00, corner10, blend.x),
            mix(corner01, corner11, blend.x),
            blend.y
          );
        }

        float waterThinRipple(vec2 flowUv, float phase) {
          float warpX = waterValueNoise(flowUv * 0.46 + vec2(phase, -phase * 0.37));
          float warpY = waterValueNoise(flowUv * 0.61 + vec2(8.4, 3.7) - phase * 0.28);
          vec2 warpedUv = flowUv + (vec2(warpX, warpY) - 0.5) * 1.28;
          float curveField = waterValueNoise(warpedUv) * 0.72 +
            waterValueNoise(warpedUv * 1.93 + 5.2) * 0.28;
          float contourDistance = abs(fract(curveField * 3.15 + phase * 0.08) - 0.5);
          float antiAlias = max(fwidth(contourDistance) * 1.35, 0.008);
          return 1.0 - smoothstep(0.038, 0.038 + antiAlias, contourDistance);
        }

        float waterSparkleLayer(
          vec2 gridPosition,
          vec2 seedOffset,
          float density,
          float sparkleTime
        ) {
          vec2 sparkleCell = floor(gridPosition) + seedOffset;
          vec2 sparkleLocal = fract(gridPosition);
          vec2 sparkleOffset = vec2(
            waterHash21(sparkleCell + vec2(7.1, 2.3)),
            waterHash21(sparkleCell + vec2(3.7, 9.2))
          );
          vec2 sparkleDelta = sparkleLocal - sparkleOffset;
          sparkleDelta.x *= mix(1.0, 2.6, waterHash21(sparkleCell + 5.4));
          float sparkleDistance = length(sparkleDelta);
          float sparkleRadius = mix(0.045, 0.105, waterHash21(sparkleCell + 8.6));
          float sparkleEdge = max(fwidth(sparkleDistance) * 1.4, 0.006);
          float sparkleShape = 1.0 - smoothstep(
            sparkleRadius - sparkleEdge,
            sparkleRadius + sparkleEdge,
            sparkleDistance
          );
          float sparklePresence = step(
            1.0 - density,
            waterHash21(sparkleCell + 13.8)
          );
          float sparkleRate = mix(0.72, 1.48, waterHash21(sparkleCell + 17.3));
          float sparklePhase = waterHash21(sparkleCell + 21.9) * 6.2831853;
          float sparkleWave = max(
            0.0,
            sin(sparkleTime * sparkleRate + sparklePhase)
          );
          float sparklePulse = 0.30 + pow(sparkleWave, 7.0) * 0.70;
          return sparkleShape * sparklePresence * sparklePulse;
        }

        float waterRainImpactRipple(vec2 worldPosition, float impactTime) {
          float impactCellSize = 2.35;
          vec2 impactGrid = worldPosition / impactCellSize;
          vec2 impactCell = floor(impactGrid);
          vec2 impactLocal = fract(impactGrid);
          vec2 impactPoint = vec2(
            mix(0.16, 0.84, waterHash21(impactCell + vec2(11.7, 4.2))),
            mix(0.16, 0.84, waterHash21(impactCell + vec2(3.4, 15.8)))
          );
          float rainImpactProbability = 0.18;
          float impactPresence = step(
            1.0 - rainImpactProbability,
            waterHash21(impactCell + 23.6)
          );
          float impactRate = mix(
            0.68,
            1.18,
            waterHash21(impactCell + 31.2)
          );
          float rainImpactLife = fract(
            impactTime * impactRate + waterHash21(impactCell + 41.9)
          );
          float impactDistance = length(impactLocal - impactPoint);
          float outerRadius = rainImpactLife * 0.22;
          float innerRadius = rainImpactLife * 0.13;
          float impactEdge = max(fwidth(impactDistance) * 1.25, 0.009);
          float outerRing = 1.0 - smoothstep(
            impactEdge,
            impactEdge * 2.4,
            abs(impactDistance - outerRadius)
          );
          float innerRing = 1.0 - smoothstep(
            impactEdge,
            impactEdge * 2.2,
            abs(impactDistance - innerRadius)
          );
          float centerDrop = 1.0 - smoothstep(
            0.012,
            0.055,
            impactDistance
          );
          float impactFade = smoothstep(0.0, 0.08, rainImpactLife) *
            (1.0 - smoothstep(0.55, 1.0, rainImpactLife));
          return impactPresence * impactFade * (
            outerRing * 0.62 + innerRing * 0.28 + centerDrop * 0.34
          );
        }`
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        float rippleClock = waterRippleTime * waterRippleSpeed;

        // Three slowly translated and differently oriented UV fields create
        // thin continuous lake ripples without exposing sine stripes.
        // 三组不同方向、尺度的缓慢 UV 流生成连续细曲线，不显示正弦条纹。
        vec2 centeredUv = vMapUv - 0.5;
        vec2 flowUvA = centeredUv * (17.0 * waterRippleFrequency) +
          vec2(rippleClock * 0.075, -rippleClock * 0.026);
        vec2 flowUvB = vec2(centeredUv.y, -centeredUv.x) *
          (23.0 * waterRippleFrequency) +
          vec2(-rippleClock * 0.043, rippleClock * 0.061);
        vec2 flowUvC = vec2(
          centeredUv.x * 0.72 + centeredUv.y * 0.69,
          -centeredUv.x * 0.69 + centeredUv.y * 0.72
        ) * (31.0 * waterRippleFrequency) +
          vec2(rippleClock * 0.031, rippleClock * 0.047);
        float thinRippleA = waterThinRipple(flowUvA, rippleClock * 0.12);
        float thinRippleB = waterThinRipple(flowUvB, 4.7 - rippleClock * 0.09);
        float thinRippleC = waterThinRipple(flowUvC, 9.3 + rippleClock * 0.065);
        float baseCrest = clamp(
          thinRippleA * 0.42 + thinRippleB * 0.31 + thinRippleC * 0.20,
          0.0,
          1.0
        );

        float shoreDistance = texture2D(waterShoreDistanceMap, vMapUv).r * ${WATER_DEPTH_TEXTURE_CONFIG.maximumShoreDistance.toFixed(1)};
        float islandPhase = sin(
          shoreDistance * 4.15 * waterRippleFrequency - rippleClock * 1.72
        );
        float islandCrest = smoothstep(0.68, 0.97, islandPhase);
        float islandStart = smoothstep(0.42, 0.78, shoreDistance);
        float islandFade = 1.0 - smoothstep(1.1, 7.2, shoreDistance);

        float sandSignal = diffuseColor.r - diffuseColor.b;
        float seaMask = 1.0 - smoothstep(-0.08, 0.10, sandSignal);
        float highlight = clamp(
          baseCrest * 0.48 + islandCrest * islandStart * islandFade * 0.82,
          0.0,
          1.0
        );
        float tealLight = 0.988 + highlight * waterRippleAmplitude;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tealLight, seaMask);

        // Only a sparse visual sample of rain drops creates surface rings;
        // individual 3D streaks do not require expensive collision matching.
        // 只让少量雨滴产生水面涟漪，不逐滴计算三维碰撞。
        float rainImpactAmount = waterRainImpactRipple(
          vWaterPosition,
          waterRippleTime
        );
        float rainShoreMask = seaMask * smoothstep(0.42, 0.96, shoreDistance);
        rainImpactAmount *= rainShoreMask * waterRainEnabled * 0.42;
        vec3 rainImpactTint = vec3(0.36, 0.68, 0.91);
        diffuseColor.rgb = mix(
          diffuseColor.rgb,
          rainImpactTint,
          rainImpactAmount
        );

        // Two differently seeded populations crossfade with complementary
        // weights. Group A is dense; group B is sparse but slightly brighter.
        // 两组不同种子的反光点互补交叉淡化；A 组多，B 组少但略亮。
        vec2 sparkleGridPosition = vWaterPosition * 0.72;
        vec2 sparkleSeedA = vec2(0.0, 0.0);
        vec2 sparkleSeedB = vec2(37.2, 19.4);
        float sparkleTime = waterRippleTime * waterSparkleSpeed;
        float groupASparkle = waterSparkleLayer(
          sparkleGridPosition,
          sparkleSeedA,
          waterSparkleGroupADensity,
          sparkleTime
        );
        float groupBSparkle = waterSparkleLayer(
          sparkleGridPosition + vec2(0.37, 0.61),
          sparkleSeedB,
          waterSparkleGroupBDensity,
          sparkleTime
        );
        float crossfadeCycle = 0.5 + 0.5 * sin(
          waterRippleTime * waterSparkleCrossfadeSpeed
        );
        float groupAVisibility = smoothstep(0.20, 0.80, crossfadeCycle);
        float groupBVisibility = 1.0 - groupAVisibility;
        float sparkleFarFade = 1.0 - smoothstep(27.0, 39.0, length(vWaterPosition));
        float sparkleAmount = (
          groupASparkle * groupAVisibility +
          groupBSparkle * groupBVisibility * 1.16
        ) *
          sparkleFarFade * seaMask * waterSparkleIntensity;
        vec3 sparkleTint = vec3(0.22, 0.66, 0.92);
        diffuseColor.rgb = mix(diffuseColor.rgb, sparkleTint, sparkleAmount);`
      );
  };
  material.customProgramCacheKey = () => "growth-water-ripples-v5";
  material.addEventListener("dispose", () => shoreDistanceTexture.dispose());
  return material;
}

export function setWaterRippleParameters(
  material: THREE.MeshLambertMaterial,
  parameters: Partial<WaterRippleParameters>
): void {
  const uniforms = rippleUniforms(material);
  if (parameters.amplitude !== undefined) {
    uniforms.amplitude.value = parameters.amplitude;
  }
  if (parameters.speed !== undefined) uniforms.speed.value = parameters.speed;
  if (parameters.frequency !== undefined) {
    uniforms.frequency.value = parameters.frequency;
  }
}

export function setWaterSparkleParameters(
  material: THREE.MeshLambertMaterial,
  parameters: Partial<WaterSparkleParameters>
): void {
  const uniforms = rippleUniforms(material);
  if (parameters.groupADensity !== undefined) {
    uniforms.sparkleGroupADensity.value = parameters.groupADensity;
  }
  if (parameters.groupBDensity !== undefined) {
    uniforms.sparkleGroupBDensity.value = parameters.groupBDensity;
  }
  if (parameters.sparkleIntensity !== undefined) {
    uniforms.sparkleIntensity.value = parameters.sparkleIntensity;
  }
  if (parameters.sparkleSpeed !== undefined) {
    uniforms.sparkleSpeed.value = parameters.sparkleSpeed;
  }
  if (parameters.crossfadeSpeed !== undefined) {
    uniforms.sparkleCrossfadeSpeed.value = parameters.crossfadeSpeed;
  }
}

export function updateWaterRippleTime(
  material: THREE.MeshLambertMaterial,
  elapsedSeconds: number
): void {
  rippleUniforms(material).time.value = elapsedSeconds;
}

export function setWaterRainEnabled(
  material: THREE.MeshLambertMaterial,
  enabled: boolean
): void {
  rippleUniforms(material).rainEnabled.value = enabled ? 1 : 0;
}
