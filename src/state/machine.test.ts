import { describe, it, expect } from "vitest";
import { initialState, reducer, type State } from "./machine";
const motion = (action: "calibrated" | "gameComplete" | "left" | "center") => ({
  type: "MOTION" as const,
  input: { action, source: "debug" as const, timestamp: 0 },
});
describe("课堂闭环", () => {
  it("弱提示点击继续工作会结束当前周期并从当前时间建立下一轮", () => {
    let s = reducer(initialState, { type: "ENTER" });
    s = reducer(s, { type: "SIMULATE_45" });
    expect(reducer(s, { type: "DELAY_DONE" }).phase).toBe("weakReminder");
    const previousGeneration = (s as State & { reminderGeneration: number })
      .reminderGeneration;

    s = reducer(s, { type: "CONTINUE_WORK", now: 10_000 } as never);

    expect(s.phase).toBe("focus");
    expect(s.pending).toBe("weakReminder");
    expect((s as State & { reminderGeneration: number }).reminderGeneration).toBe(
      previousGeneration + 1,
    );
    expect((s as State & { reminderDueAt: number }).reminderDueAt).toBeGreaterThan(
      10_000,
    );
    expect(
      reducer(s, {
        type: "DELAY_DONE",
        now: 10_001,
        generation: previousGeneration,
      } as never),
    ).toBe(s);
  });

  it("强提示点击稍后会在 snooze deadline 前 suppress 旧回调", () => {
    let s: State = { ...initialState, phase: "focus" };
    s = reducer(s, { type: "SIMULATE_STRONG" });
    s = reducer(s, { type: "LATER", now: 20_000 } as never);
    const reminderState = s as State & {
      reminderGeneration: number;
      reminderDueAt: number;
      snoozeUntil: number;
    };

    expect(s.phase).toBe("focus");
    expect(s.pending).toBe("strongReminder");
    expect(reminderState.snoozeUntil).toBe(reminderState.reminderDueAt);
    expect(
      reducer(s, {
        type: "DELAY_DONE",
        now: reminderState.snoozeUntil - 1,
        generation: reminderState.reminderGeneration,
      } as never),
    ).toBe(s);
  });

  it("snooze 到期后允许强提示再次出现", () => {
    let s: State = { ...initialState, phase: "focus" };
    s = reducer(s, { type: "SIMULATE_STRONG" });
    s = reducer(s, { type: "LATER", now: 30_000 } as never);
    const reminderState = s as State & {
      reminderGeneration: number;
      snoozeUntil: number;
    };
    s = reducer(s, {
      type: "DELAY_DONE",
      now: reminderState.snoozeUntil,
      generation: reminderState.reminderGeneration,
    } as never);

    expect(s.phase).toBe("strongReminder");
    expect(s.pending).toBeNull();
  });

  it("连续 weak → continue work 不会积累多个有效 timer", () => {
    let s: State = { ...initialState, phase: "focus" };
    s = reducer(s, { type: "SIMULATE_45" });
    s = reducer(s, { type: "CONTINUE_WORK", now: 40_000 } as never);
    const firstGeneration = (s as State & { reminderGeneration: number })
      .reminderGeneration;
    s = reducer(s, {
      type: "DELAY_DONE",
      now: (s as State & { reminderDueAt: number }).reminderDueAt,
      generation: firstGeneration,
    } as never);
    expect(s.phase).toBe("weakReminder");
    s = reducer(s, { type: "CONTINUE_WORK", now: 50_000 } as never);
    const latest = s as State & {
      reminderGeneration: number;
      reminderDueAt: number;
    };

    expect(latest.reminderGeneration).toBe(firstGeneration + 1);
    expect(latest.reminderDueAt).toBeGreaterThan(50_000);
    expect(
      reducer(s, {
        type: "DELAY_DONE",
        now: Number.MAX_SAFE_INTEGER,
        generation: firstGeneration,
      } as never),
    ).toBe(s);
  });

  it("连续 strong → later 不会被上一轮 callback 在下一帧重新打开", () => {
    let s: State = { ...initialState, phase: "focus" };
    s = reducer(s, { type: "SIMULATE_STRONG" });
    s = reducer(s, { type: "LATER", now: 60_000 } as never);
    const staleGeneration = (s as State & { reminderGeneration: number })
      .reminderGeneration;
    expect(staleGeneration).toBeGreaterThan(0);
    s = reducer(s, {
      type: "DELAY_DONE",
      now: (s as State & { snoozeUntil: number }).snoozeUntil,
      generation: staleGeneration,
    } as never);
    s = reducer(s, { type: "LATER", now: 70_000 } as never);
    const currentGeneration = (s as State & { reminderGeneration: number })
      .reminderGeneration;

    expect(s.phase).toBe("focus");
    expect(currentGeneration).toBe(staleGeneration + 1);
    expect(
      reducer(s, {
        type: "DELAY_DONE",
        now: Number.MAX_SAFE_INTEGER,
        generation: staleGeneration,
      } as never),
    ).toBe(s);
  });
  it("连续三轮：选择 → 校准进入 Yukee Run，完成进入奖励，错误动作不计数", () => {
    let s: State = reducer(initialState, { type: "ENTER" });
    for (let round = 1; round <= 3; round++) {
      for (const type of [
        "SIMULATE_45",
        "CONTINUE_WORK",
        "DELAY_DONE",
        "LATER",
        "DELAY_DONE",
      ] as const)
        s = reducer(s, { type });
      // 提醒 → 挂灯选择器 → 点头确认唯一可玩游戏 → 直接进入真人检测
      s = reducer(s, { type: "START" });
      expect(s.phase).toBe("lampSelection");
      s = reducer(s, {
        type: "LAMP_CONFIRM",
        gameId: "yukeeRun",
        available: true,
      });
      expect(s.phase).toBe("calibration");
      // 校准阶段只接受 calibrated，方向动作不改变状态
      expect(reducer(s, motion("left"))).toBe(s);
      s = reducer(s, motion("calibrated"));
      expect(s.phase).toBe("yukeeRun");
      // 游戏进行中，方向动作由游戏内部消费，reducer 不响应
      expect(reducer(s, motion("left"))).toBe(s);
      // 未完成校准动作不能直接结束游戏
      expect(reducer(s, motion("calibrated"))).toBe(s);
      s = reducer(s, motion("gameComplete"));
      expect(s.phase).toBe("reward");
      expect(s.completed).toBe(round);
      s = reducer(s, { type: "RETURN_WORK" });
      expect(s.pending).toBeNull();
    }
  });
  it("游戏中保存退出后恢复需重新校准，暂停中动作不计数", () => {
    let s: State = { ...initialState, phase: "yukeeRun", overlay: "pause" };
    expect(reducer(s, motion("gameComplete"))).toBe(s);
    s = reducer(s, { type: "SAVE_QUIT" });
    expect(s.phase).toBe("focus");
    s = reducer(s, { type: "RESTORE" });
    expect(s.phase).toBe("calibration");
    expect(reducer(s, { type: "RESET" })).toEqual(initialState);
  });
});
