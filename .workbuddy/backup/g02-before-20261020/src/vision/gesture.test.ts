import { describe, it, expect } from "vitest";
import { GestureDetector, Ema, headGeometry } from "./gesture";
describe("手势判定", () => {
  it("超过阈值触发对应方向，符号约定：左转为正、抬头为正", () => {
    const g = new GestureDetector({ cooldownMs: 0 });
    expect(g.update(0.1, 0, 0)).toBe("left");
    expect(g.update(-0.1, 0, 0)).toBe("right"); // 从左直接摆向右：右侧仍处武装态，应触发
    g.reset();
    expect(g.update(-0.1, 0, 0)).toBe("right");
    g.reset();
    expect(g.update(0, 0.1, 0)).toBe("up");
    g.reset();
    expect(g.update(0, -0.1, 0)).toBe("down");
  });
  it("必须回正后才能再次触发同类动作", () => {
    const g = new GestureDetector({ cooldownMs: 0 });
    expect(g.update(0.1, 0, 0)).toBe("left");
    expect(g.update(0.1, 0, 100)).toBe(null); // 保持左偏不连发
    expect(g.update(0.01, 0, 200)).toBe(null); // 回正中
    expect(g.update(0.1, 0, 300)).toBe("left"); // 回正后可再触发
  });
  it("cooldown 内不触发但回正仍然重新武装", () => {
    const g = new GestureDetector({ cooldownMs: 500 });
    expect(g.update(0.1, 0, 0)).toBe("left");
    expect(g.update(0, 0, 100)).toBe(null); // 回正，重新武装
    expect(g.update(0.1, 0, 300)).toBe(null); // cooldown 未过
    expect(g.update(0.1, 0, 300)).toBe(null);
    expect(g.update(0, 0, 400)).toBe(null);
    expect(g.update(0.1, 0, 600)).toBe("left");
  });
  it("斜向动作只触发偏移更大的轴", () => {
    const g = new GestureDetector({ cooldownMs: 0 });
    expect(g.update(0.09, 0.061, 0)).toBe("left");
    g.reset();
    expect(g.update(0.076, 0.09, 0)).toBe("up");
  });
  it("direction 用于 HUD：低于显示阈值回中", () => {
    const g = new GestureDetector();
    expect(g.direction(0.02, 0.01)).toBe("center");
    expect(g.direction(0.06, 0)).toBe("left");
    expect(g.direction(0, -0.05)).toBe("down");
  });
  it("Ema 平滑收敛", () => {
    const ema = new Ema(0.5);
    ema.push(0);
    ema.push(1);
    ema.push(1);
    expect(ema.current!).toBeGreaterThan(0.5);
    expect(ema.current!).toBeLessThan(1);
  });
  it("headGeometry：鼻尖右移为正 yaw，上移为正 pitch", () => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
    points[4] = { x: 0.56, y: 0.46 }; // 鼻尖
    points[33] = { x: 0.4, y: 0.4 };
    points[263] = { x: 0.6, y: 0.4 };
    points[234] = { x: 0.3, y: 0.5 };
    points[454] = { x: 0.7, y: 0.5 };
    points[10] = { x: 0.5, y: 0.3 };
    points[152] = { x: 0.5, y: 0.7 };
    const { yaw, pitch } = headGeometry(points);
    expect(yaw).toBeCloseTo(0.15); // (0.56-0.5)/0.4
    expect(pitch).toBeCloseTo(-0.15); // (0.4-0.46)/0.4
  });
});
