import { describe, expect, it } from "vitest";
import {
  GROWTH_TREE_CAMERA_LIMITS,
  resolveMaximumPolarAngle
} from "@/src/components/growth-tree-camera-constraints";
import { GROWTH_SCENE_CONFIG } from "@/src/components/growth-tree/scene-config";

describe("growth tree camera constraints", () => {
  it("allows full horizontal orbit with 45 degree top-down and 30 degree low-angle limits", () => {
    expect(GROWTH_TREE_CAMERA_LIMITS.minimumPolarAngle)
      .toBeCloseTo(Math.PI / 4);
    expect(GROWTH_TREE_CAMERA_LIMITS.maximumUserPolarAngle)
      .toBeCloseTo(Math.PI * 2 / 3);
    expect(GROWTH_TREE_CAMERA_LIMITS.minimumAzimuthAngle)
      .toBe(Number.NEGATIVE_INFINITY);
    expect(GROWTH_TREE_CAMERA_LIMITS.maximumAzimuthAngle)
      .toBe(Number.POSITIVE_INFINITY);
  });

  it("reduces low-angle viewing as distance grows to keep the camera above ground", () => {
    const near = resolveMaximumPolarAngle({
      distance: 5.2,
      targetY: 2.45
    });
    const far = resolveMaximumPolarAngle({
      distance: 12,
      targetY: 2.45
    });
    const nearHeight = 2.45 + 5.2 * Math.cos(near);
    const farHeight = 2.45 + 12 * Math.cos(far);

    expect(near).toBeLessThanOrEqual(Math.PI * 2 / 3);
    expect(far).toBeLessThan(near);
    expect(nearHeight).toBeGreaterThanOrEqual(
      GROWTH_TREE_CAMERA_LIMITS.minimumCameraY - 1e-9
    );
    expect(farHeight).toBeGreaterThanOrEqual(
      GROWTH_TREE_CAMERA_LIMITS.minimumCameraY - 1e-9
    );
  });

  it("rejects a non-positive orbit distance", () => {
    expect(() => resolveMaximumPolarAngle({
      distance: 0,
      targetY: 2.45
    })).toThrow(/distance/);
  });

  it("orbits around the tree trunk world axis", () => {
    expect(GROWTH_SCENE_CONFIG.treeOrbitTarget.x)
      .toBe(GROWTH_SCENE_CONFIG.treeOffsetX);
    expect(GROWTH_SCENE_CONFIG.treeOrbitTarget.z).toBe(0);
  });
});
