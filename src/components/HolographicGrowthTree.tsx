"use client";

import { Activity, Brain, CalendarDays, Dna, Sparkles, Trees } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { DashboardData } from "@/src/domain/aggregation";
import { buildGrowthTreeScene, type GrowthTreeNode } from "@/src/domain/tree-visualization";

type HolographicGrowthTreeProps = {
  data: DashboardData;
};

function formatMetric(node: GrowthTreeNode | null): string {
  if (!node) {
    return "选择一个发光节点";
  }
  return `${node.totalValue} accumulated / ${node.activityCount} activities`;
}

export function HolographicGrowthTree({ data }: HolographicGrowthTreeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneModel = useMemo(() => buildGrowthTreeScene(data.goals, data.goalStats, data.recentActivities), [data]);
  const [selectedGoalId, setSelectedGoalId] = useState(sceneModel.nodes.find((node) => node.activityCount > 0)?.goalId ?? sceneModel.nodes[0]?.goalId ?? null);

  const selectedNode = sceneModel.nodes.find((node) => node.goalId === selectedGoalId) ?? null;
  const dominantGoal = sceneModel.nodes.reduce<GrowthTreeNode | null>((best, node) => (!best || node.glow > best.glow ? node : best), null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x020807, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03110f, 0.055);

    const camera = new THREE.PerspectiveCamera(48, mount.clientWidth / mount.clientHeight, 0.1, 100);
    camera.position.set(0, 2.5, 8.4);

    const treeGroup = new THREE.Group();
    scene.add(treeGroup);

    const ambient = new THREE.AmbientLight(0x6ad6c6, 0.8);
    scene.add(ambient);

    const coreLight = new THREE.PointLight(0x9df8d7, 4, 16);
    coreLight.position.set(0, 2.4, 1.4);
    scene.add(coreLight);

    const sunLight = new THREE.PointLight(0xd9a441, 2.2, 18);
    sunLight.position.set(-3, 5, 3);
    scene.add(sunLight);

    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5e9d85,
      emissive: 0x103f35,
      emissiveIntensity: 0.7,
      metalness: 0.25,
      roughness: 0.34,
      transparent: true,
      opacity: 0.82
    });
    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: 0x80ffd2,
      emissive: 0x2edfa4,
      emissiveIntensity: 1.4,
      metalness: 0.2,
      roughness: 0.18,
      transparent: true,
      opacity: 0.9
    });
    const mutedNodeMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f8f83,
      emissive: 0x123d36,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.62
    });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 3.2, 20), trunkMaterial);
    trunk.position.set(0, 1.45, 0);
    treeGroup.add(trunk);

    const selectable: THREE.Mesh[] = [];
    const nodeByObject = new Map<string, GrowthTreeNode>();

    for (const branch of sceneModel.branches) {
      const start = new THREE.Vector3(branch.position.x, branch.position.y + 1.2, branch.position.z);
      const end = new THREE.Vector3(branch.endPosition.x, branch.endPosition.y, branch.endPosition.z);
      const direction = new THREE.Vector3().subVectors(end, start);
      const length = direction.length();
      const geometry = new THREE.CylinderGeometry(branch.thickness, branch.thickness * 0.72, length, 14);
      const mesh = new THREE.Mesh(geometry, trunkMaterial.clone());
      mesh.position.copy(start.clone().add(direction.multiplyScalar(0.5)));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3().subVectors(end, start).normalize());
      treeGroup.add(mesh);
    }

    for (const node of sceneModel.nodes) {
      const material = node.activityCount > 0 ? nodeMaterial.clone() : mutedNodeMaterial.clone();
      material.emissiveIntensity = 0.6 + node.glow * 2.2;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(node.radius, 24, 24), material);
      mesh.position.set(node.position.x, node.position.y, node.position.z);
      mesh.userData.goalId = node.goalId;
      treeGroup.add(mesh);
      selectable.push(mesh);
      nodeByObject.set(mesh.uuid, node);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(node.radius * 1.75, 24, 24),
        new THREE.MeshBasicMaterial({ color: 0x7fffd4, transparent: true, opacity: 0.08 + node.glow * 0.12 })
      );
      halo.position.copy(mesh.position);
      treeGroup.add(halo);
    }

    const sparkGeometry = new THREE.BufferGeometry();
    const sparkPositions: number[] = [];
    for (let i = 0; i < 320; i += 1) {
      const radius = 1.1 + (i % 29) * 0.11;
      const angle = i * 2.399963229728653;
      sparkPositions.push(Math.cos(angle) * radius, 0.2 + (i % 80) * 0.065, Math.sin(angle) * radius);
    }
    sparkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(sparkPositions, 3));
    const sparks = new THREE.Points(
      sparkGeometry,
      new THREE.PointsMaterial({ color: 0x8cffdf, size: 0.028, transparent: true, opacity: 0.72, depthWrite: false })
    );
    scene.add(sparks);

    const ringGeometry = new THREE.TorusGeometry(2.7, 0.01, 8, 160);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x5eeac5, transparent: true, opacity: 0.28 });
    const rings = [0, 1, 2].map((index) => {
      const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
      ring.rotation.x = Math.PI / 2 + index * 0.18;
      ring.rotation.z = index * 0.7;
      ring.position.y = 1.9 + index * 0.62;
      scene.add(ring);
      return ring;
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragging = false;
    let lastX = 0;
    let rotationVelocity = 0.003;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
    };
    const onPointerMove = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      if (dragging) {
        const delta = event.clientX - lastX;
        treeGroup.rotation.y += delta * 0.008;
        rotationVelocity = delta * 0.0007;
        lastX = event.clientX;
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(selectable, false)[0];
      if (hit) {
        const node = nodeByObject.get(hit.object.uuid);
        if (node) {
          setSelectedGoalId(node.goalId);
        }
      }
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * 0.006, 4.8, 11);
    };
    const onResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);

    let frame = 0;
    let animationId = 0;
    const animate = () => {
      frame += 0.01;
      treeGroup.rotation.y += rotationVelocity;
      rotationVelocity *= 0.985;
      sparks.rotation.y -= 0.0018;
      sparks.position.y = Math.sin(frame * 1.4) * 0.04;
      rings.forEach((ring, index) => {
        ring.rotation.z += 0.002 + index * 0.001;
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(frame * 2 + index) * 0.04;
      });
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [sceneModel]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020807] text-white">
      <div ref={mountRef} className="absolute inset-0" data-testid="holographic-growth-tree-canvas" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(94,234,197,0.22),transparent_34%),linear-gradient(180deg,rgba(2,8,7,0.08),rgba(2,8,7,0.84))]" />

      <header className="pointer-events-none absolute left-5 right-5 top-5 z-10 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8cffdf]">Life OS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-normal md:text-5xl">Holographic Growth Tree</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/68">
            主页只展示成长。树枝、节点和光点由 Activity 聚合生成，点击节点查看具体数据。
          </p>
        </div>
        <a className="pointer-events-auto rounded-md border border-white/16 bg-white/10 px-3 py-2 text-sm text-white/80 backdrop-blur hover:bg-white/16" href="/mock">
          Open Mock Input
        </a>
      </header>

      <aside className="absolute bottom-4 right-4 top-auto z-10 w-[calc(100%-2rem)] rounded-lg border border-white/14 bg-[#061310]/82 p-4 shadow-2xl backdrop-blur md:bottom-5 md:right-5 md:top-5 md:w-[360px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#8cffdf]/80">Selected Node</p>
            <h2 className="mt-2 text-2xl font-semibold">{selectedNode?.label ?? dominantGoal?.label ?? "Growth"}</h2>
          </div>
          <Sparkles className="mt-1 text-[#8cffdf]" size={22} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-md border border-white/10 bg-white/8 p-3">
            <Activity size={16} className="text-[#8cffdf]" />
            <p className="mt-2 text-xs text-white/50">Metric</p>
            <p className="text-sm font-semibold">{formatMetric(selectedNode ?? dominantGoal)}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/8 p-3">
            <Dna size={16} className="text-[#d9a441]" />
            <p className="mt-2 text-xs text-white/50">Glow</p>
            <p className="text-sm font-semibold">{Math.round(((selectedNode ?? dominantGoal)?.glow ?? 0) * 100)}%</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/8 p-3">
            <CalendarDays size={16} className="text-[#9db7ff]" />
            <p className="mt-2 text-xs text-white/50">Recent</p>
            <p className="text-sm font-semibold">{(selectedNode ?? dominantGoal)?.recentActivities[0]?.occurredOn ?? "No activity"}</p>
          </div>
          <div className="rounded-md border border-white/10 bg-white/8 p-3">
            <Trees size={16} className="text-[#7fb069]" />
            <p className="mt-2 text-xs text-white/50">Category</p>
            <p className="text-sm font-semibold">{(selectedNode ?? dominantGoal)?.category ?? "Life"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-md border border-white/10 bg-black/20 p-3">
          <p className="text-sm font-semibold text-white/82">Recent Activities</p>
          <div className="mt-3 space-y-2">
            {((selectedNode ?? dominantGoal)?.recentActivities ?? []).length > 0 ? (
              ((selectedNode ?? dominantGoal)?.recentActivities ?? []).map((activity) => (
                <div key={activity.id} className="flex items-center justify-between gap-3 border-b border-white/8 pb-2 last:border-0 last:pb-0">
                  <span className="text-sm text-white/78">{activity.summary}</span>
                  <span className="shrink-0 text-xs text-white/42">{activity.occurredOn}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-white/45">还没有具体 Activity。可以从 /mock 输入一条记录。</p>
            )}
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[#8cffdf]/18 bg-[#8cffdf]/8 p-3 text-xs leading-5 text-white/58">
          拖拽旋转，滚轮缩放，点击发光节点查看局部数据。主页不展示聊天输入。
        </div>
      </aside>
    </main>
  );
}
