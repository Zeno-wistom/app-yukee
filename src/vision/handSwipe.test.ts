import { describe, it, expect } from "vitest";
import {
  HandSwipeDetector,
  NodDetector,
  defaultHandSwipeConfig,
} from "./handSwipe";

/** 以固定步长推进时间，模拟 ~12 FPS 的采样节奏（83ms/帧） */
const STEP = 83;

describe("手掌滑动检测（HandSwipeDetector）", () => {
  it("一次快速左挥触发一次 left，轨迹清空后不会立即再触发", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.5, t);
    t += STEP;
    d.update(true, 0.42, t);
    t += STEP;
    expect(d.update(true, 0.3, t)).toBe("left"); // dx = -0.2
    expect(d.update(true, 0.3, t + STEP)).toBeNull();
  });

  it("右挥触发 right", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.4, t);
    t += STEP;
    d.update(true, 0.5, t);
    t += STEP;
    expect(d.update(true, 0.62, t)).toBe("right");
  });

  it("轻微抖动（位移不足）不触发", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.5, t);
    for (let i = 1; i <= 5; i++) {
      t += STEP;
      d.update(true, 0.5 + (i % 2 === 0 ? 0.03 : -0.03), t);
    }
    expect(d.update(true, 0.51, t + STEP)).toBeNull();
  });

  it("慢速平移（速度不足）不触发", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.3, t);
    // 0.3 → 0.46 共 5 步 ≈ 415ms，平均速度 ≈ 0.39/s < 0.5
    for (let i = 1; i <= 5; i++) {
      t += STEP;
      expect(d.update(true, 0.3 + i * 0.032, t)).toBeNull();
    }
  });

  it("cooldown 内不重复触发，到期后恢复", () => {
    const d = new HandSwipeDetector();
    let t = 0;
    d.update(true, 0.5, t);
    t += STEP;
    expect(d.update(true, 0.3, t)).toBe("left"); // t=83 触发
    t += STEP; // t=166
    d.update(true, 0.5, t);
    t += STEP; // t=249
    expect(d.update(true, 0.25, t)).toBeNull(); // 距上次仅 166ms < 520ms
    // cooldown 过后（回到中位已发生：0.5 采样重新武装）再挥 → 触发
    t += 600; // t=849
    d.update(true, 0.5, t);
    t += STEP; // t=932
    expect(d.update(true, 0.3, t)).toBe("left");
  });

  it("同方向未回中不触发；手放一边不会连续切换", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.5, t);
    t += STEP;
    d.update(true, 0.44, t);
    t += STEP;
    expect(d.update(true, 0.32, t)).toBe("left"); // t=166 触发
    // 停在左侧（未回中），cooldown=0 但未回中 → 再次大幅左挥不触发
    t += 600;
    d.update(true, 0.36, t);
    t += STEP;
    expect(d.update(true, 0.16, t)).toBeNull();
    // 回中后重新武装 → 可再触发
    t += 300;
    expect(d.update(true, 0.5, t)).toBeNull(); // 回中样本
    t += STEP;
    d.update(true, 0.44, t);
    t += STEP;
    expect(d.update(true, 0.3, t)).toBe("left");
  });

  it("手掌离场清空轨迹；重新出现后需重新蓄力", () => {
    const d = new HandSwipeDetector({ cooldownMs: 0 });
    let t = 0;
    d.update(true, 0.5, t);
    t += STEP;
    d.update(true, 0.45, t);
    expect(d.update(false, 0.45, t + STEP)).toBeNull();
    t += STEP * 2;
    // 瞬移式出现（无中间轨迹）不算有效滑动
    expect(d.update(true, 0.15, t)).toBeNull();
  });

  it("默认配置关键阈值符合「明显拨动才触发」的产品预期", () => {
    expect(defaultHandSwipeConfig.minDistance).toBeGreaterThanOrEqual(0.14);
    expect(defaultHandSwipeConfig.minVelocity).toBeGreaterThan(0);
    expect(defaultHandSwipeConfig.cooldownMs).toBeGreaterThanOrEqual(450);
    expect(defaultHandSwipeConfig.windowMs).toBeLessThan(500);
  });
});

describe("点头确认（NodDetector）", () => {
  it("向下点头触发一次，随后必须回正才能再触发", () => {
    const n = new NodDetector({ cooldownMs: 0 });
    let t = 0;
    expect(n.update(0.01, t)).toBe(false);
    t += STEP;
    expect(n.update(-0.06, t)).toBe(true);
    t += STEP;
    expect(n.update(-0.07, t)).toBe(false);
    expect(n.update(0.01, t + STEP)).toBe(false); // 回正（重新武装）
    t += STEP * 2;
    expect(n.update(-0.06, t)).toBe(true);
  });

  it("抬头不是确认信号", () => {
    const n = new NodDetector({ cooldownMs: 0 });
    let t = 0;
    expect(n.update(0.08, t)).toBe(false);
    t += STEP;
    expect(n.update(0.08, t)).toBe(false);
    expect(n.isArmed).toBe(true);
  });

  it("cooldown 防连发", () => {
    const n = new NodDetector();
    let t = 0;
    t += STEP;
    n.update(0.01, 0);
    expect(n.update(-0.06, t)).toBe(true);
    t += STEP;
    n.update(0.005, t); // 回正
    t += STEP;
    expect(n.update(-0.06, t)).toBe(false); // cooldown 内
    t += 1200;
    n.update(0.005, t);
    t += STEP;
    expect(n.update(-0.06, t)).toBe(true);
  });

  it("单帧向下尖峰与持续低头都不算点头", () => {
    const n = new NodDetector({ cooldownMs: 0 });
    expect(n.update(0, 0)).toBe(false);
    expect(n.update(-0.08, 10)).toBe(false); // 10ms 尖峰，低于最短运动时间
    expect(n.update(-0.08, 100)).toBe(false); // 已经停在低位，没有新增位移
  });
});
