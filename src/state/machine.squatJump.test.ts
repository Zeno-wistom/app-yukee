import { describe, it, expect } from "vitest";
import { reducer, initialState } from "./machine";
const selection = reducer(reducer(initialState, { type: "ENTER" }), { type: "START" });
const entered = reducer(selection, { type: "LAMP_CONFIRM", gameId: "squatJump", available: true });
const calibrated = {
  type: "MOTION" as const,
  input: { action: "calibrated" as const, source: "camera" as const, timestamp: 0 },
};
const playing = reducer(entered, calibrated);
describe("G05 系统接入", () => {
  it("选卡进入站姿校准，校准后进入游戏；暂停时不允许校准完成", () => {
    expect(entered.phase).toBe("squatCalibration");
    expect(entered.activeGame).toBe("squatJump");
    expect(playing.phase).toBe("squatJump");
    const paused = reducer(entered, { type: "OPEN", overlay: "pause" });
    expect(reducer(paused, calibrated)).toBe(paused);
  });
  it("退出恢复必须重新做站姿校准", () => {
    const saved = reducer(playing, { type: "SAVE_QUIT" });
    expect(saved.saved?.phase).toBe("squatCalibration");
    expect(reducer(saved, { type: "RESTORE" }).activeGame).toBe("squatJump");
  });
  it("未满五连跳不能收尾；keyboard_demo 记录来源但不计入真实活动", () => {
    expect(reducer(playing, { type: "FINISH_GAME", result: { effectiveMs: 9000, reps: 3, source: "camera" } })).toBe(playing);
    const demo = reducer(playing, { type: "FINISH_GAME", result: { effectiveMs: 9000, reps: 5, source: "keyboard-demo" } });
    expect(demo.phase).toBe("focus");
    expect(demo.completed).toBe(playing.completed);
    expect(demo.lastGame).toMatchObject({ game: "squatJump", source: "keyboard-demo", reps: 5 });
    const real = reducer(playing, { type: "FINISH_GAME", result: { effectiveMs: 21000, reps: 5, source: "camera" } });
    expect(real.completed).toBe(playing.completed + 1);
    expect(reducer(real, { type: "FINISH_GAME", result: { effectiveMs: 1, reps: 5, source: "camera" } })).toBe(real);
  });
  it("G04 月野风车仍为开发中，不进入任何游戏", () => {
    const s = reducer(selection, { type: "LAMP_CONFIRM", gameId: "moonwindVillage", available: false });
    expect(s.phase).toBe("lampSelection");
    expect(s.selectionDevNotice).toBe("moonwindVillage");
  });
});
