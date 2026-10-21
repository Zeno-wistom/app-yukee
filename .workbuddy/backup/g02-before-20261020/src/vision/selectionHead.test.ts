import { describe, expect, it } from "vitest";
import { SelectionHeadDetector } from "./selectionHead";

describe("SelectionHeadDetector", () => {
  it("触发后必须回中，不能从左侧直接甩到右侧连触发", () => {
    const detector = new SelectionHeadDetector({ cooldownMs: 0 });
    expect(detector.update(0.07, 0)).toBe("left");
    expect(detector.update(0.08, 100)).toBeNull();
    expect(detector.update(-0.08, 200)).toBeNull();
    expect(detector.update(0.01, 300)).toBeNull();
    expect(detector.update(-0.07, 400)).toBe("right");
  });

  it("中心区抖动不触发", () => {
    const detector = new SelectionHeadDetector();
    expect(detector.update(0.02, 0)).toBeNull();
    expect(detector.update(-0.03, 100)).toBeNull();
  });
});
