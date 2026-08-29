# Activity Leaf Twig Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-Activity-one-twig layout with stable Goal-owned fine twigs that each carry at most 20 Activity leaves in a staggered, approximately opposite arrangement.

**Architecture:** The domain skeleton will decide grouping and placement: it groups visible Activities by Goal, fills each fine twig sequentially to a capacity of 20, and emits shared `LeafTwig` records plus leaf-specific petioles and transforms. The Three.js layer will consume those records, merge each shared twig exactly once, keep Activity leaves instanced, and preserve the existing `instanceId -> Activity` interaction mapping.

**Tech Stack:** TypeScript, Three.js, Next.js, Vitest.

**Review policy:** Do not commit any task automatically. After implementation and verification, leave all changes uncommitted for user review.

---

## File map

- Modify `src/domain/semantic-tree-skeleton.ts`: own Activity grouping, shared fine-twig generation, staggered leaf placement, and deterministic ordering.
- Modify `src/domain/tree-visualization.ts`: expose shared fine twigs in `GrowthTreeViewModel`.
- Modify `src/components/growth-tree-semantic-geometry.ts`: merge shared twigs once and leaf petioles once; retain instanced leaf rendering.
- Modify `src/components/RealisticGrowthTree.tsx`: pass shared twigs and visible leaves into the geometry batch.
- Modify `tests/semantic-tree-skeleton.test.ts`: verify capacity, new-twig threshold, stable ordering, alternating sides, and non-coplanar placement.
- Modify `tests/growth-tree-semantic-geometry.test.ts`: verify the twig batch accepts shared twigs without duplication.
- Modify `tests/growth-tree-geometry.test.ts`: update the view-model fixture and preserve layer interaction/disposal assertions.
- Modify `tests/growth-tree-dashboard.test.tsx` and `tests/growth-tree-details-panel.test.tsx`: add the new view-model field to explicit fixtures.
- Modify `tests/mature-growth-tree-mock.test.ts`: verify mature mock leaf count and per-twig capacity.

---

### Task 1: Make shared Activity twigs part of the domain contract

**Files:**
- Modify: `src/domain/semantic-tree-skeleton.ts`
- Modify: `src/domain/tree-visualization.ts`
- Test: `tests/semantic-tree-skeleton.test.ts`

- [ ] **Step 1: Add a failing contract test for shared twigs**

Add assertions that the skeleton returns `leafTwigs`, each leaf references one by `twigId`, and no leaf embeds its own full twig:

```ts
const result = skeleton();
const twigIds = new Set(result.leafTwigs.map((twig) => twig.id));

expect(result.leafTwigs.length).toBeGreaterThan(0);
expect(result.leaves.every((leaf) => twigIds.has(leaf.twigId))).toBe(true);
expect(result.leaves.every((leaf) => !("twig" in leaf))).toBe(true);
```

- [ ] **Step 2: Run the focused test and confirm the intended failure**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts
```

Expected: FAIL because `leafTwigs` and `SemanticLeaf.twigId` do not exist.

- [ ] **Step 3: Change the skeleton types**

Replace the embedded twig contract with a shared reference:

```ts
export const ACTIVITY_LEAVES_PER_TWIG = 20;

export type SemanticLeaf = {
  activityId: string;
  goalId: string;
  twigId: string;
  side: -1 | 1;
  petiole: LeafTwig;
  anchor: SceneVector;
  direction: SceneVector;
  roll: number;
  rotation: SceneVector;
  scale: number;
  visible: boolean;
};

export type SemanticTreeSkeleton = {
  branches: SemanticBranch[];
  leafTwigs: LeafTwig[];
  leaves: SemanticLeaf[];
};
```

- [ ] **Step 4: Propagate shared twigs through the view model**

Update `GrowthTreeViewModel` and its builder:

```ts
import {
  buildSemanticTreeSkeleton,
  type LeafTwig,
  type SemanticBranch,
  type SemanticLeaf
} from "./semantic-tree-skeleton";

export type GrowthTreeViewModel = {
  recipe: TreeRecipe;
  branches: SemanticBranch[];
  semanticLeafTwigs: LeafTwig[];
  semanticLeaves: SemanticLeaf[];
  root: TreeWood;
  lifeAreaBranches: TreeWood[];
  longGoalTwigs: TreeWood[];
  shortGoalBranches: TreeWood[];
  activityLeaves: ActivityLeaf[];
  vitalityElements: VitalityElement[];
  diagnostics: TreeDiagnostic[];
};
```

Return `semanticLeafTwigs: skeleton.leafTwigs` beside `semanticLeaves: skeleton.leaves`.

- [ ] **Step 5: Run typecheck to expose every fixture that needs the new field**

Run:

```bash
npm run typecheck
```

Expected: FAIL only at code and test fixtures that construct `GrowthTreeViewModel` without `semanticLeafTwigs` or still access `leaf.twig`.

---

### Task 2: Group Activities by Goal and fill one twig to 20 leaves

**Files:**
- Modify: `src/domain/semantic-tree-skeleton.ts`
- Test: `tests/semantic-tree-skeleton.test.ts`
- Test: `tests/mature-growth-tree-mock.test.ts`

- [ ] **Step 1: Add test data with 41 Activities under one Goal**

Build a test state by copying one completed Activity and its completed Task 41 times with stable IDs and increasing dates. Assert the capacity boundary:

```ts
const result = skeleton(stateWithActivityCount(41));
const goalLeaves = result.leaves.filter((leaf) => leaf.goalId === "aws");
const goalTwigs = result.leafTwigs.filter(
  (twig) => twig.parentEntityId === "aws"
);
const counts = new Map<string, number>();
for (const leaf of goalLeaves) {
  counts.set(leaf.twigId, (counts.get(leaf.twigId) ?? 0) + 1);
}

expect(goalTwigs).toHaveLength(3);
expect([...counts.values()]).toEqual([20, 20, 1]);
```

Also test 20 and 21 explicitly:

```ts
expect(twigCountFor(20)).toBe(1);
expect(twigCountFor(21)).toBe(2);
```

- [ ] **Step 2: Run the capacity tests and confirm they fail**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts
```

Expected: FAIL because every Activity currently creates an independent twig.

- [ ] **Step 3: Add stable Activity ordering and chunking helpers**

Use occurrence/completion chronology first and ID as the final tie breaker:

```ts
function orderedGoalActivities(data: DashboardData, goalId: string) {
  return data.allActivities
    .filter((activity) => activity.goalId === goalId)
    .sort((left, right) =>
      left.occurredOn.localeCompare(right.occurredOn) ||
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id)
    );
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, index) => items.slice(index * size, (index + 1) * size)
  );
}
```

- [ ] **Step 4: Generate one shared fine twig per chunk**

Create `goalLeafTwig(parent, twigIndex, twigCount)` with stratified stable randomness. Divide curve progress `0.25–0.9` into `twigCount` strata and keep each twig inside its own stratum:

```ts
const minimumProgress = .25;
const maximumProgress = .9;
const stratumSize = (maximumProgress - minimumProgress) / twigCount;
const stratumStart = minimumProgress + twigIndex * stratumSize;
const randomOffset = .2 + seedFromId(
  `${parent.entityId}:${twigIndex}`,
  "twig-progress"
) * .6;
const progress = stratumStart + stratumSize * randomOffset;
```

Enforce a minimum progress gap of `min(.12, stratumSize)` from the previous twig and clamp the final value to its own stratum. Select outward direction from four rotating sectors—left, front, right, back—and add no more than ±12 degrees of stable jitter within that sector. Keep `baseRadius` and `tipRadius` equal to `CANOPY_TWIG_RADIUS`. Give each twig a stable ID:

```ts
id: `goal-leaf-twig-${parent.entityId}-${twigIndex}`
```

Store `attachmentProgress` and `directionSector` on `LeafTwig`; tests can then verify spacing and directional coverage without approximately projecting points back onto the Bézier curve.

- [ ] **Step 5: Build skeleton output by Goal rather than by Activity**

For each Goal branch:

```ts
const groups = chunks(
  orderedGoalActivities(data, parent.entityId),
  ACTIVITY_LEAVES_PER_TWIG
);

groups.forEach((activities, twigIndex) => {
  const twig = goalLeafTwig(parent, twigIndex, groups.length);
  leafTwigs.push(twig);
  activities.forEach((activity, leafIndex) => {
    leaves.push(activityLeafOnTwig(activity, twig, leafIndex, activities.length));
  });
});
```

Continue calculating `visible` from the existing recent-Activity and canopy-retention rules; do not synthesize decorative leaves.

- [ ] **Step 6: Run the focused tests**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts tests/mature-growth-tree-mock.test.ts
```

Expected: PASS for 20/21/41 capacity, deterministic regeneration, and mature mock Activity count.

---

### Task 3: Place 10–20 leaves in staggered opposite rows

**Files:**
- Modify: `src/domain/semantic-tree-skeleton.ts`
- Test: `tests/semantic-tree-skeleton.test.ts`

- [ ] **Step 1: Add failing spatial-layout assertions**

For a full 20-leaf twig, verify both sides, distinct attachment progress, downward bias, short petioles, and non-identical orientations:

```ts
const twigLeaves = result.leaves.filter((leaf) => leaf.twigId === twig.id);
expect(twigLeaves.filter((leaf) => leaf.side === -1)).toHaveLength(10);
expect(twigLeaves.filter((leaf) => leaf.side === 1)).toHaveLength(10);
expect(new Set(twigLeaves.map((leaf) => leaf.petiole.controlPoints[0]))).not.toHaveLength(1);
expect(twigLeaves.every((leaf) => leaf.direction.y <= .08)).toBe(true);
expect(new Set(twigLeaves.map((leaf) => leaf.roll)).size).toBeGreaterThan(4);
expect(twigLeaves.every((leaf) => petioleLength(leaf) <= .035)).toBe(true);
```

Compare the two side sets and assert their attachment points are staggered along the curve rather than identical pairs.

- [ ] **Step 2: Run the spatial test and confirm it fails**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts
```

Expected: FAIL because current leaves each sit at the end of their own twig.

- [ ] **Step 3: Add a cubic-curve tangent helper for `LeafTwig`**

Generalize the existing Bézier helper or add a `leafTwigFrame` helper returning point, tangent, and side axis at progress. Handle near-vertical tangents with a stable fallback axis:

```ts
let sideAxis = cross(tangent, v(0, 1, 0));
if (length(sideAxis) < .0001) sideAxis = v(1, 0, 0);
sideAxis = normalized(sideAxis);
```

- [ ] **Step 4: Implement staggered opposite placement**

For `leafIndex` in a group:

```ts
const side: -1 | 1 = leafIndex % 2 === 0 ? -1 : 1;
const pairIndex = Math.floor(leafIndex / 2);
const pairCount = Math.ceil(groupSize / 2);
const baseProgress = .14 + (pairIndex / Math.max(1, pairCount - 1)) * .76;
const stagger = side === 1 ? .018 : -.018;
const progress = clamp(baseProgress + stagger, .1, .92);
```

Build leaf direction from the local side axis, a small forward component, deterministic circumferential variation, and gravity:

```ts
const direction = normalized(add(
  scale(sideAxis, side),
  scale(tangent, .18),
  v(0, -.22 - seedFromId(activity.id, "droop") * .12, 0)
));
```

Use a petiole length between `.022` and `.035`. Set `roll` to a bounded deterministic variation rather than an unrestricted common-plane value.

- [ ] **Step 5: Keep partial twigs visually progressive**

Use the twig's fixed 20-slot layout when computing progress, so the first Activities occupy the inner portion and later Activities extend toward the tip. Do not rescale all existing leaf positions when the 11th or 20th Activity arrives:

```ts
const pairIndex = Math.floor(leafIndex / 2);
const baseProgress = .14 + (pairIndex / 9) * .76;
```

- [ ] **Step 6: Run skeleton tests and inspect deterministic snapshots/assertions**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts
```

Expected: PASS; calling the builder twice with the same input returns deeply equal `leafTwigs` and `leaves`.

---

### Task 4: Render every shared twig exactly once

**Files:**
- Modify: `src/components/growth-tree-semantic-geometry.ts`
- Modify: `src/components/RealisticGrowthTree.tsx`
- Test: `tests/growth-tree-semantic-geometry.test.ts`
- Test: `tests/growth-tree-geometry.test.ts`

- [ ] **Step 1: Add a failing geometry-batch test**

Create one shared twig and two leaves with separate petioles. Assert the batch contains one twig geometry plus two petiole geometries, not two copies of the shared twig:

```ts
const mesh = createActivityLeafTwigBatch([sharedTwig], [leftLeaf, rightLeaf]);
expect(mesh.name).toBe("activity-leaf-twigs");
expect(mesh.userData.sharedTwigCount).toBe(1);
expect(mesh.userData.petioleCount).toBe(2);
```

- [ ] **Step 2: Run the focused geometry test and confirm it fails**

Run:

```bash
npm test -- tests/growth-tree-semantic-geometry.test.ts
```

Expected: FAIL because the current batch reads `leaf.twig` and duplicates twig geometry per leaf.

- [ ] **Step 3: Change the batch API**

Implement:

```ts
export function createActivityLeafTwigBatch(
  twigs: LeafTwig[],
  leaves: SemanticLeaf[]
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const parts = [
    ...twigs.map(twigGeometry),
    ...leaves.map((leaf) => twigGeometry(leaf.petiole))
  ];
  const geometry = parts.length > 0
    ? mergeGeometries(parts, false) ?? new THREE.BufferGeometry()
    : new THREE.BufferGeometry();
  for (const part of parts) part.dispose();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      color: HEALING_PALETTE.trunk,
      flatShading: true
    })
  );
  mesh.name = "activity-leaf-twigs";
  mesh.userData.decorative = true;
  mesh.raycast = () => undefined;
  mesh.castShadow = true;
  mesh.userData.sharedTwigCount = twigs.length;
  mesh.userData.petioleCount = leaves.length;
  return mesh;
}
```

- [ ] **Step 4: Pass only twigs used by visible leaves**

In `RealisticGrowthTree.tsx`, derive the visible twig IDs and filter the view-model twigs before batching:

```ts
const visibleTwigIds = new Set(
  visibleActivityLeaves.map((leaf) => leaf.twigId)
);
const visibleActivityTwigs = viewModel.semanticLeafTwigs.filter((twig) =>
  visibleTwigIds.has(twig.id)
);
const activityLeafTwigs = createActivityLeafTwigBatch(
  visibleActivityTwigs,
  visibleActivityLeaves
);
```

Do not edit `createActivityLeafInstances`. Preserve the existing construction order of `activityTargets`, and preserve `targetForIntersection` so that `intersection.instanceId` continues indexing the same sorted `visibleActivityLeaves` array used to populate the InstancedMesh.

- [ ] **Step 5: Update explicit view-model fixtures**

Add `semanticLeafTwigs` to the fixtures in:

- `tests/growth-tree-geometry.test.ts`
- `tests/growth-tree-dashboard.test.tsx`
- `tests/growth-tree-details-panel.test.tsx`

Update embedded `SemanticLeaf` fixtures to use `twigId` and `side`, with the actual twig placed in `semanticLeafTwigs`.

- [ ] **Step 6: Run component and interaction tests**

Run:

```bash
npm test -- tests/growth-tree-semantic-geometry.test.ts tests/growth-tree-geometry.test.ts tests/growth-tree-dashboard.test.tsx tests/growth-tree-details-panel.test.tsx
```

Expected: PASS; Activity instance hover/click target mapping and resource disposal remain intact.

---

### Task 5: Remove obsolete decorative-canopy APIs and verify the whole feature

**Files:**
- Modify: `src/components/growth-tree-semantic-geometry.ts`
- Modify: `tests/growth-tree-semantic-geometry.test.ts`
- Test: `tests/realistic-growth-tree-contract.test.ts`

- [ ] **Step 1: Delete obsolete decorative canopy helpers**

Remove the unused `CanopyLeafPlacement`, `CanopyStructure`, `buildCanopyStructure`, `createDecorativeCanopyTwigs`, `createDecorativeCanopy`, and single-leaf `createActivityLeafTwigMesh` APIs. Keep only the shared Activity twig batch and Activity leaf instance APIs used by production.

- [ ] **Step 2: Replace old decorative-canopy tests**

Delete tests that exercise removed decorative APIs. Retain the uniform wood-color assertion by testing `createActivityLeafTwigBatch([], [])` against `createSemanticBranchMesh(...)`.

- [ ] **Step 3: Run all tree-focused tests**

Run:

```bash
npm test -- tests/semantic-tree-skeleton.test.ts tests/growth-tree-semantic-geometry.test.ts tests/growth-tree-geometry.test.ts tests/realistic-growth-tree-contract.test.ts tests/mature-growth-tree-mock.test.ts tests/tree-recipe.test.ts
```

Expected: all listed test files pass.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run typecheck
npm test
git diff --check
git status --short
```

Expected:

- TypeScript exits with code 0.
- All Vitest files and tests pass.
- `git diff --check` prints no errors.
- Status shows only the already-uncommitted mature-mock/tree work plus this approved leaf-layout work.

- [ ] **Step 5: Stop for user review**

Report the exact test totals, summarize changed files, and explicitly state that no browser visual verification and no commit have occurred. Do not commit until the user reviews the code and explicitly asks for a commit.
