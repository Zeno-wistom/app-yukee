import { describe, it, expect } from "vitest";
import { initialState, reducer, type State } from "./machine";

const enterSelection = (s: State = initialState): State =>
  reducer(reducer(s, { type: "ENTER" }), { type: "START" });

describe("挂灯游戏选择（lampSelection）", () => {
  it("HOME 的课堂强提醒快捷入口只在 focus 生效", () => {
    const strong = reducer(
      { ...initialState, phase: "focus" },
      { type: "SIMULATE_STRONG" },
    );
    expect(strong.phase).toBe("strongReminder");
    expect(reducer(strong, { type: "SIMULATE_STRONG" })).toEqual(strong);
  });

  it("提醒阶段 START 进入 lampSelection，索引归零", () => {
    // SIMULATE_45 需先 ENTER 进入 focus
    const s = reducer(reducer(initialState, { type: "ENTER" }), {
      type: "SIMULATE_45",
    });
    expect(s.phase).toBe("weakReminder");
    const sel = reducer(s, { type: "START" });
    expect(sel.phase).toBe("lampSelection");
    expect(sel.selectionIndex).toBe(0);
    expect(sel.selectionDevNotice).toBeNull();
  });

  it("LAMP_NEXT / LAMP_PREV 循环折返且清除开发中提示", () => {
    let s = enterSelection();
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    expect(s.selectionIndex).toBe(1);
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    expect(s.selectionIndex).toBe(3);
    // 3 + 1 → 回绕到 0
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    expect(s.selectionIndex).toBe(0);
    // 0 - 1 → 回绕到 3
    s = reducer(s, { type: "LAMP_PREV", totalCount: 4 });
    expect(s.selectionIndex).toBe(3);
    expect(s.phase).toBe("lampSelection");
  });

  it("totalCount 非法时索引保持稳定", () => {
    let s = enterSelection();
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 0 });
    expect(s.selectionIndex).toBe(0);
  });

  it("确认可用游戏 → 直接进入真人检测（无二次点击）", () => {
    let s = enterSelection();
    s = reducer(s, { type: "LAMP_CONFIRM", gameId: "yukeeRun", available: true });
    expect(s.phase).toBe("calibration");
    expect(s.selectionDevNotice).toBeNull();
  });

  it("确认未开放游戏 → 留在原位并记录 devNotice；CLEAR 清除", () => {
    let s = enterSelection();
    s = reducer(s, {
      type: "LAMP_CONFIRM",
      gameId: "starRhythm",
      available: false,
    });
    expect(s.phase).toBe("lampSelection");
    expect(s.selectionDevNotice).toBe("starRhythm");
    s = reducer(s, { type: "CLEAR_DEV_NOTICE" });
    expect(s.selectionDevNotice).toBeNull();
  });

  it("切卡会自动清除上一次的开发中提示", () => {
    let s = enterSelection();
    s = reducer(s, { type: "LAMP_CONFIRM", gameId: "starRhythm", available: false });
    s = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    expect(s.selectionDevNotice).toBeNull();
  });

  it("EXIT_LAMP_SELECTION 回到 focus；选择阶段外这些事件无效", () => {
    let s = enterSelection();
    s = reducer(s, { type: "EXIT_LAMP_SELECTION" });
    expect(s.phase).toBe("focus");
    // focus 下 LAMP 事件不再改索引
    expect(reducer(s, { type: "LAMP_NEXT", totalCount: 4 }).selectionIndex).toBe(
      s.selectionIndex,
    );
  });

  it("overlay 打开时选择事件被忽略", () => {
    let s = enterSelection();
    s = reducer(s, { type: "OPEN", overlay: "pause" });
    const frozen = reducer(s, { type: "LAMP_NEXT", totalCount: 4 });
    expect(frozen.selectionIndex).toBe(s.selectionIndex);
    expect(
      reducer(s, { type: "LAMP_CONFIRM", gameId: "x", available: true }).phase,
    ).toBe("lampSelection");
  });

  it("完整闭环：选择 → 校准 → 游戏 → 奖励 → 重新选择", () => {
    let s = enterSelection();
    s = reducer(s, { type: "LAMP_CONFIRM", gameId: "yukeeRun", available: true });
    expect(s.phase).toBe("calibration");
    s = reducer(s, {
      type: "MOTION",
      input: { action: "calibrated", source: "camera", timestamp: 0 },
    });
    expect(s.phase).toBe("yukeeRun");
    s = reducer(s, {
      type: "MOTION",
      input: { action: "gameComplete", source: "camera", timestamp: 0 },
    });
    expect(s.phase).toBe("reward");
    s = reducer(s, { type: "RETURN_WORK" });
    s = reducer(s, { type: "ENTER_LAMP_SELECTION" });
    expect(s.phase).toBe("lampSelection");
    expect(s.selectionIndex).toBe(0);
  });
});
