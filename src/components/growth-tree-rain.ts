import * as THREE from "three";

export const GROWTH_TREE_RAIN_CONFIG = {
  count: 1200,
  radius: 14,
  minimumY: 0.5,
  maximumY: 15,
  minimumLength: 0.16,
  maximumLength: 0.36,
  minimumSpeed: 2.8,
  maximumSpeed: 4.2,
  opacity: 0.58,
  nearDropFraction: 0.25,
  windX: 0.18,
  deterministicSeed: 104729
} as const;

export const RAINY_SCENE_FILTER =
  "brightness(0.83) saturate(0.96) contrast(1.04)";

export type GrowthTreeRain = {
  lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  dispose: () => void;
  phases: Float32Array;
  speeds: Float32Array;
  lengths: Float32Array;
  xPositions: Float32Array;
  zPositions: Float32Array;
};

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function rainDropTopY(phase: number, speed: number, elapsed: number): number {
  const span =
    GROWTH_TREE_RAIN_CONFIG.maximumY - GROWTH_TREE_RAIN_CONFIG.minimumY;
  return GROWTH_TREE_RAIN_CONFIG.maximumY -
    ((phase + elapsed * speed) % span);
}

function writeRainPositions(rain: GrowthTreeRain, elapsedSeconds: number): void {
  const positions = rain.lines.geometry.attributes.position as
    THREE.BufferAttribute;
  for (let index = 0; index < GROWTH_TREE_RAIN_CONFIG.count; index += 1) {
    const topY = rainDropTopY(
      rain.phases[index]!,
      rain.speeds[index]!,
      elapsedSeconds
    );
    const length = rain.lengths[index]!;
    const vertexIndex = index * 2;
    positions.setXYZ(
      vertexIndex,
      rain.xPositions[index]!,
      topY,
      rain.zPositions[index]!
    );
    positions.setXYZ(
      vertexIndex + 1,
      rain.xPositions[index]! - GROWTH_TREE_RAIN_CONFIG.windX * length,
      topY - length,
      rain.zPositions[index]! + length * 0.05
    );
  }
  positions.needsUpdate = true;
}

/** Create short, translucent streaks for a light three-dimensional rain. */
/** 创建短而透明的三维细雨线段，不使用覆盖屏幕的二维雨幕。 */
export function createGrowthTreeRain(): GrowthTreeRain {
  const random = seededRandom(GROWTH_TREE_RAIN_CONFIG.deterministicSeed);
  const phases = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count);
  const speeds = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count);
  const lengths = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count);
  const xPositions = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count);
  const zPositions = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count);
  const positions = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count * 2 * 3);
  const colors = new Float32Array(GROWTH_TREE_RAIN_CONFIG.count * 2 * 3);
  const farColor = new THREE.Color("#B8D5E5");
  const nearColor = new THREE.Color("#D7ECF5");

  for (let index = 0; index < GROWTH_TREE_RAIN_CONFIG.count; index += 1) {
    const isNearDrop =
      index < GROWTH_TREE_RAIN_CONFIG.count *
        GROWTH_TREE_RAIN_CONFIG.nearDropFraction;
    const angle = random() * Math.PI * 2;
    const radius = Math.sqrt(random()) * GROWTH_TREE_RAIN_CONFIG.radius;
    phases[index] = index === 0
      ? 0
      : random() * (
          GROWTH_TREE_RAIN_CONFIG.maximumY -
          GROWTH_TREE_RAIN_CONFIG.minimumY
        );
    speeds[index] = isNearDrop
      ? THREE.MathUtils.lerp(3.5, GROWTH_TREE_RAIN_CONFIG.maximumSpeed, random())
      : THREE.MathUtils.lerp(GROWTH_TREE_RAIN_CONFIG.minimumSpeed, 3.7, random());
    lengths[index] = isNearDrop
      ? THREE.MathUtils.lerp(0.24, GROWTH_TREE_RAIN_CONFIG.maximumLength, random())
      : THREE.MathUtils.lerp(GROWTH_TREE_RAIN_CONFIG.minimumLength, 0.27, random());
    xPositions[index] = Math.cos(angle) * radius;
    zPositions[index] = Math.sin(angle) * radius;
    const color = isNearDrop ? nearColor : farColor;
    for (let endpoint = 0; endpoint < 2; endpoint += 1) {
      const colorOffset = (index * 2 + endpoint) * 3;
      colors[colorOffset] = color.r;
      colors[colorOffset + 1] = color.g;
      colors[colorOffset + 2] = color.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: GROWTH_TREE_RAIN_CONFIG.opacity,
    depthWrite: false,
    fog: true
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "growth-tree-rain";
  lines.userData.deterministicSeed = GROWTH_TREE_RAIN_CONFIG.deterministicSeed;
  lines.frustumCulled = false;
  lines.renderOrder = 12;
  lines.raycast = () => undefined;

  const rain: GrowthTreeRain = {
    lines,
    phases,
    speeds,
    lengths,
    xPositions,
    zPositions,
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
  writeRainPositions(rain, 0);
  return rain;
}

export function updateGrowthTreeRain(
  rain: GrowthTreeRain,
  elapsedSeconds: number
): void {
  if (rain.lines.visible) {
    writeRainPositions(rain, elapsedSeconds);
  }
}

export function setGrowthTreeRainEnabled(
  rain: GrowthTreeRain,
  enabled: boolean
): void {
  rain.lines.visible = enabled;
}
