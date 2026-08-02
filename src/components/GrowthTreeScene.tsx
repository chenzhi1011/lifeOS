"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GrowthTreeSelection } from "@/src/domain/tree-interaction";
import type {
  ActivityLeaf,
  GrowthTreeViewModel,
  TreeWood
} from "@/src/domain/tree-visualization";
import {
  createRealisticGrowthTreeLayer,
  resolveTreeMaterialColor,
  type RealisticGrowthTreeLayer,
  type TreeSelectionTarget
} from "./RealisticGrowthTree";
import {
  beginPointerGesture,
  cancelPointerGesture,
  endPointerGesture,
  movePointerGesture,
  type PointerGestureState
} from "./growth-tree-pointer";

type GrowthTreeSceneProps = {
  viewModel: GrowthTreeViewModel;
  selection: GrowthTreeSelection;
  onSelectWood: (wood: Pick<TreeWood, "entityType" | "entityId">) => void;
  onSelectLeaf: (leaf: Pick<ActivityLeaf, "activityId" | "goalId">) => void;
  onClearSelection: () => void;
};

type SceneRuntime = {
  scene: THREE.Scene;
  layer: RealisticGrowthTreeLayer | null;
  hoveredUuid: string | null;
};

function pointerFromEvent(
  pointer: THREE.Vector2,
  event: PointerEvent,
  element: HTMLCanvasElement
): void {
  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function meshMaterial(object: THREE.Object3D): THREE.MeshStandardMaterial | null {
  if (!(object instanceof THREE.Mesh)) {
    return null;
  }
  return object.material instanceof THREE.MeshStandardMaterial
    ? object.material
    : null;
}

function targetIsSelected(
  target: TreeSelectionTarget,
  selection: GrowthTreeSelection
): boolean {
  if (target.kind === "leaf") {
    return target.leafId === selection.leafId;
  }
  return (
    target.entityType === selection.entityType &&
    target.entityId === selection.entityId
  );
}

function updateLayerMaterials(
  layer: RealisticGrowthTreeLayer,
  selection: GrowthTreeSelection,
  hoveredUuid: string | null
): void {
  for (const object of layer.selectable) {
    const target = layer.entityByUuid.get(object.uuid);
    const material = meshMaterial(object);
    if (!target || !material) {
      continue;
    }
    const hovered = object.uuid === hoveredUuid;
    const selected = targetIsSelected(target, selection);
    const related =
      target.kind === "leaf" &&
      (selection.entityType === "long_goal" ||
        selection.entityType === "short_goal") &&
      target.goalId === selection.entityId;
    const color = resolveTreeMaterialColor(
      {
        baseColor: material.userData.baseColor as number,
        hoverColor: material.userData.hoverColor as number,
        selectedColor: material.userData.selectedColor as number,
        relatedColor: material.userData.relatedColor as number | undefined
      },
      { selected, hovered, related }
    );
    material.color.setHex(color);
    material.emissive.setHex(
      selected ? (target.kind === "leaf" ? 0x315d18 : 0x4a2f14) : 0x000000
    );
    material.emissiveIntensity = selected ? 0.18 : 0;
  }
}

function selectedTarget(
  layer: RealisticGrowthTreeLayer,
  raycaster: THREE.Raycaster
): TreeSelectionTarget | null {
  const hit = raycaster.intersectObjects(layer.selectable, false)[0];
  return hit ? (layer.entityByUuid.get(hit.object.uuid) ?? null) : null;
}

export function GrowthTreeScene({
  viewModel,
  selection,
  onSelectWood,
  onSelectLeaf,
  onClearSelection
}: GrowthTreeSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SceneRuntime | null>(null);
  const selectionRef = useRef(selection);
  const onSelectWoodRef = useRef(onSelectWood);
  const onSelectLeafRef = useRef(onSelectLeaf);
  const onClearSelectionRef = useRef(onClearSelection);
  selectionRef.current = selection;
  onSelectWoodRef.current = onSelectWood;
  onSelectLeafRef.current = onSelectLeaf;
  onClearSelectionRef.current = onClearSelection;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setClearColor(0x9edcff, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9edcff);
    scene.fog = new THREE.Fog(0xcef4ff, 18, 42);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 3.4, 9.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 2.5, 0);
    controls.minDistance = 5.2;
    controls.maxDistance = 12;

    scene.add(new THREE.HemisphereLight(0xdff6ff, 0x5e8f39, 2.15));
    const sun = new THREE.DirectionalLight(0xfff0b5, 4.8);
    sun.position.set(-5.8, 9, 4.5);
    sun.castShadow = true;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbfe7ff, 1.1);
    fill.position.set(5, 4, -5);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(18, 64),
      new THREE.MeshStandardMaterial({
        color: 0x567348,
        roughness: 0.97
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const runtime: SceneRuntime = { scene, layer: null, hoveredUuid: null };
    runtimeRef.current = runtime;
    let pointerGesture: PointerGestureState | null = null;

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const raycast = (event: PointerEvent): TreeSelectionTarget | null => {
      const layer = runtime.layer;
      if (!layer) {
        return null;
      }
      pointerFromEvent(pointer, event, renderer.domElement);
      raycaster.setFromCamera(pointer, camera);
      return selectedTarget(layer, raycaster);
    };
    const capturePointer = (pointerId: number) => {
      try {
        renderer.domElement.setPointerCapture(pointerId);
      } catch {
        // The pointer may already have ended before capture is established.
      }
    };
    const releasePointer = (pointerId: number) => {
      try {
        if (renderer.domElement.hasPointerCapture(pointerId)) {
          renderer.domElement.releasePointerCapture(pointerId);
        }
      } catch {
        // Losing capture during controls cleanup is safe to ignore.
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const nextGesture = beginPointerGesture(pointerGesture, event);
      if (nextGesture === pointerGesture) {
        return;
      }
      pointerGesture = nextGesture;
      if (pointerGesture) {
        capturePointer(pointerGesture.pointerId);
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      pointerGesture = movePointerGesture(pointerGesture, event);
      const layer = runtime.layer;
      if (!layer) {
        return;
      }
      pointerFromEvent(pointer, event, renderer.domElement);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(layer.selectable, false)[0];
      const nextHoveredUuid = hit?.object.uuid ?? null;
      if (runtime.hoveredUuid !== nextHoveredUuid) {
        runtime.hoveredUuid = nextHoveredUuid;
        updateLayerMaterials(layer, selectionRef.current, nextHoveredUuid);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      const completed = endPointerGesture(pointerGesture, event);
      pointerGesture = completed.state;
      if (!completed.matched) {
        return;
      }
      releasePointer(event.pointerId);
      if (!completed.isClick) {
        return;
      }
      const target = raycast(event);
      if (!target) {
        onClearSelectionRef.current();
      } else if (target.kind === "leaf") {
        onSelectLeafRef.current({
          activityId: target.leafId!,
          goalId: target.goalId!
        });
      } else {
        onSelectWoodRef.current({
          entityType: target.entityType as TreeWood["entityType"],
          entityId: target.entityId
        });
      }
    };
    const onPointerCancel = (event: PointerEvent) => {
      const cancelled = cancelPointerGesture(pointerGesture, event.pointerId);
      pointerGesture = cancelled.state;
      if (cancelled.matched) {
        releasePointer(event.pointerId);
      }
    };
    const onPointerLeave = () => {
      runtime.hoveredUuid = null;
      if (runtime.layer) {
        updateLayerMaterials(runtime.layer, selectionRef.current, null);
      }
    };

    resize();
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);

    let animationId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", resize);
      if (runtime.layer) {
        scene.remove(runtime.layer.group);
        runtime.layer.dispose();
        runtime.layer = null;
      }
      ground.geometry.dispose();
      ground.material.dispose();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      runtimeRef.current = null;
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    if (runtime.layer) {
      runtime.scene.remove(runtime.layer.group);
      runtime.layer.dispose();
    }
    const layer = createRealisticGrowthTreeLayer(viewModel);
    runtime.layer = layer;
    runtime.hoveredUuid = null;
    runtime.scene.add(layer.group);
    updateLayerMaterials(layer, selectionRef.current, null);
    return () => {
      if (runtime.layer === layer) {
        runtime.scene.remove(layer.group);
        layer.dispose();
        runtime.layer = null;
      }
    };
  }, [viewModel]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (runtime?.layer) {
      updateLayerMaterials(
        runtime.layer,
        selection,
        runtime.hoveredUuid
      );
    }
  }, [selection, viewModel]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#9edcff] text-[#17351d]">
      <div
        className="absolute inset-0"
        data-testid="realistic-growth-tree-canvas"
        ref={mountRef}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_16%,rgba(255,244,170,0.7),transparent_15%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(55,134,45,0.08)_72%,rgba(31,99,33,0.24))]" />
    </div>
  );
}
