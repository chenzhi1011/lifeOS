import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  createNaturalBranchGeometry,
  getNaturalBranchProfile,
  type NaturalBranchGeometryOptions
} from "@/src/components/growth-tree-branch-geometry";

const options: NaturalBranchGeometryOptions = {
  entityId: "health",
  controlPoints: [
    { x: 0, y: 1, z: 0 },
    { x: 0.2, y: 1.5, z: -0.1 },
    { x: 0.55, y: 1.9, z: 0.25 },
    { x: 1, y: 2.3, z: 0.4 }
  ],
  baseRadius: 0.24,
  tipRadius: 0.055,
  longitudinalSegments: 12,
  radialSegments: 8,
  irregularity: 0.06,
  twist: 0.22
};

describe("natural branch geometry", () => {
  it("creates a deterministic tapered branch with one pointed tip", () => {
    const profile = getNaturalBranchProfile(options);
    const first = createNaturalBranchGeometry(options);
    const second = createNaturalBranchGeometry(options);
    const positions = Array.from(first.attributes.position.array);

    expect(first).toBeInstanceOf(THREE.BufferGeometry);
    expect(profile.ringRadii[0]).toBeGreaterThan(profile.ringRadii.at(-1)!);
    expect(profile.tipVertexCount).toBe(1);
    expect(profile.baseVertexCount).toBe(1);
    expect(positions.every(Number.isFinite)).toBe(true);
    expect(first.attributes.normal).toBeDefined();
    expect(first.boundingBox).not.toBeNull();
    expect(first.boundingSphere).not.toBeNull();
    expect(positions).toEqual(Array.from(second.attributes.position.array));
  });

  it("rejects invalid radii and control points before building buffers", () => {
    expect(() => createNaturalBranchGeometry({
      ...options,
      baseRadius: 0
    })).toThrow(/baseRadius/);
    expect(() => createNaturalBranchGeometry({
      ...options,
      tipRadius: Number.POSITIVE_INFINITY
    })).toThrow(/tipRadius/);
    expect(() => createNaturalBranchGeometry({
      ...options,
      controlPoints: [
        { x: Number.NaN, y: 1, z: 0 },
        options.controlPoints[1],
        options.controlPoints[2],
        options.controlPoints[3]
      ]
    })).toThrow(/controlPoints/);
  });

  it("clamps unsafe segment counts to finite minimum geometry", () => {
    const profile = getNaturalBranchProfile({
      ...options,
      longitudinalSegments: 0,
      radialSegments: 1
    });
    const geometry = createNaturalBranchGeometry({
      ...options,
      longitudinalSegments: 0,
      radialSegments: 1
    });

    expect(profile.ringCount).toBe(2);
    expect(profile.radialSegments).toBe(3);
    expect(Array.from(geometry.attributes.position.array).every(Number.isFinite))
      .toBe(true);
  });

  it("winds every branch side toward the visible outside surface", () => {
    const geometry = createNaturalBranchGeometry({
      ...options,
      entityId: "straight-branch",
      controlPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 3, z: 0 }
      ],
      irregularity: 0,
      twist: 0
    });
    const position = geometry.attributes.position;
    const index = geometry.index!;
    const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(0));
    const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(1));
    const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(2));
    const faceNormal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const faceCenter = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const outward = new THREE.Vector3(faceCenter.x, 0, faceCenter.z).normalize();

    expect(faceNormal.dot(outward)).toBeGreaterThan(0.9);
  });
});
