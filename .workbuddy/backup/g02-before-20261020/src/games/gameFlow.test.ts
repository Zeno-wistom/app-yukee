import { describe, expect, it } from "vitest";
import { FINISH_AT, TOTAL_SECONDS } from "./level";
import { hasReachedCompletion, shouldPauseForTracking } from "./gameFlow";

describe("Yukee Run 收尾边界", () => {
  it("识别丢失只冻结终点前，终点后的庆祝时钟继续推进", () => {
    const base = {
      visionWatching: true,
      facePresent: false,
      completed: false,
    };
    expect(
      shouldPauseForTracking({ ...base, worldTime: FINISH_AT - 0.01 }),
    ).toBe(true);
    expect(shouldPauseForTracking({ ...base, worldTime: FINISH_AT })).toBe(
      false,
    );
    expect(shouldPauseForTracking({ ...base, worldTime: FINISH_AT + 1 })).toBe(
      false,
    );
  });

  it("只有越过完整庆祝尾声才进入奖励", () => {
    expect(hasReachedCompletion(TOTAL_SECONDS - 0.01)).toBe(false);
    expect(hasReachedCompletion(TOTAL_SECONDS)).toBe(true);
  });
});
