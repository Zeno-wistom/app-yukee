/**
 * YUKEE 产品体验样片 · 第三视角三维场景（独立渲染页，逐帧确定性输出）
 *
 * 复用旧 DeskScene 的思路（桌面 / 显示器 / 屏幕门户 / 柔光环境），但改为原生 three.js
 * 逐帧渲染：window.__renderFrame(f) 推进到成片第 f 帧并渲染一张 1920×1080 图。
 * 屏幕内容全部来自真实录制帧（out/monitor、out/g05/frames、out/lamp）。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Mannequin, V, lerpPose, type Pose } from "./mannequin";
import { FPS, WIDTH, HEIGHT, CUES, SHOTS, buildTimeline, gameFrameAt, monitorSourceAt, shotAt } from "./timeline.mjs";

const q = new URLSearchParams(location.search);
const W = +(q.get("w") || WIDTH), H = +(q.get("h") || HEIGHT);
const canvas = document.getElementById("c") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#cfc8bd");
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;
scene.fog = new THREE.Fog("#cfc8bd", 7, 14);

// ———————————————————— 尺寸（米） ————————————————————
const DESK = { w: 1.4, d: 0.72, h: 0.74, t: 0.032, z: 0 };
const MON = { w: 0.6146, h: 0.3556, active: [0.5966, 0.3356] as const, z: -0.16, bottom: DESK.h + 0.115, depthTop: 0.064 };
const monCenterY = MON.bottom + MON.h / 2;
const monTop = MON.bottom + MON.h;
const monFront = MON.z + 0.012; // 面板前表面

const std = (color: string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const rbox = (w: number, h: number, d: number, r: number, m: THREE.Material) => {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m);
  mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
};

// ———————————————————— 房间 ————————————————————
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), std("#a8998a", 0.78));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 5), std("#d9d3c9", 0.95));
wall.position.set(0, 2.5, -0.9); wall.receiveShadow = true; scene.add(wall);
const sideWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), std("#d4cdc2", 0.95));
sideWall.rotation.y = Math.PI / 2; sideWall.position.set(-3.0, 2.5, 3); sideWall.receiveShadow = true; scene.add(sideWall);
// 窗（侧墙上的柔光面板）
const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.45), new THREE.MeshBasicMaterial({ color: "#f6efe2" }));
win.rotation.y = Math.PI / 2; win.position.set(-2.975, 1.6, 1.2); scene.add(win);
const winFrame = rbox(0.04, 1.53, 1.38, 0.01, std("#ebe7df", 0.5)); winFrame.position.set(-2.995, 1.6, 1.2); scene.add(winFrame);
for (const dz of [-0.217, 0.217]) { const mull = rbox(0.03, 1.45, 0.025, 0.004, std("#ebe7df", 0.5)); mull.position.set(-2.96, 1.6, 1.2 + dz); scene.add(mull); }
const sill = rbox(0.12, 0.03, 1.45, 0.006, std("#ebe7df", 0.5)); sill.position.set(-2.94, 0.86, 1.2); scene.add(sill);
// 墙上一条细踢脚线
const skirting = rbox(14, 0.08, 0.02, 0.005, std("#e2ddd3", 0.7)); skirting.position.set(0, 0.04, -0.89); scene.add(skirting);

// ———————————————————— 桌子 ————————————————————
const oak = std("#c7a47d", 0.55);
const deskTop = rbox(DESK.w, DESK.t, DESK.d, 0.008, oak);
deskTop.position.set(0, DESK.h - DESK.t / 2, DESK.z); scene.add(deskTop);
const legM = std("#f1efea", 0.35, 0.2);
for (const sx of [-1, 1]) {
  const frame = rbox(0.04, DESK.h - DESK.t, DESK.d - 0.1, 0.012, legM);
  frame.position.set(sx * (DESK.w / 2 - 0.08), (DESK.h - DESK.t) / 2, DESK.z); scene.add(frame);
}
// 键盘、鼠标、杯子、笔记本
const kb = rbox(0.36, 0.018, 0.125, 0.005, std("#e4e2dc", 0.45));
kb.position.set(0, DESK.h + 0.009, 0.19); scene.add(kb);
const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.105), new THREE.MeshStandardMaterial({ color: "#d3d1ca", roughness: 0.5 }));
{
  const c = document.createElement("canvas"); c.width = 680; c.height = 210; const g = c.getContext("2d")!;
  g.fillStyle = "#cfccc4"; g.fillRect(0, 0, 680, 210);
  for (let r = 0; r < 5; r++) for (let i = 0; i < 15; i++) { g.fillStyle = "#f2f1ec"; g.beginPath(); g.roundRect(6 + i * 44.6, 6 + r * 40, 39, 34, 5); g.fill(); }
  keys.material = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.5 });
  (keys.material as THREE.MeshStandardMaterial).map!.colorSpace = THREE.SRGBColorSpace;
}
keys.rotation.x = -Math.PI / 2; keys.position.set(0, DESK.h + 0.0185, 0.19); scene.add(keys);
const mouse = rbox(0.062, 0.03, 0.105, 0.014, std("#e8e6e0", 0.4)); mouse.position.set(0.31, DESK.h + 0.015, 0.2); scene.add(mouse);
const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.037, 0.095, 40), std("#3e5a50", 0.4)); mug.position.set(-0.45, DESK.h + 0.0475, 0.05); mug.castShadow = true; scene.add(mug);
const book = rbox(0.21, 0.016, 0.28, 0.003, std("#a9b8ae", 0.8)); book.position.set(0.48, DESK.h + 0.008, -0.05); book.rotation.y = -0.18; scene.add(book);
const plantPot = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, 0.1, 40), std("#efebe3", 0.6)); plantPot.position.set(-0.56, DESK.h + 0.05, -0.2); plantPot.castShadow = true; scene.add(plantPot);
for (let i = 0; i < 9; i++) {
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), std(i % 2 ? "#6f8f6d" : "#5d7f5e", 0.7));
  const a = (i / 9) * Math.PI * 2; leaf.scale.set(0.022, 0.07 + (i % 3) * 0.012, 0.01);
  leaf.position.set(-0.56 + Math.cos(a) * 0.025, DESK.h + 0.15 + (i % 3) * 0.01, -0.2 + Math.sin(a) * 0.025);
  leaf.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * 0.5); leaf.castShadow = true; scene.add(leaf);
}

// ———————————————————— 显示器 ————————————————————
const monBlack = std("#1b1d1f", 0.35, 0.1);
const monShell = std("#2a2c2f", 0.45, 0.2);
const panel = rbox(MON.w, MON.h, 0.012, 0.004, monBlack);
panel.position.set(0, monCenterY, MON.z + 0.006); scene.add(panel);
// 背壳：顶部保持完整厚度，作为挂灯的安放面
const back = rbox(MON.w - 0.004, MON.h - 0.004, MON.depthTop - 0.012, 0.012, monShell);
back.position.set(0, monCenterY, MON.z - (MON.depthTop - 0.012) / 2); scene.add(back);
const hump = rbox(0.26, 0.2, 0.05, 0.02, monShell); hump.position.set(0, monCenterY - 0.03, MON.z - MON.depthTop); scene.add(hump);
const neck = rbox(0.06, 0.26, 0.03, 0.01, std("#c9cbcc", 0.3, 0.6)); neck.position.set(0, DESK.h + 0.13, MON.z - 0.07); scene.add(neck);
const foot = rbox(0.24, 0.012, 0.18, 0.006, std("#c9cbcc", 0.3, 0.6)); foot.position.set(0, DESK.h + 0.006, MON.z - 0.04); scene.add(foot);
// 主显示器画面
const screenMat = new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(MON.active[0], MON.active[1]), screenMat);
screen.position.set(0, monCenterY + 0.004, monFront + 0.0006); scene.add(screen);
// 屏幕辉光（对键盘与人物的微弱补光）
const screenLight = new THREE.RectAreaLight("#cfe3ff", 0, MON.active[0], MON.active[1]);

// ———————————————————— 椅子 ————————————————————
const chair = new THREE.Group();
{
  const fabric = std("#4a4f55", 0.9);
  const metal = std("#bfc1c3", 0.3, 0.7);
  const seat = rbox(0.48, 0.07, 0.46, 0.03, fabric); seat.position.y = 0.45; chair.add(seat);
  const backrest = rbox(0.46, 0.5, 0.06, 0.03, fabric); backrest.position.set(0, 0.8, 0.22); backrest.rotation.x = -0.12; chair.add(backrest);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 20), metal); post.position.y = 0.26; post.castShadow = true; chair.add(post);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = rbox(0.3, 0.025, 0.04, 0.01, metal); arm.position.set(Math.cos(a) * 0.15, 0.08, Math.sin(a) * 0.15); arm.rotation.y = -a; chair.add(arm);
    const wheel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), std("#2b2d30", 0.5)); wheel.position.set(Math.cos(a) * 0.3, 0.028, Math.sin(a) * 0.3); wheel.castShadow = true; chair.add(wheel);
  }
  chair.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}
scene.add(chair);

// ———————————————————— 灯光 ————————————————————
scene.add(new THREE.HemisphereLight("#fff6ea", "#8f8272", 0.28));
const sun = new THREE.DirectionalLight("#ffe9d0", 2.6);
sun.position.set(-3.6, 3.4, 2.0); sun.target.position.set(0, 0.8, 0.4);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.2, right: 2.2, top: 2.2, bottom: -1.2, near: 0.5, far: 10 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight("#dfe8ff", 0.22); fill.position.set(3, 2.2, 3); scene.add(fill);

// ———————————————————— YUKEE 实体模型（用户提供的 3dm → GLB，未改形） ————————————————————
const product = new THREE.Group(); scene.add(product);
let lampScreen: THREE.Mesh | null = null;
let diffuserMats: THREE.MeshStandardMaterial[] = [];
const lampSpot = new THREE.SpotLight("#fff1dc", 0, 1.6, 0.95, 0.65, 1.2);
const PRODUCT = {
  // Rhino 毫米坐标中的装配基准（来自 parts.json 包围盒）
  centerX: 1111.0, restY: -83.2, bottomZ: -14.4,
  screen: { x0: 1032.2, x1: 1122.2, z0: 14.1, z1: 41.1, y: -100.7 },
};
async function loadProduct() {
  const g = await new GLTFLoader().loadAsync("/models/yukee-lamp-assembled.glb");
  const m = g.scene;
  // Rhino Z-up(mm) → three Y-up(m)：绕 X 轴 -90°，比例 0.001，仅平移，不做任何拉伸
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(1); // GLB 已在导出时由 mm 换算为 m
  // 安装基准：壳体底面（z=-14.4mm，前后 y∈[-83.2,-64.2]）是最低的承重面，放在显示器顶面；
  // 灯条（y∈[-99.7,-83.2]）伸出显示器前表面之外向下照明；后盖底面比承重面高 2.2mm，悬于顶面之上不穿插。
  m.position.set(-PRODUCT.centerX * 0.001, monTop - PRODUCT.bottomZ * 0.001 + 0.0001, monFront + PRODUCT.restY * 0.001 + 0.0005);
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    const name = mesh.name || mesh.parent?.name || "";
    if (name.startsWith("backcover")) { // 玻璃（半透磨砂）
      mesh.material = new THREE.MeshPhysicalMaterial({ color: "#d7d7d1", roughness: 0.35, transmission: 0.25, thickness: 0.002, metalness: 0 });
    } else if (name.startsWith("screen")) {
      mesh.material = new THREE.MeshPhysicalMaterial({ color: "#0b0c0d", roughness: 0.08, clearcoat: 1 });
    } else if (name.startsWith("camera")) {
      mesh.material = new THREE.MeshPhysicalMaterial({ color: "#1a1b1d", roughness: 0.15, clearcoat: 1 });
    } else if (mat && "roughness" in mat) {
      mesh.material = new THREE.MeshPhysicalMaterial({ color: mat.color, roughness: name.startsWith("lampshade") ? 0.42 : 0.32, clearcoat: 0.35, clearcoatRoughness: 0.4 });
    }
  });
  product.add(m);
  m.updateMatrixWorld(true);
  // 灯条底部扩散板（obj 46，后蓋层玻璃挤出件）：点亮时自发光
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && /backcover_46|shell_45/.test(mesh.name)) {
      const em = new THREE.MeshStandardMaterial({ color: "#fff7ea", emissive: new THREE.Color("#ffe8c4"), emissiveIntensity: 0, roughness: 0.6 });
      mesh.material = em; diffuserMats.push(em);
    }
  });
  // YUKEE 自身小屏：与模型屏幕件 obj 23 完全重合的显示层（90×27 mm），只贴图不改形
  const s = PRODUCT.screen;
  const sw = (s.x1 - s.x0) * 0.001, sh = (s.z1 - s.z0) * 0.001;
  lampScreen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false }));
  const cx = ((s.x0 + s.x1) / 2 - PRODUCT.centerX) * 0.001;
  const cy = monTop - PRODUCT.bottomZ * 0.001 + ((s.z0 + s.z1) / 2) * 0.001;
  const cz = m.position.z + -s.y * 0.001 + 0.00015;
  lampScreen.position.set(cx, cy, cz);
  scene.add(lampScreen);
  // 灯条光：向下照向键盘
  const barY = monTop - PRODUCT.bottomZ * 0.001 - 0.012;
  lampSpot.position.set(0, barY, monFront + 0.009);
  lampSpot.target.position.set(0, DESK.h, 0.18);
  lampSpot.castShadow = false;
  scene.add(lampSpot, lampSpot.target);
}

// ———————————————————— 人物与动作 ————————————————————
const person = new Mannequin(); scene.add(person.root);
const LAMP_EYE = V(-0.035, monTop + 0.03, monFront + 0.02);
const SCREEN_C = V(0, monCenterY, monFront);
const seated: Pose = {
  pelvis: V(0, 0.56, 0.7), yaw: 0, lean: 0.14, chest: 0.06, look: SCREEN_C.clone().add(V(0, -0.03, 0)),
  handL: V(-0.105, DESK.h + 0.042, 0.235), handR: V(0.105, DESK.h + 0.042, 0.235),
  footL: V(-0.13, 0, 0.42), footR: V(0.13, 0, 0.38), heel: 0,
};
const standing: Pose = {
  pelvis: V(0.0, 0.955, 1.32), yaw: 0, lean: 0.02, chest: 0.0, look: SCREEN_C.clone(),
  handL: V(-0.24, 0.9, 1.36), handR: V(0.24, 0.9, 1.36),
  footL: V(-0.125, 0, 1.3), footR: V(0.125, 0, 1.3), heel: 0,
};
const squat: Pose = {
  ...standing,
  pelvis: V(0.0, 0.78, 1.45), lean: 0.46, chest: 0.04,
  handL: V(-0.16, 1.02, 1.02), handR: V(0.16, 1.02, 1.02),
};
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ramp = (t: number, a: number, b: number) => ease((t - a) / (b - a));

let tl: ReturnType<typeof buildTimeline>;

function poseAt(t: number): Pose {
  if (t < CUES.standing) {
    let p = lerpPose(seated, seated, 0);
    // 打字：左右手交替轻敲 + 轻微呼吸
    const typing = 1 - ramp(t, CUES.reminder + 0.5, CUES.reminder + 1.0) * (1 - ramp(t, 6.8, 7.4)) - ramp(t, CUES.lookUp - 0.2, CUES.lookUp + 0.2);
    const tap = (ph: number) => Math.max(0, Math.sin(t * 2 * Math.PI * 3.1 + ph)) ** 3 * 0.012 * Math.max(0, typing);
    p.handL.y += tap(0) + 0.004 * Math.sin(t * 1.3);
    p.handR.y += tap(2.2) + 0.004 * Math.sin(t * 1.1 + 1);
    p.handL.x += 0.012 * Math.sin(t * 0.7); p.handR.x += 0.015 * Math.sin(t * 0.55 + 2);
    p.pelvis.y += 0.003 * Math.sin(t * 1.6);
    p.lean += 0.01 * Math.sin(t * 0.8);
    // 提醒出现：抬眼看挂灯（S2 中短暂抬头），S3 中正式抬头看 YUKEE 并点头回应
    const glance = ramp(t, CUES.reminder + 0.4, CUES.reminder + 0.9) * (1 - ramp(t, 6.9, 7.5));
    const look = ramp(t, CUES.lookUp, CUES.lookUp + 0.55) * (1 - ramp(t, CUES.reachMouse + 0.2, CUES.reachMouse + 0.8));
    const nod = Math.sin(Math.max(0, Math.min(1, (t - (CUES.lookUp + 0.9)) / 0.5)) * Math.PI) * 0.03;
    const toLamp = Math.max(glance * 0.7, look);
    p.look = p.look.clone().lerp(LAMP_EYE, toLamp).add(V(0, -nod, 0));
    p.lean -= 0.07 * look; // 靠回椅背抬头
    // 手伸向鼠标并点击「开始活动」
    const reach = ramp(t, CUES.reachMouse, CUES.reachMouse + 0.6);
    p.handR = p.handR.clone().lerp(V(0.31, DESK.h + 0.045, 0.235), reach);
    const click = Math.max(0, Math.sin(Math.max(0, Math.min(1, (t - 10.9) / 0.18)) * Math.PI)) * 0.006;
    p.handR.y -= click;
    return p;
  }
  // —— 站立，按真实游戏事件做浅蹲/起身 ——
  let k = 0, heel = 0;
  for (const j of tl.jumps) {
    // 下蹲在蓄力开始（press）前 0.32 s 起，press 时到达浅蹲；回升在 release 前 0.26 s 开始，release 时站直
    const down = ramp(t, j.press - 0.32, j.press + 0.02);
    const up = ramp(t, j.release - 0.26, j.release + 0.02);
    // 蓄力过程中略微再沉一点（越蓄越深，最多 15%）
    const deepen = 0.15 * ramp(t, j.press, j.release - 0.26) * (1 - up);
    k = Math.max(k, down * (1 - up) * (0.85 + deepen));
    const pop = Math.sin(Math.max(0, Math.min(1, (t - j.release) / 0.32)) * Math.PI);
    heel = Math.max(heel, pop * 0.9);
  }
  let p = lerpPose(standing, squat, k);
  p.heel = heel;
  p.pelvis.y += heel * 0.035;
  // 呼吸与轻微重心摆动（避免站姿僵硬）
  p.pelvis.x += 0.006 * Math.sin(t * 0.9);
  p.pelvis.y += 0.003 * Math.sin(t * 1.7);
  p.handL.x += 0.006 * Math.sin(t * 1.1); p.handR.x -= 0.006 * Math.sin(t * 1.2);
  // 第二跳完美落地后：小幅握拳庆祝
  const last = tl.jumps[tl.jumps.length - 1];
  const cheer = ramp(t, last.landed + 0.05, last.landed + 0.35) * (1 - ramp(t, last.landed + 1.1, last.landed + 1.6));
  p.handR = p.handR.clone().lerp(V(0.2, 1.14, 1.18), cheer);
  // 收尾：抬头看 YUKEE
  const lookLamp = ramp(t, 24.6, 25.4);
  p.look = p.look.clone().lerp(LAMP_EYE, lookLamp);
  return p;
}

function chairAt(t: number) {
  if (t < CUES.standing) { chair.position.set(0, 0, 0.8); chair.rotation.y = 0; }
  else { chair.position.set(-1.0, 0, 0.62); chair.rotation.y = 1.1; }
}

// ———————————————————— 镜头 ————————————————————
const camera = new THREE.PerspectiveCamera(36, W / H, 0.01, 40);
type CamKey = { p: THREE.Vector3; t: THREE.Vector3; fov: number };
const CAMS: Record<string, [CamKey, CamKey]> = {
  establish: [{ p: V(2.45, 1.66, 2.85), t: V(0.05, 0.98, 0.15), fov: 33 }, { p: V(2.0, 1.52, 2.35), t: V(0.0, 1.0, 0.1), fov: 32 }],
  lampClose: [{ p: V(-0.34, monTop + 0.06, 0.62), t: V(0.0, monTop + 0.01, monFront), fov: 30 }, { p: V(-0.24, monTop + 0.045, 0.5), t: V(0.0, monTop + 0.012, monFront), fov: 27 }],
  overShoulder: [{ p: V(0.85, 1.56, 1.95), t: V(0.0, 1.1, -0.05), fov: 40 }, { p: V(0.0, monCenterY + 0.004, 0.33), t: V(0, monCenterY + 0.004, monFront), fov: 42 }],
  squatSide: [{ p: V(2.6, 1.3, 2.05), t: V(-0.14, 0.86, 0.6), fov: 40 }, { p: V(2.48, 1.27, 1.9), t: V(-0.14, 0.86, 0.6), fov: 39 }],
  pip: [{ p: V(2.95, 1.02, 1.42), t: V(0.0, 0.85, 1.2), fov: 41 }, { p: V(2.9, 1.02, 1.38), t: V(0.0, 0.85, 1.2), fov: 41 }],
  outro: [{ p: V(2.48, 1.27, 1.9), t: V(-0.14, 0.86, 0.6), fov: 39 }, { p: V(3.0, 1.9, 3.7), t: V(0.0, 1.0, 0.3), fov: 36 }],
};
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function setCamera(name: string, k: number) {
  const [a, b] = CAMS[name];
  let e = name === "overShoulder" ? easeIO(k) : name === "outro" ? easeIO(k) : k * 0.5 + easeIO(k) * 0.5;
  if (name === "overShoulder") {
    // 绕过人物头部：先从右肩外侧经过，再收拢到屏幕正前方
    const mid = V(0.36, 1.32, 0.78);
    const p0 = a.p, p2 = b.p;
    const u = e; const pt = p0.clone().multiplyScalar((1 - u) * (1 - u)).add(mid.clone().multiplyScalar(2 * u * (1 - u))).add(p2.clone().multiplyScalar(u * u));
    camera.position.copy(pt);
  } else camera.position.copy(a.p).lerp(b.p, e);
  const tgt = a.t.clone().lerp(b.t, e);
  camera.fov = a.fov + (b.fov - a.fov) * e;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  camera.lookAt(tgt);
}

// ———————————————————— 屏幕贴图（真实录制帧） ————————————————————
const texCache = new Map<string, THREE.Texture>();
async function loadTex(url: string) {
  if (texCache.has(url)) return texCache.get(url)!;
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { imageOrientation: "flipY" });
  const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
  tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true;
  if (texCache.size > 6) { const [k, v] = texCache.entries().next().value!; v.dispose(); texCache.delete(k); }
  texCache.set(url, tex);
  return tex;
}
const pad = (n: number) => String(n).padStart(5, "0");
async function monitorTexAt(t: number, f: number) {
  const src = monitorSourceAt(t);
  if (src.kind === "game") return loadTex(`/out/g05/frames/${pad(gameFrameAt(t, tl))}.jpg`);
  return loadTex(`/out/monitor/${pad(Math.min(f, 353))}.jpg`);
}

// ———————————————————— 帧驱动 ————————————————————
function lampLevel(t: number) {
  // 工作时常亮暖光；提醒时呼吸 3 次；之后恢复
  let lv = 1;
  if (t > CUES.reminder && t < CUES.reminder + 3.0) lv = 0.72 + 0.28 * Math.cos((t - CUES.reminder) * Math.PI * 2 * 1.0);
  return lv;
}
async function renderFrame(f: number, camOverride?: string) {
  const t = f / FPS;
  const shot = shotAt(t);
  const camName = camOverride || shot.cam || "outro";
  const k = (t - shot.start) / (shot.end - shot.start);
  setCamera(camName, camOverride ? (t - 20.3) / 3.4 : Math.max(0, Math.min(1, k)));
  person.apply(poseAt(t));
  chairAt(t);
  screenMat.map = await monitorTexAt(t, f); screenMat.needsUpdate = true;
  if (lampScreen) {
    const lm = lampScreen.material as THREE.MeshBasicMaterial;
    lm.map = await loadTex(`/out/lamp/${pad(Math.min(f, 929))}.jpg`); lm.needsUpdate = true;
  }
  const lv = lampLevel(t);
  for (const m of diffuserMats) m.emissiveIntensity = 3.2 * lv;
  lampSpot.intensity = 3.5 * lv;
  renderer.render(scene, camera);
  // 等 GPU 完成
  const gl = renderer.getContext(); gl.finish();
}

(async () => {
  const ev = await (await fetch("/out/g05/events.json")).json();
  tl = buildTimeline(ev);
  await loadProduct();
  (window as any).__renderFrame = renderFrame;
  // 验证截图用：任意机位渲染第 f 帧（不影响成片镜头）
  (window as any).__renderCustom = async (f: number, p: number[], t: number[], fov: number, hidePerson = false) => {
    await renderFrame(f);
    person.root.visible = !hidePerson;
    camera.position.set(p[0], p[1], p[2]); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(t[0], t[1], t[2]);
    renderer.render(scene, camera); person.root.visible = true;
  };
  (window as any).__dims = { monTop, monFront, monCenterY, DESK, MON };
  (window as any).__timeline = tl;
  (window as any).__shots = SHOTS;
  (window as any).__ready = true;
  const f0 = q.get("f");
  if (f0) await renderFrame(+f0, q.get("cam") || undefined);
  document.title = "ready";
})();
void screenLight;
