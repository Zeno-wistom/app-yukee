import { describe, it, expect } from "vitest";
import {
  chargeToDistance,
  distanceToCharge,
  JUMP_CONFIG,
  JumpRun,
  PlatformGenerator,
  resolveLanding,
  type Platform,
} from "./jumpLogic";

const box = (o: Partial<Platform>): Platform => ({ id: 0, x: 0, z: 0, w: 2, d: 2, h: 1, shape: "box", color: 0, bonus: false, axis: "x", ...o });

describe("G05 跳一跳逻辑", () => {
  it("蓄力越久跳得越远，1.5 秒封顶", () => {
    expect(chargeToDistance(0.5)).toBeLessThan(chargeToDistance(1.0));
    expect(chargeToDistance(3)).toBe(chargeToDistance(JUMP_CONFIG.maxChargeSec));
    expect(distanceToCharge(chargeToDistance(0.8))).toBeCloseTo(0.8);
  });

  it("三种结果都真实存在：不够 / 落上 / 过远，并有中心奖励", () => {
    const cur = box({ id: 0 }),
      next = box({ id: 1, x: 4, w: 1.6, d: 1.6 });
    const exact = distanceToCharge(4);
    expect(resolveLanding(cur, next, 0, 0, exact).kind).toBe("perfect");
    expect(resolveLanding(cur, next, 0, 0, distanceToCharge(4.5)).kind).toBe("hit");
    expect(resolveLanding(cur, next, 0, 0, distanceToCharge(2.4)).kind).toBe("short");
    expect(resolveLanding(cur, next, 0, 0, distanceToCharge(5.6)).kind).toBe("long");
    expect(resolveLanding(cur, next, 0, 0, distanceToCharge(4.9)).kind).toBe("edgeLong");
    // 跳得太轻仍落在原台：不得分也不失败
    expect(resolveLanding(cur, next, 0, 0, 0.05).kind).toBe("stay");
  });

  it("落点由实际距离决定，不吸附到中心", () => {
    const cur = box({ id: 0 }),
      next = box({ id: 1, z: 3.5, axis: "z" });
    const l = resolveLanding(cur, next, 0, 0, distanceToCharge(3.9));
    expect(l.kind).toBe("hit");
    expect(l.z).toBeCloseTo(3.9);
    expect(l.x).toBe(0);
  });

  it("生成的路线左右交错：不会连续三次同向，平台间有空隙且都可达", () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = new PlatformGenerator(seed);
      const ps = [g.first()];
      for (let i = 1; i < 30; i++) ps.push(g.next(ps[i - 1], i));
      for (let i = 3; i < ps.length; i++) expect(ps[i].axis === ps[i - 1].axis && ps[i].axis === ps[i - 2].axis).toBe(false);
      const axes = new Set(ps.slice(1).map((p) => p.axis));
      expect(axes.size).toBe(2);
      for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1],
          b = ps[i];
        const along = b.axis === "x" ? b.x - a.x : b.z - a.z;
        const gap = along - (b.axis === "x" ? a.w / 2 + b.w / 2 : a.d / 2 + b.d / 2);
        expect(gap).toBeGreaterThanOrEqual(JUMP_CONFIG.gapMin - 1e-9);
        // 最远一跳（从台面后沿到目标前沿）也在 1.5 秒蓄力内
        expect(along + 0.5).toBeLessThan(chargeToDistance(JUMP_CONFIG.maxChargeSec));
        expect(b.axis === "x" ? b.z - a.z : b.x - a.x).toBe(0);
        expect(b.color).not.toBe(a.color);
      }
    }
  });

  it("精准五连跳通关；中心连击加分；失败即结束", () => {
    const run = new JumpRun(3);
    for (let i = 0; i < 5; i++) {
      const t = run.target;
      const dist = t.axis === "x" ? t.x - run.px : t.z - run.pz;
      const r = run.jump(distanceToCharge(dist));
      expect(r.kind).toBe("perfect");
    }
    expect(run.cleared).toBe(true);
    expect(run.over).toBe(true);
    expect(run.jumps).toBe(5);
    expect(run.score).toBeGreaterThanOrEqual(2 + 4 + 6 + 8 + 10);

    const lose = new JumpRun(3);
    const t = lose.target;
    const dist = t.axis === "x" ? t.x - lose.px : t.z - lose.pz;
    const r = lose.jump(distanceToCharge(dist + 3));
    expect(r.kind === "long" || r.kind === "edgeLong").toBe(true);
    expect(lose.over).toBe(true);
    expect(lose.cleared).toBe(false);
    expect(() => lose.jump(0.5)).toThrow();
  });

  it("非中心落点得 1 分并清零连击", () => {
    const run = new JumpRun(5);
    const t = run.target;
    const half = (t.axis === "x" ? t.w : t.d) / 2;
    const dist = (t.axis === "x" ? t.x - run.px : t.z - run.pz) + half * 0.7;
    const r = run.jump(distanceToCharge(dist));
    expect(r.kind).toBe("hit");
    expect(r.gained).toBe(1 + (run.current.bonus ? JUMP_CONFIG.bonusScore : 0));
    expect(run.combo).toBe(0);
  });
});
