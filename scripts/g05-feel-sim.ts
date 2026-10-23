/**
 * G05 手感诊断（模拟动作，不是真人摄像头）。
 * 用合成双肩轨迹驱动真实的 SquatSession + 真实的平台生成/落点判定，
 * 测量：不同幅度/节奏的浅蹲产生多少蓄力、跳多远、目标需要多少蓄力、成功率。
 * 运行：npx vite-node scripts/g05-feel-sim.ts [old|new]
 */
import { SquatSession, type SquatProfile, type SquatSample } from "../src/vision/squatPose";
import { JUMP_CONFIG, JumpRun, chargeToDistance, distanceToCharge } from "../src/games/squatJump/jumpLogic";
import { CameraCharge } from "../src/games/squatJump/chargeModel";

const mode = (process.argv[2] ?? "new") as "old" | "new";
const W0 = 200;
const profile: SquatProfile = { ly0: 300, ry0: 300, cx0: 640, w0: W0, tilt0: 0, amp: 0.12, jitterPx: 1.2 };

function rnd(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** 一次动作：站 pre → 下蹲 descend 到 depth(×A) → 保持 hold → 站起 ascend → 站 post */
interface Move { depth: number; descend: number; hold: number; ascend: number; dropAt?: number; dropMs?: number }
function depthAt(m: Move, t: number) {
  const pre = 0.4;
  if (t < pre) return 0;
  t -= pre;
  if (t < m.descend) return smooth(t / m.descend) * m.depth;
  t -= m.descend;
  if (t < m.hold) return m.depth;
  t -= m.hold;
  if (t < m.ascend) return (1 - smooth(t / m.ascend)) * m.depth;
  return 0;
}

/** 跑一次动作，返回控制器拿到的蓄力（秒）与释放时刻 */
export function runMove(m: Move, fps: number, seed: number, which: "old" | "new", stopAt?: (charge: number) => boolean) {
  const r = rnd(seed);
  const s = new SquatSession(profile);
  const cc = new CameraCharge();
  // 预热：站立已上膛
  let charge = 0,
    charging = false,
    released = false,
    tRel = -1,
    peakU = 0;
  const frameMs = 1000 / fps,
    latency = 70; // 推理延迟
  const total = 0.4 + m.descend + m.hold + m.ascend + 0.8;
  let lastFrame = -1e9,
    sample: SquatSample | null = null,
    sampleAt = 0;
  // 动作可能被“看到满格就提前站起”截断：stopAt 返回 true 后立即进入 ascend
  let cut = -1;
  for (let t = -0.5; t < total + 1; t += 1 / 60) {
    const now = t * 1000;
    if (now - lastFrame >= frameMs) {
      lastFrame = now;
      const tt = (now - latency) / 1000;
      let d: number;
      if (cut >= 0 && tt >= cut) {
        const k = tt - cut;
        const d0 = depthAt(m, cut);
        d = k < m.ascend ? (1 - smooth(k / m.ascend)) * d0 : 0;
      } else d = depthAt(m, tt);
      const dropped = m.dropAt !== undefined && tt >= m.dropAt && tt < m.dropAt + (m.dropMs ?? 0) / 1000;
      const y = 300 + d * profile.amp * W0 + (r() - 0.5) * 2 * 2.2;
      sample = dropped ? null : { ly: y + (r() - 0.5) * 2, ry: y + (r() - 0.5) * 2, lx: 540 + (r() - 0.5) * 2, rx: 740 + (r() - 0.5) * 2, width: 200 + (r() - 0.5) * 2, videoH: 720 };
      sampleAt = now;
    }
    const u = s.update(1000 / 60, sample, sample ? sampleAt : undefined);
    peakU = Math.max(peakU, u.u);
    if (t < 0) continue;
    if (which === "old") {
      if (u.enteredDownSec > 0 && !charging) charge = Math.min(JUMP_CONFIG.maxChargeSec, u.enteredDownSec);
      if (u.charging) {
        charging = true;
        charge = Math.min(JUMP_CONFIG.maxChargeSec, charge + 1 / 60);
      }
    } else {
      charge = cc.step(1 / 60, u, profile).charge;
      if (u.charging) charging = true;
    }
    if (u.cancel) { charge = 0; charging = false; cc.reset(); }
    if (stopAt && cut < 0 && charging && stopAt(charge)) cut = t + 0.12; // 看到 + 反应 120ms
    if (u.release && charging) {
      released = true;
      tRel = t;
      break;
    }
  }
  return { charge, released, tRel, peakU };
}

// —— 1. 固定动作产生的蓄力 ——
const moves: [string, Move][] = [
  ["轻微浅蹲 0.6A 不停", { depth: 0.6, descend: 0.35, hold: 0, ascend: 0.35 }],
  ["正常浅蹲 1.0A 停 0.2s", { depth: 1.0, descend: 0.45, hold: 0.2, ascend: 0.4 }],
  ["正常浅蹲 1.0A 停 0.6s", { depth: 1.0, descend: 0.45, hold: 0.6, ascend: 0.4 }],
  ["较大浅蹲 1.6A 停 0.2s", { depth: 1.6, descend: 0.55, hold: 0.2, ascend: 0.5 }],
  ["较大浅蹲 1.6A 停 0.8s", { depth: 1.6, descend: 0.55, hold: 0.8, ascend: 0.5 }],
  ["正常浅蹲中途丢失 250ms", { depth: 1.0, descend: 0.45, hold: 0.6, ascend: 0.4, dropAt: 1.1, dropMs: 250 }],
];
const fmt = (x: number, n = 2) => x.toFixed(n);
console.log(`\n# 模式 ${mode}：固定动作 → 蓄力 → 距离（15 / 30 fps 平均，10 次噪声）`);
for (const [name, m] of moves) {
  for (const fps of [15, 30]) {
    let c = 0, rel = 0;
    for (let i = 0; i < 10; i++) {
      const o = runMove(m, fps, 100 + i, mode);
      if (o.released) { c += o.charge; rel++; }
    }
    const avg = rel ? c / rel : 0;
    console.log(`${name.padEnd(22)} ${fps}fps  释放 ${rel}/10  蓄力 ${fmt(avg)}s  距离 ${fmt(chargeToDistance(avg))}`);
  }
}

// —— 2. 平台需要的蓄力区间 ——
let need: number[] = [], win: number[] = [];
for (let seed = 1; seed <= 200; seed++) {
  const run = new JumpRun(seed);
  for (let k = 0; k < 5; k++) {
    const cur = run.current, tgt = run.target;
    const ax = tgt.axis === "x";
    const center = Math.abs(ax ? tgt.x - run.px : tgt.z - run.pz);
    const half = (ax ? tgt.w : tgt.d) / 2;
    need.push(distanceToCharge(center));
    win.push(distanceToCharge(center + half) - distanceToCharge(center - half));
    run.jump(distanceToCharge(center));
    void cur;
  }
}
need.sort((a, b) => a - b); win.sort((a, b) => a - b);
const q = (a: number[], f: number) => a[Math.floor((a.length - 1) * f)];
console.log(`\n# 目标中心需要蓄力（键盘秒）：p5 ${fmt(q(need, 0.05))}  p50 ${fmt(q(need, 0.5))}  p95 ${fmt(q(need, 0.95))}；可落窗口宽 p5 ${fmt(q(win, 0.05))}s p50 ${fmt(q(win, 0.5))}s`);

// —— 3. 体感玩家模拟：看蓄力条，到达自己估计的目标就站起（估计误差 σ=12%，反应 120ms） ——
function gauss(r: () => number) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }
for (const [label, depth] of [["正常浅蹲 1.0A", 1.0], ["较大浅蹲 1.6A", 1.6], ["轻微浅蹲 0.7A", 0.7]] as const) {
  let ok = 0, long = 0, short = 0, stay = 0, total = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const run = new JumpRun(seed);
    const r = rnd(seed * 7);
    for (let k = 0; k < 5 && !run.over; k++) {
      const tgt = run.target;
      const ax = tgt.axis === "x";
      const center = Math.abs(ax ? tgt.x - run.px : tgt.z - run.pz);
      const goal = distanceToCharge(center) * (1 + 0.12 * gauss(r));
      const o = runMove({ depth, descend: 0.45, hold: 4, ascend: 0.4 }, 20, seed * 31 + k, mode, (c) => c >= goal);
      total++;
      const l = run.jump(o.charge);
      if (l.kind === "hit" || l.kind === "perfect") ok++;
      else if (l.kind === "long" || l.kind === "edgeLong") long++;
      else if (l.kind === "stay") stay++;
      else short++;
    }
  }
  console.log(`${label} 看条跳：成功 ${fmt((100 * ok) / total, 0)}%  过远 ${fmt((100 * long) / total, 0)}%  不够 ${fmt((100 * short) / total, 0)}%  留原台 ${stay}  (n=${total})`);
}
