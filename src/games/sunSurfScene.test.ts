import { describe, it, expect } from "vitest";
import { layoutFor } from "./sunSurfScene";
describe("G03 全视口构图安全区", () => {
  it.each([[1280,648], [1366,696], [1920,1008], [2560,1368], [390,784]])("%i×%i 的左右目标和侧倾位置均位于画布内", (w, h) => {
    const l = layoutFor(w, h);
    for (const side of [-1, 1]) {
      expect(l.cx + l.laneDX * side).toBeGreaterThan(0);
      expect(l.cx + l.laneDX * side).toBeLessThan(w);
      expect(l.tx + l.targetDX * side).toBeGreaterThan(0);
      expect(l.tx + l.targetDX * side).toBeLessThan(w);
    }
    // 机器人约 140 个绘图单位；不能因为竖屏很高就撑出画面。
    expect(l.k * 140).toBeLessThan(w * .4);
  });
});
