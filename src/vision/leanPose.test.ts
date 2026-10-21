import { describe, it, expect } from "vitest";
import {
  measureLean,
  leanAmount,
  LeanSession,
  LeanCalibrator,
  DEFAULT_LEAN_CONFIG,
  type LeanProfile,
  type LeanSample,
} from "./leanPose";
import type { PoseFrame } from "./wingPose";

const DEG = Math.PI / 180;
/**
 * 合成一位坐在桌前的用户：髋点为轴，上身侧倾 leanDeg 度（正 = 用户右侧）。
 * 原始摄像头画面未镜像：用户右肩（12）在画面左侧。
 */
function body({
  leanDeg = 0,
  shiftX = 0,
  hips = true,
  noseX = 0.5,
  vis = 1,
}: {
  leanDeg?: number;
  shiftX?: number;
  hips?: boolean;
  noseX?: number;
  vis?: number;
} = {}): PoseFrame {
  const W = 640,
    H = 480;
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.2,
    visibility: 0.2,
  }));
  const hipC = { x: 320 + shiftX * W, y: 420 };
  const torsoLen = 230,
    halfShoulder = 80;
  const a = leanDeg * DEG;
  // 向用户右侧倾 = 向画面左侧倾
  const sC = { x: hipC.x - Math.sin(a) * torsoLen, y: hipC.y - Math.cos(a) * torsoLen };
  const ux = Math.cos(a),
    uy = -Math.sin(a);
  // 11 = 左肩（画面右），12 = 右肩（画面左）；侧倾时肩线随躯干一起旋转
  landmarks[11] = { x: (sC.x + ux * halfShoulder) / W, y: (sC.y - uy * halfShoulder * -1) / H, visibility: vis };
  landmarks[12] = { x: (sC.x - ux * halfShoulder) / W, y: (sC.y + uy * halfShoulder * -1) / H, visibility: vis };
  landmarks[23] = { x: (hipC.x + 50) / W, y: hipC.y / H, visibility: hips ? vis : 0.1 };
  landmarks[24] = { x: (hipC.x - 50) / W, y: hipC.y / H, visibility: hips ? vis : 0.1 };
  landmarks[0] = { x: noseX, y: (sC.y - 90) / H, visibility: 1 };
  return { landmarks, videoWidth: W, videoHeight: H, at: 0 };
}
const sample = (o: Parameters<typeof body>[0] = {}) => measureLean(body(o))!;
const profileFrom = (o: Parameters<typeof body>[0] = {}): LeanProfile => {
  const s = sample(o);
  return {
    a0: s.torso,
    s0: s.shoulder,
    range: DEFAULT_LEAN_CONFIG.defaultRange,
    sRange: DEFAULT_LEAN_CONFIG.defaultShoulderRange,
  };
};
function run(s: LeanSession, x: LeanSample | null, ms: number) {
  let v = s.update(0, x);
  for (let t = 0; t < ms; t += 20) v = s.update(20, x);
  return v;
}

describe("G03 v2 姿态特征", () => {
  it("向用户右侧倾为正，向左为负；躯干角与肩线角同号", () => {
    const r = sample({ leanDeg: 4 }),
      l = sample({ leanDeg: -4 }),
      c = sample();
    expect(r.torso!).toBeGreaterThan(c.torso! + 0.05);
    expect(r.shoulder).toBeGreaterThan(c.shoulder + 0.05);
    expect(l.torso!).toBeLessThan(c.torso! - 0.05);
    expect(l.shoulder).toBeLessThan(c.shoulder - 0.05);
  });
  it("整体平移、鼻子（头部）移动不改变特征", () => {
    const c = sample();
    const moved = sample({ shiftX: 0.15, noseX: 0.8 });
    expect(moved.torso!).toBeCloseTo(c.torso!, 6);
    expect(moved.shoulder).toBeCloseTo(c.shoulder, 6);
  });
  it("髋部看不到时仍可用肩线；肩膀看不到或太远则拒绝", () => {
    const noHips = sample({ hips: false });
    expect(noHips.torso).toBeNull();
    expect(Number.isFinite(noHips.shoulder)).toBe(true);
    expect(measureLean(body({ vis: 0.4 }))).toBeNull();
    const far = body();
    far.landmarks[11].x = 0.51;
    far.landmarks[12].x = 0.49;
    expect(measureLean(far)).toBeNull();
    expect(measureLean({ ...body(), videoHeight: 0 })).toBeNull();
  });
  it("可见度门槛已从 0.65 放宽到 0.5", () => {
    expect(measureLean(body({ vis: 0.55 }))).not.toBeNull();
  });
  it("双信号融合并限制在 -1..1", () => {
    const p = profileFrom();
    expect(leanAmount(sample(), p)).toBeCloseTo(0, 6);
    expect(leanAmount(sample({ leanDeg: 3 }), p)).toBeGreaterThan(
      DEFAULT_LEAN_CONFIG.catchThreshold,
    );
    expect(leanAmount(sample({ leanDeg: 30 }), p)).toBe(1);
    // 只有肩线时同样可用
    const ps = profileFrom({ hips: false });
    expect(leanAmount(sample({ leanDeg: -3, hips: false }), ps)).toBeLessThan(
      -DEFAULT_LEAN_CONFIG.catchThreshold,
    );
  });
});

describe("G03 v2 一步校准", () => {
  it("双肩稳定约 1 秒即完成，并记录是否看见髋部", () => {
    const c = new LeanCalibrator();
    for (let t = 0; t <= 1100; t += 33) c.update(sample(), t);
    expect(c.stage).toBe("ready");
    expect(c.hipsSeen).toBe(true);
    expect(c.profile!.a0).not.toBeNull();
    const c2 = new LeanCalibrator();
    for (let t = 0; t <= 1100; t += 33) c2.update(sample({ hips: false }), t);
    expect(c2.stage).toBe("ready");
    expect(c2.profile!.a0).toBeNull();
  });
  it("轻微呼吸晃动不会重来；丢失会回到等待", () => {
    const c = new LeanCalibrator();
    for (let t = 0; t <= 1100; t += 33)
      c.update(sample({ leanDeg: Math.sin(t / 150) * 1.2 }), t);
    expect(c.stage).toBe("ready");
    const c2 = new LeanCalibrator();
    for (let t = 0; t <= 600; t += 33) c2.update(sample(), t);
    c2.update(null, 640);
    expect(c2.stage).toBe("visible");
    expect(c2.progress).toBe(0);
  });
});

describe("G03 v2 接星循环", () => {
  const p = profileFrom();
  it("约 3° 的轻微侧倾就能接住；左右交替六次完成", () => {
    const s = new LeanSession(p);
    run(s, sample(), 300);
    let v = s.current;
    for (let i = 0; i < 6; i++) {
      const dir = i % 2 ? 3 : -3;
      v = run(s, sample({ leanDeg: dir }), 700);
      expect(v.reps).toBe(i + 1);
      v = run(s, sample(), 400);
    }
    expect(v.complete).toBe(true);
    expect(v.reps).toBe(6);
    // 六次只用了不到 7 秒有效时间，不再每次等待 4.2 秒巡航
    expect(v.effectiveMs).toBeLessThan(7000);
  });
  it("迟滞：接光中轻微回落（仍高于保留线）不中断；短暂丢一两帧只冻结不清零", () => {
    const s = new LeanSession(p);
    run(s, sample(), 300);
    // 刚好越过进入线后回落到约 0.38（低于 0.42、高于 0.34）仍能完成
    let v = run(s, sample({ leanDeg: -2.8 }), 300);
    expect(v.arrived).toBe(true);
    v = run(s, sample({ leanDeg: -2.2 }), 400);
    expect(v.reps).toBe(1);
    // 短暂丢帧：保持进度冻结，不加时
    const s2 = new LeanSession(p);
    run(s2, sample(), 300);
    v = run(s2, sample({ leanDeg: -4 }), 200);
    const held = v.hold;
    expect(v.reps).toBe(0);
    v = s2.update(40, null);
    v = s2.update(40, null);
    expect(v.reps).toBe(0);
    expect(v.hold).toBeCloseTo(held, 5);
    v = run(s2, sample({ leanDeg: -4 }), 160);
    expect(v.reps).toBe(1);
  });
  it("丢帧超过冻结窗口：本次保持作废，不补算", () => {
    const s = new LeanSession(p);
    run(s, sample(), 300);
    run(s, sample({ leanDeg: -4 }), 180);
    let v = run(s, null, 300);
    expect(v.hold).toBe(0);
    expect(v.reps).toBe(0);
  });
  it("校准：单帧离群点不让进度归零", () => {
    const c = new LeanCalibrator();
    for (let t = 0; t <= 1200; t += 33)
      c.update(t === 495 ? sample({ leanDeg: 8 }) : sample(), t);
    expect(c.stage).toBe("ready");
  });
  it("完全不动 60 秒：0 分", () => {
    const s = new LeanSession(p);
    const v = run(s, sample(), 60000);
    expect(v.reps).toBe(0);
  });
  it("一直歪向同一侧最多得 1 分；必须回中再去另一侧", () => {
    const s = new LeanSession(p);
    let v = run(s, sample({ leanDeg: -4 }), 5000);
    expect(v.reps).toBe(1);
    expect(v.returning).toBe(true);
    v = run(s, sample({ leanDeg: -4 }), 5000);
    expect(v.reps).toBe(1);
    v = run(s, sample(), 300);
    expect(v.returning).toBe(false);
    v = run(s, sample({ leanDeg: 4 }), 600);
    expect(v.reps).toBe(2);
  });
  it("一闪而过的动作（< 220ms）不计分；方向错误不计分", () => {
    const s = new LeanSession(p);
    run(s, sample(), 200);
    let v = run(s, sample({ leanDeg: -4 }), 100);
    v = run(s, sample(), 400);
    expect(v.reps).toBe(0);
    v = run(s, sample({ leanDeg: 4 }), 2000);
    expect(v.reps).toBe(0);
  });
  it("整体平移、甩头不计分", () => {
    const s = new LeanSession(p);
    let v = run(s, sample(), 200);
    for (let i = 0; i < 20; i++) {
      v = run(s, sample({ shiftX: i % 2 ? 0.2 : -0.2, noseX: i % 2 ? 0.2 : 0.8 }), 500);
    }
    expect(v.reps).toBe(0);
  });
  it("追踪丢失：冻结时间与计分，超过 600ms 提示，恢复约 0.45 秒继续", () => {
    const s = new LeanSession(p);
    run(s, sample(), 200);
    const before = s.current.effectiveMs;
    let v = run(s, null, 400);
    expect(v.tracking).toBe("unstable");
    expect(v.effectiveMs).toBe(before);
    v = run(s, null, 400);
    expect(v.tracking).toBe("lost");
    expect(v.recovering).toBe(true);
    v = run(s, sample({ leanDeg: -4 }), 300);
    expect(v.recovering).toBe(true);
    expect(v.reps).toBe(0);
    v = run(s, sample({ leanDeg: -4 }), 600);
    expect(v.recovering).toBe(false);
    expect(v.reps).toBe(1);
  });
  it("髋部中途被遮挡：自动切到肩线继续，不中断", () => {
    const s = new LeanSession(p);
    run(s, sample(), 200);
    const v = run(s, sample({ leanDeg: -3, hips: false }), 600);
    expect(v.tracking).toBe("ok");
    expect(v.source).toBe("shoulder");
    expect(v.reps).toBe(1);
  });
  it("单帧误检跳变被丢弃", () => {
    const s = new LeanSession(p);
    run(s, sample(), 200);
    const spike = { ...sample(), shoulder: sample().shoulder - 0.6 };
    const v = s.update(20, spike);
    expect(v.tracking).toBe("unstable");
    expect(v.reps).toBe(0);
  });
  it("幅度自适应只放大且有上限；基线漂移不会造成计分", () => {
    const s = new LeanSession(p);
    run(s, sample(), 200);
    run(s, sample({ leanDeg: -20 }), 600);
    expect(s.liveProfile.range).toBeLessThanOrEqual(DEFAULT_LEAN_CONFIG.maxRange);
    expect(s.liveProfile.range).toBeGreaterThan(DEFAULT_LEAN_CONFIG.defaultRange);
    const s2 = new LeanSession(p);
    let v = s2.current;
    // 坐姿在 40 秒里慢慢偏移 2°（每帧极小）——不应被当作侧倾
    for (let t = 0; t < 40000; t += 20)
      v = s2.update(20, sample({ leanDeg: (t / 40000) * 2 }));
    expect(v.reps).toBe(0);
  });
  it("校准时看不到髋部，游戏中髋部出现会在中立时补记基线", () => {
    const s = new LeanSession(profileFrom({ hips: false }));
    run(s, sample(), 300);
    expect(s.liveProfile.a0).not.toBeNull();
    expect(s.current.source).toBe("torso");
  });
});
