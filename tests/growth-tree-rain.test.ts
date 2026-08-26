import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createGrowthTreeRain,
  GROWTH_TREE_RAIN_CONFIG,
  RAINY_SCENE_FILTER,
  setGrowthTreeRainEnabled,
  updateGrowthTreeRain
} from "@/src/components/growth-tree-rain";

describe("growth tree fine rain", () => {
  it("creates deterministic non-interactive fine rain streaks", () => {
    const rain = createGrowthTreeRain();
    expect(rain.lines.name).toBe("growth-tree-rain");
    expect(rain.lines).toBeInstanceOf(THREE.LineSegments);
    expect(rain.lines.geometry.attributes.position.count)
      .toBe(GROWTH_TREE_RAIN_CONFIG.count * 2);
    expect(GROWTH_TREE_RAIN_CONFIG.count).toBe(1200);
    expect(GROWTH_TREE_RAIN_CONFIG.opacity).toBeCloseTo(0.58);
    expect(GROWTH_TREE_RAIN_CONFIG.minimumLength).toBeCloseTo(0.16);
    expect(GROWTH_TREE_RAIN_CONFIG.maximumLength).toBeCloseTo(0.36);
    expect(GROWTH_TREE_RAIN_CONFIG.nearDropFraction).toBeCloseTo(0.25);
    expect(rain.lines.material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(rain.lines.material.transparent).toBe(true);
    expect(rain.lines.material.depthWrite).toBe(false);
    expect(rain.lines.material.vertexColors).toBe(true);
    expect(rain.lines.material.linewidth).toBe(1);
    const colors = rain.lines.geometry.attributes.color as
      THREE.BufferAttribute;
    expect(colors).toBeDefined();
    expect(colors.getX(0)).not.toBeCloseTo(colors.getX(colors.count - 1));
    expect(rain.lines.userData.deterministicSeed).toBeDefined();

    const hits = new THREE.Raycaster(
      new THREE.Vector3(0, 5, 5),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(rain.lines);
    expect(hits).toEqual([]);
    rain.dispose();
  });

  it("defines a subtle rainy grade for the canvas rather than the UI", () => {
    expect(RAINY_SCENE_FILTER).toContain("brightness(0.83)");
    expect(RAINY_SCENE_FILTER).toContain("saturate(0.96)");
    expect(RAINY_SCENE_FILTER).toContain("contrast(1.04)");
  });

  it("falls, wraps above the water, and follows one visibility switch", () => {
    const rain = createGrowthTreeRain();
    const positions = rain.lines.geometry.attributes.position as
      THREE.BufferAttribute;
    const initialY = positions.getY(0);

    updateGrowthTreeRain(rain, 0.25);
    expect(positions.getY(0)).toBeLessThan(initialY);
    updateGrowthTreeRain(rain, 100);
    expect(positions.getY(0)).toBeGreaterThanOrEqual(
      GROWTH_TREE_RAIN_CONFIG.minimumY
    );
    expect(positions.getY(0)).toBeLessThanOrEqual(
      GROWTH_TREE_RAIN_CONFIG.maximumY
    );

    setGrowthTreeRainEnabled(rain, false);
    expect(rain.lines.visible).toBe(false);
    setGrowthTreeRainEnabled(rain, true);
    expect(rain.lines.visible).toBe(true);
    rain.dispose();
  });
});
