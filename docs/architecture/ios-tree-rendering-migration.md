# Life OS 成长树 iOS 渲染迁移方案

## 文档状态

| 阶段 | 状态 | 含义 |
| --- | --- | --- |
| 第一阶段：Three.js 可迁移边界 | **Approved / 已确认** | 当前项目按本阶段继续实施和演进。 |
| 第二阶段：WKWebView 接入 iOS | **Proposed / 待核实** | 作为未来候选方案保存，实施前重新评审。 |
| 第三阶段：RealityKit 原生渲染 | **Proposed / 待核实** | 仅在真实性能或兼容性数据证明有必要时启动。 |

本文记录长期架构方向，不代表第二、第三阶段已经获得实施批准。启动任一后续阶段前，需结合当时的产品需求、iOS 技术栈、设备性能和认证方案重新核实。

## 1. 背景与目标

Life OS 当前使用 React、Three.js 和 WebGL 渲染数据驱动的成长树。未来需要同时支持：

- iOS App 内查看和操作成长树；
- 用户通过网页分享自己的树；
- 现阶段继续使用 Three.js 快速迭代视觉和树形规则；
- WKWebView 出现无法接受的性能或兼容性问题时，增加 RealityKit 原生渲染器；
- Web 与 iOS 原生渲染长期并存；
- 离线时只查看上次联网后缓存的树，不要求离线生成最新树形。

核心目标是让未来 RealityKit 重写的对象仅限于“渲染器”，不重新实现数据库读取、成长计算、历史叶片选择和树形布局业务。

## 2. 最终架构

```text
Life OS 数据库
      │
      ▼
Tree Scene Recipe Generator
生成平台无关、可版本化的树形 JSON
      │
      ├────────────────────────┐
      ▼                        ▼
Three.js Renderer       RealityKit Renderer
      │                        │
      ├─ Web Dashboard         └─ iOS 原生 App
      ├─ Web 分享页
      └─ iOS WKWebView 兼容模式
```

Three.js 和 RealityKit 不直接互相转换。两端读取同一份 `TreeSceneRecipe`，分别创建各自平台的 Mesh、材质、相机和交互对象。

## 3. 技术路线决策

### 3.1 不采用：两端分别计算树形

如果 TypeScript 和 Swift 分别从数据库数据计算树形，会产生以下问题：

- 随机数、排序和浮点计算容易不一致；
- 新增规则时需要修改两套业务算法；
- 网页和 iOS 可能显示不同的树；
- 测试和维护成本持续增加。

### 3.2 采用：后端生成 Recipe，两端分别渲染

树形生成算法保持单一真源，Web 和 iOS 消费相同 JSON。

优点：

- 两端获得相同枝条、叶片和稳定随机结果；
- iOS 可缓存上次联网后的 Recipe；
- 渲染器可以独立优化或替换；
- 适合 Web 与原生长期并存。

### 3.3 暂不采用：Rust/C++ 共享计算核心

未来可把算法编译为 WebAssembly 和 iOS 原生库，但当前会引入额外语言、构建和调试成本。只有在必须支持设备端离线生成，或 Recipe 服务无法满足一致性要求时再评估。

## 4. 第一阶段：Three.js 可迁移边界（已确认）

### 4.1 目标与边界

继续使用 Three.js 开发，但整理为：

```text
用户数据
  ↓
成长指标
  ↓
TreeRecipe
  ↓
TreeSceneRecipe（普通 JSON）
  ↓
ThreeTreeRenderer
```

`TreeSceneRecipe` 负责描述“这棵树是什么样”；Three.js 只负责“如何在 WebGL 中画出来”。

### 4.2 TreeSceneRecipe v1 草案

```ts
type TreeSceneRecipe = {
  schemaVersion: number;
  generatorVersion: string;
  styleVersion: string;
  coordinateSystem: {
    handedness: "right";
    upAxis: "y";
    unit: "meter";
  };
  bounds: SceneBounds;
  cameraHint: CameraRecipe;
  branches: BranchRenderRecipe[];
  twigs: TwigRenderRecipe[];
  leaves: LeafRenderRecipe[];
  vitality: VitalityRenderRecipe[];
  environment: EnvironmentRecipe;
  materials: MaterialPaletteRecipe;
};
```

协议只能包含 JSON 可序列化数据，不能出现 `THREE.Vector3`、`THREE.Matrix4`、`THREE.BufferGeometry`、`THREE.Material` 或 `THREE.Object3D`。

### 4.3 枝干协议

```ts
type BranchRenderRecipe = {
  id: string;
  parentId: string | null;
  entity: {
    type: "root" | "life_area" | "long_goal" | "short_goal";
    id: string;
  };
  controlPoints: [Vector3, Vector3, Vector3, Vector3];
  baseRadius: number;
  tipRadius: number;
  meshProfile: {
    longitudinalSegments: number;
    radialSegments: number;
    irregularity: number;
    twist: number;
    capStart: boolean;
    capEnd: boolean;
  };
  materialKey: string;
};
```

枝条数量、位置、曲线、半径和随机结果由 Recipe Generator 决定。渲染器只把参数转换为平台网格。

### 4.4 叶片协议

```ts
type LeafRenderRecipe = {
  id: string;
  activityId: string;
  goalId: string;
  twigId: string;
  transform: {
    position: Vector3;
    direction: Vector3;
    normal: Vector3;
    roll: number;
    scale: number;
  };
  geometryKey: "activity_leaf_v1";
  materialKey: "young_leaf" | "mature_leaf";
  interaction: {
    selectable: true;
    entityType: "activity";
    entityId: string;
  };
};
```

叶片形状也必须进入平台无关配方：

```ts
type LeafGeometryRecipe = {
  sections: Array<{
    distance: number;
    halfWidth: number;
    height: number;
  }>;
};
```

### 4.5 推荐目录边界

```text
src/tree-core/
├── schema/
│   ├── tree-scene-recipe.ts
│   └── tree-scene-recipe.schema.json
├── generator/
│   ├── tree-recipe.ts
│   ├── semantic-tree-skeleton.ts
│   ├── leaf-layout.ts
│   └── branch-collision.ts
├── style/
│   ├── healing-style-v1.ts
│   └── geometry-profiles.ts
└── fixtures/
    ├── empty-tree.json
    ├── young-tree.json
    ├── mature-tree.json
    └── over-500-activities.json

src/renderers/three/
├── ThreeTreeRenderer.ts
├── branch-mesh.ts
├── leaf-mesh.ts
├── camera-controller.ts
├── interaction-controller.ts
└── environment/
```

不要求一次性移动所有当前文件。应在修改相关模块时逐步建立边界，避免与视觉迭代同时进行大规模重写。

### 4.6 第一阶段验收标准

- `tree-core` 不 import `three`；
- Three.js 不决定枝条数量、叶片保留和布局位置；
- Three.js 只把 Recipe 转为 Mesh 和交互对象；
- Recipe 可稳定执行 `JSON.stringify` 和 Schema 校验；
- 相同输入和版本生成相同 Recipe；
- 枝干网格配置、叶片截面和颜色语义不再只存在于 Three.js 文件；
- Golden Fixtures 可以验证关键输出。

## 5. 第二阶段：WKWebView 接入 iOS（待核实）

本阶段尚未批准实施。启动前应重新核实最低系统版本、认证方式、部署方式和离线需求。

### 5.1 职责划分

Swift 负责：

- 用户注册、登录与 Supabase Session；
- Keychain 令牌保存；
- 原生导航和推送通知；
- App 前后台生命周期；
- 请求和缓存 TreeSceneRecipe；
- WKWebView 容器和 Bridge。

WKWebView 内的 Three.js 负责：

- 3D场景渲染；
- 相机交互；
- 枝条和叶片点击；
- 水面、岛屿、云雾与天气效果。

### 5.2 认证边界

推荐由 iOS 原生层持有 Session：

```text
iOS 原生登录
  ↓
Swift 获得 Session
  ↓
Swift 请求 TreeSceneRecipe API
  ↓
Swift 缓存 Recipe
  ↓
Recipe 注入 WKWebView
```

WKWebView 不应维护另一套 Supabase 登录状态，否则 Session 刷新、Cookie 管理和未来切换 RealityKit 都会变复杂。

### 5.3 专用嵌入入口

不要直接把整个 `/dashboard` 放入 WKWebView。建议提供：

```text
/embed/tree
```

该页面不负责登录或数据库查询，不显示网页导航，只接收 Recipe、创建 ThreeTreeRenderer 并实现 JavaScript Bridge。

网页分享使用独立入口：

```text
/share/tree/{shareToken}
```

两个入口共用同一个 ThreeTreeRenderer。

### 5.4 Bridge 协议

iOS 发送给 Web：

```ts
window.lifeOS.loadTreeRecipe(recipe);
window.lifeOS.setQuality("low" | "medium" | "high");
window.lifeOS.setAppState("active" | "background");
window.lifeOS.setTheme(theme);
window.lifeOS.setSelection(selection);
```

Web 发送给 iOS：

```ts
type WebTreeEvent =
  | { type: "rendererReady" }
  | { type: "entitySelected"; entityType: string; entityId: string }
  | { type: "cameraChanged"; state: CameraState }
  | { type: "performance"; fps: number; frameTime: number }
  | { type: "webglContextLost" }
  | { type: "rendererError"; code: string };
```

Bridge 需要独立版本号，避免 App 与网页资源版本不匹配。

### 5.5 离线缓存

离线只显示上次联网后的 Recipe：

```text
联网：下载最新 Recipe → 写入本地缓存 → 渲染
离线：读取最后一次 Recipe → 显示上次同步时间 → 渲染
```

建议缓存：

```text
Application Support/
└── tree-cache/
    ├── current-recipe.json
    ├── metadata.json
    └── assets/
```

元数据至少记录用户、Schema、生成器、样式、数据和缓存时间版本。

### 5.6 App 生命周期

iOS 进入后台时暂停 Three.js 动画循环；返回前台后恢复并重新计算画布尺寸。还需处理内存警告、WebGL Context Lost、屏幕旋转、安全区域和 WKWebView 进程恢复。

## 6. 第三阶段：RealityKit 与 Three.js 长期并存（待核实）

本阶段只有在第二阶段的真实设备数据证明必要时才启动，且 RealityKit 不替换网页版本。

```text
TreeSceneRecipe
├── ThreeTreeRenderer
│   ├── Web Dashboard
│   ├── Web 分享页
│   └── iOS WKWebView 兼容模式
└── RealityTreeRenderer
    └── iOS 原生高性能模式
```

### 6.1 RealityKit 映射

| Recipe / Three.js 概念 | RealityKit / iOS 实现 |
| --- | --- |
| 枝干贝塞尔控制点 | Swift 贝塞尔采样 |
| BufferGeometry 扫掠枝干 | `MeshDescriptor` 或 `LowLevelMesh` |
| Mesh | `ModelEntity` |
| InstancedMesh 叶片 | Entity 资源复用或 `LowLevelMesh` |
| MeshLambertMaterial | `PhysicallyBasedMaterial` 或自定义材质 |
| Raycaster | CollisionComponent 与 Hit Testing |
| OrbitControls | SwiftUI Gesture 与 Camera Entity |
| GLSL 水面效果 | Metal Shader |
| Three.js 雾与云 | RealityKit Entity、粒子或 Metal Shader |

### 6.2 原生渲染器职责限制

RealityKit 层不得决定：

- Goal 生成几条枝；
- Activity 是否显示；
- 每个 Goal 的500片视觉上限；
- 最新100片保护和历史叶片替换；
- 枝条长度、角度和随机方向；
- 细枝容量与叶片布局。

这些必须由 TreeSceneRecipe Generator 决定。RealityKit 只负责 Recipe 到 Mesh 的转换、GPU资源、材质、相机、手势、Hit Testing、动画和生命周期。

## 7. 两端一致性

### 7.1 Golden Fixtures

至少维护：

```text
empty-tree.json
young-tree.json
active-tree.json
mature-tree.json
over-500-activities.json
```

每个 Fixture 固定并验证枝条控制点、半径、网格配置、细枝数量、叶片数量与变换、材质 Key、场景边界和相机提示。Three.js 与 RealityKit 必须通过同一批 Fixture。

### 7.2 坐标与颜色约定

协议必须固定：

- 右手坐标系；
- Y轴向上；
- 单位为米；
- 角度统一使用弧度；
- 矩阵统一使用列主序；
- 颜色输入使用 sRGB；
- RealityKit 坐标转换集中在一个 Adapter 内。

### 7.3 版本管理

至少区分：

- `schemaVersion`：字段和数据结构；
- `generatorVersion`：树形生成算法；
- `styleVersion`：颜色、材质和几何精度。

iOS 遇到不支持的版本时必须请求兼容版本或提示升级，不能静默错误渲染。

## 8. API 草案（待核实）

个人树 Recipe：

```http
GET /api/tree-scene
Authorization: Bearer <session>
Accept: application/vnd.lifeos.tree-scene+json; version=1
```

响应包含 `schemaVersion`、`generatorVersion`、`styleVersion`、`dataVersion`、`generatedAt` 和 `recipe`。建议支持 `ETag` 与 `If-None-Match`，数据未变化时返回 `304 Not Modified`。

分享接口使用分享令牌或只读快照：

```http
GET /api/shared-trees/{shareToken}
```

分享地址不能暴露真实 `userId`，也不能返回 Task、Reminder 或其他私密数据。

## 9. 何时启动 RealityKit

必须在最低支持机型上使用成熟树和完整环境效果测试。建议触发条件：

- 稳定帧率低于30 FPS；
- 常规交互无法稳定在约45 FPS；
- 首次可交互时间超过3秒；
- 频繁发生 WebGL Context Lost；
- WKWebView 因内存被系统终止；
- 连续运行产生不可接受的发热或耗电；
- 降低画质后仍无法满足产品要求。

启动原生开发前，应先验证降低移动端像素比、降低或关闭阴影、降低环境网格分段、增加 Instancing、减少透明层叠、增加画质档位，以及进入后台时暂停动画。

## 10. 推荐实施顺序

1. 定义 `TreeSceneRecipe v1` 和 JSON Schema。
2. 把枝干几何配置移入平台无关样式配置。
3. 把叶片截面和颜色语义移入平台无关配置。
4. 从当前 ViewModel 生成完整 TreeSceneRecipe。
5. 增加 Golden Fixtures 和序列化测试。
6. 将 Three.js 改为只消费 TreeSceneRecipe。
7. 第二阶段重新评审后，建立 `/embed/tree`。
8. 定义并版本化 JavaScript Bridge。
9. 创建最小 WKWebView iOS 外壳。
10. 接入原生认证和 Recipe 缓存。
11. 在真实设备收集性能数据。
12. 达到触发条件后重新评审 RealityKit。
13. 如获批准，实现 RealityTreeRenderer。
14. 长期保留 Web 分享与 Three.js Renderer。

## 11. 第二、第三阶段待核实清单

实施第二阶段前确认：

- iOS 最低支持版本与最低设备；
- SwiftUI 或 UIKit；
- Supabase Auth 是否仍是认证真源；
- WKWebView 加载远程资源还是内置静态渲染资源；
- 离线缓存加密和过期规则；
- Bridge 协议版本策略；
- App Store 对远程代码和内容更新的合规要求；
- 推送通知、深链与分享流程。

实施第三阶段前确认：

- WKWebView 真实设备性能报告；
- RealityKit 最低系统版本；
- RealityKit、LowLevelMesh 和 Metal 的职责边界；
- 原生水面、云雾、雨和透明效果的视觉验收标准；
- Web 与原生允许的视觉差异；
- 两个渲染器的回归测试与发布策略；
- 是否在 iOS 保留 Web/Native 切换开关作为回退能力。

## 12. 决策摘要

- Web 分享能力长期保留；
- 第一阶段继续使用 Three.js，并建立平台无关 Recipe 边界；
- iOS 离线只显示上次联网缓存，不离线计算最新树；
- 第二阶段优先使用 WKWebView，尚待实施前核实；
- 第三阶段由真实性能数据触发，尚待实施前核实；
- RealityKit 与 Three.js 长期并存，共用一个版本化 TreeSceneRecipe；
- 数据库和成长算法只有一个真源，渲染器不得复制业务逻辑。
