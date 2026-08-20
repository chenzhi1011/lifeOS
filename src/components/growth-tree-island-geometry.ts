import * as THREE from "three";

export const ISLAND_TERRAIN_CONFIG = {
  baseRadius: 4.75,
  xScale: 1.25,
  worldX: -1.2,
  worldZ: 0.5,
  radialRings: 7,
  angularSegments: 32,
  centerHeight: 0.12,
  shoreHeight: -0.025,
  maximumWaterY: -0.055
} as const;

export function islandRadiusAtAngle(angle: number): number {
  const irregularity = 1
    + Math.sin(angle * 3 + 0.4) * 0.09
    + Math.sin(angle * 7 - 1.1) * 0.055
    + Math.cos(angle * 11 + 0.2) * 0.025;
  return ISLAND_TERRAIN_CONFIG.baseRadius * irregularity;
}

export function islandHeightAt(x: number, z: number): number {
  const circularX = x / ISLAND_TERRAIN_CONFIG.xScale;
  const angle = Math.atan2(z, circularX);
  const radius = Math.hypot(circularX, z);
  const normalizedRadius = Math.min(1,
    radius / islandRadiusAtAngle(angle)
  );
  const centerWeight = (1 - normalizedRadius) ** 1.35;
  const baseHeight = THREE.MathUtils.lerp(
    ISLAND_TERRAIN_CONFIG.shoreHeight,
    ISLAND_TERRAIN_CONFIG.centerHeight,
    centerWeight
  );
  // Directional hills and shallow valleys fade out at both center and shore.
  // 偏心山丘与浅洼地在中心和岸边逐渐消失，避免同心圆式均匀隆起。
  const interiorWeight = Math.sin(Math.PI * normalizedRadius);
  const unevenHeight = interiorWeight * (
    Math.sin(angle * 2 + 0.7) * 0.085
    + Math.cos(angle * 5 - 0.4) * 0.055
    + Math.sin(radius * 1.5 + angle * 3) * 0.03
  );
  return Math.max(
    ISLAND_TERRAIN_CONFIG.maximumWaterY + 0.012,
    baseHeight + unevenHeight
  );
}

/**
 * Build a deterministic low-poly radial island mesh.
 * 构建确定性的低多边形放射状岛屿网格。
 */
export function createIslandTerrainGeometry(): THREE.BufferGeometry {
  const { radialRings, angularSegments, xScale } = ISLAND_TERRAIN_CONFIG;
  const positions: number[] = [0, islandHeightAt(0, 0), 0];
  const indices: number[] = [];

  for (let ring = 1; ring <= radialRings; ring += 1) {
    const radialProgress = ring / radialRings;
    for (let side = 0; side < angularSegments; side += 1) {
      const angle = side / angularSegments * Math.PI * 2;
      const boundaryRadius = islandRadiusAtAngle(angle);
      const radius = boundaryRadius * radialProgress;
      const x = Math.cos(angle) * radius * xScale;
      const z = Math.sin(angle) * radius;
      positions.push(x, islandHeightAt(x, z), z);
    }
  }

  for (let side = 0; side < angularSegments; side += 1) {
    const current = 1 + side;
    const next = 1 + (side + 1) % angularSegments;
    indices.push(0, next, current);
  }

  for (let ring = 1; ring < radialRings; ring += 1) {
    const innerStart = 1 + (ring - 1) * angularSegments;
    const outerStart = 1 + ring * angularSegments;
    for (let side = 0; side < angularSegments; side += 1) {
      const following = (side + 1) % angularSegments;
      indices.push(
        innerStart + side,
        outerStart + following,
        outerStart + side,
        innerStart + side,
        innerStart + following,
        outerStart + following
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
