/**
 * robotRig 纯几何测试：
 * - 手臂随 u 连续伸展（手距肩单调变远、肘部弯曲度单调变小）；
 * - 左右臂独立响应，互不耦合；
 * - 缆绳端点与帆的 scaleX 公式一致，且任何姿态下不进入头部包围盒；
 * - 肘部始终在身体外侧（不会穿模到躯干另一侧）。
 */
import { describe, expect, it } from "vitest";
import {
  computeRobotPose,
  robotCssVars,
  sailClew,
  ROBOT_GEOMETRY as G,
} from "./robotRig";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe("computeRobotPose", () => {
  it("u=0 时手臂弯曲收起，u=1 时手臂接近完全伸直", () => {
    const rest = computeRobotPose(0, 0);
    const open = computeRobotPose(1, 1);
    expect(Math.abs(rest.left.foreDeg)).toBeGreaterThan(30);
    expect(Math.abs(open.left.foreDeg)).toBeLessThan(8);
    expect(dist({ x: rest.left.handX, y: rest.left.handY }, G.shoulderL)).toBeLessThan(
      G.upperLen + G.foreLen - 3,
    );
    // 展开时手部贴近臂展极限
    expect(dist({ x: open.left.handX, y: open.left.handY }, G.shoulderL)).toBeGreaterThan(
      G.upperLen + G.foreLen - 1,
    );
  });

  it("展开过程连续：手离肩单调变远（允许到达臂展后保持）", () => {
    let prev = -1;
    for (let u = 0; u <= 1.001; u += 0.05) {
      const pose = computeRobotPose(u, u);
      const d = dist({ x: pose.left.handX, y: pose.left.handY }, G.shoulderL);
      expect(d).toBeGreaterThanOrEqual(prev - 1e-6);
      prev = d;
    }
    expect(prev).toBeGreaterThan(18.4);
  });

  it("左右臂独立：只展开左手时右臂保持收起", () => {
    const pose = computeRobotPose(1, 0);
    expect(Math.abs(pose.left.foreDeg)).toBeLessThan(8);
    expect(Math.abs(pose.right.foreDeg)).toBeGreaterThan(30);
  });

  it("左右镜像对称", () => {
    const pose = computeRobotPose(0.5, 0.5);
    expect(pose.left.handX + pose.right.handX).toBeCloseTo(2 * G.centerX, 0);
    expect(pose.left.handY).toBeCloseTo(pose.right.handY, 6);
  });

  it("肘部始终在身体中线外侧", () => {
    for (let u = 0; u <= 1.001; u += 0.05) {
      const pose = computeRobotPose(u, u);
      expect(G.centerX - pose.left.elbowX).toBeGreaterThan(
        G.centerX - G.shoulderL.x - 0.01,
      );
      expect(pose.right.elbowX - G.centerX).toBeGreaterThan(
        G.shoulderR.x - G.centerX - 0.01,
      );
    }
  });
});

describe("sailClew / 缆绳", () => {
  it("clew 位置与 CSS 中帆的 scaleX(0.2 + 0.8u) 一致", () => {
    expect(sailClew(0, "L").x).toBeCloseTo(G.mastL - G.sailReach * 0.2, 6);
    expect(sailClew(1, "L").x).toBeCloseTo(G.mastL - G.sailReach, 6);
    expect(sailClew(1, "R").x).toBeCloseTo(G.mastR + G.sailReach, 6);
  });

  it("缆绳长度与端点几何自洽", () => {
    const pose = computeRobotPose(0.6, 0.6);
    const clew = sailClew(0.6, "L");
    expect(pose.ropeL.len).toBeCloseTo(
      dist({ x: pose.ropeL.x, y: pose.ropeL.y }, clew),
      6,
    );
  });

  it("任意姿态下缆绳不进入头部包围盒", () => {
    for (let uL = 0; uL <= 1.001; uL += 0.1) {
      for (let uR = 0; uR <= 1.001; uR += 0.1) {
        const pose = computeRobotPose(uL, uR);
        // 左侧缆绳整体在头左侧，右侧缆绳整体在头右侧
        expect(Math.max(pose.ropeL.x, sailClew(uL, "L").x)).toBeLessThan(G.headBox.x0);
        expect(Math.min(pose.ropeR.x, sailClew(uR, "R").x)).toBeGreaterThan(G.headBox.x1);
      }
    }
  });
});

describe("robotCssVars", () => {
  it("输出渲染层所需的全部变量且为有限数值", () => {
    const vars = robotCssVars(computeRobotPose(0.3, 0.7));
    const keys = [
      "--arm-l-upper", "--arm-l-fore-x", "--arm-l-fore-y", "--arm-l-fore-abs",
      "--arm-r-upper", "--arm-r-fore-x", "--arm-r-fore-y", "--arm-r-fore-abs",
      "--rope-l-x", "--rope-l-y", "--rope-l-len", "--rope-l-ang",
      "--rope-r-x", "--rope-r-y", "--rope-r-len", "--rope-r-ang",
    ];
    for (const key of keys) {
      expect(vars[key], key).toBeDefined();
      expect(Number.isFinite(Number(vars[key])), key).toBe(true);
    }
  });
});
