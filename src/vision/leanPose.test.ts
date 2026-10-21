import { describe, it, expect } from "vitest";
import {
  measureLean,
  leanAmount,
  LeanSession,
  LeanCalibrator,
  DEFAULT_LEAN_CONFIG,
  leanCenterThreshold,
} from "./leanPose";
import type { PoseFrame } from "./wingPose";

const profile = { a0: 0, aL: -0.2, aR: 0.25 };
function frame(shift = 0, lean = 0): PoseFrame {
  const landmarks = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.2,
    visibility: 1,
  }));
  landmarks[11] = { x: 0.4 + shift + lean, y: 0.3, visibility: 1 };
  landmarks[12] = { x: 0.6 + shift + lean, y: 0.3, visibility: 1 };
  landmarks[23] = { x: 0.43 + shift, y: 0.7, visibility: 1 };
  landmarks[24] = { x: 0.57 + shift, y: 0.7, visibility: 1 };
  return { landmarks, videoWidth: 640, videoHeight: 480, at: 0 };
}
const config = { ...DEFAULT_LEAN_CONFIG, cruiseMs: 0 };
function step(s: LeanSession, a: number | null, ms: number) {
  let value = s.update(0, a);
  for (let t = 0; t < ms; t += 20) value = s.update(20, a);
  return value;
}
describe("G03 躯干几何", () => {
  it("先换像素，统一镜像；平移与鼻子不改变输入", () => {
    expect(measureLean(frame(0, 0.06))!).toBeCloseTo(
      -Math.atan2(0.06 * 640, 0.4 * 480),
    );
    expect(measureLean(frame(0.1))).toBeCloseTo(0);
    const f = frame();
    f.landmarks[0].x = 0.9;
    expect(measureLean(f)).toBeCloseTo(0);
    expect(
      measureLean(frame(0, 0.06), { ...config, mirror: false })!,
    ).toBeGreaterThan(0);
  });
  it("任一髋不可见、缺少置信度或出界均拒绝", () => {
    const f = frame();
    f.landmarks[23].visibility = 0.64;
    expect(measureLean(f)).toBeNull();
    f.landmarks[23].visibility = 1;
    f.landmarks[24].y = 1.1;
    expect(measureLean(f)).toBeNull();
    expect(measureLean({ ...frame(), videoHeight: 0 })).toBeNull();
    const absent = frame();
    absent.landmarks[23].visibility = undefined as unknown as number;
    expect(measureLean(absent)).toBeNull();
  });
  it("按个人两侧幅度归一化并限制在 -1 到 1", () => {
    expect(leanAmount(-0.13, profile)).toBeCloseTo(-0.65);
    expect(leanAmount(0.1625, profile)).toBeCloseTo(0.65);
    expect(leanAmount(1, profile)).toBe(1);
  });
});
describe("G03 目标闭环与时钟", () => {
  it("到达必须连续600ms，回中必须连续400ms，错误侧不能触发", () => {
    const s = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
    step(s, 0, 500);
    expect(step(s, 0.25, 1500).arrived).toBe(false);
    for (let i = 0; i < 5; i++) s.update(100, -0.2);
    expect(s.current.arrived).toBe(false);
    s.update(99, -0.2);
    expect(s.current.arrived).toBe(false);
    s.update(1, -0.2);
    expect(s.current.arrived).toBe(true);
    for (let i = 0; i < 3; i++) s.update(100, 0);
    expect(s.current.reps).toBe(0);
    s.update(100, 0);
    expect(s.current.reps).toBe(1);
  });
  it("左倾保持只标到达，回中才计次；一直同侧不能重复计数", () => {
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    expect(step(s, -0.2, 900).reps).toBe(0);
    expect(step(s, -0.2, 4000).arrived).toBe(true);
    expect(step(s, 0, 900).reps).toBe(1);
    expect(step(s, -0.2, 4000).reps).toBe(1);
  });
  it("连续六次左右交替，未到阈值不计分，六星后不再累计", () => {
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    expect(step(s, -0.05, 2000).arrived).toBe(false);
    for (let i = 0; i < 6; i++) {
      step(s, i % 2 ? 0.25 : -0.2, 1100);
      expect(step(s, 0, 1000).reps).toBe(i + 1);
    }
    expect(step(s, 0, 2000).complete).toBe(true);
  });
  it("短丢失冻结，长丢失取消半动作；恢复需中立稳定一秒和三秒准备", () => {
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    step(s, -0.2, 1000);
    const time = s.current.effectiveMs;
    expect(step(s, null, 200).effectiveMs).toBe(time);
    expect(step(s, null, 120).tracking).toBe("lost");
    expect(step(s, 0.25, 5000).recovering).toBe(true);
    expect(step(s, 0, 3800).recovering).toBe(true);
    expect(step(s, 0, 600).recovering).toBe(false);
    expect(s.current.reps).toBe(0);
    expect(s.current.effectiveMs).toBeLessThan(time + 600);
  });
  it("暂停清掉未完成动作；45秒不是成功", () => {
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    step(s, -0.2, 1000);
    s.pause();
    step(s, 0, 4500);
    expect(s.current.reps).toBe(0);
    const u = step(s, 0, 46000);
    expect(u.overSoftLimit).toBe(true);
    expect(u.complete).toBe(false);
  });
});
describe("G03 校准", () => {
  it("重复旧帧与不稳定姿态不能累计校准时间", () => {
    const c = new LeanCalibrator();
    for (let i = 0; i < 100; i++) c.update(0, 100);
    expect(c.stage).toBe("visible");
    for (let t = 150; t < 3000; t += 50) c.update(t % 100 ? 0.1 : 0, t);
    expect(c.stage).toBe("visible");
  });
  it("静止不能伪装左右端点；需稳定有效新帧，丢失重新采当前阶段", () => {
    const c = new LeanCalibrator();
    for (let t = 0; t <= 3400; t += 50) c.update(0, t);
    expect(c.stage).toBe("left");
    for (let t = 3450; t < 5000; t += 50) c.update(0, t);
    expect(c.stage).toBe("left");
    for (let t = 5000; t < 6000; t += 50) c.update(-0.16, t);
    expect(c.stage).toBe("right");
    c.update(0.18, 6050);
    c.update(null, 6100);
    for (let t = 6150; t < 6900; t += 50) c.update(0.18, t);
    expect(c.profile).toBeNull();
    for (let t = 6900; t < 7200; t += 50) c.update(0.18, t);
    expect(c.profile?.aL).toBeCloseTo(-0.16);
    expect(c.profile?.aR).toBeCloseTo(0.18);
  });
});

describe("G03 新手容错（不降低可见性或进入门槛）", () => {
  it("短遮挡冻结已累计保持，缺失时间不能凑够600ms", () => {
    const s = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
    step(s, 0, 500);
    step(s, -0.2, 400);
    const time = s.current.effectiveMs;
    step(s, null, 100);
    expect(s.current.hold).toBeCloseTo(2 / 3);
    expect(s.current.effectiveMs).toBe(time);
    expect(step(s, -0.2, 180).arrived).toBe(false);
    expect(step(s, -0.2, 20).arrived).toBe(true);
  });
  it("迟滞只保留已进入的保持，未达0.65不能从0.55起步", () => {
    const s = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
    step(s, 0, 500);
    expect(step(s, -0.12, 1800).arrived).toBe(false);
    step(s, -0.14, 200);
    expect(step(s, -0.12, 400).arrived).toBe(true);
    // 回中先进入0.20，再允许轻微抖到0.28，不要求僵直归零。
    step(s, 0, 200);
    expect(step(s, 0.06, 200).reps).toBe(1);
  });
  it("越界100ms不清零且不加保持；持续反向动作会重置", () => {
    const s = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
    step(s, 0, 500);
    step(s, -0.2, 300);
    step(s, 0, 100);
    expect(step(s, -0.2, 280).arrived).toBe(false);
    expect(step(s, -0.2, 20).arrived).toBe(true);
    const t = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
    step(t, 0, 500);
    step(t, -0.2, 400);
    step(t, 0.25, 200);
    expect(step(t, -0.2, 400).arrived).toBe(false);
  });
  it("舒适小幅校准保留两侧独立幅度，噪声回中容差有上限", () => {
    const c = new LeanCalibrator();
    let at = 0;
    const sample = (a: number, ms: number) => {
      for (let n = 0; n < ms; n += 50) {
        c.update(a + (n % 150 === 0 ? 0.006 : -0.006), at);
        at += 50;
      }
    };
    sample(0, 3400);
    expect(c.stage).toBe("left");
    sample(-0.075, 1000);
    sample(0.095, 1000);
    expect(c.stage).toBe("ready");
    expect(c.profile!.aL).toBeCloseTo(-0.081);
    expect(leanAmount(-0.06, c.profile!)).toBeLessThan(-0.65);
    expect(leanCenterThreshold({ ...profile, neutralNoise: 1 })).toBe(0.3);
  });
  it("单帧中立离群不反复归零，连续摇摆仍不能完成", () => {
    const c = new LeanCalibrator();
    for (let at = 0; at <= 3200; at += 50) c.update(at === 1900 ? 0.07 : 0, at);
    expect(c.stage).toBe("left");
    for (let at = 3250; at < 6000; at += 50)
      c.update(at % 100 ? -0.07 : -0.16, at);
    expect(c.stage).toBe("left");
  });
  it("300ms以上缺失取消半动作；100ms以内的校准缺帧只冻结", () => {
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    step(s, -0.2, 500);
    step(s, null, 320);
    expect(s.current.tracking).toBe("lost");
    expect(s.current.hold).toBe(0);
    const c = new LeanCalibrator();
    for (let at = 0; at <= 600; at += 50) c.update(0, at);
    c.update(null, 650);
    c.update(null, 700);
    for (let at = 750; at <= 1200; at += 50) c.update(0, at);
    expect(c.stage).toBe("neutral");
  });
  it("不同帧率具有相同保持时长；大时间间隔不能补算一次动作", () => {
    for (const hz of [30, 60, 144]) {
      const s = new LeanSession(profile, { ...config, smoothTauMs: 0.001 });
      for (let n = 0; n < hz / 2; n++) s.update(1000 / hz, 0);
      for (let n = 0; n < Math.ceil(hz * 0.7); n++) s.update(1000 / hz, -0.2);
      expect(s.current.arrived).toBe(true);
      for (let n = 0; n < Math.ceil(hz * 0.5); n++) s.update(1000 / hz, 0);
      expect(s.current.reps).toBe(1);
    }
    const s = new LeanSession(profile, config);
    step(s, 0, 500);
    s.update(8000, -0.2);
    expect(s.current.arrived).toBe(false);
  });
});
