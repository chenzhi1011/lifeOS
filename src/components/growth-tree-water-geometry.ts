import * as THREE from "three";

export const WATER_SURFACE_CONFIG = {
  // Shared world-space height used by both water and island shorelines.
  // 水面与所有岛岸共用的世界坐标高度，避免远岛漂浮或下沉。
  worldY: -0.08,
  // Covers the island's widest shoreline before any visible curvature starts.
  // 覆盖小岛最宽岸线；在这个范围内水面保持水平，不与岛岸分离。
  flatRadius: 7.2,
  // Keep the visible middle distance level; curvature begins only near the
  // expanded world's edge. / 中景保持水平，只在扩大后的世界边缘开始弯曲。
  curveStartRadius: 20,
  outerRadius: 40,
  edgeDrop: 5,
  radialRings: 10,
  angularSegments: 40
} as const;

export function waterHeightAtRadius(radius: number): number {
  if (radius <= WATER_SURFACE_CONFIG.curveStartRadius) return 0;

  const curvedSpan =
    WATER_SURFACE_CONFIG.outerRadius - WATER_SURFACE_CONFIG.curveStartRadius;
  const progress = Math.min(
    1,
    Math.max(0, (radius - WATER_SURFACE_CONFIG.curveStartRadius) / curvedSpan)
  );

  // Cubic falloff keeps most visible water calm and nearly horizontal; the
  // round-world curvature becomes noticeable only close to the far edge.
  // 三次下降让大部分可见水域近似水平，只在远端逐渐显出小世界曲率。
  return -WATER_SURFACE_CONFIG.edgeDrop * progress ** 3;
}

export function createWaterSurfaceGeometry(): THREE.BufferGeometry {
  const {
    angularSegments,
    outerRadius,
    radialRings
  } = WATER_SURFACE_CONFIG;
  const vertices: number[] = [0, 0, 0];
  const uvs: number[] = [.5, .5];
  const indices: number[] = [];

  for (let ring = 1; ring <= radialRings; ring += 1) {
    const radius = outerRadius * ring / radialRings;
    const height = waterHeightAtRadius(radius);
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const angle = segment / angularSegments * Math.PI * 2;
      vertices.push(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius
      );
      uvs.push(
        .5 + Math.cos(angle) * radius / outerRadius * .5,
        .5 + Math.sin(angle) * radius / outerRadius * .5
      );
    }
  }

  for (let segment = 0; segment < angularSegments; segment += 1) {
    const current = 1 + segment;
    const next = 1 + (segment + 1) % angularSegments;
    indices.push(0, next, current);
  }

  for (let ring = 1; ring < radialRings; ring += 1) {
    const innerStart = 1 + (ring - 1) * angularSegments;
    const outerStart = innerStart + angularSegments;
    for (let segment = 0; segment < angularSegments; segment += 1) {
      const nextSegment = (segment + 1) % angularSegments;
      const innerCurrent = innerStart + segment;
      const innerNext = innerStart + nextSegment;
      const outerCurrent = outerStart + segment;
      const outerNext = outerStart + nextSegment;
      indices.push(
        innerCurrent,
        outerNext,
        outerCurrent,
        innerCurrent,
        innerNext,
        outerNext
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3)
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
