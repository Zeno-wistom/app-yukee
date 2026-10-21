import { describe, expect, it } from "vitest";
import { pickHurtEvent, YUKEE_EVENTS } from "./yukeeStateMap";

describe("受伤表情池", () => {
  it("单次受伤从轻度池随机（wince/startled/worried）", () => {
    const seen = new Set(
      [0, 0.3, 0.6, 0.99].map((r) => pickHurtEvent(0, () => r)),
    );
    for (const e of seen)
      expect(["wince", "startled", "worried"]).toContain(e);
  });

  it("首次与第二次受伤不升级为 pained", () => {
    expect(pickHurtEvent(0, () => 0.99)).not.toBe("pained");
    expect(pickHurtEvent(1, () => 0.99)).not.toBe("pained");
  });

  it("连续受伤 streak ≥ 2 升级为 pained", () => {
    expect(pickHurtEvent(2)).toBe("pained");
    expect(pickHurtEvent(5)).toBe("pained");
  });

  it("四类受伤事件都有表情映射且时长克制（≤ 720ms）", () => {
    for (const e of ["wince", "startled", "worried", "pained"] as const) {
      expect(YUKEE_EVENTS[e].expression).toBeTypeOf("number");
      expect(YUKEE_EVENTS[e].durationMs).toBeLessThanOrEqual(720);
      expect(YUKEE_EVENTS[e].bounce).toBe(false);
    }
  });
});
