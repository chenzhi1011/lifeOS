import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createWaterSurfaceGeometry,
  waterHeightAtRadius,
  WATER_SURFACE_CONFIG
} from "@/src/components/growth-tree-water-geometry";
import {
  createWaterSurfaceTexture,
  createWaterShoreDistanceTexture,
  WATER_DEPTH_TEXTURE_CONFIG,
  shoreDistanceAt,
  waterColorAt,
  waterShoreBandsAt,
  waterShallowFactorAt
} from "@/src/components/growth-tree-water-texture";
import {
  createArchipelagoLayout,
  archipelagoIslandRadiusAtAngle
} from "@/src/components/growth-tree-archipelago-geometry";
import {
  ISLAND_TERRAIN_CONFIG,
  islandRadiusAtAngle
} from "@/src/components/growth-tree-island-geometry";
import {
  createWaterRippleMaterial,
  setWaterRainEnabled,
  setWaterSparkleParameters,
  setWaterRippleParameters,
  updateWaterRippleTime,
  WATER_RIPPLE_CONFIG,
  WATER_SPARKLE_CONFIG
} from "@/src/components/growth-tree-water-material";

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
    expect(WATER_SURFACE_CONFIG.worldY).toBe(-0.08);
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
    expect(geometry.attributes.uv).toBeDefined();
    expect(geometry.attributes.uv.count).toBe(positions.count);

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

  it("generates a geographic blue-green depth texture with tonal variation", () => {
    const texture = createWaterSurfaceTexture();
    const data = texture.image.data as Uint8Array;
    const redValues = Array.from(
      { length: data.length / 4 },
      (_, index) => data[index * 4]!
    );

    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.name).toBe("growth-water-depth-texture");
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(Math.max(...redValues) - Math.min(...redValues)).toBeGreaterThan(80);
    texture.dispose();
  });

  it("uses a warm sand color at the shoreline instead of white", () => {
    const [red, green, blue] = WATER_DEPTH_TEXTURE_CONFIG.sandColor;
    expect(red).toBeGreaterThan(blue);
    expect(green).toBeGreaterThan(blue);
    expect(blue).toBeLessThan(180);
    expect(red - blue).toBeGreaterThan(40);
    expect(Math.max(...WATER_DEPTH_TEXTURE_CONFIG.sandColor)).toBeLessThan(220);
    expect(Math.max(...waterColorAt(0, 0))).toBeLessThan(220);
  });

  it("uses RGB 58 151 228 everywhere outside the sand transition", () => {
    expect(WATER_DEPTH_TEXTURE_CONFIG.seaColor).toEqual([58, 151, 228]);
    const farWaterColors = Array.from({ length: 20 * 20 }, (_, index) => {
      const x = index % 20 / 19 * 70 - 35;
      const z = Math.floor(index / 20) / 19 * 70 - 35;
      return { color: waterColorAt(x, z), factor: waterShallowFactorAt(x, z) };
    }).filter((sample) => sample.factor < .05)
      .map((sample) => sample.color);
    expect(farWaterColors.length).toBeGreaterThan(20);
    expect(farWaterColors.every((color) =>
      color[0] === 58 && color[1] === 151 && color[2] === 228
    )).toBe(true);
  });

  it("uses independently irregular shore bands instead of uniform rings", () => {
    const samples = Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2;
      const radius = islandRadiusAtAngle(angle);
      return waterShoreBandsAt(
        Math.cos(angle) * radius * ISLAND_TERRAIN_CONFIG.xScale,
        Math.sin(angle) * radius
      );
    });
    const sandWidths = samples.map((sample) => sample.sand);
    const shallowWidths = samples.map((sample) => sample.shallow);
    const bandGaps = samples.map((sample) => sample.shallow - sample.sand);

    expect(Math.max(...sandWidths) - Math.min(...sandWidths)).toBeGreaterThan(.45);
    expect(Math.max(...shallowWidths) - Math.min(...shallowWidths)).toBeGreaterThan(.8);
    expect(Math.max(...bandGaps) - Math.min(...bandGaps)).toBeGreaterThan(.4);
  });

  it("follows the exact main-island and small-island shore shapes", () => {
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const radius = islandRadiusAtAngle(angle) + .45;
      expect(waterShallowFactorAt(
        Math.cos(angle) * radius * ISLAND_TERRAIN_CONFIG.xScale,
        Math.sin(angle) * radius
      )).toBeGreaterThan(.7);
    }

    for (const island of createArchipelagoLayout()) {
      const angle = island.shorelinePhase;
      const radius = archipelagoIslandRadiusAtAngle(island, angle) + .35;
      expect(waterShallowFactorAt(
        island.x + Math.cos(angle) * radius * island.xScale,
        island.z + Math.sin(angle) * radius
      )).toBeGreaterThan(.7);
    }
  });

  it("uses deeper water away from every shoreline", () => {
    const samples = Array.from({ length: 24 * 24 }, (_, index) => {
      const x = index % 24 / 23 * 70 - 35;
      const z = Math.floor(index / 24) / 23 * 70 - 35;
      return waterShallowFactorAt(x, z);
    });
    expect(Math.min(...samples)).toBeLessThan(.05);
    expect(Math.max(...samples)).toBeGreaterThan(.85);
  });

  it("encodes distance from the real irregular shore for radiating ripples", () => {
    const angle = 1.17;
    const radius = islandRadiusAtAngle(angle);
    expect(shoreDistanceAt(
      Math.cos(angle) * radius * ISLAND_TERRAIN_CONFIG.xScale,
      Math.sin(angle) * radius
    )).toBeCloseTo(0, 5);
    expect(shoreDistanceAt(9, 9)).toBeGreaterThan(1);

    const texture = createWaterShoreDistanceTexture();
    expect(texture).toBeInstanceOf(THREE.DataTexture);
    expect(texture.format).toBe(THREE.RedFormat);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    texture.dispose();
  });

  it("injects ambient and shore-radiating teal ripples without moving vertices", () => {
    const material = createWaterRippleMaterial();
    const shader = {
      uniforms: {} as Record<string, { value: number }>,
      vertexShader: "#include <common>\n#include <begin_vertex>",
      fragmentShader: "#include <common>\n#include <map_fragment>"
    };
    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.uniforms.waterRippleTime).toBeDefined();
    expect(shader.uniforms.waterRippleAmplitude).toBeDefined();
    expect(shader.uniforms.waterRippleSpeed).toBeDefined();
    expect(shader.uniforms.waterRippleFrequency).toBeDefined();
    expect(shader.uniforms.waterShoreDistanceMap).toBeDefined();
    expect(shader.uniforms.waterSparkleGroupADensity).toBeDefined();
    expect(shader.uniforms.waterSparkleGroupBDensity).toBeDefined();
    expect(shader.uniforms.waterSparkleIntensity).toBeDefined();
    expect(shader.uniforms.waterSparkleSpeed).toBeDefined();
    expect(shader.uniforms.waterSparkleCrossfadeSpeed).toBeDefined();
    expect(shader.uniforms.waterRainEnabled).toBeDefined();
    expect(shader.fragmentShader).toContain("seaMask");
    expect(shader.fragmentShader).toContain("baseCrest");
    expect(shader.fragmentShader).toContain("waterValueNoise");
    expect(shader.fragmentShader).toContain("waterThinRipple");
    expect(shader.fragmentShader).toContain("flowUvA");
    expect(shader.fragmentShader).toContain("flowUvB");
    expect(shader.fragmentShader).toContain("flowUvC");
    expect(shader.fragmentShader).toContain("thinRippleA");
    expect(shader.fragmentShader).toContain("thinRippleB");
    expect(shader.fragmentShader).toContain("thinRippleC");
    expect(shader.fragmentShader).not.toContain("basePhaseA");
    expect(shader.fragmentShader).toContain("islandCrest");
    expect(shader.fragmentShader).toContain("islandFade");
    expect(shader.fragmentShader).toContain("waterHash21");
    expect(shader.fragmentShader).toContain("sparklePulse");
    expect(shader.fragmentShader).toContain("sparkleFarFade");
    expect(shader.fragmentShader).toContain("groupAVisibility");
    expect(shader.fragmentShader).toContain("groupBVisibility = 1.0 - groupAVisibility");
    expect(shader.fragmentShader).toContain("sparkleSeedA");
    expect(shader.fragmentShader).toContain("sparkleSeedB");
    expect(shader.fragmentShader).toContain("waterRainImpactRipple");
    expect(shader.fragmentShader).toContain("rainImpactProbability");
    expect(shader.fragmentShader).toContain("rainImpactLife");
    expect(shader.fragmentShader).toContain("rainShoreMask");
    expect(shader.fragmentShader).toContain("smoothstep");
    expect(shader.fragmentShader).not.toContain("vec3(1.0)");
    expect(shader.vertexShader).not.toContain("transformed.y +=");
    expect(WATER_RIPPLE_CONFIG.amplitude).toBeGreaterThan(0);
    expect(WATER_RIPPLE_CONFIG.speed).toBeGreaterThan(0);
    expect(WATER_RIPPLE_CONFIG.frequency).toBeGreaterThan(0);
    expect(WATER_SPARKLE_CONFIG.groupADensity)
      .toBeGreaterThan(WATER_SPARKLE_CONFIG.groupBDensity);
    expect(WATER_SPARKLE_CONFIG.groupBDensity).toBeGreaterThan(0);
    expect(WATER_SPARKLE_CONFIG.sparkleIntensity).toBeLessThan(.6);

    updateWaterRippleTime(material, 4.25);
    expect(shader.uniforms.waterRippleTime!.value).toBe(4.25);
    setWaterRippleParameters(material, {
      amplitude: .08,
      speed: .6,
      frequency: 1.2
    });
    expect(shader.uniforms.waterRippleAmplitude!.value).toBe(.08);
    expect(shader.uniforms.waterRippleSpeed!.value).toBe(.6);
    expect(shader.uniforms.waterRippleFrequency!.value).toBe(1.2);
    setWaterSparkleParameters(material, {
      groupADensity: .16,
      groupBDensity: .06,
      sparkleIntensity: .32,
      sparkleSpeed: .75,
      crossfadeSpeed: .4
    });
    expect(shader.uniforms.waterSparkleGroupADensity!.value).toBe(.16);
    expect(shader.uniforms.waterSparkleGroupBDensity!.value).toBe(.06);
    expect(shader.uniforms.waterSparkleIntensity!.value).toBe(.32);
    expect(shader.uniforms.waterSparkleSpeed!.value).toBe(.75);
    expect(shader.uniforms.waterSparkleCrossfadeSpeed!.value).toBe(.4);
    setWaterRainEnabled(material, false);
    expect(shader.uniforms.waterRainEnabled!.value).toBe(0);
    setWaterRainEnabled(material, true);
    expect(shader.uniforms.waterRainEnabled!.value).toBe(1);
    material.map!.dispose();
    material.dispose();
  });
});
