import { describe, expect, it } from "vitest";
import { CAMERA_CHARGE, CameraCharge, depthGain } from "./chargeModel";
import { SquatSession, squatThresholds, type SquatProfile, type SquatUpdate } from "../../vision/squatPose";
import { chargeToDistance, JUMP_CONFIG } from "./jumpLogic";

// 均为模拟动作（合成双肩 / 合成 SquatUpdate），不是真人摄像头验证。
const profile: SquatProfile = { ly0: 300, ry0: 300, cx0: 640, w0: 200, tilt0: 0, amp: 0.12, jitterPx: 1 };
const downU = squatThresholds(profile).downU;
const upd = (u: number, charging = true, extra: Partial<SquatUpdate> = {}) =>
  ({ u, charging, release: false, cancel: false, enteredDownSec: 0, ...extra }) as SquatUpdate;
const hold = (cc: CameraCharge, u: number, sec: number) => {
  for (let t = 0; t < sec; t += 1 / 60) cc.step(1 / 60, upd(u), profile);
  return cc.charge;
};

describe("G05 摄像头蓄力模型（模拟输入）", () => {
  it("轻微抖一下（0.2 秒刚过门槛）不足以起跳", () => {
    const cc = new CameraCharge();
    expect(hold(cc, downU + 0.05, 0.2)).toBeLessThan(CAMERA_CHARGE.minJump);
  });

  it("蹲得越深蓄得越快，但都比按键慢（1 秒 < 0.8 秒蓄力）", () => {
    const shallow = hold(new CameraCharge(), downU + 0.05, 1);
    const normal = hold(new CameraCharge(), 1.0, 1);
    const big = hold(new CameraCharge(), 1.6, 1);
    expect(shallow).toBeLessThan(normal);
    expect(normal).toBeLessThanOrEqual(big);
    expect(big).toBeLessThan(0.8);
    expect(depthGain(3, downU)).toBe(CAMERA_CHARGE.maxDepthGain);
  });

  it("开始站起即冻结并回退反应延迟，回升途中不再增加", () => {
    const cc = new CameraCharge();
    const peak = hold(cc, 1.0, 1.2);
    // 回升：u 逐帧下降
    for (let u = 1.0; u > 0.4; u -= 0.05) cc.step(1 / 60, upd(u), profile);
    expect(cc.frozen).toBe(true);
    expect(cc.charge).toBeLessThan(peak);
    expect(peak - cc.charge).toBeLessThan(0.15);
  });

  it("封顶 1.3 秒，取消即清零", () => {
    const cc = new CameraCharge();
    expect(hold(cc, 1.2, 5)).toBeCloseTo(CAMERA_CHARGE.maxCharge, 5);
    cc.step(1 / 60, upd(1.2, false, { cancel: true }), profile);
    expect(cc.charge).toBe(0);
    expect(chargeToDistance(CAMERA_CHARGE.maxCharge)).toBeLessThan(chargeToDistance(JUMP_CONFIG.maxChargeSec));
  });

  it("接真实 SquatSession：自然浅蹲一个来回（停 0.2 秒）不会跳过中位目标；停约 1.3 秒落在常见目标区间", () => {
    const run = (holdSec: number) => {
      const s = new SquatSession(profile);
      const cc = new CameraCharge();
      const depthAt = (t: number) => {
        const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
        if (t < 0.4) return 0;
        t -= 0.4;
        if (t < 0.45) return ease(t / 0.45);
        t -= 0.45;
        if (t < holdSec) return 1;
        t -= holdSec;
        return 1 - ease(t / 0.4);
      };
      for (let t = 0; t < 4; t += 1 / 30) {
        const y = 300 + depthAt(t) * profile.amp * profile.w0;
        const o = s.update(1000 / 30, { ly: y, ry: y, lx: 540, rx: 740, width: 200, videoH: 720 }, t * 1000);
        cc.step(1 / 30, o, profile);
        if (o.release) return cc.charge;
      }
      return -1;
    };
    const quick = run(0.2);
    expect(quick).toBeGreaterThan(0);
    expect(quick).toBeLessThan(0.55); // 最近目标约需 0.55 秒
    const held = run(1.3);
    expect(held).toBeGreaterThan(0.6);
    expect(held).toBeLessThan(1.0);
  });
});
