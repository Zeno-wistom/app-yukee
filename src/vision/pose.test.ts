import { it, expect } from "vitest";
import { matrixAngles, cameraError } from "./pose";
it("单位旋转是零角度，水平旋转可用于方向判断", () => {
  expect(
    matrixAngles([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  ).toEqual({ yaw: 0, pitch: -0 });
  const a = Math.PI / 6;
  expect(
    matrixAngles([
      Math.cos(a),
      0,
      -Math.sin(a),
      0,
      0,
      1,
      0,
      0,
      Math.sin(a),
      0,
      Math.cos(a),
      0,
      0,
      0,
      0,
      1,
    ]).yaw,
  ).toBeCloseTo(30);
});
it("权限拒绝给出明确可恢复说明", () =>
  expect(
    cameraError(new DOMException("denied", "NotAllowedError"), "摄像头"),
  ).toContain("权限被拒绝"));
