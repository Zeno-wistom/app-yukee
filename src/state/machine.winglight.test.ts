import { describe, it, expect } from "vitest";
import { initialState, reducer, type State } from "./machine";

/**
 * G02 接入状态机后的回归测试：
 * - G01 入口与流程保持原样；
 * - G02 走独立校准相位，完成后直接回工作态并计数；
 * - 退出/恢复不会串到另一款游戏。
 */

function toSelection(): State {
  let s = reducer(initialState, { type: "ENTER" });
  s = reducer(s, { type: "SIMULATE_45" });
  s = reducer(s, { type: "DELAY_DONE" });
  expect(s.phase).toBe("weakReminder");
  return reducer(s, { type: "START" });
}

const calibrated = {
  type: "MOTION" as const,
  input: { action: "calibrated" as const, source: "debug" as const, timestamp: 0 },
};

describe("G02 入口与完成", () => {
  it("确认展翼接光进入肩臂校准，确认拾光跑者仍是原校准", () => {
    const selection = toSelection();
    const wing = reducer(selection, {
      type: "LAMP_CONFIRM",
      gameId: "winglight",
      available: true,
    });
    expect(wing.phase).toBe("wingCalibration");
    expect(wing.activeGame).toBe("winglight");

    const run = reducer(selection, {
      type: "LAMP_CONFIRM",
      gameId: "yukeeRun",
      available: true,
    });
    expect(run.phase).toBe("calibration");
    expect(run.activeGame).toBe("yukeeRun");
  });

  it("校准完成进入游戏，完成事件回到工作态并记录结果", () => {
    let s = reducer(toSelection(), {
      type: "LAMP_CONFIRM",
      gameId: "winglight",
      available: true,
    });
    const generation = s.reminderGeneration;
    s = reducer(s, calibrated);
    expect(s.phase).toBe("winglight");

    s = reducer(s, {
      type: "FINISH_GAME",
      result: { effectiveMs: 32_000, reps: 5, source: "camera" },
    });
    expect(s.phase).toBe("focus");
    expect(s.activeGame).toBeNull();
    expect(s.completed).toBe(1);
    expect(s.lastGame).toEqual({
      game: "winglight",
      effectiveMs: 32_000,
      reps: 5,
      source: "camera",
    });
    // 回到工作态必须推进提醒代际，旧计时回调不会补发
    expect(s.reminderGeneration).toBeGreaterThan(generation);
  });

  it("中途退出再恢复，仍回到 G02 而不是 G01", () => {
    let s = reducer(toSelection(), {
      type: "LAMP_CONFIRM",
      gameId: "winglight",
      available: true,
    });
    s = reducer(s, calibrated);
    s = reducer(s, { type: "SAVE_QUIT" });
    expect(s.phase).toBe("focus");
    expect(s.saved?.phase).toBe("wingCalibration");
    expect(s.completed).toBe(0);
    s = reducer(s, { type: "RESTORE" });
    expect(s.phase).toBe("wingCalibration");
    expect(s.activeGame).toBe("winglight");
  });

  it("没有确认关卡时不会误触发 G02 完成", () => {
    const s = reducer(initialState, {
      type: "FINISH_GAME",
      result: { effectiveMs: 1000, reps: 5, source: "camera" },
    });
    expect(s).toBe(initialState);
  });
});
