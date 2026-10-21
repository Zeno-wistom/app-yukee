import { describe, expect, it } from "vitest";
import { bodyFromFaceCenter, gazeFromHead } from "./yukeeMotion";

describe("Yukee 真人跟随映射", () => {
  it("身体横移有较强增益且保持镜像方向", () => {
    expect(bodyFromFaceCenter(0.4)).toBeCloseTo(0.224);
    expect(bodyFromFaceCenter(0.6)).toBeCloseTo(-0.224);
    expect(bodyFromFaceCenter(0.1)).toBe(1);
  });

  it("头部 yaw/pitch 分层驱动快速 gaze", () => {
    const gaze = gazeFromHead(0.05, -0.04, 0, 0);
    expect(gaze.x).toBeCloseTo(-0.336);
    expect(gaze.y).toBeCloseTo(0.198);
    expect(gazeFromHead(0.2, -0.2, 0, 0)).toEqual({ x: -1, y: 1 });
  });

  it("中心 dead zone：微小噪声不产生跟随", () => {
    expect(gazeFromHead(0.01, -0.01, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(gazeFromHead(0.021, 0.017, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(bodyFromFaceCenter(0.52)).toBe(0);
    expect(bodyFromFaceCenter(0.48)).toBe(0);
    // dead zone 边界外连续平移，不出现跳变
    expect(gazeFromHead(0.023, 0, 0, 0).x).toBeCloseTo(-0.012);
  });
});
