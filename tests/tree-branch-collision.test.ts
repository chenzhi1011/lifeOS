import { describe, expect, it } from "vitest";
import {
  branchesCollide,
  type CollisionBranch
} from "@/src/domain/tree-branch-collision";

function branch(
  entityId: string,
  parentEntityId: string | null,
  controlPoints: CollisionBranch["controlPoints"],
  radius = 0.12
): CollisionBranch {
  return {
    entityId,
    parentEntityId,
    controlPoints,
    baseRadius: radius,
    tipRadius: radius * 0.35
  };
}

const trunk = branch("root", null, [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 1.3, z: 0 },
  { x: 0, y: 2.7, z: 0 },
  { x: 0, y: 4, z: 0 }
], 0.3);

describe("tree branch collision", () => {
  it("detects intersecting curved branch capsules", () => {
    const horizontal = branch("other", null, [
      { x: -1, y: 2, z: 0 },
      { x: -0.4, y: 2, z: 0 },
      { x: 0.4, y: 2, z: 0 },
      { x: 1, y: 2, z: 0 }
    ]);

    expect(branchesCollide(horizontal, trunk)).toBe(true);
  });

  it("does not report separated branch capsules", () => {
    const separated = branch("other", null, [
      { x: 2, y: 1, z: 0 },
      { x: 2.3, y: 1.5, z: 0 },
      { x: 2.6, y: 2, z: 0 },
      { x: 3, y: 2.5, z: 0 }
    ]);

    expect(branchesCollide(separated, trunk)).toBe(false);
  });

  it("allows the child root inside its parent but rejects re-entry", () => {
    const safelyForked = branch("child", "root", [
      { x: 0, y: 2, z: 0 },
      { x: 0.7, y: 2.2, z: 0 },
      { x: 1.4, y: 2.6, z: 0 },
      { x: 2, y: 3, z: 0 }
    ]);
    const reEntering = branch("child", "root", [
      { x: 0, y: 2, z: 0 },
      { x: 1.2, y: 2.2, z: 0 },
      { x: 1.2, y: 3, z: 0 },
      { x: 0, y: 3.3, z: 0 }
    ]);

    expect(branchesCollide(safelyForked, trunk)).toBe(false);
    expect(branchesCollide(reEntering, trunk)).toBe(true);
  });

  it("allows sibling roots to share a fork but rejects later crossing", () => {
    const left = branch("left", "root", [
      { x: 0, y: 2, z: 0 },
      { x: -0.8, y: 2.3, z: 0 },
      { x: -1.4, y: 2.8, z: 0 },
      { x: -2, y: 3.2, z: 0 }
    ]);
    const right = branch("right", "root", [
      { x: 0, y: 2, z: 0 },
      { x: 0.8, y: 2.3, z: 0 },
      { x: 1.4, y: 2.8, z: 0 },
      { x: 2, y: 3.2, z: 0 }
    ]);
    const crossing = branch("crossing", "root", [
      { x: 0, y: 2, z: 0 },
      { x: 0.8, y: 2.3, z: 0 },
      { x: -1.2, y: 2.8, z: 0 },
      { x: -2, y: 3.2, z: 0 }
    ]);

    expect(branchesCollide(right, left)).toBe(false);
    expect(branchesCollide(crossing, left)).toBe(true);
  });
});
