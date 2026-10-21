import { describe, it, expect } from "vitest";
import {
  DEFAULT_WING_CONFIG,
  WingCalibrator,
  WingSession,
  expandAmount,
  measureWing,
  wingInstruction,
  type PoseLandmark,
  type WingMeasure,
  type WingProfile,
} from "./wingPose";

/**
 * G02 动作判定的纯逻辑测试。
 * 这些用例覆盖了验收清单里所有「不能加分」的场景：
 * 单手、保持不回位、静止抖动、整个人平移、识别丢失后恢复。
 */

const FRAME_W = 640;
const FRAME_H = 480;
const SHOULDER_W = 0.16; // 归一化肩宽

/** 构造 33 点姿态：肩在 y=0.4，手腕按 q（以肩宽为单位）向外展开 */
function pose(
  qL: number,
  qR: number,
  options: { mirror?: boolean; offsetX?: number; visible?: boolean } = {},
): PoseLandmark[] {
  const { mirror = false, offsetX = 0, visible = true } = options;
  const points: PoseLandmark[] = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.5,
    visibility: 0,
  }));
  const center = 0.5 + offsetX;
  const lS = center - SHOULDER_W / 2;
  const rS = center + SHOULDER_W / 2;
  const put = (index: number, x: number, y: number) => {
    points[index] = { x, y, visibility: visible ? 0.99 : 0 };
  };
  if (!mirror) {
    put(11, lS, 0.4);
    put(12, rS, 0.4);
    put(13, lS - qL * SHOULDER_W * 0.5, 0.55);
    put(15, lS - qL * SHOULDER_W, 0.7);
    put(14, rS + qR * SHOULDER_W * 0.5, 0.55);
    put(16, rS + qR * SHOULDER_W, 0.7);
  } else {
    // 镜像画面：左肩出现在画面右侧，但展开方向同样朝外侧
    put(11, rS, 0.4);
    put(12, lS, 0.4);
    put(13, rS + qL * SHOULDER_W * 0.5, 0.55);
    put(15, rS + qL * SHOULDER_W, 0.7);
    put(14, lS - qR * SHOULDER_W * 0.5, 0.55);
    put(16, lS - qR * SHOULDER_W, 0.7);
  }
  return points;
}

const sample = (q: number): WingMeasure => ({
  qL: q,
  qR: q,
  shoulderWidthPx: 100,
  mirrored: false,
});

const PROFILE: WingProfile = {
  q0L: 0.1,
  q1L: 0.9,
  q0R: 0.1,
  q1R: 0.9,
  jitter: 0.01,
  shoulderWidthPx: 100,
};

/** 以 60fps 推进 ms 毫秒，返回最后一帧与期间累计的新增次数 */
function run(
  session: WingSession,
  ms: number,
  makeSample: () => WingMeasure | null,
) {
  let last = session.update(16, makeSample());
  let added = last.added;
  for (let t = 16; t < ms; t += 16) {
    last = session.update(16, makeSample());
    added += last.added;
  }
  return Object.assign(last, { addedTotal: added });
}

describe("展开量计算", () => {
  it("归一化坐标先换算像素，再按肩宽归一化", () => {
    const m = measureWing(pose(1, 1), FRAME_W, FRAME_H)!;
    expect(m).not.toBeNull();
    expect(m.qL).toBeCloseTo(1, 1);
    expect(m.qR).toBeCloseTo(1, 1);
    expect(m.shoulderWidthPx).toBeCloseTo(SHOULDER_W * FRAME_W, 1);
  });

  it("镜像画面不会让左右语义翻转", () => {
    const normal = measureWing(pose(0.8, 0.9), FRAME_W, FRAME_H)!;
    const mirrored = measureWing(pose(0.8, 0.9, { mirror: true }), FRAME_W, FRAME_H)!;
    expect(mirrored.qL).toBeCloseTo(normal.qL, 1);
    expect(mirrored.qR).toBeCloseTo(normal.qR, 1);
  });

  it("整个人左右平移不改变展开量", () => {
    const still = measureWing(pose(0.5, 0.5), FRAME_W, FRAME_H)!;
    const moved = measureWing(pose(0.5, 0.5, { offsetX: 0.2 }), FRAME_W, FRAME_H)!;
    expect(moved.qL).toBeCloseTo(still.qL, 3);
    expect(moved.qR).toBeCloseTo(still.qR, 3);
  });

  it("关键点不可见时返回 null，由上层冻结判定", () => {
    expect(measureWing(pose(1, 1, { visible: false }), FRAME_W, FRAME_H)).toBeNull();
  });

  it("同一姿势随镜头距离缩放，展开量不改变", () => {
    const original = pose(1, 1);
    const scaled = original.map(p => ({ ...p, x: .5 + (p.x - .5) * .8, y: .5 + (p.y - .5) * .8 }));
    expect(measureWing(scaled, FRAME_W, FRAME_H)!.qL).toBeCloseTo(measureWing(original, FRAME_W, FRAME_H)!.qL, 5);
  });

  it("肘不可见、手腕出画或坐标非法，校准与游戏均判无效", () => {
    for (const [index, change] of [[13, {visibility:0}], [15, {x:1.2}], [11, {x:NaN}]] as const) {
      const points = pose(1,1);
      Object.assign(points[index], change);
      expect(measureWing(points, FRAME_W, FRAME_H)).toBeNull();
    }
  });

  it("最终展开量取两侧较小值", () => {
    expect(expandAmount(1, 0.1, PROFILE).u).toBe(0);
    expect(expandAmount(1, 0.5, PROFILE).u).toBeCloseTo(0.5, 2);
  });
});

describe("动作状态机", () => {
  it("只展开一只手不会进入有效展开", () => {
    const session = new WingSession(PROFILE);
    run(session, 600, () => sample(0.1));
    const update = run(session, 2000, () => ({
      qL: 1,
      qR: 0.1,
      shoulderWidthPx: 100,
      mirrored: false,
    }));
    expect(update.stage).toBe("ready");
    expect(update.openValid).toBe(false);
    expect(update.reps).toBe(0);
  });

  it("原地不动不会自动加分", () => {
    const session = new WingSession(PROFILE);
    const update = run(session, 4000, () => sample(0.1));
    expect(update.reps).toBe(0);
    expect(update.u).toBeLessThan(0.25);
  });

  it("静止抖动不会被判为展开", () => {
    const session = new WingSession(PROFILE);
    let flip = 0;
    const update = run(session, 4000, () => sample(flip++ % 2 ? 0.16 : 0.12));
    expect(update.openValid).toBe(false);
    expect(update.reps).toBe(0);
  });

  it("展开→保持→回位 计一次；保持不回位不重复加分", () => {
    const session = new WingSession(PROFILE);
    run(session, 600, () => sample(0.1));
    const opened = run(session, 1200, () => sample(1));
    expect(opened.openValid).toBe(true);
    // 一直保持展开：没有回位，不能加分
    const held = run(session, 4000, () => sample(1));
    expect(held.reps).toBe(0);
    expect(held.openValid).toBe(true);
    // 回位后 +1
    const back = run(session, 800, () => sample(0.1));
    expect(back.reps).toBe(1);
    expect(back.addedTotal).toBe(1);
    // 再次保持展开不会连续加分
    const again = run(session, 3000, () => sample(0.1));
    expect(again.reps).toBe(1);
  });

  it("完整五次后结束", () => {
    const session = new WingSession(PROFILE);
    for (let rep = 0; rep < 5; rep++) {
      run(session, 600, () => sample(0.1));
      run(session, 900, () => sample(1));
      const back = run(session, 700, () => sample(0.1));
      expect(back.reps).toBe(rep + 1);
    }
    const finished = session.update(16, sample(0.1));
    expect(finished.complete).toBe(true);
    expect(finished.reps).toBe(5);
  });

  it("展开后只收回单手不能得分，两手均回位后才计一次", () => {
    const s = new WingSession(PROFILE);
    run(s, 600, () => sample(.1));
    run(s, 1200, () => sample(1));
    expect(run(s, 1600, () => ({...sample(1), qL:.1})).reps).toBe(0);
    expect(run(s, 900, () => sample(.1)).reps).toBe(1);
  });

  it("刚进入游戏尚无新帧先冻结，新帧到达正常跟踪", () => {
    const s = new WingSession(PROFILE);
    expect(run(s, 150, () => null).tracking).toBe("unstable");
    expect(run(s, 600, () => sample(.1)).tracking).toBe("ok");
    expect(s.repCount).toBe(0);
  });

  it("恢复必须连续稳定，间断可见不能累计恢复时间", () => {
    const s = new WingSession(PROFILE);
    run(s, 900, () => null);
    for (let i=0;i<5;i++) {
      expect(run(s, 500, () => sample(.1)).resuming).toBe(true);
      run(s, 100, () => null);
    }
    expect(run(s, 600, () => sample(.1)).resuming).toBe(true);
    expect(run(s, 600, () => sample(.1)).tracking).toBe("ok");
  });

  it("暂停使半途动作作废，不能在继续后补计", () => {
    const s = new WingSession(PROFILE);
    run(s, 600, () => sample(.1));
    run(s, 1200, () => sample(1));
    s.pause();
    expect(run(s, 2200, () => sample(.1)).reps).toBe(0);
    run(s, 1200, () => sample(1));
    expect(run(s, 900, () => sample(.1)).reps).toBe(1);
  });

  it("短暂丢帧只冻结判定，不重置进度", () => {
    const session = new WingSession(PROFILE);
    run(session, 600, () => sample(0.1));
    run(session, 400, () => sample(1));
    const frozen = run(session, 200, () => null);
    expect(frozen.tracking).toBe("unstable");
    expect(frozen.interrupted).toBe(false);
    // 恢复后继续之前的保持（不会因为丢帧而回退）
    const resumed = run(session, 500, () => sample(1));
    expect(resumed.openValid).toBe(true);
  });

  it("连续丢失超过宽限后暂停计时，恢复需稳定确认，且不补算已丢失的动作", () => {
    const session = new WingSession(PROFILE);
    run(session, 600, () => sample(0.1));
    run(session, 1000, () => sample(1)); // 有效展开
    const before = session.elapsed;
    const lost = run(session, 800, () => null);
    expect(lost.tracking).toBe("lost");
    expect(lost.interrupted).toBe(true);
    expect(lost.reps).toBe(0);
    // 丢失期间有效时间不增长
    expect(session.elapsed).toBe(before);
    // 恢复：先稳定 1s，再回到 READY，不能因为「刚恢复时手还举着」而加分
    const resuming = run(session, 400, () => sample(1));
    expect(resuming.resuming).toBe(true);
    expect(resuming.reps).toBe(0);
    run(session, 900, () => sample(1));
    const settled = run(session, 300, () => sample(1));
    expect(settled.stage).toBe("ready");
    const stillOpen = run(session, 1500, () => sample(1));
    expect(stillOpen.reps).toBe(0);
    // 只有重新完成一次展开→回位才 +1
    run(session, 700, () => sample(0.1));
    const rep = run(session, 1200, () => sample(1));
    expect(rep.reps).toBe(0); // 只是展开有效，还没回位
    const done = run(session, 800, () => sample(0.1));
    expect(done.reps).toBe(1);
  });

  it("超过建议时长会提示结束或继续，但不强制中断", () => {
    const session = new WingSession(PROFILE, {
      ...DEFAULT_WING_CONFIG,
      softLimitMs: 1000,
    });
    const update = run(session, 2500, () => sample(0.1));
    expect(update.overSoftLimit).toBe(true);
    expect(update.complete).toBe(false);
  });

  it("指令文案随阶段变化", () => {
    const session = new WingSession(PROFILE);
    expect(wingInstruction(run(session, 600, () => sample(0.1)))).toBe(
      "缓慢展开双臂",
    );
    expect(wingInstruction(run(session, 500, () => sample(1)))).toBe("保持一下");
    expect(wingInstruction(run(session, 600, () => sample(1)))).toBe("放松回位");
  });
});

describe("个人校准", () => {
  it("中立姿态抖动过大时要求重新校准", () => {
    const calibrator = new WingCalibrator();
    for (let i = 0; i < 40; i++)
      calibrator.addNeutral(0.2 + (i % 2 ? 0.12 : -0.12), 0.2);
    const neutral = calibrator.captureNeutral();
    expect(neutral.ok).toBe(false);
    expect(neutral.reason).toBe("jitter");
    expect(calibrator.captureSpread(100).ok).toBe(false);
  });

  it("展开幅度不足以区分抖动时拒绝通过", () => {
    const calibrator = new WingCalibrator();
    for (let i = 0; i < 40; i++) calibrator.addNeutral(0.2 + (i % 3) * 0.002, 0.2);
    expect(calibrator.captureNeutral().ok).toBe(true);
    calibrator.beginSpread(0);
    calibrator.trackSpread(0.26, 0.26, 100);
    const result = calibrator.captureSpread(100);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("separation");
  });

  it("正常展开幅度生成个人阈值", () => {
    const calibrator = new WingCalibrator();
    for (let i = 0; i < 40; i++) calibrator.addNeutral(0.2 + (i % 3) * 0.002, 0.2);
    calibrator.captureNeutral();
    calibrator.beginSpread(0);
    let track = calibrator.trackSpread(0.7, 0.68, 100);
    track = calibrator.trackSpread(0.7, 0.72, 500);
    expect(track.progress).toBeGreaterThan(0.9);
    for (let at = 600; at <= 1600; at += 100) calibrator.trackSpread(0.7, 0.72, at);
    const stable = calibrator.trackSpread(0.7, 0.72, 1700);
    expect(stable.settled).toBe(true);
    const result = calibrator.captureSpread(120);
    expect(result.ok).toBe(true);
    expect(result.profile?.q1L).toBeGreaterThan(result.profile!.q0L);
    expect(result.profile?.shoulderWidthPx).toBe(120);
  });

  it("左右在不同时刻展开或仅一帧尖峰，不能拼成舒适端点", () => {
    const c = new WingCalibrator();
    for(let i=0;i<12;i++) c.addNeutral(.1,.1);
    c.captureNeutral(); c.beginSpread(0);
    for(let at=100;at<=1500;at+=100) {
      expect(c.trackSpread(at%200 ? .8:.1, at%200 ? .1:.8, at).settled).toBe(false);
    }
    c.trackSpread(2,2,1600);
    c.trackSpread(.1,.1,1700);
    expect(c.captureSpread(100).ok).toBe(false);
  });
});
