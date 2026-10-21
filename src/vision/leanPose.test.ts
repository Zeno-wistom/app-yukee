import { describe, it, expect } from "vitest";
import {
  measureLean,
  leanAmount,
  LeanSession,
  LeanCalibrator,
  DEFAULT_LEAN_CONFIG,
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
