# Natural Curved Tree Geometry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fixed-radius `TubeGeometry` branches with deterministic, tapered, naturally irregular swept meshes for the trunk, life-area branches, and Goal twigs.

**Architecture:** Keep `SemanticTreeSkeleton` as the source of semantic identity and Bézier paths. Add one pure Three.js geometry builder that samples each path into transported cross-section rings, interpolates radius, applies seeded irregularity, and closes the base and pointed tip. The existing semantic mesh factory remains responsible for materials and selection metadata.

**Tech Stack:** TypeScript, Three.js `BufferGeometry`, Vitest, Next.js

---

## File map

- Create `src/components/growth-tree-branch-geometry.ts`: pure branch mesh generation and validation.
- Create `tests/growth-tree-branch-geometry.test.ts`: shape, determinism, taper, cap, and invalid-input tests.
- Modify `src/components/growth-tree-semantic-geometry.ts`: consume the new geometry builder while preserving materials and interaction metadata.
- Modify `tests/growth-tree-semantic-geometry.test.ts`: replace the obsolete `TubeGeometry` assertion with integration assertions.

### Task 1: Specify and build the swept branch geometry

**Files:**
- Create: `tests/growth-tree-branch-geometry.test.ts`
- Create: `src/components/growth-tree-branch-geometry.ts`

- [ ] **Step 1: Write failing tests for deterministic taper and pointed tips**

Create a fixed cubic Bézier fixture and assert that `createNaturalBranchGeometry` returns a `THREE.BufferGeometry` with finite positions, normals and bounds. Assert that `getNaturalBranchProfile(options).ringRadii[0]` is greater than its final ring radius, `tipVertexCount` is one, and two calls produce identical position arrays.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/growth-tree-branch-geometry.test.ts`

Expected: FAIL because the geometry module does not exist.

- [ ] **Step 3: Implement the public geometry API**

Create these exports:

```ts
export type NaturalBranchGeometryOptions = {
  entityId: string;
  controlPoints: readonly [SceneVector, SceneVector, SceneVector, SceneVector];
  baseRadius: number;
  tipRadius: number;
  longitudinalSegments: number;
  radialSegments: number;
  irregularity: number;
  twist: number;
};

export type NaturalBranchProfile = {
  ringRadii: number[];
  ringCount: number;
  radialSegments: number;
  baseVertexCount: number;
  tipVertexCount: number;
};

export function getNaturalBranchProfile(
  options: NaturalBranchGeometryOptions
): NaturalBranchProfile;

export function createNaturalBranchGeometry(
  options: NaturalBranchGeometryOptions
): THREE.BufferGeometry;
```

Implementation rules: sample the cubic Bézier curve; build a stable transported local frame from each tangent; interpolate `baseRadius` to `tipRadius` with smoothstep; apply small deterministic `seedFromId` irregularity; connect adjacent rings; add a base-center fan and one pointed tip vertex; compute normals and bounds. Never call `Math.random()`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/growth-tree-branch-geometry.test.ts`

Expected: PASS.

### Task 2: Validate bad geometry inputs

**Files:**
- Modify: `tests/growth-tree-branch-geometry.test.ts`
- Modify: `src/components/growth-tree-branch-geometry.ts`

- [ ] **Step 1: Write failing validation tests**

Assert that zero or non-finite radii throw an error naming the field, and a `NaN` control point throws an error naming `controlPoints`. Assert that longitudinal counts below two and radial counts below three are clamped and still produce finite geometry.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/growth-tree-branch-geometry.test.ts`

Expected: FAIL on the new validation or clamping expectation.

- [ ] **Step 3: Add minimal validation and safe clamping**

Keep all buffer-safety validation inside the pure geometry module. Reject invalid numeric inputs before allocating arrays.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/growth-tree-branch-geometry.test.ts`

Expected: PASS.

### Task 3: Integrate natural geometry with semantic branches

**Files:**
- Modify: `tests/growth-tree-semantic-geometry.test.ts`
- Modify: `src/components/growth-tree-semantic-geometry.ts`

- [ ] **Step 1: Write a failing integration test**

Replace the `THREE.TubeGeometry` expectation. Assert that the Mesh uses a plain `THREE.BufferGeometry`, is not a `TubeGeometry`, keeps `MeshLambertMaterial`, and preserves `entityType`, `entityId`, `goalId`, and `leafId`. Add root, life-area, and Goal fixtures and assert their vertex counts decrease by hierarchy level.

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts`

Expected: FAIL because the semantic renderer still creates `TubeGeometry`.

- [ ] **Step 3: Route all semantic branch levels through the builder**

Use these initial profiles:

```ts
const profileByType = {
  root: { longitudinalSegments: 30, radialSegments: 12, irregularity: 0.045, twist: 0.16 },
  life_area: { longitudinalSegments: 18, radialSegments: 9, irregularity: 0.065, twist: 0.24 },
  long_goal: { longitudinalSegments: 12, radialSegments: 7, irregularity: 0.08, twist: 0.3 },
  short_goal: { longitudinalSegments: 12, radialSegments: 7, irregularity: 0.08, twist: 0.3 }
} as const;
```

Pass through the branch identity, control points, base radius and tip radius. Preserve existing vertex colors, healing-palette material state, interaction metadata and shadows.

- [ ] **Step 4: Run the integration test and verify GREEN**

Run: `npm test -- tests/growth-tree-semantic-geometry.test.ts`

Expected: PASS.

### Task 4: Regression verification and review handoff

**Files:**
- Modify only files above if a regression is found.

- [ ] **Step 1: Run focused tree tests**

Run: `npm test -- tests/growth-tree-branch-geometry.test.ts tests/growth-tree-semantic-geometry.test.ts tests/semantic-tree-skeleton.test.ts`

Expected: all tests PASS.

- [ ] **Step 2: Run the complete test suite**

Run: `npm test`

Expected: all tests PASS with no new warnings.

- [ ] **Step 3: Run static verification**

Run: `npm run typecheck`

Run: `git diff --check`

Expected: both commands exit 0.

- [ ] **Step 4: Start the local app for review**

Run: `npm run dev`

Expected: Next.js reports a local URL. Review `/dashboard` for a tapered trunk, seven naturally curved primary branches, pointed Goal twigs, and no obvious branch-junction gaps.

- [ ] **Step 5: Stop before commit**

Report changed files, test results and local URL. Do not stage or commit until the project owner explicitly approves it after code review.
