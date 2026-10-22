import { describe, it, expect } from "vitest";
import { reducer, initialState } from "./machine";
const selection = reducer(reducer(initialState, { type: "ENTER" }), {
  type: "START",
});
const entered = reducer(selection, {
  type: "LAMP_CONFIRM",
  gameId: "leanSurf",
  available: true,
});
const calibrated = {
  type: "MOTION" as const,
  input: {
    action: "calibrated" as const,
    source: "camera" as const,
    timestamp: 0,
  },
};
const playing = reducer(entered, calibrated);
describe("G03 系统接入", () => {
  it("独立校准相位、暂停不允许校准完成", () => {
    expect(entered.phase).toBe("leanCalibration");
    expect(playing.phase).toBe("leanSurf");
    const paused = reducer(entered, { type: "OPEN", overlay: "pause" });
    expect(reducer(paused, calibrated)).toBe(paused);
  });
  it("退出恢复必须重新校准 G03，旧提醒回调无效", () => {
    const saved = reducer(playing, { type: "SAVE_QUIT" });
    expect(saved.saved?.phase).toBe("leanCalibration");
    expect(reducer(saved, { type: "RESTORE" }).activeGame).toBe("leanSurf");
    expect(reducer(saved, { type: "DELAY_DONE", generation: 0 })).toBe(saved);
  });
  it("未集满不能登记成功，完整演示保留来源且重复完成不计数", () => {
    const result = {
      effectiveMs: 38000,
      reps: 5,
      source: "keyboard-demo" as const,
    };
    expect(reducer(playing, { type: "FINISH_GAME", result })).toBe(playing);
    const done = reducer(playing, {
      type: "FINISH_GAME",
      result: { ...result, reps: 6 },
    });
    expect(done.completed).toBe(0);
    expect(done.lastGame?.source).toBe("keyboard-demo");
    expect(done.lastGame?.game).toBe("leanSurf");
    expect(
      reducer(done, { type: "FINISH_GAME", result: { ...result, reps: 6 } }),
    ).toBe(done);
  });
});
