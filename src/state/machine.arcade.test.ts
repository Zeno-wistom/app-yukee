import { describe, expect, it } from "vitest";
import { arcadeInitialState, reducer, type GameId } from "./machine";
import { GAMES, G05_FINAL_PREVIEW_IMAGE } from "../selection/games";
describe("直达游戏系统", () => {
  it("四个真实入口与 G05 资源契约", () => {
    expect(GAMES.map((g) => g.id)).toEqual([
      "yukeeRun",
      "winglight",
      "leanSurf",
      "squatJump",
    ]);
    expect(G05_FINAL_PREVIEW_IMAGE).toBeNull();
    expect(arcadeInitialState.phase).toBe("lampSelection");
  });
  it.each<GameId>(["yukeeRun", "winglight", "leanSurf", "squatJump"])(
    "%s 重开与返回不会串游戏，也不遗留弹窗",
    (id) => {
      const cal = reducer(arcadeInitialState, {
        type: "LAMP_CONFIRM",
        gameId: id,
        available: true,
      });
      const playing = reducer(cal, {
        type: "MOTION",
        input: { action: "calibrated", source: "debug", timestamp: 0 },
      });
      const paused = reducer(playing, { type: "OPEN", overlay: "pause" });
      expect(reducer(paused, { type: "RESTART_GAME" }).phase).toBe(cal.phase);
      const back = reducer(paused, { type: "BACK_TO_SELECTION" });
      expect(back.phase).toBe("lampSelection");
      expect(back.overlay).toBe("none");
      expect(back.activeGame).toBeNull();
      expect(
        reducer(back, {
          type: "FINISH_GAME",
          result: { effectiveMs: 40000, reps: 5, source: "camera" },
        }),
      ).toBe(back);
    },
  );
  it("G01 演示结束与摄像头结束分开计数", () => {
    const s = {
      ...arcadeInitialState,
      phase: "yukeeRun" as const,
      activeGame: "yukeeRun" as const,
    };
    expect(
      reducer(s, { type: "FINISH_RUN", source: "keyboard-demo", energy: 2 })
        .completed,
    ).toBe(0);
    const real = reducer(s, {
      type: "FINISH_RUN",
      source: "camera",
      energy: 3,
    });
    expect(real.completed).toBe(1);
    expect(real.lastGame?.reps).toBe(3);
  });
});
