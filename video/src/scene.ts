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
import { FPS, WIDTH, HEIGHT, CUES, SHOTS, GAMES, DURATION, buildTimeline, gameFrameAt, monitorSourceAt, shotAt } from "./timeline.mjs";

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
win.rotation.y = Math.PI / 2; win.position.set(-2.968, 1.6, 1.2); scene.add(win);
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
// 中性补光（不带蓝色偏色，避免把金属灰染成浅蓝）
const fill = new THREE.DirectionalLight("#f4f1ec", 0.25); fill.position.set(3, 2.2, 3); scene.add(fill);

// ———————————————————— YUKEE 实体模型（用户提供的 3dm → GLB，未改形） ————————————————————
const product = new THREE.Group(); scene.add(product);
let lampScreen: THREE.Mesh | null = null;
let diffuserMats: THREE.MeshStandardMaterial[] = [];
// 拉丝不锈钢（银灰）：金属度 1、粗糙度 0.3，颜色为中性灰，环境反射保持中性
const steel = new THREE.MeshPhysicalMaterial({ color: "#c3c4c5", metalness: 1, roughness: 0.3, clearcoat: 0.15, clearcoatRoughness: 0.35, envMapIntensity: 1.1 });
const steelBar = new THREE.MeshPhysicalMaterial({ color: "#b9babb", metalness: 1, roughness: 0.34, envMapIntensity: 1.1 });
const backMat = new THREE.MeshPhysicalMaterial({ color: "#efebe4", roughness: 0.55, metalness: 0, emissive: new THREE.Color("#ffe6c8"), emissiveIntensity: 0.25 });
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
  // 材质以宣传海报（产品真实外观）为准：拉丝不锈钢银灰机身 + 同材质灯条、深色玻璃屏、黑色镜头、
  // 磨砂乳白后盖（背光透出暖光）、灯条底部暖白扩散光。几何完全来自 3dm，不做任何变形。
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const name = mesh.name || mesh.parent?.name || "";
    if (name.startsWith("backcover")) {
      mesh.material = backMat;
    } else if (name.startsWith("screen")) {
      mesh.material = new THREE.MeshPhysicalMaterial({ color: "#07090a", roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
    } else if (name.startsWith("camera")) {
      mesh.material = new THREE.MeshPhysicalMaterial({ color: "#050506", roughness: 0.08, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 });
    } else if (name.startsWith("lampshade")) {
      mesh.material = steelBar;
    } else {
      mesh.material = steel;
    }
  });
  product.add(m);
  m.updateMatrixWorld(true);
  // 灯条底部扩散板（obj 46，后蓋层玻璃挤出件）：点亮时自发光
  m.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && /backcover_46|shell_45/.test(mesh.name)) {
      const em = new THREE.MeshStandardMaterial({ color: "#fff7ea", emissive: new THREE.Color("#ffe3bd"), emissiveIntensity: 0, roughness: 0.6 });
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
const SPOT_Z = 0.98; // 站立活动位置：骨盆离显示器约 1.1 m（摄像头能看到全身上半部）
const seated: Pose = {
  pelvis: V(0, 0.56, 0.62), yaw: 0, lean: 0.12, chest: 0.06, look: SCREEN_C.clone().add(V(0, -0.03, 0)),
  handL: V(-0.105, DESK.h + 0.03, 0.245), handR: V(0.105, DESK.h + 0.03, 0.245),
  footL: V(-0.13, 0, 0.34), footR: V(0.13, 0, 0.3), heel: 0, side: 0,
};
const standing: Pose = {
  pelvis: V(0.0, 0.955, SPOT_Z), yaw: 0, lean: 0.02, chest: 0.0, look: SCREEN_C.clone(),
  handL: V(-0.2, 0.9, SPOT_Z + 0.04), handR: V(0.2, 0.9, SPOT_Z + 0.04),
  footL: V(-0.125, 0, SPOT_Z - 0.02), footR: V(0.125, 0, SPOT_Z - 0.02), heel: 0, side: 0,
};
const squat: Pose = {
  ...standing,
  pelvis: V(0.0, 0.78, SPOT_Z + 0.13), lean: 0.46, chest: 0.04,
  handL: V(-0.16, 1.02, SPOT_Z - 0.32), handR: V(0.16, 1.02, SPOT_Z - 0.32),
};
const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const ramp = (t: number, a: number, b: number) => ease((t - a) / (b - a));
const pulse = (t: number, a: number, d: number) => Math.sin(Math.max(0, Math.min(1, (t - a) / d)) * Math.PI);
const wnd = (t: number, a: number, b: number, fi: number, fo: number) => ramp(t, a, a + fi) * (1 - ramp(t, b, b + fo));

let tl: ReturnType<typeof buildTimeline>;

/** 坐姿办公：打字 / 用鼠标 / 看笔记 / 调整坐姿 / 随时间轻微疲劳 */
function officePose(t: number, relaxed = false): Pose {
  const p = lerpPose(seated, seated, 0);
  const tired = relaxed ? 0 : ramp(t, CUES.timelapseStart, CUES.timelapseEnd);
  const mouseUse = relaxed ? wnd(t, 44.0, 45.4, 0.35, 0.35) : wnd(t, 3.0, 4.5, 0.35, 0.35) + wnd(t, 8.2, 8.9, 0.25, 0.3);
  const glanceNotes = relaxed ? 0 : wnd(t, 3.6, 4.4, 0.3, 0.35);
  const fast = t > CUES.timelapseStart && t < CUES.timelapseEnd ? 1.8 : 1; // 时间流逝镜头里打字更快
  const typing = (1 - mouseUse) * (1 - ramp(t, CUES.reminder + 0.1, CUES.reminder + 0.5) * (relaxed ? 0 : 1));
  const tap = (ph: number) => Math.max(0, Math.sin(t * 2 * Math.PI * 2.9 * fast + ph)) ** 3 * 0.011 * Math.max(0, typing);
  p.handL.y += tap(0) + 0.003 * Math.sin(t * 1.3);
  p.handR.y += tap(2.2) + 0.003 * Math.sin(t * 1.1 + 1);
  p.handL.x += 0.012 * Math.sin(t * 0.7); p.handR.x += 0.014 * Math.sin(t * 0.55 + 2);
  // 鼠标：右手移到鼠标上并小幅移动
  const mouse = V(0.31 + 0.012 * Math.sin(t * 2.3), DESK.h + 0.035, 0.245 + 0.01 * Math.sin(t * 1.7));
  p.handR = p.handR.clone().lerp(mouse, mouseUse);
  // 呼吸、坐姿微调
  p.pelvis.y += 0.003 * Math.sin(t * 1.6);
  p.pelvis.x += relaxed ? 0 : 0.012 * ramp(t, 5.3, 5.9);
  p.lean += 0.01 * Math.sin(t * 0.8);
  // 疲劳：上身前探、头低一点
  p.lean += 0.1 * tired; p.chest += 0.1 * tired;
  p.look = p.look.clone().add(V(0, -0.06 * tired, 0));
  p.look = p.look.clone().lerp(V(0.5, DESK.h, -0.05), glanceNotes);
  // 揉脖子（左手）
  const rub = relaxed ? 0 : wnd(t, CUES.neckRub, CUES.neckRub + 1.1, 0.35, 0.4);
  p.handL = p.handL.clone().lerp(V(-0.045 + 0.012 * Math.sin(t * 9), 1.16, 0.6), rub);
  p.elbowL = rub;
  p.look = p.look.clone().add(V(0.08 * rub, -0.12 * rub, 0));
  p.side = -0.05 * rub;
  if (relaxed) { p.lean -= 0.06; p.chest -= 0.03; }
  return p;
}

function poseAt(t: number): Pose {
  // —— 办公 → 提醒 → 回应 ——
  if (t < CUES.standUp) {
    const p = officePose(t);
    const look = ramp(t, CUES.lookUp, CUES.lookUp + 0.5);
    const nod = pulse(t, CUES.nod, 0.45) * 0.035;
    p.look = p.look.clone().lerp(LAMP_EYE, look * (1 - ramp(t, CUES.reachMouse + 0.35, CUES.reachMouse + 0.8))).add(V(0, -nod, 0));
    p.lean -= 0.12 * look; p.chest -= 0.08 * look; // 靠回椅背、伸展一下
    const reach = ramp(t, CUES.reachMouse, CUES.reachMouse + 0.5);
    p.handR = p.handR.clone().lerp(V(0.31, DESK.h + 0.035, 0.245), reach);
    p.handR.y -= pulse(t, CUES.click, 0.18) * 0.006;
    p.handL = p.handL.clone().lerp(V(-0.16, DESK.h + 0.03, 0.31), look); // 左手离开键盘，放松
    return p;
  }
  // —— 起身、后退一步 ——
  if (t < CUES.standing) {
    const sitEnd = officePose(CUES.standUp - 0.01);
    sitEnd.handR = V(0.31, DESK.h + 0.035, 0.245); sitEnd.handL = V(-0.16, DESK.h + 0.03, 0.31); sitEnd.look = SCREEN_C.clone();
    const a = ramp(t, CUES.standUp, CUES.stepBack + 0.1); // 起身
    const mid: Pose = {
      ...standing, pelvis: V(0, 0.92, 0.66), lean: 0.12,
      handL: V(-0.22, 0.88, 0.68), handR: V(0.22, 0.88, 0.68),
      footL: V(-0.13, 0, 0.58), footR: V(0.13, 0, 0.56),
    };
    let p = lerpPose(sitEnd, mid, a);
    // 起身时身体先前倾再直立
    p.lean += 0.32 * pulse(t, CUES.standUp, 0.6);
    const b = ramp(t, CUES.stepBack, CUES.standing - 0.1); // 后退一步
    p = lerpPose(p, standing, b);
    const fl = ramp(t, CUES.stepBack, CUES.stepBack + 0.35), fr = ramp(t, CUES.stepBack + 0.3, CUES.stepBack + 0.65);
    p.footL = mid.footL.clone().lerp(standing.footL, a >= 1 ? fl : 0); p.footL.y += pulse(t, CUES.stepBack, 0.35) * 0.06;
    p.footR = mid.footR.clone().lerp(standing.footR, a >= 1 ? fr : 0); p.footR.y += pulse(t, CUES.stepBack + 0.3, 0.35) * 0.06;
    if (a < 1) { p.footL = sitEnd.footL.clone().lerp(mid.footL, a); p.footR = sitEnd.footR.clone().lerp(mid.footR, a); }
    return p;
  }
  // —— 回到办公（放松的坐姿） ——
  if (t >= CUES.backToWork) {
    const p = officePose(t, true);
    const g = wnd(t, 43.7, 44.4, 0.3, 0.3);
    p.look = p.look.clone().lerp(LAMP_EYE, g);
    return p;
  }
  // —— 站立：四款游戏的体感动作，由真实游戏事件驱动 ——
  let p = lerpPose(standing, standing, 0);
  p.pelvis.x += 0.006 * Math.sin(t * 0.9);
  p.pelvis.y += 0.003 * Math.sin(t * 1.7);
  p.handL.x += 0.006 * Math.sin(t * 1.1); p.handR.x -= 0.006 * Math.sin(t * 1.2);
  const G = tl.games;
  // G01：抬头 = 跳；低头 = 蹲；转头 = 收能量（只动头颈）
  if (G.g01 && t < GAMES.g01.end + 0.5) {
    let look = SCREEN_C.clone();
    for (const a of G.g01.acts) {
      const k = ramp(t, a.press - 0.12, a.press + 0.06) * (1 - ramp(t, a.release, a.release + 0.22));
      const off = a.kind === "up" ? V(0, 0.8, 0) : a.kind === "down" ? V(0, -0.6, 0.1) : a.kind === "left" ? V(-0.75, 0, 0.1) : V(0.75, 0, 0.1);
      look = look.add(off.multiplyScalar(k));
    }
    p.look = look;
  }
  // G02：缓慢展开双臂 → 保持 → 缓慢回位
  if (G.g02 && t >= GAMES.g02.start - 1 && t < GAMES.g02.end + 0.6) {
    let k = 0;
    for (const a of G.g02.acts) {
      const open = ramp(t, a.press - 0.1, a.charged) * (1 - ramp(t, a.release - 0.05, a.rep - 0.05));
      k = Math.max(k, open);
    }
    p.handL = p.handL.clone().lerp(V(-0.72, 1.36, SPOT_Z + 0.05), k);
    p.handR = p.handR.clone().lerp(V(0.72, 1.36, SPOT_Z + 0.05), k);
    p.chest -= 0.04 * k;
  }
  // G03：躯干向阳光一侧轻轻侧倾，接住后回中
  if (G.g03 && t >= GAMES.g03.start - 1 && t < GAMES.g03.end + 0.6) {
    let side = 0;
    for (const a of G.g03.acts) {
      const k = ramp(t, a.press - 0.18, a.press + 0.12) * (1 - ramp(t, a.release - 0.05, a.release + 0.22));
      side += a.side * k;
    }
    p.side = 0.18 * side;
    p.pelvis.x -= 0.03 * side;
    p.handL = p.handL.clone().add(V(-0.04 * Math.abs(side), 0.02 * Math.abs(side), 0));
    p.handR = p.handR.clone().add(V(0.04 * Math.abs(side), 0.02 * Math.abs(side), 0));
  }
  // G05：浅蹲蓄力（press 时到达浅蹲，越蓄越深）→ 站直起跳（release）
  if (G.g05 && t >= GAMES.g05.start - 1.2) {
    let k = 0, heel = 0;
    for (const j of G.g05.acts) {
      const down = ramp(t, j.press - 0.32, j.press + 0.02);
      const up = ramp(t, j.release - 0.26, j.release + 0.02);
      const deepen = 0.15 * ramp(t, j.press, j.release - 0.26) * (1 - up);
      k = Math.max(k, down * (1 - up) * (0.85 + deepen));
      heel = Math.max(heel, pulse(t, j.release, 0.32) * 0.9);
    }
    p = lerpPose(p, { ...squat, look: p.look }, k);
    p.heel = heel; p.pelvis.y += heel * 0.035;
    // 最后一跳完美落地：握拳
    const last = G.g05.acts.filter((a) => a.landed < GAMES.g05.end).pop();
    if (last) p.handR = p.handR.clone().lerp(V(0.2, 1.16, SPOT_Z - 0.12), wnd(t, last.landed + 0.05, last.landed + 1.0, 0.3, 0.45));
  }
  // 收尾（40–42.6）：伸个懒腰
  const stretch = wnd(t, 40.2, 41.6, 0.5, 0.6);
  p.handL = p.handL.clone().lerp(V(-0.13, 1.93, SPOT_Z + 0.02), stretch);
  p.handR = p.handR.clone().lerp(V(0.13, 1.93, SPOT_Z + 0.02), stretch);
  p.look = p.look.clone().lerp(LAMP_EYE, ramp(t, 41.4, 41.9));
  return p;
}

function chairAt(t: number) {
  if (t < CUES.standUp) { chair.position.set(0, 0, 0.72); chair.rotation.y = 0; }
  else if (t < CUES.backToWork) {
    const k = ramp(t, CUES.standUp + 0.05, CUES.standUp + 0.8);
    const k2 = t > CUES.standing ? 1 : 0; // 镜头外把椅子推到一旁
    chair.position.set(-0.55 * k - 0.95 * k2, 0, 0.72 + 0.55 * k - 0.3 * k2);
    chair.rotation.y = 0.6 * k + 0.7 * k2;
  } else { chair.position.set(0, 0, 0.72); chair.rotation.y = 0; }
}

// ———————————————————— 镜头 ————————————————————
const camera = new THREE.PerspectiveCamera(36, W / H, 0.01, 40);
type CamKey = { p: THREE.Vector3; t: THREE.Vector3; fov: number };
const PT = V(0, monTop + 0.012, monFront - 0.01); // 产品中心
const CAMS: Record<string, [CamKey, CamKey]> = {
  establish: [{ p: V(2.65, 1.78, 3.05), t: V(0.0, 0.95, 0.2), fov: 34 }, { p: V(1.38, 1.44, 1.78), t: V(0.0, 1.0, 0.22), fov: 34 }],
  profile: [{ p: V(1.6, 1.2, 0.62), t: V(-0.08, 1.0, 0.3), fov: 38 }, { p: V(1.5, 1.18, 0.46), t: V(-0.08, 1.0, 0.28), fov: 38 }],
  lampClose: [{ p: V(-0.3, monTop - 0.03, 0.56), t: PT.clone().add(V(0, -0.012, 0)), fov: 28 }, { p: V(-0.19, monTop - 0.022, 0.42), t: PT.clone().add(V(0, -0.01, 0)), fov: 25 }],
  overShoulder: [{ p: V(1.0, 1.55, 1.95), t: V(-0.08, 1.1, -0.1), fov: 32 }, { p: V(0.8, 1.5, 1.66), t: V(-0.08, 1.13, -0.1), fov: 32 }],
  standSide: [{ p: V(2.15, 1.25, 1.02), t: V(-0.08, 0.95, 0.66), fov: 42 }, { p: V(2.25, 1.25, 1.2), t: V(-0.08, 0.95, 0.75), fov: 42 }],
  headCam: [{ p: V(1.12, 1.52, 0.3), t: V(0.0, 1.36, SPOT_Z), fov: 42 }, { p: V(1.08, 1.51, 0.32), t: V(0.0, 1.36, SPOT_Z), fov: 42 }],
  backCam: [{ p: V(0.42, 1.48, 3.05), t: V(0.0, 1.12, 0.45), fov: 38 }, { p: V(0.36, 1.46, 2.95), t: V(0.0, 1.12, 0.45), fov: 38 }],
  backWide: [{ p: V(-0.95, 1.62, 3.0), t: V(0.0, 1.12, 0.35), fov: 36 }, { p: V(-0.72, 1.56, 2.75), t: V(0.0, 1.12, 0.35), fov: 36 }],
  sideCam: [{ p: V(2.55, 1.12, 1.62), t: V(0.0, 0.88, SPOT_Z - 0.05), fov: 40 }, { p: V(2.5, 1.12, 1.58), t: V(0.0, 0.88, SPOT_Z - 0.05), fov: 40 }],
  squatSide: [{ p: V(2.35, 1.3, 2.05), t: V(-0.18, 0.88, 0.5), fov: 40 }, { p: V(2.22, 1.27, 1.88), t: V(-0.18, 0.88, 0.5), fov: 40 }],
  lampHero: [{ p: V(-0.34, monTop - 0.015, 0.44), t: PT, fov: 26 }, { p: V(0.12, monTop + 0.005, 0.5), t: PT, fov: 26 }],
  relaxed: [{ p: V(1.95, 1.48, 2.05), t: V(0.0, 1.0, 0.3), fov: 32 }, { p: V(1.72, 1.42, 1.78), t: V(0.0, 1.0, 0.3), fov: 32 }],
  // 片尾：产品在画面右侧，左侧留给标题
  heroEnd: [{ p: V(0.34, monTop + 0.085, 0.42), t: V(-0.11, monTop + 0.01, monFront), fov: 25 }, { p: V(0.24, monTop + 0.065, 0.38), t: V(-0.1, monTop + 0.01, monFront), fov: 25 }],
};
const easeIO = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
function setCamera(name: string, k: number) {
  const [a, b] = CAMS[name];
  const e = k * 0.4 + easeIO(k) * 0.6;
  camera.position.copy(a.p).lerp(b.p, e);
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
const MON_FRAMES = Math.round(DURATION * FPS) - 1;
export const SELECT_LEAD = 0.35; // 选择页录制从第 0.35 s 开始用
async function monitorTexAt(t: number, f: number) {
  const src = monitorSourceAt(t);
  if (src.kind === "game") return loadTex(`/out/games/${src.game}/frames/${pad(gameFrameAt(src.game!, t, tl))}.jpg`);
  if (src.kind === "select") {
    const sf = Math.max(0, Math.min(tl.selectFrames - 1, Math.round((Math.max(t, CUES.selectStart) - CUES.selectStart + SELECT_LEAD) * FPS)));
    return loadTex(`/out/games/select/frames/${pad(sf)}.jpg`);
  }
  return loadTex(`/out/monitor/${pad(Math.min(f, MON_FRAMES))}.jpg`);
}

// ———————————————————— 灯条（遵循产品灯光逻辑） ————————————————————
const WARM = new THREE.Color("#ffd9a8"), PEACH = new THREE.Color("#ff9f80"), PINK = new THREE.Color("#d77ee0");
function lampAt(t: number) {
  // 默认：暖白常亮。时间流逝时略微变暖。提醒：先柔和呼吸，再给出更明确的颜色提示（暖 → 蜜桃 → 粉紫）；
  // 用户选择「开始活动」后恢复暖白。游戏中常亮；成功反馈时轻微增亮。
  let lv = 1;
  const c = WARM.clone();
  if (t > CUES.reminder && t < CUES.click + 0.3) {
    const age = t - CUES.reminder;
    lv = 0.75 + 0.3 * Math.sin(Math.min(1, age / 1.25) * Math.PI) * (t < CUES.colorCue ? 1 : 0);
    const cue = ramp(t, CUES.colorCue - 0.2, CUES.colorCue + 0.5);
    c.lerp(PEACH, Math.min(1, cue * 1.6)).lerp(PINK, ramp(t, CUES.colorCue + 0.4, CUES.colorCue + 1.0));
    if (t >= CUES.colorCue) lv = 0.85 + 0.15 * Math.sin((t - CUES.colorCue) * Math.PI * 1.4);
    const back = ramp(t, CUES.click, CUES.click + 0.3);
    c.lerp(WARM, back); lv = lv + (1 - lv) * back;
  }
  for (const s of tl.success) lv += 0.35 * pulse(t, s.t, 0.45);
  if (t >= 40 && t < 41.4) lv += 0.25 * pulse(t, 40.05, 1.3);
  return { lv, c };
}

// ———————————————————— 帧驱动 ————————————————————
async function renderFrame(f: number, camOverride?: string, kOverride?: number) {
  const t = f / FPS;
  const shot = shotAt(t);
  let camName = shot.cam;
  let k = (t - shot.start) / (shot.end - shot.start);
  if (shot.kind === "game") {
    if (shot.insert && t < shot.insert.end) { camName = shot.insert.cam; k = (t - shot.start) / (shot.insert.end - shot.start); }
    else camName = shot.pip;
  }
  if (camOverride === "pip") { camName = (shot as any).pip; k = (t - shot.start) / (shot.end - shot.start); }
  else if (camOverride) { camName = camOverride; k = kOverride ?? k; }
  setCamera(camName || "establish", Math.max(0, Math.min(1, k)));
  person.apply(poseAt(t));
  chairAt(t);
  // 时间流逝：阳光角度与色温变化
  const tl01 = ramp(t, CUES.timelapseStart, CUES.timelapseEnd);
  const late = t < CUES.timelapseStart ? 0 : 1;
  sun.position.set(-3.6, 3.4 - 0.9 * Math.max(tl01, late * (t > CUES.timelapseEnd ? 1 : 0)), 2.0 - 1.1 * Math.max(tl01, late * (t > CUES.timelapseEnd ? 1 : 0)));
  sun.color.set("#ffe9d0").lerp(new THREE.Color("#ffd2a6"), t >= CUES.timelapseStart ? tl01 : 0);
  screenMat.map = await monitorTexAt(t, f); screenMat.needsUpdate = true;
  if (lampScreen) {
    const lm = lampScreen.material as THREE.MeshBasicMaterial;
    lm.map = await loadTex(`/out/lamp/${pad(Math.min(f, MON_FRAMES))}.jpg`); lm.needsUpdate = true;
  }
  const { lv, c } = lampAt(t);
  for (const m of diffuserMats) { m.emissive.copy(c); m.emissiveIntensity = 1.5 * lv; }
  lampSpot.color.copy(c); lampSpot.intensity = 3.4 * lv;
  backMat.emissive.copy(c); backMat.emissiveIntensity = 0.22 * lv;
  renderer.render(scene, camera);
  const gl = renderer.getContext(); gl.finish();
}

(async () => {
  const all: Record<string, any> = {};
  for (const g of ["g01", "g02", "g03", "g05"]) all[g] = await (await fetch(`/out/games/${g}/events.json`)).json();
  tl = buildTimeline(all);
  const sel = await (await fetch("/out/games/select/events.json")).json();
  (tl as any).selectFrames = sel.frames;
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
