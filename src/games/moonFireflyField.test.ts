import { describe, expect, it } from "vitest";
import {
  bezier,
  FIREFLY_SOURCES,
  MoonFireflyField,
  type LightTargets,
} from "./moonFireflyField";
import { MOON_BOAT } from "./moonSceneGeometry";

const targets: LightTargets = {
  left: { x: 300, y: 290 },
  right: { x: 440, y: 290 },
  mast: { x: 370, y: 350 },
  lamp: { x: 370, y: 473 },
};
function advance(
  f: MoonFireflyField,
  ms: number,
  open: number,
  charged = false,
  reps = 0,
) {
  for (let i = 0; i < ms; i += 16)
    f.step(16, open, charged, reps, false, targets);
}
describe("环境星光显示系统", () => {
  it("放大 1.5 倍保持河面接触点；出生区覆盖天空、树木与河面，不属于船体", () => {
    expect(MOON_BOAT.scale / 1.05).toBeCloseTo(1.5);
    expect(MOON_BOAT.anchorY).toBeCloseTo(210 + 282 * 1.05);
    expect(FIREFLY_SOURCES.some((p) => p.y < 100)).toBe(true);
    expect(FIREFLY_SOURCES.some((p) => p.x < 100 && p.y > 250)).toBe(true);
    expect(FIREFLY_SOURCES.some((p) => p.x > 800 && p.y > 250)).toBe(true);
    expect(FIREFLY_SOURCES.some((p) => p.y > 450)).toBe(true);
    expect(
      FIREFLY_SOURCES.some((p) => p.x > 200 && p.x < 540 && p.y > 440),
    ).toBe(false);
  });
  it("准备时只有环境浮动，长期停留也不会产生收集或奖励", () => {
    const f = new MoonFireflyField();
    advance(f, 12000, 0);
    expect(f.particles.every((p) => p.phase === "ambient")).toBe(true);
    expect(f.reps).toBe(0);
    expect(f.rewardAge).toBeGreaterThan(12000);
  });
  it("轨迹有明确起点、终点和弯曲中段，持续展开能抵达帆面", () => {
    const start = { x: 80, y: 70 },
      end = { x: 300, y: 290 };
    expect(bezier(start, end, 0.2, 0)).toEqual(start);
    expect(bezier(start, end, 0.2, 1)).toEqual(end);
    expect(bezier(start, end, 0.2, 0.5).x).not.toBeCloseTo(190);
    const f = new MoonFireflyField();
    advance(f, 9000, 1, true);
    expect(f.particles.every((p) => p.phase === "dock")).toBe(true);
    for (const p of f.particles)
      expect(
        Math.hypot(
          p.position.x - targets[p.side].x,
          p.position.y - targets[p.side].y,
        ),
      ).toBeLessThan(9);
    expect(f.reps).toBe(0);
    expect(f.particles.some((p) => p.phase === "store")).toBe(false);
  });
  it("暂停不前进，恢复后巨大时间差被限制为单帧而非补播", () => {
    const f = new MoonFireflyField();
    advance(f, 1000, 0.6);
    const snapshot = JSON.stringify(f);
    f.step(0, 1, true, 0, false, targets);
    expect(JSON.stringify(f)).toBe(snapshot);
    const t = f.time;
    f.step(20000, 1, true, 0, false, targets);
    expect(f.time - t).toBe(50);
  });
  it("只有真实次数增加才触发储存与奖励，相同次数不重复触发", () => {
    const f = new MoonFireflyField();
    advance(f, 9000, 1, true);
    f.step(16, 0, false, 1, false, targets);
    expect(f.particles.every((p) => p.phase === "store")).toBe(true);
    expect(f.rewardAge).toBe(0);
    expect(f.reps).toBe(1);
    f.step(16, 0, false, 1, false, targets);
    expect(f.rewardAge).toBe(16);
    advance(f, 2000, 0, false, 1);
    expect(f.particles.every((p) => p.phase === "ambient")).toBe(true);
  });
  it("目标随帆面移动时连续跟随，左右目标独立", () => {
    const f = new MoonFireflyField();
    advance(f, 9000, 1, true);
    const moved = {
      ...targets,
      left: { x: 270, y: 260 },
      right: { x: 470, y: 280 },
    };
    for (let i = 0; i < 80; i++) f.step(16, 1, true, 0, false, moved);
    for (const p of f.particles)
      expect(
        Math.hypot(
          p.position.x - moved[p.side].x,
          p.position.y - moved[p.side].y,
        ),
      ).toBeLessThan(9);
  });
});
