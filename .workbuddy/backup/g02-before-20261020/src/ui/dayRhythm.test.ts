import { describe, expect, it } from "vitest";
import { dayCellState, rhythmForHour } from "./dayRhythm";

describe("rhythmForHour 时段映射", () => {
  it("覆盖全天 24 小时且无空档", () => {
    for (let h = 0; h < 24; h++) {
      const r = rhythmForHour(h);
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.phrase.length).toBeGreaterThan(0);
    }
  });
  it("边界符合约定", () => {
    expect(rhythmForHour(5).key).toBe("dawn");
    expect(rhythmForHour(8).key).toBe("dawn");
    expect(rhythmForHour(9).key).toBe("morning");
    expect(rhythmForHour(12).key).toBe("noon");
    expect(rhythmForHour(14).key).toBe("afternoon");
    expect(rhythmForHour(17).key).toBe("afternoon");
    expect(rhythmForHour(18).key).toBe("dusk");
    expect(rhythmForHour(21).key).toBe("night");
    expect(rhythmForHour(23).key).toBe("night");
    expect(rhythmForHour(0).key).toBe("night");
    expect(rhythmForHour(4).key).toBe("night");
  });
  it("文案不含健康诊断措辞", () => {
    for (let h = 0; h < 24; h++) {
      const { phrase } = rhythmForHour(h);
      expect(phrase).not.toMatch(/疲劳|颈椎|检测到/);
    }
  });
});

describe("dayCellState 24 小时矩阵", () => {
  it("过去 / 当前 / 未来三态", () => {
    expect(dayCellState(0, 16)).toBe("past");
    expect(dayCellState(15, 16)).toBe("past");
    expect(dayCellState(16, 16)).toBe("now");
    expect(dayCellState(17, 16)).toBe("future");
    expect(dayCellState(23, 16)).toBe("future");
  });
  it("午夜边界", () => {
    expect(dayCellState(0, 0)).toBe("now");
    expect(dayCellState(23, 23)).toBe("now");
  });
});
