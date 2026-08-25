import * as THREE from "three";
import {
  archipelagoIslandRadiusAtAngle,
  createArchipelagoLayout,
  type ArchipelagoIsland
} from "./growth-tree-archipelago-geometry";
import {
  ISLAND_TERRAIN_CONFIG,
  islandRadiusAtAngle
} from "./growth-tree-island-geometry";
import { WATER_SURFACE_CONFIG } from "./growth-tree-water-geometry";

export const WATER_DEPTH_TEXTURE_CONFIG = {
  size: 256,
  maximumShoreDistance: 10,
  shallowWidth: 2.4,
  // Unified sea color requested by the visual specification.
  // 沙滩以外统一使用指定海水色。
  seaColor: [58, 151, 228],
  // Warm submerged sand, not white foam / 暖黄色水下沙地，不是白色浪花。
  sandColor: [208, 188, 132]
} as const;

const ARCHIPELAGO_LAYOUT = createArchipelagoLayout();

function mainIslandShoreDistance(x: number, z: number): number {
  const circularX = x / ISLAND_TERRAIN_CONFIG.xScale;
  const angle = Math.atan2(z, circularX);
  return Math.hypot(circularX, z) - islandRadiusAtAngle(angle);
}

function smallIslandShoreDistance(
  x: number,
  z: number,
  island: ArchipelagoIsland
): number {
  const circularX = (x - island.x) / island.xScale;
  const localZ = z - island.z;
  const angle = Math.atan2(localZ, circularX);
  return Math.hypot(circularX, localZ) -
    archipelagoIslandRadiusAtAngle(island, angle);
}

/**
 * Return 1 at a real shoreline and fade toward 0 as the water gets deeper.
 * 主岛和小岛共用真实不规则岸线；岸边为 1，离岸越远越接近深水 0。
 */
export function waterShallowFactorAt(x: number, z: number): number {
  const shoreDistance = shoreDistanceAt(x, z);
  const bands = waterShoreBandsAt(x, z);
  return 1 - THREE.MathUtils.smoothstep(
    Math.max(0, shoreDistance),
    0,
    bands.shallow
  );
}

export function shoreDistanceAt(x: number, z: number): number {
  let shoreDistance = mainIslandShoreDistance(x, z);
  for (const island of ARCHIPELAGO_LAYOUT) {
    shoreDistance = Math.min(
      shoreDistance,
      smallIslandShoreDistance(x, z, island)
    );
  }
  return shoreDistance;
}

export type WaterShoreBands = {
  sand: number;
  aqua: number;
  shallow: number;
};

/**
 * Independently distort each depth boundary so the colored areas overlap like
 * natural shoals instead of forming parallel glow rings.
 * 分别扰动每一层边界，使沙地与浅水像天然浅滩般交错，而不是平行光圈。
 */
export function waterShoreBandsAt(x: number, z: number): WaterShoreBands {
  const broadA = (
    Math.sin(x * .27 + z * .14) + Math.cos(z * .23 - x * .09)
  ) * .5;
  const broadB = (
    Math.sin(x * .19 - z * .31 + 1.4) + Math.cos(x * .13 + z * .26)
  ) * .5;
  const middleA = (
    Math.sin(x * .73 - z * .41) + Math.cos(x * .38 + z * .67 + .8)
  ) * .5;
  const middleB = (
    Math.sin(x * .52 + z * .81 + 2.1) + Math.cos(z * .57 - x * .44)
  ) * .5;

  const sand = THREE.MathUtils.clamp(
    .48 + broadA * .28 + middleA * .2,
    .08,
    1.02
  );
  const aqua = Math.max(
    sand + .2,
    1.22 + broadB * .48 + middleA * .24
  );
  const shallow = Math.max(
    aqua + .32,
    WATER_DEPTH_TEXTURE_CONFIG.shallowWidth + broadA * .62 + middleB * .48
  );
  return { sand, aqua, shallow };
}

function mixChannel(start: number, end: number, amount: number): number {
  return Math.round(THREE.MathUtils.lerp(start, end, amount));
}

function mixColor(
  start: readonly number[],
  end: readonly number[],
  amount: number
): number[] {
  return start.map((channel, index) =>
    mixChannel(channel, end[index]!, amount)
  );
}

/** Return the layered water color at a local world position / 返回位置对应水色。 */
export function waterColorAt(x: number, z: number): readonly number[] {
  const { seaColor, sandColor } = WATER_DEPTH_TEXTURE_CONFIG;
  const distance = Math.max(0, shoreDistanceAt(x, z));
  const bands = waterShoreBandsAt(x, z);
  const sandMask = 1 - THREE.MathUtils.smoothstep(
    distance,
    Math.max(0, bands.sand - .12),
    bands.sand + .12
  );
  return mixColor(seaColor, sandColor, sandMask);
}

function createWaterDepthPixels(): Uint8Array {
  const { size } = WATER_DEPTH_TEXTURE_CONFIG;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const worldX = (x + .5) / size * WATER_SURFACE_CONFIG.outerRadius * 2 -
        WATER_SURFACE_CONFIG.outerRadius;
      const worldZ = (y + .5) / size * WATER_SURFACE_CONFIG.outerRadius * 2 -
        WATER_SURFACE_CONFIG.outerRadius;
      const color = waterColorAt(worldX, worldZ);
      const offset = (y * size + x) * 4;
      pixels[offset] = color[0]!;
      pixels[offset + 1] = color[1]!;
      pixels[offset + 2] = color[2]!;
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

// Shore geometry is deterministic, so calculate the bathymetry once and let
// each material own a lightweight texture wrapper. / 岸线固定，只计算一次像素。
const WATER_DEPTH_PIXELS = createWaterDepthPixels();

function createShoreDistancePixels(): Uint8Array {
  const { size, maximumShoreDistance } = WATER_DEPTH_TEXTURE_CONFIG;
  const pixels = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const worldX = (x + .5) / size * WATER_SURFACE_CONFIG.outerRadius * 2 -
        WATER_SURFACE_CONFIG.outerRadius;
      const worldZ = (y + .5) / size * WATER_SURFACE_CONFIG.outerRadius * 2 -
        WATER_SURFACE_CONFIG.outerRadius;
      const normalizedDistance = THREE.MathUtils.clamp(
        Math.max(0, shoreDistanceAt(worldX, worldZ)) / maximumShoreDistance,
        0,
        1
      );
      pixels[y * size + x] = Math.round(normalizedDistance * 255);
    }
  }
  return pixels;
}

const WATER_SHORE_DISTANCE_PIXELS = createShoreDistancePixels();

/** Generate a world-aligned bathymetry texture / 生成与世界岛岸对齐的水深纹理。 */
export function createWaterSurfaceTexture(): THREE.DataTexture {
  const { size } = WATER_DEPTH_TEXTURE_CONFIG;
  const texture = new THREE.DataTexture(
    WATER_DEPTH_PIXELS,
    size,
    size,
    THREE.RGBAFormat
  );
  texture.name = "growth-water-depth-texture";
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Distance-to-shore data for outward-moving island ripples / 岛岸扩散波距离图。 */
export function createWaterShoreDistanceTexture(): THREE.DataTexture {
  const { size } = WATER_DEPTH_TEXTURE_CONFIG;
  const texture = new THREE.DataTexture(
    WATER_SHORE_DISTANCE_PIXELS,
    size,
    size,
    THREE.RedFormat
  );
  texture.name = "growth-water-shore-distance-texture";
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}
