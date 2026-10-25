/**
 * 风格化三维人物（设计人台风格）：程序化几何 + 两骨 IK。
 * 不依赖任何第三方角色模型，许可无风险；姿态由「骨盆 / 躯干倾角 / 视线目标 / 手脚目标」描述，
 * 关键帧之间插值后再求 IK，因此手脚不会穿模、关节长度恒定，动作连贯不僵硬。
 */
import * as THREE from "three";

export type Pose = {
  pelvis: THREE.Vector3;
  yaw: number; // 绕 Y 轴；0 = 面向 -Z（显示器方向）
  lean: number; // 躯干前倾（弧度）
  chest: number; // 上胸额外前倾
  look: THREE.Vector3; // 视线目标（世界坐标）
  handL: THREE.Vector3;
  handR: THREE.Vector3;
  footL: THREE.Vector3;
  footR: THREE.Vector3;
  heel: number; // 踮脚 0–1
};

const L = {
  thigh: 0.44,
  shin: 0.43,
  upper: 0.29,
  fore: 0.265,
  spine: 0.5,
  neck: 0.075,
  hipW: 0.095,
  shoulderW: 0.162,
};

const mat = (color: string, rough = 0.75, sheen = 0) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, sheen, sheenRoughness: 0.8, sheenColor: new THREE.Color(color) });

/** 沿 +Y 的锥形肢体（两端圆头） */
function limbGeo(r0: number, r1: number, len: number) {
  const pts: THREE.Vector2[] = [];
  const n = 8;
  for (let i = 0; i <= n; i++) {
    const a = (-Math.PI / 2) * (1 - i / n);
    pts.push(new THREE.Vector2(Math.cos(a) * r0, Math.sin(a) * r0));
  }
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (i / n);
    pts.push(new THREE.Vector2(Math.cos(a) * r1, len + Math.sin(a) * r1));
  }
  return new THREE.LatheGeometry(pts, 28);
}

function torsoGeo() {
  // 腰 → 胸 → 肩的轮廓（随后 Z 方向压扁）
  const prof: [number, number][] = [
    [0.0, -0.02], [0.12, 0.0], [0.135, 0.06], [0.128, 0.15], [0.14, 0.26], [0.165, 0.36], [0.172, 0.42], [0.16, 0.47], [0.1, 0.505], [0.05, 0.515], [0.0, 0.517],
  ];
  return new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
}

const UP = new THREE.Vector3(0, 1, 0);
function place(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) {
  m.position.copy(a);
  const d = b.clone().sub(a).normalize();
  m.quaternion.setFromUnitVectors(UP, d);
}

/** 两骨 IK：返回中间关节位置 */
function ik(a: THREE.Vector3, t: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3) {
  const at = t.clone().sub(a);
  let d = at.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995);
  const dir = at.normalize();
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const p = pole.clone().sub(a);
  p.sub(dir.clone().multiplyScalar(p.dot(dir))).normalize();
  const end = a.clone().add(dir.clone().multiplyScalar(d));
  return { joint: a.clone().add(dir.clone().multiplyScalar(x)).add(p.multiplyScalar(h)), end };
}

export class Mannequin {
  root = new THREE.Group();
  private parts: Record<string, THREE.Mesh> = {};
  constructor() {
    const skin = mat("#d9b9a1", 0.62);
    const knit = mat("#d6d0c3", 0.92, 0.6);
    const pants = mat("#3a4047", 0.85, 0.3);
    const shoe = mat("#efede7", 0.55);
    const hair = mat("#2b2522", 0.7, 0.4);
    const add = (name: string, geo: THREE.BufferGeometry, m: THREE.Material) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.parts[name] = mesh;
      this.root.add(mesh);
      return mesh;
    };
    add("torso", torsoGeo(), knit).scale.set(1, 1, 0.64);
    add("pelvis", new THREE.SphereGeometry(1, 32, 20), pants).scale.set(0.155, 0.1, 0.11);
    add("neck", limbGeo(0.042, 0.038, L.neck), skin);
    const head = add("head", new THREE.SphereGeometry(1, 40, 28), skin);
    head.scale.set(0.094, 0.118, 0.106);
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.56), hair);
    hairCap.castShadow = true;
    this.parts.hair = hairCap;
    this.root.add(hairCap);
    for (const s of ["L", "R"]) {
      add("thigh" + s, limbGeo(0.068, 0.05, L.thigh), pants);
      add("shin" + s, limbGeo(0.05, 0.04, L.shin), pants);
      add("upper" + s, limbGeo(0.048, 0.04, L.upper), knit);
      add("fore" + s, limbGeo(0.04, 0.03, L.fore), knit);
      add("hand" + s, new THREE.SphereGeometry(1, 20, 14), skin).scale.set(0.032, 0.05, 0.02);
      add("shoe" + s, new THREE.SphereGeometry(1, 24, 14), shoe).scale.set(0.048, 0.04, 0.125);
    }
  }

  apply(p: Pose) {
    const P = this.parts;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    // 躯干方向：向上并按 lean 朝前倾
    const spineDir = UP.clone().multiplyScalar(Math.cos(p.lean)).add(fwd.clone().multiplyScalar(Math.sin(p.lean)));
    const waist = p.pelvis.clone().add(UP.clone().multiplyScalar(0.035));
    const chestDir = UP.clone().multiplyScalar(Math.cos(p.lean + p.chest)).add(fwd.clone().multiplyScalar(Math.sin(p.lean + p.chest)));
    const neckBase = waist.clone().add(spineDir.clone().multiplyScalar(L.spine * 0.55)).add(chestDir.clone().multiplyScalar(L.spine * 0.45));
    // 躯干：从腰到颈根，保持人物朝向
    P.torso.position.copy(waist);
    const tq = new THREE.Quaternion().setFromUnitVectors(UP, neckBase.clone().sub(waist).normalize());
    P.torso.quaternion.copy(tq.multiply(new THREE.Quaternion().setFromAxisAngle(UP, p.yaw)));
    P.torso.scale.set(1, neckBase.distanceTo(waist) / 0.517, 0.64);
    P.pelvis.position.copy(p.pelvis);
    P.pelvis.quaternion.setFromAxisAngle(UP, p.yaw);
    // 头颈
    const neckTop = neckBase.clone().add(chestDir.clone().multiplyScalar(L.neck));
    place(P.neck, neckBase.clone().sub(chestDir.clone().multiplyScalar(0.02)), neckTop);
    const lookDir = p.look.clone().sub(neckTop).normalize();
    // 头部转向：限制在合理范围内（不超过 ±70° 偏航、±35° 俯仰），并与躯干方向混合
    const headDir = lookDir.clone().lerp(chestDir.clone().multiplyScalar(0.0).add(fwd), 0.15).normalize();
    const headCenter = neckTop.clone().add(UP.clone().multiplyScalar(0.085)).add(headDir.clone().multiplyScalar(0.012));
    P.head.position.copy(headCenter);
    const m = new THREE.Matrix4().lookAt(headCenter, headCenter.clone().sub(headDir), UP);
    P.head.quaternion.setFromRotationMatrix(m);
    P.hair.position.copy(headCenter.clone().add(new THREE.Vector3(0, 0.008, 0)).sub(headDir.clone().multiplyScalar(0.01)));
    P.hair.quaternion.copy(P.head.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.5));
    P.hair.scale.set(0.1, 0.124, 0.113);
    // 手臂
    for (const [s, sign, hand] of [["L", -1, p.handL], ["R", 1, p.handR]] as const) {
      const sh = neckBase.clone().add(right.clone().multiplyScalar(sign * L.shoulderW)).sub(chestDir.clone().multiplyScalar(0.062));
      const pole = sh.clone().add(right.clone().multiplyScalar(sign * 0.25)).add(UP.clone().multiplyScalar(-0.5)).sub(fwd.clone().multiplyScalar(0.25));
      const { joint: elbow, end } = ik(sh, hand, L.upper, L.fore, pole);
      place(P["upper" + s], sh, elbow);
      place(P["fore" + s], elbow, end);
      const fd = end.clone().sub(elbow).normalize();
      P["hand" + s].position.copy(end.clone().add(fd.clone().multiplyScalar(0.04)));
      P["hand" + s].quaternion.setFromUnitVectors(UP, fd);
    }
    // 腿
    for (const [s, sign, foot] of [["L", -1, p.footL], ["R", 1, p.footR]] as const) {
      const hip = p.pelvis.clone().add(right.clone().multiplyScalar(sign * L.hipW)).sub(UP.clone().multiplyScalar(0.03));
      const ankle = foot.clone().add(UP.clone().multiplyScalar(0.07 + p.heel * 0.05));
      const pole = hip.clone().add(fwd.clone().multiplyScalar(1.0)).add(right.clone().multiplyScalar(sign * 0.08));
      const { joint: knee, end } = ik(hip, ankle, L.thigh, L.shin, pole);
      place(P["thigh" + s], hip, knee);
      place(P["shin" + s], knee, end);
      const shoe = P["shoe" + s];
      shoe.position.copy(foot.clone().add(UP.clone().multiplyScalar(0.035 + p.heel * 0.02)).add(fwd.clone().multiplyScalar(0.045)));
      shoe.quaternion.setFromAxisAngle(UP, p.yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -p.heel * 0.35));
    }
  }
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function lerpPose(a: Pose, b: Pose, k: number): Pose {
  const v = (x: THREE.Vector3, y: THREE.Vector3) => x.clone().lerp(y, k);
  return {
    pelvis: v(a.pelvis, b.pelvis),
    yaw: a.yaw + (b.yaw - a.yaw) * k,
    lean: a.lean + (b.lean - a.lean) * k,
    chest: a.chest + (b.chest - a.chest) * k,
    look: v(a.look, b.look),
    handL: v(a.handL, b.handL),
    handR: v(a.handR, b.handR),
    footL: v(a.footL, b.footL),
    footR: v(a.footR, b.footR),
    heel: a.heel + (b.heel - a.heel) * k,
  };
}
