# Data-Driven Growth Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overlapping model-based tree with a procedural goal hierarchy whose branches are selectable and whose non-spherical leaves each contain at most five activities.

**Architecture:** Keep goal hierarchy and activity grouping deterministic in `src/domain/tree-visualization.ts`. Put interaction transitions and Three.js geometry construction behind small testable modules, while `RealisticGrowthTree.tsx` owns the WebGL lifecycle, raycasting, and conditional panel composition.

**Tech Stack:** TypeScript, React 19, Next.js 15, Three.js, Vitest, Testing Library

---

## File Structure

- Modify `src/domain/tree-visualization.ts`: generate root trunk, three levels of branches, and activity leaf groups.
- Modify `tests/tree-visualization.test.ts`: verify hierarchy pruning, missing-parent handling, deterministic positions, and five-activity leaf chunks.
- Create `src/domain/tree-interaction.ts`: implement pure trunk/branch/leaf selection transitions.
- Create `tests/tree-interaction.test.ts`: verify selection prerequisites and clearing.
- Create `src/components/GrowthTreeDetailsPanel.tsx`: render nothing without a selected goal and render goal/leaf details after selection.
- Create `tests/growth-tree-details-panel.test.tsx`: verify conditional panel content.
- Create `src/components/growth-tree-geometry.ts`: create aligned wood cylinders and non-spherical activity leaves.
- Create `tests/growth-tree-geometry.test.ts`: verify geometry type, identifiers, and absence of spheres.
- Modify `src/components/RealisticGrowthTree.tsx`: remove TDS loading, fallback trees, spherical markers, and always-visible UI; integrate the new model and interactions.
- Create `tests/realistic-growth-tree-contract.test.ts`: guard removal of the model loader and spherical geometry.

The working tree already contains user-owned changes in several target files. Stage and commit steps are intentionally omitted during execution so those existing changes are not misattributed or committed without explicit user authorization.

### Task 1: Generate Three Goal Levels and Activity Leaves

**Files:**
- Modify: `tests/tree-visualization.test.ts`
- Modify: `src/domain/tree-visualization.ts`

- [ ] **Step 1: Write failing hierarchy and leaf-group tests**

Add helpers that create deterministic nested goals and activities, then add these assertions:

```ts
it("renders goal branches through depth three and excludes deeper goals", () => {
  const goals = [
    goal("root", null),
    goal("level-1", "root"),
    goal("level-2", "level-1"),
    goal("level-3", "level-2"),
    goal("level-4", "level-3")
  ];

  const scene = buildGrowthTreeScene(goals, [], []);

  expect(scene.root?.goalId).toBe("root");
  expect(scene.branches.map((branch) => [branch.goalId, branch.depth])).toEqual([
    ["level-1", 1],
    ["level-2", 2],
    ["level-3", 3]
  ]);
  expect(scene.branches.some((branch) => branch.goalId === "level-4")).toBe(false);
});

it("does not render goals whose parent is missing", () => {
  const scene = buildGrowthTreeScene(
    [goal("root", null), goal("orphan", "missing-parent")],
    [],
    []
  );

  expect(scene.branches).toHaveLength(0);
});

it("groups ordered activities into non-empty leaves of at most five", () => {
  const goals = [goal("root", null), goal("career", "root")];
  const activities = Array.from({ length: 12 }, (_, index) =>
    activity(`activity-${index}`, "career", `2026-07-${String(index + 1).padStart(2, "0")}`)
  );

  const scene = buildGrowthTreeScene(goals, [], activities);
  const leaves = scene.leaves.filter((leaf) => leaf.goalId === "career");

  expect(leaves.map((leaf) => leaf.activities.length)).toEqual([5, 5, 2]);
  expect(leaves.flatMap((leaf) => leaf.activities).map((item) => item.id)).toEqual(
    [...activities].reverse().map((item) => item.id)
  );
});

it("does not create leaves for hidden goals", () => {
  const goals = [
    goal("root", null),
    goal("level-1", "root"),
    goal("level-2", "level-1"),
    goal("level-3", "level-2"),
    goal("level-4", "level-3")
  ];
  const scene = buildGrowthTreeScene(goals, [], [activity("hidden", "level-4", "2026-07-01")]);

  expect(scene.leaves).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- tests/tree-visualization.test.ts
```

Expected: FAIL because the current scene has no branch `depth`, nullable rich root segment, or `leaves`.

- [ ] **Step 3: Replace marker-oriented scene types with wood segments and leaves**

Use these public types:

```ts
export type GrowthTreeWoodSegment = {
  goalId: string;
  parentGoalId: string | null;
  depth: 0 | 1 | 2 | 3;
  label: string;
  category: string;
  startPosition: SceneVector;
  endPosition: SceneVector;
  thickness: number;
  totalValue: number;
  activityCount: number;
  intensity: number;
  recentActivities: Activity[];
};

export type GrowthTreeLeaf = {
  id: string;
  goalId: string;
  position: SceneVector;
  rotation: SceneVector;
  scale: number;
  activities: Activity[];
};

export type GrowthTreeScene = {
  root: GrowthTreeWoodSegment | null;
  branches: GrowthTreeWoodSegment[];
  leaves: GrowthTreeLeaf[];
  vitality: number;
};
```

Build the hierarchy only by walking children from the chosen root:

```ts
const rootGoal = goals.find((goal) => goal.parentGoalId === null) ?? null;
if (!rootGoal) {
  return { root: null, branches: [], leaves: [], vitality: 0 };
}

const childrenByParent = new Map<string, Goal[]>();
goals.forEach((goal) => {
  if (!goal.parentGoalId) return;
  const siblings = childrenByParent.get(goal.parentGoalId) ?? [];
  siblings.push(goal);
  childrenByParent.set(goal.parentGoalId, siblings);
});
childrenByParent.forEach((children) =>
  children.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
);
```

Create the root from `(0, 0, 0)` to `(0, 2.65, 0)`. Recursively create children through depth three. For each child, start 58–78% along its parent segment and choose a deterministic radial angle from its sibling index and depth. Use shorter and thinner segments at greater depth:

```ts
function createChildren(parent: GrowthTreeWoodSegment, depth: 1 | 2 | 3): void {
  const children = childrenByParent.get(parent.goalId) ?? [];
  children.forEach((goal, index) => {
    const siblingRatio = (index + 1) / (children.length + 1);
    const startPosition = interpolate(parent.startPosition, parent.endPosition, 0.56 + siblingRatio * 0.22);
    const angle = depth * 1.17 + index * (Math.PI * 2 / Math.max(1, children.length));
    const length = 2.15 - depth * 0.38;
    const endPosition = vector(
      startPosition.x + Math.cos(angle) * length,
      startPosition.y + 0.72 + (3 - depth) * 0.18,
      startPosition.z + Math.sin(angle) * length * 0.72
    );
    const segment = woodSegment(goal, depth, startPosition, endPosition, stats, activities);
    branches.push(segment);
    if (depth < 3) createChildren(segment, (depth + 1) as 2 | 3);
  });
}
```

Sort each visible goal's activities by `occurredOn`, then `createdAt`, then `id`, all descending. Chunk them with `slice(index, index + 5)` and place each leaf deterministically along its owning segment:

```ts
for (const segment of [root, ...branches]) {
  const ordered = activities
    .filter((item) => item.goalId === segment.goalId)
    .sort(compareActivities);
  for (let offset = 0; offset < ordered.length; offset += 5) {
    const groupIndex = offset / 5;
    const anchor = interpolate(segment.startPosition, segment.endPosition, 0.68 + (groupIndex % 3) * 0.1);
    leaves.push({
      id: `${segment.goalId}-leaf-${groupIndex}`,
      goalId: segment.goalId,
      position: vector(anchor.x + (groupIndex % 2 === 0 ? 0.13 : -0.13), anchor.y + 0.1, anchor.z),
      rotation: vector(0.2 + groupIndex * 0.17, groupIndex * 1.31, groupIndex % 2 === 0 ? 0.42 : -0.42),
      scale: round(0.82 + Math.min(0.35, ordered.slice(offset, offset + 5).length * 0.05)),
      activities: ordered.slice(offset, offset + 5)
    });
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm test -- tests/tree-visualization.test.ts
```

Expected: all tree visualization tests PASS.

### Task 2: Add Explicit Selection State and a Conditional Details Panel

**Files:**
- Create: `src/domain/tree-interaction.ts`
- Create: `tests/tree-interaction.test.ts`
- Create: `src/components/GrowthTreeDetailsPanel.tsx`
- Create: `tests/growth-tree-details-panel.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

```ts
import { clearTreeSelection, selectTreeLeaf, selectTreeWood } from "@/src/domain/tree-interaction";

it("selects wood and clears any previously selected leaf", () => {
  expect(selectTreeWood({ goalId: "career", leafId: "career-leaf-0" }, "health")).toEqual({
    goalId: "health",
    leafId: null
  });
});

it("only selects a leaf belonging to the selected goal", () => {
  const selected = { goalId: "career", leafId: null };
  expect(selectTreeLeaf(selected, { id: "health-leaf-0", goalId: "health" })).toEqual(selected);
  expect(selectTreeLeaf(selected, { id: "career-leaf-0", goalId: "career" })).toEqual({
    goalId: "career",
    leafId: "career-leaf-0"
  });
});

it("clears all selection", () => {
  expect(clearTreeSelection()).toEqual({ goalId: null, leafId: null });
});
```

- [ ] **Step 2: Run the interaction test and verify RED**

Run:

```bash
npm test -- tests/tree-interaction.test.ts
```

Expected: FAIL because `src/domain/tree-interaction.ts` does not exist.

- [ ] **Step 3: Implement the pure state transitions**

```ts
export type GrowthTreeSelection = {
  goalId: string | null;
  leafId: string | null;
};

export const EMPTY_TREE_SELECTION: GrowthTreeSelection = { goalId: null, leafId: null };

export function selectTreeWood(
  _selection: GrowthTreeSelection,
  goalId: string
): GrowthTreeSelection {
  return { goalId, leafId: null };
}

export function selectTreeLeaf(
  selection: GrowthTreeSelection,
  leaf: { id: string; goalId: string }
): GrowthTreeSelection {
  return selection.goalId === leaf.goalId ? { goalId: selection.goalId, leafId: leaf.id } : selection;
}

export function clearTreeSelection(): GrowthTreeSelection {
  return { ...EMPTY_TREE_SELECTION };
}
```

- [ ] **Step 4: Write the conditional panel test**

Render `GrowthTreeDetailsPanel` with `segment={null}` and assert `queryByTestId("growth-tree-details")` is `null`. Render it with a selected branch and no leaf, then assert the goal title is visible. Render it with a leaf and assert all supplied activity summaries are visible and no more than five list rows exist.

```tsx
expect(renderPanel({ segment: null, leaf: null }).queryByTestId("growth-tree-details")).toBeNull();
expect(renderPanel({ segment: careerSegment, leaf: null }).getByText("职业")).toBeTruthy();
expect(renderPanel({ segment: careerSegment, leaf: careerLeaf }).getAllByTestId("leaf-activity")).toHaveLength(5);
```

- [ ] **Step 5: Run the panel test and verify RED**

Run:

```bash
npm test -- tests/growth-tree-details-panel.test.tsx
```

Expected: FAIL because `GrowthTreeDetailsPanel` does not exist.

- [ ] **Step 6: Implement the conditional panel**

Create a presentational component with this contract:

```tsx
type GrowthTreeDetailsPanelProps = {
  segment: GrowthTreeWoodSegment | null;
  leaf: GrowthTreeLeaf | null;
  vitality: number;
};

export function GrowthTreeDetailsPanel({ segment, leaf, vitality }: GrowthTreeDetailsPanelProps) {
  if (!segment) return null;

  const activities = leaf?.activities ?? segment.recentActivities;
  return (
    <aside data-testid="growth-tree-details" className="absolute bottom-4 right-4 z-10 w-[calc(100%-2rem)] rounded-lg border border-white/65 bg-white/72 p-4 text-[#17351d] shadow-2xl backdrop-blur md:bottom-5 md:right-5 md:top-5 md:w-[360px]">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#2f7b3c]/80">
        {leaf ? "Selected Activity Leaf" : "Selected Growth"}
      </p>
      <h2 className="mt-2 text-2xl font-semibold">{segment.label}</h2>
      <p className="mt-2 text-sm">{segment.category}</p>
      <p className="mt-1 text-sm">{segment.totalValue} accumulated / {segment.activityCount} activities</p>
      <p className="mt-1 text-sm">Vitality {Math.round(vitality * 100)}%</p>
      <div className="mt-4 space-y-2">
        {activities.slice(0, 5).map((activity) => (
          <div data-testid="leaf-activity" key={activity.id}>
            <span>{activity.summary}</span>
            <span>{activity.occurredOn}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Run both focused tests and verify GREEN**

Run:

```bash
npm test -- tests/tree-interaction.test.ts tests/growth-tree-details-panel.test.tsx
```

Expected: both test files PASS.

### Task 3: Build Testable Non-Spherical Tree Geometry

**Files:**
- Create: `src/components/growth-tree-geometry.ts`
- Create: `tests/growth-tree-geometry.test.ts`

- [ ] **Step 1: Write failing geometry tests**

```ts
it("aligns wood geometry and stores the goal id", () => {
  const mesh = createWoodSegmentMesh(segment);
  expect(mesh.userData.goalId).toBe(segment.goalId);
  expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
  expect(mesh.position.y).toBeGreaterThan(0);
});

it("creates a non-spherical activity leaf with leaf metadata", () => {
  const mesh = createActivityLeafMesh(leaf);
  expect(mesh.userData.leafId).toBe(leaf.id);
  expect(mesh.userData.goalId).toBe(leaf.goalId);
  expect(mesh.geometry).toBeInstanceOf(THREE.ShapeGeometry);
  expect(mesh.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
});
```

- [ ] **Step 2: Run the geometry test and verify RED**

Run:

```bash
npm test -- tests/growth-tree-geometry.test.ts
```

Expected: FAIL because the geometry module does not exist.

- [ ] **Step 3: Implement aligned wood and leaf meshes**

Create the wood mesh from the midpoint, distance, and direction between segment endpoints:

```ts
export function createWoodSegmentMesh(segment: GrowthTreeWoodSegment): THREE.Mesh {
  const start = toVector3(segment.startPosition);
  const end = toVector3(segment.endPosition);
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(segment.thickness * 0.72, segment.thickness, direction.length(), 12),
    new THREE.MeshStandardMaterial({ color: 0x9b704c, roughness: 0.88 })
  );
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.goalId = segment.goalId;
  return mesh;
}
```

Create the activity leaf from a pointed `THREE.Shape`, not sphere or icosahedron geometry:

```ts
export function createActivityLeafMesh(leaf: GrowthTreeLeaf): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.22);
  shape.bezierCurveTo(0.22, -0.12, 0.24, 0.14, 0, 0.3);
  shape.bezierCurveTo(-0.24, 0.14, -0.22, -0.12, 0, -0.22);
  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape, 8),
    new THREE.MeshStandardMaterial({ color: 0x68b947, roughness: 0.72, side: THREE.DoubleSide })
  );
  mesh.position.set(leaf.position.x, leaf.position.y, leaf.position.z);
  mesh.rotation.set(leaf.rotation.x, leaf.rotation.y, leaf.rotation.z);
  mesh.scale.setScalar(leaf.scale);
  mesh.castShadow = true;
  mesh.userData.goalId = leaf.goalId;
  mesh.userData.leafId = leaf.id;
  return mesh;
}
```

- [ ] **Step 4: Run the geometry test and verify GREEN**

Run:

```bash
npm test -- tests/growth-tree-geometry.test.ts
```

Expected: all geometry tests PASS.

### Task 4: Integrate the Procedural Tree and Required Click Flow

**Files:**
- Modify: `src/components/RealisticGrowthTree.tsx`
- Create: `tests/realistic-growth-tree-contract.test.ts`

- [ ] **Step 1: Write a failing renderer contract test**

Read the renderer source and assert that obsolete model and sphere construction are absent and the new geometry helpers are present:

```ts
const source = readFileSync(path.resolve("src/components/RealisticGrowthTree.tsx"), "utf8");

expect(source).not.toContain("TDSLoader");
expect(source).not.toContain("SphereGeometry");
expect(source).not.toContain("createFallbackTree");
expect(source).not.toContain("createTrunkVolume");
expect(source).toContain("createWoodSegmentMesh");
expect(source).toContain("createActivityLeafMesh");
expect(source).toContain("<GrowthTreeDetailsPanel");
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
npm test -- tests/realistic-growth-tree-contract.test.ts
```

Expected: FAIL because the current renderer imports `TDSLoader`, builds fallback and duplicate trunks, and creates spherical markers.

- [ ] **Step 3: Remove the obsolete tree construction**

Delete:

- the `TDSLoader` import;
- `markerColor`;
- `createFallbackTree`;
- `createLeafCanopy`;
- `createTrunkVolume`;
- `treeAnchor`, fallback model setup, external model loading, canopy, and duplicate trunk;
- marker spheres, halo spheres, marker stems, and marker click maps;
- the always-visible details `<aside>`.

- [ ] **Step 4: Add procedural geometry and selection collections**

Initialize selection with no goal:

```ts
const [selection, setSelection] = useState<GrowthTreeSelection>(EMPTY_TREE_SELECTION);
const selectedSegment = [sceneModel.root, ...sceneModel.branches]
  .find((segment) => segment?.goalId === selection.goalId) ?? null;
const selectedLeaf = sceneModel.leaves.find((leaf) => leaf.id === selection.leafId) ?? null;
```

Inside the Three.js effect, add the root and branches:

```ts
const selectableWood: THREE.Mesh[] = [];
const woodByObject = new Map<string, GrowthTreeWoodSegment>();
for (const segment of [sceneModel.root, ...sceneModel.branches]) {
  if (!segment) continue;
  const mesh = createWoodSegmentMesh(segment);
  selectableWood.push(mesh);
  woodByObject.set(mesh.uuid, segment);
  world.add(mesh);
}

const selectableLeaves: THREE.Mesh[] = [];
const leafByObject = new Map<string, GrowthTreeLeaf>();
for (const leaf of sceneModel.leaves) {
  const mesh = createActivityLeafMesh(leaf);
  selectableLeaves.push(mesh);
  leafByObject.set(mesh.uuid, leaf);
  world.add(mesh);
}
```

- [ ] **Step 5: Implement click ordering, blank clearing, and drag suppression**

Track total pointer movement:

```ts
let pointerTravel = 0;
const onPointerDown = (event: PointerEvent) => {
  dragging = true;
  lastX = event.clientX;
  pointerTravel = 0;
};
```

Accumulate `Math.abs(delta)` during pointer movement. In `onPointerUp`, return without raycasting when `pointerTravel > 5`. Otherwise:

1. raycast wood first;
2. if wood is hit, call `setSelection(current => selectTreeWood(current, goalId))`;
3. if no wood is hit, raycast leaves;
4. if a leaf is hit, call `setSelection(current => selectTreeLeaf(current, leaf))`;
5. if neither is hit, call `setSelection(clearTreeSelection())`.

This ordering lets wood remain the primary interaction and enforces the branch-before-leaf rule in the pure transition function.

- [ ] **Step 6: Render the panel only from selection**

Keep the canvas and background always visible. Replace the existing `<aside>` with:

```tsx
<GrowthTreeDetailsPanel
  segment={selectedSegment}
  leaf={selectedLeaf}
  vitality={sceneModel.vitality}
/>
```

Update instruction text to say that users click a trunk or branch first, then an activity leaf, and click empty space to close.

- [ ] **Step 7: Run the focused contract and interaction suite**

Run:

```bash
npm test -- tests/realistic-growth-tree-contract.test.ts tests/tree-interaction.test.ts tests/growth-tree-geometry.test.ts tests/growth-tree-details-panel.test.tsx
```

Expected: all focused tests PASS.

### Task 5: Full Verification

**Files:**
- Verify all modified and created files.

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```

Expected: all test files PASS with zero failures.

- [ ] **Step 2: Run TypeScript checking**

```bash
npm run typecheck
```

Expected: exit code 0 with no TypeScript diagnostics.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: Next.js production build exits with code 0.

- [ ] **Step 4: Run dashboard visual verification**

Start the application on port 3001:

```bash
npm run dev -- --port 3001
```

In a second command:

```bash
LIFE_OS_DASHBOARD_URL="http://localhost:3001/dashboard?userId=demo-user" node scripts/verify-3d-dashboard.mjs
```

Expected: desktop and mobile verification complete without console errors, screenshots are written under `test-results/`, and the initial dashboard contains only the procedural tree and environment with no details panel.

- [ ] **Step 5: Inspect the final diff**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only task-related additions plus the user's pre-existing working-tree changes are present.
