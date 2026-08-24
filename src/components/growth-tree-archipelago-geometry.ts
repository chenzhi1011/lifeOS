import * as THREE from "three";
import { seedFromId } from "@/src/domain/stable-seed";
import {
  WATER_SURFACE_CONFIG,
  waterHeightAtRadius
} from "./growth-tree-water-geometry";

export const ARCHIPELAGO_CONFIG = {
  islandCount: 10,
  minimumIslandRadius: 1.5,
  maximumIslandRadius: 4.5,
  maximumOuterRadius: 39.6,
  shoreClearance: 0.008,
  radialRings: 6,
  angularSegments: 24,
  nearLimit: 22,
  middleLimit: 30
} as const;

export const ARCHIPELAGO_BAND_COLORS = {
  near: "#91B873",
  middle: "#9EBD86",
  horizon: "#A9C397"
} as const;

export type ArchipelagoDepthBand = "near" | "middle" | "horizon";
export type ArchipelagoShape =
  | "broad"
  | "long"
  | "twin"
  | "crescent"
  | "lobed"
  | "inlet";

export type TerrainCenter = {
  x: number;
  z: number;
  width: number;
  height: number;
};

export type ArchipelagoIsland = {
  id: string;
  clusterId: string | null;
  ringIndex: number;
  sectorIndex: number;
  depthBand: ArchipelagoDepthBand;
  shape: ArchipelagoShape;
  x: number;
  z: number;
  radius: number;
  xScale: number;
  shorelinePhase: number;
  detailPhase: number;
  plateauHeight: number;
  terrainCenters: TerrainCenter[];
};

const SHAPES: ArchipelagoShape[] = [
  "broad", "long", "twin", "crescent", "lobed", "inlet"
];

function random(id: string, property: string): number {
  return seedFromId(id, `growth-archipelago-${property}`);
}

function terrainCenters(id: string, index: number): TerrainCenter[] {
  const count = 2 + index % 4;
  const mainAngle = random(id, "main-hill-angle") * Math.PI * 2;
  const centers: TerrainCenter[] = [{
    x: Math.cos(mainAngle) * THREE.MathUtils.lerp(.34, .46, random(id, "main-hill-distance")),
    z: Math.sin(mainAngle) * THREE.MathUtils.lerp(.34, .46, random(id, "main-hill-distance")),
    width: THREE.MathUtils.lerp(.2, .29, random(id, "main-hill-width")),
    height: THREE.MathUtils.lerp(.16, .28, random(id, "main-hill-height"))
  }];
  for (let centerIndex = 1; centerIndex < count; centerIndex += 1) {
    const angle = random(id, `hill-angle-${centerIndex}`) * Math.PI * 2;
    const distance = THREE.MathUtils.lerp(.15, .62, random(id, `hill-distance-${centerIndex}`));
    centers.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      width: THREE.MathUtils.lerp(.16, .38, random(id, `hill-width-${centerIndex}`)),
      height: THREE.MathUtils.lerp(-.075, .16, random(id, `hill-height-${centerIndex}`))
    });
  }
  return centers;
}

function aspectRatio(shape: ArchipelagoShape, id: string): number {
  if (shape === "long") return THREE.MathUtils.lerp(1.18, 1.28, random(id, "aspect"));
  if (shape === "crescent") return THREE.MathUtils.lerp(.72, .86, random(id, "aspect"));
  if (shape === "twin") return THREE.MathUtils.lerp(.84, 1.08, random(id, "aspect"));
  return THREE.MathUtils.lerp(.88, 1.16, random(id, "aspect"));
}

function overlaps(candidate: ArchipelagoIsland, existing: ArchipelagoIsland[]): boolean {
  const extent = candidate.radius * Math.max(1, candidate.xScale);
  return existing.some((island) =>
    Math.hypot(candidate.x - island.x, candidate.z - island.z) <=
      extent + island.radius * Math.max(1, island.xScale) + .12
  );
}

function depthBandAt(distance: number): ArchipelagoDepthBand {
  if (distance < ARCHIPELAGO_CONFIG.nearLimit) return "near";
  if (distance < ARCHIPELAGO_CONFIG.middleLimit) return "middle";
  return "horizon";
}

function radiusForDistance(id: string, distance: number): number {
  const depthBand = depthBandAt(distance);
  const range = depthBand === "near"
    ? [2.8, 4.5]
    : depthBand === "middle"
      ? [2.25, 3.85]
      : [1.5, 3.05];
  return THREE.MathUtils.lerp(range[0]!, range[1]!, random(id, "radius"));
}

function islandAt(
  id: string,
  globalIndex: number,
  ringIndex: number,
  sectorIndex: number,
  x: number,
  z: number,
  radiusScale = 1
): ArchipelagoIsland {
  const distance = Math.hypot(x, z);
  const shape = SHAPES[globalIndex % SHAPES.length]!;
  return {
    id,
    clusterId: null,
    ringIndex,
    sectorIndex,
    depthBand: depthBandAt(distance),
    shape,
    x,
    z,
    radius: Math.max(
      ARCHIPELAGO_CONFIG.minimumIslandRadius,
      radiusForDistance(id, distance) * radiusScale
    ),
    xScale: aspectRatio(shape, id),
    shorelinePhase: random(id, "shoreline") * Math.PI * 2,
    detailPhase: random(id, "detail") * Math.PI * 2,
    plateauHeight: THREE.MathUtils.lerp(.07, .15, random(id, "plateau")),
    terrainCenters: terrainCenters(id, globalIndex)
  };
}

function canPlace(candidate: ArchipelagoIsland, existing: ArchipelagoIsland[]): boolean {
  const distance = Math.hypot(candidate.x, candidate.z);
  const extent = candidate.radius * Math.max(1, candidate.xScale);
  return distance > 13.5 &&
    distance - extent > 8.34 &&
    distance + extent < ARCHIPELAGO_CONFIG.maximumOuterRadius &&
    !overlaps(candidate, existing);
}

/**
 * Give every independent island its own radial ring and angular sector.
 * Ring-to-sector pairing and in-cell offsets are deterministic but irregular.
 * 每座独立岛占用不同的距离圈与方向扇形；圈扇配对和格内偏移保持确定性随机。
 */
export function createArchipelagoLayout(): ArchipelagoIsland[] {
  const islands: ArchipelagoIsland[] = [];
  const count = ARCHIPELAGO_CONFIG.islandCount;
  const sectorWidth = Math.PI * 2 / count;
  const sectorOffsets = [.08, .82, .18, .67, .35, .91, .12, .73, .28, .58];
  const ringOrder = Array.from({ length: count }, (_, index) => index)
    .sort((left, right) =>
      random(`ring-${left}`, "order") - random(`ring-${right}`, "order")
    );

  for (let sectorIndex = 0; sectorIndex < count; sectorIndex += 1) {
    const ringIndex = ringOrder[sectorIndex]!;
    const id = `independent-island-${sectorIndex}`;
    let placed: ArchipelagoIsland | null = null;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const sectorOffset = attempt === 0
        ? sectorOffsets[sectorIndex]!
        : THREE.MathUtils.lerp(.06, .94, random(id, `angle-${attempt}`));
      const angle = sectorIndex * sectorWidth + sectorWidth * sectorOffset;
      const ringStart = 14.2 + ringIndex * 2.2;
      const distance = THREE.MathUtils.lerp(
        ringStart + .15,
        ringStart + 1.85,
        random(id, `distance-${attempt}`)
      );
      const candidate = islandAt(
        id,
        sectorIndex,
        ringIndex,
        sectorIndex,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        Math.max(.76, 1 - attempt * .004)
      );
      if (canPlace(candidate, islands)) {
        placed = candidate;
        break;
      }
    }
    if (!placed) throw new Error(`unable to place ${id}`);
    islands.push(placed);
  }
  return islands;
}

function shapeRadiusFactor(island: ArchipelagoIsland, angle: number): number {
  const phase = island.shorelinePhase;
  if (island.shape === "long") {
    return 1 + Math.sin(angle * 2 + phase) * .08 + Math.sin(angle * 5 - phase) * .045;
  }
  if (island.shape === "twin") {
    return 1 + Math.cos(angle * 2 + phase) * .2 + Math.sin(angle * 5) * .045;
  }
  if (island.shape === "crescent") {
    return 1 + Math.cos(angle + phase) * .16 - Math.cos(angle * 2 - phase) * .11;
  }
  if (island.shape === "lobed") {
    return 1 + Math.cos(angle * 3 + phase) * .17 + Math.sin(angle * 5 - phase) * .07;
  }
  if (island.shape === "inlet") {
    return 1 + Math.cos(angle * 2 + phase) * .11 + Math.sin(angle * 4 - phase) * .12;
  }
  return 1 + Math.sin(angle * 2 + phase) * .07 + Math.cos(angle * 3 - phase) * .05;
}

export function archipelagoIslandRadiusAtAngle(
  island: ArchipelagoIsland,
  angle: number
): number {
  const fineDetail = Math.sin(angle * 7 + island.detailPhase) * .025 +
    Math.cos(angle * 11 - island.shorelinePhase) * .015;
  return island.radius * Math.max(.62, shapeRadiusFactor(island, angle) + fineDetail);
}

function waterBaseHeight(island: ArchipelagoIsland, localX: number, localZ: number): number {
  return waterHeightAtRadius(Math.hypot(island.x + localX, island.z + localZ)) +
    WATER_SURFACE_CONFIG.worldY + ARCHIPELAGO_CONFIG.shoreClearance;
}

export function islandTerrainHeight(
  island: ArchipelagoIsland,
  localX: number,
  localZ: number
): number {
  const circularX = localX / island.xScale;
  const angle = Math.atan2(localZ, circularX);
  const radius = Math.hypot(circularX, localZ);
  const boundary = archipelagoIslandRadiusAtAngle(island, angle);
  const normalizedRadius = Math.min(1, radius / boundary);
  const shoreFade = 1 - THREE.MathUtils.smoothstep(normalizedRadius, .68, 1);
  let relief = island.plateauHeight;
  const normalizedX = circularX / island.radius;
  const normalizedZ = localZ / island.radius;
  for (const center of island.terrainCenters) {
    const distanceSquared =
      (normalizedX - center.x) ** 2 + (normalizedZ - center.z) ** 2;
    relief += center.height * Math.exp(
      -distanceSquared / (2 * center.width ** 2)
    );
  }
  relief += Math.sin(
    normalizedX * 5 + normalizedZ * 3 + island.detailPhase
  ) * .018;
  return waterBaseHeight(island, localX, localZ) +
    Math.max(.018, relief) * shoreFade;
}

/** Merge all landmasses into one indexed low-poly mesh / 合并成一次绘制。 */
export function createArchipelagoGeometry(): THREE.BufferGeometry {
  const { radialRings, angularSegments } = ARCHIPELAGO_CONFIG;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const island of createArchipelagoLayout()) {
    const color = new THREE.Color(ARCHIPELAGO_BAND_COLORS[island.depthBand]);
    const vertexOffset = positions.length / 3;
    positions.push(island.x, islandTerrainHeight(island, 0, 0), island.z);
    colors.push(color.r, color.g, color.b);
    for (let ring = 1; ring <= radialRings; ring += 1) {
      const radialProgress = ring / radialRings;
      for (let side = 0; side < angularSegments; side += 1) {
        const angle = side / angularSegments * Math.PI * 2;
        const radius = archipelagoIslandRadiusAtAngle(island, angle) * radialProgress;
        const localX = Math.cos(angle) * radius * island.xScale;
        const localZ = Math.sin(angle) * radius;
        positions.push(
          island.x + localX,
          islandTerrainHeight(island, localX, localZ),
          island.z + localZ
        );
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let side = 0; side < angularSegments; side += 1) {
      indices.push(
        vertexOffset,
        vertexOffset + 1 + (side + 1) % angularSegments,
        vertexOffset + 1 + side
      );
    }
    for (let ring = 1; ring < radialRings; ring += 1) {
      const innerStart = vertexOffset + 1 + (ring - 1) * angularSegments;
      const outerStart = vertexOffset + 1 + ring * angularSegments;
      for (let side = 0; side < angularSegments; side += 1) {
        const following = (side + 1) % angularSegments;
        indices.push(
          innerStart + side, outerStart + following, outerStart + side,
          innerStart + side, innerStart + following, outerStart + following
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
