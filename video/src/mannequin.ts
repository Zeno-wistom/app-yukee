/**
 * 风格化三维人物（设计人台风格）：程序化几何 + 两骨 IK。
 * 不依赖任何第三方角色模型，许可无风险；姿态由「骨盆 / 躯干倾角 / 视线目标 / 手脚目标」描述，
 * 关键帧之间插值后再求 IK，因此手脚不会穿模、关节长度恒定，动作连贯不僵硬。
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

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
  side?: number; // 躯干侧倾（弧度，正 = 向右）
  elbowL?: number; // 0–1：肘部抬起外展（如揉脖子）
  elbowR?: number;
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

/** 手：掌 + 并拢四指（微屈）+ 拇指。局部坐标：+Y 指向指尖，+Z 为手背，-Z 为掌心。成人手长约 18.5 cm、掌宽 8.4 cm。 */
function handGeo() {
  const palm = new RoundedBoxGeometry(0.082, 0.1, 0.03, 3, 0.012); palm.translate(0, 0.05, 0);
  const fingers = new RoundedBoxGeometry(0.076, 0.085, 0.022, 3, 0.01);
  fingers.translate(0, 0.0425, 0); fingers.rotateX(-0.28); fingers.translate(0, 0.098, -0.004);
  const thumb = new THREE.CapsuleGeometry(0.011, 0.045, 4, 10); thumb.rotateZ(0.75); thumb.translate(-0.05, 0.045, -0.01);
  for (const g of [palm, fingers, thumb]) { g.deleteAttribute("uv"); }
  return mergeGeometries([palm, fingers, thumb].map((g) => (g.index ? g.toNonIndexed() : g)))!;
}
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
    add("nose", new THREE.ConeGeometry(0.015, 0.036, 12), skin);
    const eyeM = new THREE.MeshPhysicalMaterial({ color: "#1d1a19", roughness: 0.25, clearcoat: 1 });
    const browM = mat("#2b2522", 0.8);
    for (const s of ["L", "R"]) {
      add("eye" + s, new THREE.SphereGeometry(1, 16, 12), eyeM).scale.set(0.0105, 0.0125, 0.006);
      add("brow" + s, new THREE.CapsuleGeometry(0.004, 0.026, 3, 8), browM);
    }
    add("mouth", new THREE.CapsuleGeometry(0.0035, 0.022, 3, 8), mat("#a8746a", 0.6));
    this.parts.hair = hairCap;
    this.root.add(hairCap);
    for (const s of ["L", "R"]) {
      add("thigh" + s, limbGeo(0.068, 0.05, L.thigh), pants);
      add("shin" + s, limbGeo(0.05, 0.04, L.shin), pants);
      add("upper" + s, limbGeo(0.048, 0.04, L.upper), knit);
      add("fore" + s, limbGeo(0.04, 0.03, L.fore), knit);
      add("hand" + s, handGeo(), skin).scale.set(s === "L" ? -1 : 1, 1, 1);
      add("delt" + s, new THREE.SphereGeometry(1, 24, 16), knit).scale.set(0.058, 0.052, 0.056);
      add("ear" + s, new THREE.SphereGeometry(1, 14, 10), skin).scale.set(0.012, 0.03, 0.02);
      add("shoe" + s, new THREE.SphereGeometry(1, 24, 14), shoe).scale.set(0.048, 0.04, 0.125);
    }
  }

  apply(p: Pose) {
    const P = this.parts;
    const fwd = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    // 躯干方向：向上并按 lean 朝前倾
    const sideQ = new THREE.Quaternion().setFromAxisAngle(fwd, -(p.side || 0));
    const spineDir = UP.clone().multiplyScalar(Math.cos(p.lean)).add(fwd.clone().multiplyScalar(Math.sin(p.lean))).applyQuaternion(sideQ);
    const waist = p.pelvis.clone().add(UP.clone().multiplyScalar(0.035));
    const chestDir = UP.clone().multiplyScalar(Math.cos(p.lean + p.chest)).add(fwd.clone().multiplyScalar(Math.sin(p.lean + p.chest))).applyQuaternion(sideQ);
    const rightT = right.clone().applyQuaternion(sideQ);
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
    P.hair.scale.set(0.103, 0.127, 0.116);
    const hq = P.head.quaternion; // 头部局部：+Z 朝前（Matrix4.lookAt 的 z 轴 = 视线方向）
    const hf = new THREE.Vector3(0, 0, 1).applyQuaternion(hq), hr = new THREE.Vector3(1, 0, 0).applyQuaternion(hq), hu = new THREE.Vector3(0, 1, 0).applyQuaternion(hq);
    P.nose.position.copy(headCenter.clone().add(hf.clone().multiplyScalar(0.104)).add(hu.clone().multiplyScalar(-0.012)));
    P.nose.quaternion.setFromUnitVectors(UP, hf);
    const onFace = (x: number, y: number) => {
      // 头部是椭球（半径 0.094 / 0.118 / 0.106）：把点投到前表面
      const zz = Math.sqrt(Math.max(0, 1 - (x / 0.094) ** 2 - (y / 0.118) ** 2)) * 0.106;
      return headCenter.clone().add(hr.clone().multiplyScalar(x)).add(hu.clone().multiplyScalar(y)).add(hf.clone().multiplyScalar(zz));
    };
    for (const [s, sign] of [["L", -1], ["R", 1]] as const) {
      P["eye" + s].position.copy(onFace(sign * 0.034, 0.012)); P["eye" + s].quaternion.copy(hq);
      P["brow" + s].position.copy(onFace(sign * 0.036, 0.03).add(hf.clone().multiplyScalar(0.002)));
      P["brow" + s].quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 - sign * 0.12));
    }
    P.mouth.position.copy(onFace(0, -0.058)); P.mouth.quaternion.copy(hq).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    for (const [s, sign] of [["L", -1], ["R", 1]] as const) {
      P["ear" + s].position.copy(headCenter.clone().add(hr.clone().multiplyScalar(sign * 0.092)).add(hu.clone().multiplyScalar(-0.005)).add(hf.clone().multiplyScalar(-0.008)));
      P["ear" + s].quaternion.copy(hq);
    }
    // 手臂
    for (const [s, sign, hand] of [["L", -1, p.handL], ["R", 1, p.handR]] as const) {
      const sh = neckBase.clone().add(rightT.clone().multiplyScalar(sign * L.shoulderW)).sub(chestDir.clone().multiplyScalar(0.062));
      P["delt" + s].position.copy(sh.clone().add(chestDir.clone().multiplyScalar(0.012)));
      P["delt" + s].quaternion.copy(P.torso.quaternion);
      const eu = (s === "L" ? p.elbowL : p.elbowR) || 0;
      const poleDown = right.clone().multiplyScalar(sign * 0.25).add(UP.clone().multiplyScalar(-0.5)).sub(fwd.clone().multiplyScalar(0.25));
      const poleUp = right.clone().multiplyScalar(sign * 0.5).add(UP.clone().multiplyScalar(0.25)).add(fwd.clone().multiplyScalar(0.15));
      const pole = sh.clone().add(poleDown.lerp(poleUp, eu));
      const { joint: elbow, end } = ik(sh, hand, L.upper, L.fore, pole);
      place(P["upper" + s], sh, elbow);
      place(P["fore" + s], elbow, end);
      const fd = end.clone().sub(elbow).normalize();
      const hang = Math.max(0, Math.min(1, (-fd.y - 0.35) / 0.5));
      const palmN = new THREE.Vector3(0, -1, 0).lerp(right.clone().multiplyScalar(-sign), hang).normalize(); // 掌心朝向
      const back = palmN.clone().negate(); back.sub(fd.clone().multiplyScalar(back.dot(fd))).normalize();
      const xAxis = new THREE.Vector3().crossVectors(fd, back).normalize();
      const hm = new THREE.Matrix4().makeBasis(xAxis, fd, back);
      P["hand" + s].position.copy(end.clone().sub(fd.clone().multiplyScalar(0.012)));
      P["hand" + s].quaternion.setFromRotationMatrix(hm);
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
    side: (a.side || 0) + ((b.side || 0) - (a.side || 0)) * k,
    elbowL: (a.elbowL || 0) + ((b.elbowL || 0) - (a.elbowL || 0)) * k,
    elbowR: (a.elbowR || 0) + ((b.elbowR || 0) - (a.elbowR || 0)) * k,
  };
}
