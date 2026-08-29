import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  ATMOSPHERIC_HAZE_CONFIG,
  createAtmosphericHaze,
  HORIZON_WISP_ANGLES,
  setAtmosphericHazeParameters,
  updateAtmosphericHaze
} from "@/src/components/growth-tree-atmospheric-haze";

describe("growth tree atmospheric haze", () => {
  it("creates one transparent back-facing horizon haze dome", () => {
    const haze = createAtmosphericHaze();
    expect(haze.name).toBe("growth-atmospheric-haze");
    expect(haze.geometry).toBeInstanceOf(THREE.SphereGeometry);
    expect(haze.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(haze.material.transparent).toBe(true);
    expect(haze.material.depthWrite).toBe(false);
    expect(haze.material.side).toBe(THREE.BackSide);
    expect("map" in haze.material).toBe(false);
    haze.geometry.dispose();
    haze.material.dispose();
  });

  it("builds separated gaseous cloud clusters around the horizon", () => {
    const haze = createAtmosphericHaze();
    expect(haze.material.fragmentShader).toContain("horizonBand");
    expect(haze.material.fragmentShader).toContain("horizonShift");
    expect(haze.material.fragmentShader).toContain("hazeNoise3");
    expect(haze.material.fragmentShader).toContain("hazeFbm");
    expect(haze.material.fragmentShader).toContain("domainWarp");
    expect(haze.material.fragmentShader).toContain("driftOffset");
    expect(haze.material.fragmentShader).toContain("cloudClusterMask");
    expect(haze.material.fragmentShader).toContain("cloudCore");
    expect(haze.material.fragmentShader).toContain("cloudSpread");
    expect(haze.material.fragmentShader).toContain("cloudWisps");
    expect(haze.material.fragmentShader).toContain("transparentGap");
    expect(haze.material.fragmentShader).toContain("horizonWispLayer");
    expect(haze.material.fragmentShader).toContain("horizonWisps");
    expect(haze.material.fragmentShader).toContain("topWispLayer");
    expect(haze.material.fragmentShader).toContain("topWisps");
    expect(haze.material.fragmentShader).toContain("topSkyMask");
    expect(haze.material.fragmentShader).toContain("wispIntensityNoise");
    expect(haze.material.fragmentShader).toContain("wispLocalIntensity");
    expect(haze.material.fragmentShader).toContain("wispFaintFloor = 0.18");
    expect(haze.material.fragmentShader).toContain("wispStrongCeiling = 1.0");
    expect(haze.material.fragmentShader).toContain("wispRetentionFloor = 0.32");
    expect(haze.material.fragmentShader).toContain("baseHorizonWisps");
    expect(haze.material.fragmentShader).toContain("baseTopWisps");
    expect(haze.material.fragmentShader).toContain("baseCloudAlpha");
    expect(haze.material.fragmentShader).toContain("dynamicCloudAlpha");
    expect(haze.material.fragmentShader).toContain("baseWispOpacityCeiling = 0.25");
    expect(haze.material.fragmentShader).toMatch(
      /float baseWispPhase = [^;]+;/
    );
    expect(haze.material.fragmentShader).not.toMatch(
      /float baseWispPhase = [^;]*hazeTime[^;]*;/
    );
    expect(haze.material.fragmentShader).toContain("cloudCoreWeight = 0.12");
    expect(haze.material.fragmentShader)
      .toContain("vec3 cloudColor = vec3(1.0)");
    expect(haze.material.fragmentShader).not.toContain("coolHaze");
    expect(haze.material.fragmentShader).not.toContain("warmHaze");
    expect(haze.material.fragmentShader).not.toContain("irregularDensity");
    for (const angle of Object.values(HORIZON_WISP_ANGLES)) {
      expect(Math.abs(angle)).toBeGreaterThanOrEqual(12);
      expect(Math.abs(angle)).toBeLessThanOrEqual(28);
    }
    expect(haze.material.fragmentShader).not.toContain("sampler2D");
    haze.geometry.dispose();
    haze.material.dispose();
  });

  it("exposes density, opacity, scale, drift, and morph controls", () => {
    const haze = createAtmosphericHaze();
    updateAtmosphericHaze(haze.material, 7.5);
    setAtmosphericHazeParameters(haze.material, {
      density: .7,
      opacity: .24,
      scale: 2.2,
      driftSpeed: .03,
      morphSpeed: .02
    });
    expect(haze.material.uniforms.hazeTime.value).toBe(7.5);
    expect(haze.material.uniforms.hazeDensity.value).toBe(.7);
    expect(haze.material.uniforms.hazeOpacity.value).toBe(.24);
    expect(haze.material.uniforms.hazeScale.value).toBe(2.2);
    expect(haze.material.uniforms.hazeDriftSpeed.value).toBe(.03);
    expect(haze.material.uniforms.hazeMorphSpeed.value).toBe(.02);
    expect(ATMOSPHERIC_HAZE_CONFIG.opacity).toBeLessThanOrEqual(1);
    haze.geometry.dispose();
    haze.material.dispose();
  });
});
