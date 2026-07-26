# Data-Driven Growth Tree Design

## Goal

Replace the current overlapping mix of an external 3DS tree, an additional dark-brown trunk, and spherical growth markers with one procedural, data-driven tree. The visible wood structure represents the goal hierarchy, leaves represent grouped activities, and the information panel appears only after an intentional tree interaction.

## Scope

This change will:

- remove the external 3DS tree model;
- remove the additional dark-brown trunk and roots;
- remove fruit and bud spheres and all spherical halos;
- generate one central trunk and up to three visible levels of goal branches;
- group each goal's activities into leaves containing at most five activities;
- make the trunk, goal branches, and eligible leaves interactive;
- hide the information panel until the user selects the trunk or a branch;
- hide the panel again when the user clicks outside interactive tree geometry.

Goals below the third visible goal level are intentionally not rendered. This iteration does not add game-engine features such as physics, PBR asset pipelines, LOD, wind simulation, or post-processing.

## Scene Model

`src/domain/tree-visualization.ts` will remain the deterministic boundary between application data and 3D rendering. It will produce a scene model with:

- one root trunk model associated with the root goal;
- branch models associated with visible goals;
- each branch's parent relationship and depth;
- deterministic start and end positions for each branch;
- leaf models attached to a branch;
- each leaf's ordered list of no more than five activities;
- scene-level vitality values that may continue to influence restrained visual properties.

The root goal maps to the central trunk. Its direct children are depth-one branches, their children are depth-two branches, and their children are depth-three branches. A goal is excluded if its computed depth is greater than three or if its parent is missing from the visible hierarchy.

Activities are grouped by their owning `goalId`. Within each visible goal, activities are ordered consistently and chunked in groups of five. A goal with 12 activities produces three leaves containing 5, 5, and 2 activities. Goals with no activities still produce branches but no activity leaves. Activities whose goal is not visible are excluded from the scene.

## Rendering

`src/components/RealisticGrowthTree.tsx` will translate the scene model into Three.js objects.

The renderer will:

- build the central trunk and branches from cylinder-based segments aligned between deterministic 3D points;
- use a lighter, consistent bark palette so no second dark trunk appears;
- create a non-spherical leaf mesh for each activity group;
- attach each leaf visually to the branch for its goal;
- store `goalId` or leaf identifiers in interactive object metadata;
- maintain separate collections of selectable wood geometry and leaves for raycasting;
- keep the existing sky, grass, lighting, drag-to-rotate, and wheel-to-zoom behavior;
- use material changes or outlines for selection feedback without spherical glow geometry.

The procedural scene replaces the external TDS model rather than overlaying interactive geometry on it. This avoids visible overlap and guarantees that rendered branches match raycast targets.

## Interaction State

The initial state has no selected goal, no selected leaf, and no information panel.

Interaction behavior:

1. Clicking the central trunk selects the root goal and opens the information panel.
2. Clicking a goal branch selects that goal, opens the panel, and enables only the leaves attached to that branch.
3. Clicking an enabled leaf changes the panel to show that leaf's activity group, containing at most five records.
4. Clicking a different trunk or branch replaces the current goal selection and clears any leaf selection.
5. Leaves on unselected branches ignore clicks.
6. Clicking the sky, grass, canopy, or any other non-interactive area clears all selection and hides the panel.
7. A drag gesture rotates the scene without being interpreted as a click when the pointer is released.

The information panel remains absent from the DOM when nothing is selected, keeping the default view limited to the tree and background.

## Information Panel

When a trunk or branch is selected, the panel shows the selected goal's:

- title and category;
- accumulated metric;
- activity count;
- vitality or intensity;
- recent activity summary.

When a leaf is subsequently selected, the panel emphasizes the leaf's activity group and lists its one to five activities. Selecting a new branch returns the panel to goal-level content.

## Empty and Invalid Data

- With no root or no goals, the renderer shows the environment without interactive tree geometry or a panel.
- A goal with a missing parent is not promoted or attached to an arbitrary branch.
- A goal deeper than level three is not rendered.
- An activity attached to a hidden or missing goal is not rendered as a leaf.
- Empty activity groups are never generated.

These rules keep the visual hierarchy faithful to the underlying data rather than silently restructuring it.

## Testing

Domain tests will verify:

- direct children become depth-one branches;
- descendants are mapped through depth three;
- depth-four and deeper goals are excluded;
- goals with missing parents are excluded;
- activity ordering and grouping are deterministic;
- every leaf contains between one and five activities;
- 12 activities produce leaf group sizes of 5, 5, and 2;
- activities for hidden goals do not produce leaves.

Component or extracted interaction-state tests will verify:

- the panel is hidden initially;
- selecting the trunk or a branch opens the panel;
- selecting a branch clears the previous leaf;
- only leaves on the selected branch can be opened;
- selecting an eligible leaf shows its activity group;
- clicking non-interactive space hides the panel;
- dragging does not trigger selection.

Completion requires the focused red-green regression tests, the full Vitest suite, TypeScript type checking, and a production build.

## Future Game-Quality Evolution

The scene-model boundary is designed to survive a later rendering upgrade. A future version can replace procedural cylinders and leaves with authored PBR assets, instanced meshes, LOD variants, skeletal or shader-based wind, post-processing, physics, and richer camera control while preserving the goal hierarchy and activity grouping rules.

For a larger game-like world, the rendering layer can later move to React Three Fiber or Babylon.js, or the product can export the same scene data to Unity or Unreal. That decision is outside this iteration and should be made from measured requirements for scene scale, platform targets, asset workflow, physics, and performance.
