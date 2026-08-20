import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createWaterSurfaceGeometry,
  waterHeightAtRadius,
  WATER_SURFACE_CONFIG
} from "@/src/components/growth-tree-water-geometry";

describe("growth tree water surface geometry", () => {
  it("doubles the visible water diameter without adding vertices", () => {
    expect(WATER_SURFACE_CONFIG.outerRadius).toBe(40);
    expect(
      1 +
        WATER_SURFACE_CONFIG.radialRings *
          WATER_SURFACE_CONFIG.angularSegments
    ).toBeLessThanOrEqual(401);
  });

  it("stays nearly level around the complete island shoreline", () => {
    expect(WATER_SURFACE_CONFIG.flatRadius).toBeGreaterThan(6);
    expect(waterHeightAtRadius(0)).toBe(0);
    expect(waterHeightAtRadius(WATER_SURFACE_CONFIG.flatRadius)).toBe(0);
  });

  it("curves down only after the flat shoreline region", () => {
    expect(
      waterHeightAtRadius(WATER_SURFACE_CONFIG.curveStartRadius)
    ).toBe(0);
    const transitionRadius =
      (WATER_SURFACE_CONFIG.curveStartRadius +
        WATER_SURFACE_CONFIG.outerRadius) / 2;

    expect(waterHeightAtRadius(transitionRadius)).toBeLessThan(-0.1);
    expect(waterHeightAtRadius(WATER_SURFACE_CONFIG.outerRadius)).toBeLessThan(-3);
  });

  it("creates only a lightweight upward-facing circular surface", () => {
    const geometry = createWaterSurfaceGeometry();
    const positions = geometry.attributes.position;

    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry).not.toBeInstanceOf(THREE.SphereGeometry);
    expect(positions.count).toBeLessThanOrEqual(450);
    expect(geometry.index).not.toBeNull();

    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeLessThan(-3);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(0, 5);

    const normals = geometry.attributes.normal;
    let downwardNormals = 0;
    for (let index = 0; index < normals.count; index += 1) {
      if (normals.getY(index) <= 0) downwardNormals += 1;
    }
    expect(downwardNormals).toBe(0);
    geometry.dispose();
  });
});
