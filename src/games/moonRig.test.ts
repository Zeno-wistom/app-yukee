import { describe, expect, it } from "vitest";
import { moonRopes } from "./moonRig";
import { computeRobotPose, sailClew } from "./robotRig";

describe("月夜船员缆绳", () => {
  it("左右独立跟随手部，终点始终落在对应帆角", () => {
    for (const [l, r] of [
      [0, 0],
      [0.5, 0.5],
      [1, 1],
      [1, 0],
      [0, 1],
    ]) {
      const pose = computeRobotPose(l, r);
      const ropes = moonRopes(l, r);
      expect(ropes[0].hand.x).toBeCloseTo(pose.left.handX + 38);
      expect(ropes[1].hand.x).toBeCloseTo(pose.right.handX + 38);
      expect(ropes[0].clew).toEqual(sailClew(l, "L"));
      expect(ropes[1].clew).toEqual(sailClew(r, "R"));
    }
  });
  it("整个连续动作区间内，每段绳都避开头部与躯干", () => {
    for (let l = 0; l <= 1.001; l += 0.05)
      for (let r = 0; r <= 1.001; r += 0.05) {
        for (const rope of moonRopes(l, r)) {
          for (const [a, b] of [
            [rope.hand, rope.guide],
            [rope.guide, rope.clew],
          ]) {
            for (let t = 0; t <= 1; t += 0.02) {
              const x = a.x + (b.x - a.x) * t,
                y = a.y + (b.y - a.y) * t;
              expect(x > 339 && x < 377 && y > 173 && y < 200).toBe(false);
              expect(x > 346 && x < 370 && y > 200 && y < 226).toBe(false);
            }
          }
        }
      }
  });
});
