import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ARCHIPELAGO_CONFIG,
  ARCHIPELAGO_BAND_COLORS,
  archipelagoIslandRadiusAtAngle,
  createArchipelagoGeometry,
  createArchipelagoLayout,
  islandTerrainHeight
} from "@/src/components/growth-tree-archipelago-geometry";
import { ISLAND_TERRAIN_CONFIG } from "@/src/components/growth-tree-island-geometry";
import {
  WATER_SURFACE_CONFIG,
  waterHeightAtRadius
} from "@/src/components/growth-tree-water-geometry";

describe("growth tree archipelago geometry", () => {
  it("creates stable, visibly larger islands across near, middle, and horizon bands", () => {
    const first = createArchipelagoLayout();
    const second = createArchipelagoLayout();

    expect(first).toEqual(second);
    expect(first).toHaveLength(10);
    expect(new Set(first.map((island) => island.radius.toFixed(2))).size)
      .toBeGreaterThanOrEqual(7);
    expect(Math.min(...first.map((island) => island.radius)))
      .toBeGreaterThanOrEqual(ARCHIPELAGO_CONFIG.minimumIslandRadius);
    expect(Math.max(...first.map((island) => island.radius)))
      .toBeLessThan(ISLAND_TERRAIN_CONFIG.baseRadius);
    expect(new Set(first.map((island) => island.depthBand)))
      .toEqual(new Set(["near", "middle", "horizon"]));
    expect(first.filter((island) => island.depthBand === "near").length)
      .toBeGreaterThanOrEqual(2);
    expect(first.filter((island) => island.depthBand === "horizon").length)
      .toBeGreaterThanOrEqual(3);
  });

  it("uses uneven random angles and continuous distances without leaving a huge empty direction", () => {
    const islands = createArchipelagoLayout();
    const angles = islands.map((island) => Math.atan2(island.z, island.x))
      .map((angle) => angle < 0 ? angle + Math.PI * 2 : angle)
      .sort((left, right) => left - right);
    const gaps = angles.map((angle, index) => {
      const next = angles[(index + 1) % angles.length]!;
      return (next - angle + Math.PI * 2) % (Math.PI * 2);
    });
    expect(Math.max(...gaps)).toBeLessThan(1.65);
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(3);

    const distances = islands.map((island) => Math.hypot(island.x, island.z));
    expect(new Set(distances.map((distance) => distance.toFixed(1))).size)
      .toBeGreaterThan(8);
    expect(Math.min(...distances)).toBeGreaterThan(13.5);
    expect(Math.max(...distances)).toBeGreaterThan(33);
  });

  it("places every island in a different radial ring and angular sector", () => {
    const islands = createArchipelagoLayout();
    expect(new Set(islands.map((island) => island.ringIndex)).size)
      .toBe(islands.length);
    expect(new Set(islands.map((island) => island.sectorIndex)).size)
      .toBe(islands.length);
    expect(islands.every((island) => island.clusterId === null)).toBe(true);
  });

  it("uses varied shore families, aspect ratios, and multiple terrain centers", () => {
    const islands = createArchipelagoLayout();
    expect(new Set(islands.map((island) => island.shape)).size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...islands.map((island) => island.xScale)) -
      Math.min(...islands.map((island) => island.xScale))).toBeGreaterThan(0.4);
    expect(islands.every((island) => island.terrainCenters.length >= 2)).toBe(true);
    expect(islands.some((island) => island.terrainCenters.length >= 4)).toBe(true);

    const shorelineSignatures = islands.map((island) =>
      Array.from({ length: 12 }, (_, index) =>
        archipelagoIslandRadiusAtAngle(island, index / 12 * Math.PI * 2)
          .toFixed(2)
      ).join(":"));
    expect(new Set(shorelineSignatures).size).toBe(islands.length);
  });

  it("builds broad multi-hill terrain instead of repeating centered cones", () => {
    const islands = createArchipelagoLayout();
    const offCenterPeaks = islands.filter((island) => {
      const center = islandTerrainHeight(island, 0, 0);
      const samples = Array.from({ length: 16 }, (_, index) => {
        const angle = index / 16 * Math.PI * 2;
        const boundary = archipelagoIslandRadiusAtAngle(island, angle);
        return islandTerrainHeight(
          island,
          Math.cos(angle) * boundary * island.xScale * 0.45,
          Math.sin(angle) * boundary * 0.45
        );
      });
      return Math.max(...samples) > center + 0.008;
    });
    expect(offCenterPeaks.length / islands.length).toBeGreaterThan(0.65);
  });

  it("keeps islands separate and every horizon shoreline attached to curved water", () => {
    const islands = createArchipelagoLayout();
    const mainExtent = ISLAND_TERRAIN_CONFIG.baseRadius * ISLAND_TERRAIN_CONFIG.xScale;
    for (const island of islands) {
      const distance = Math.hypot(island.x, island.z);
      const extent = island.radius * Math.max(1, island.xScale);
      expect(distance - extent).toBeGreaterThan(mainExtent + 2.4);
      expect(distance + extent).toBeLessThan(ARCHIPELAGO_CONFIG.maximumOuterRadius);
    }
    for (let left = 0; left < islands.length; left += 1) {
      for (let right = left + 1; right < islands.length; right += 1) {
        const a = islands[left]!;
        const b = islands[right]!;
        const distance = Math.hypot(a.x - b.x, a.z - b.z);
        expect(distance).toBeGreaterThan(
          a.radius * Math.max(1, a.xScale) +
          b.radius * Math.max(1, b.xScale) + 0.12
        );
      }
    }

    for (const island of islands.filter((item) => item.depthBand === "horizon")) {
      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * Math.PI * 2;
        const radius = archipelagoIslandRadiusAtAngle(island, angle);
        const localX = Math.cos(angle) * radius * island.xScale;
        const localZ = Math.sin(angle) * radius;
        const worldRadius = Math.hypot(island.x + localX, island.z + localZ);
        expect(islandTerrainHeight(island, localX, localZ)).toBeCloseTo(
          waterHeightAtRadius(worldRadius) + WATER_SURFACE_CONFIG.worldY +
            ARCHIPELAGO_CONFIG.shoreClearance,
          5
        );
      }
    }
  });

  it("merges all islands into one finite indexed geometry with normals", () => {
    const geometry = createArchipelagoGeometry();
    expect(geometry.index).not.toBeNull();
    expect(geometry.attributes.normal).toBeDefined();
    expect(geometry.attributes.color).toBeDefined();
    expect(geometry.attributes.position.count).toBeLessThan(6_000);
    expect(Array.from(geometry.attributes.position.array).every(Number.isFinite))
      .toBe(true);
    expect(Array.from(geometry.attributes.normal.array).every(Number.isFinite))
      .toBe(true);
    expect(ARCHIPELAGO_BAND_COLORS.horizon).not.toBe("#FFFFFF");
    const horizon = new THREE.Color(ARCHIPELAGO_BAND_COLORS.horizon);
    expect(horizon.g).toBeGreaterThan(horizon.r);
    expect(horizon.g).toBeGreaterThan(horizon.b);
    geometry.dispose();
  });
});
