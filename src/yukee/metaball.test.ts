import { describe, expect, it } from "vitest";
import {
  bridgePath,
  circlePath,
  neckWaist,
  unionPath,
  CONNECT_STRETCH,
  SNAP_STRETCH,
} from "./metaball";

describe("metaball 几何（移植自 fluidkit）", () => {
  it("circlePath 输出合法圆弧 path，半径过小返回空", () => {
    expect(circlePath({ x: 10, y: 10, r: 5 })).toContain("A 5.00 5.00");
    expect(circlePath({ x: 0, y: 0, r: 0.4 })).toBe("");
  });

  it("bridgePath：距离超过 reach 倍半径和时为空，包含时非空", () => {
    const a = { x: 0, y: 0, r: 20 };
    const near = { x: 30, y: 0, r: 10 };
    const far = { x: 200, y: 0, r: 10 };
    expect(bridgePath(a, near, 0.5)).toContain("C");
    expect(bridgePath(a, far, 0.5)).toBe("");
  });

  it("neckWaist 随拉伸增大而收窄，且不低于 BASE×0.6", () => {
    // 未夹持区间为 stretch ∈ [0.95, 1.09]，之外分别夹持到上限/下限
    const w0 = neckWaist(0.95);
    const w1 = neckWaist(1.02);
    const w2 = neckWaist(1.09);
    expect(w0).toBeGreaterThan(w1);
    expect(w1).toBeGreaterThan(w2);
    expect(neckWaist(1.29)).toBeCloseTo(0.55 * 0.6, 5);
  });

  it("unionPath 带回滞：连接后需超过 SNAP_STRETCH 才断开", () => {
    const a = { x: 0, y: 0, r: 20 };
    const inRange = { x: 31, y: 0, r: 10 }; // stretch ≈ 1.03
    const first = unionPath(a, inRange, false);
    expect(first.connected).toBe(false); // 未连接时 > CONNECT_STRETCH 不连接
    const held = unionPath(a, inRange, true);
    expect(held.connected).toBe(true); // 已连接时 < SNAP_STRETCH 保持
    expect(held.d).toContain("C");
    const torn = unionPath(a, { x: 50, y: 0, r: 10 }, true);
    expect(torn.connected).toBe(false);
    expect(torn.d).not.toContain("C");
    expect(CONNECT_STRETCH).toBeLessThan(SNAP_STRETCH);
  });
});
