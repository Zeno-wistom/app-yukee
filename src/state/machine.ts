import type { MotionAction, MotionInput } from "../vision/types";
import {
  DEMO_DELAY_MS,
  REMINDER_CYCLE_MS,
  REMINDER_SNOOZE_MS,
} from "../config/demo";
export type Phase =
  | "product"
  | "focus"
  | "weakReminder"
  | "secondaryReminder"
  | "strongReminder"
  | "activityIntro"
  | "lampSelection"
  | "calibration"
  | "yukeeRun"
  /** G02：个人动作校准（肩/肘/腕取景 + 中立位 + 展开幅度） */
  | "wingCalibration"
  /** G02：展翼接光游戏进行中 */
  | "winglight"
  | "leanCalibration"
  | "leanSurf"
  | "reward";

/** 可玩的关卡 id，与 selection/games.ts 的卡片 id 对应 */
export type GameId = "yukeeRun" | "winglight" | "leanSurf";

/** 一局结束后的结果（只保存在内存，不上传、不持久化） */
export interface GameResult {
  game: GameId;
  /** 有效游戏时间（毫秒，不含暂停与识别中断） */
  effectiveMs: number;
  /** 完成的动作次数 */
  reps: number;
  /** 输入来源：键盘演示的结果不视为摄像头识别通过 */
  source: "camera" | "keyboard-demo";
}
export type Overlay =
  | "none"
  | "library"
  | "detail"
  | "archive"
  | "records"
  | "pause"
  | "quit";
export interface State {
  phase: Phase;
  overlay: Overlay;
  pending: "weakReminder" | "secondaryReminder" | "strongReminder" | null;
  /** 当前提醒调度代际；任何周期重置都会递增，使旧 callback 自动失效。 */
  reminderGeneration: number;
  /** 当前 pending 提醒的绝对触发时间。 */
  reminderDueAt: number | null;
  /** 强提醒「稍后」的抑制截止时间。 */
  snoozeUntil: number | null;
  /** 最近一次明确结束弱提醒周期的时间。 */
  reminderAcknowledgedAt: number | null;
  step: number;
  /** 可恢复的退出点；game 记录当时选择的关卡，避免恢复时串到另一款 */
  saved: { phase: Phase; step: number; game: GameId | null } | null;
  /** 当前进行中的关卡（未选择关卡时为 null） */
  activeGame: GameId | null;
  /** 最近一局的结果，用于完成页与后续关卡复用 */
  lastGame: GameResult | null;
  completed: number;
  remindersPaused: boolean;
  /** 挂灯游戏选择：当前高亮卡片索引 */
  selectionIndex: number;
  /** "开发中"提示态：上一次确认到的卡片 id，无提示为 null */
  selectionDevNotice: string | null;
}
/** 提醒阶段点击「活动一下」也会进入此选择器 */
const ACTIVITY_TRIGGERS: Phase[] = [
  "focus",
  "weakReminder",
  "secondaryReminder",
  "strongReminder",
];
export const initialState: State = {
  phase: "product",
  overlay: "none",
  pending: null,
  reminderGeneration: 0,
  reminderDueAt: null,
  snoozeUntil: null,
  reminderAcknowledgedAt: null,
  step: 0,
  saved: null,
  activeGame: null,
  lastGame: null,
  completed: 0,
  remindersPaused: false,
  selectionIndex: 0,
  selectionDevNotice: null,
};
/** 各相位接受的 reducer 级动作（游戏内方向动作由 YukeeRun 直接从总线消费） */
export const sequences: Partial<Record<Phase, MotionAction[]>> = {
  calibration: ["calibrated"],
  yukeeRun: ["gameComplete"],
  wingCalibration: ["calibrated"],
  winglight: ["gameComplete"],
  leanCalibration: ["calibrated"],
};

/**
 * reducer 内部使用的 selection 事件。
 * 由 ProductApp 把视觉输入（手/头）派发为这些事件，
 * 保持「Input Adapter → Product State → UI Feedback」结构。
 *
 * `totalCount` 由调用方提供，因为 reducer 不感知游戏目录。
 * `available` 由调用方根据「该卡片是否真的能玩」给出，
 * 让 reducer 在确认时决定「跳转下一阶段」还是「提示开发中」。
 */
export type LampEvent =
  | { type: "LAMP_NEXT"; totalCount: number }
  | { type: "LAMP_PREV"; totalCount: number }
  | { type: "LAMP_CONFIRM"; gameId: string; available: boolean };

export type Event =
  | { type: "FINISH_GAME"; result: Omit<GameResult, "game"> }
  | {
      type:
        | "ENTER"
        | "SIMULATE_45"
        | "SIMULATE_STRONG"
        | "START"
        | "BEGIN"
        | "RETURN_WORK"
        | "DISABLE"
        | "RESET"
        | "RESUME"
        | "SAVE_QUIT"
        | "RESTORE"
        | "NEW_GAME"
        | "ENTER_LAMP_SELECTION"
        | "EXIT_LAMP_SELECTION"
        | "CLEAR_DEV_NOTICE";
    }
  | { type: "CONTINUE_WORK" | "LATER"; now?: number }
  | { type: "DELAY_DONE"; now?: number; generation?: number }
  | LampEvent
  | { type: "OPEN"; overlay: Overlay }
  | { type: "MOTION"; input: MotionInput };
export const isGame = (phase: Phase) =>
  phase === "yukeeRun" || phase === "winglight" || phase === "leanSurf";
function wrapIndex(i: number, total: number) {
  if (total <= 0) return 0;
  return ((i % total) + total) % total;
}
export function reducer(s: State, e: Event): State {
  switch (e.type) {
    case "RESET":
      return { ...initialState };
    case "ENTER":
      return s.phase === "product" ? { ...s, phase: "focus" } : s;
    case "SIMULATE_45":
      return s.phase === "focus" &&
        !s.pending &&
        !s.remindersPaused &&
        s.overlay === "none"
        ? {
            ...s,
            phase: "weakReminder",
            reminderGeneration: s.reminderGeneration + 1,
            reminderDueAt: null,
            snoozeUntil: null,
          }
        : s;
    case "SIMULATE_STRONG":
      return s.phase === "focus" && s.overlay === "none"
        ? {
            ...s,
            phase: "strongReminder",
            pending: null,
            reminderGeneration: s.reminderGeneration + 1,
            reminderDueAt: null,
            snoozeUntil: null,
            selectionDevNotice: null,
          }
        : s;
    case "CONTINUE_WORK":
      if (s.phase !== "weakReminder") return s;
      {
        const now = e.now ?? Date.now();
        return {
          ...s,
          phase: "focus",
          pending: "weakReminder",
          reminderGeneration: s.reminderGeneration + 1,
          reminderDueAt: now + REMINDER_CYCLE_MS,
          snoozeUntil: null,
          reminderAcknowledgedAt: now,
        };
      }
    case "LATER": {
      const now = e.now ?? Date.now();
      if (s.phase === "secondaryReminder")
        return {
          ...s,
          phase: "focus",
          pending: "strongReminder",
          reminderGeneration: s.reminderGeneration + 1,
          reminderDueAt: now + DEMO_DELAY_MS,
          snoozeUntil: null,
        };
      if (s.phase === "strongReminder") {
        const snoozeUntil = now + REMINDER_SNOOZE_MS;
        return {
          ...s,
          phase: "focus",
          pending: "strongReminder",
          reminderGeneration: s.reminderGeneration + 1,
          reminderDueAt: snoozeUntil,
          snoozeUntil,
        };
      }
      return s;
    }
    case "DELAY_DONE": {
      if (s.phase !== "focus" || !s.pending || s.overlay !== "none") return s;
      if (
        e.generation !== undefined &&
        e.generation !== s.reminderGeneration
      )
        return s;
      const now = e.now ?? Date.now();
      if (s.reminderDueAt !== null && now < s.reminderDueAt) return s;
      if (s.snoozeUntil !== null && now < s.snoozeUntil) return s;
      return {
        ...s,
        phase: s.pending,
        pending: null,
        reminderDueAt: null,
        snoozeUntil: null,
      };
    }
    case "START":
      // 提醒阶段点击「活动一下」：进入挂灯上的卡片选择器。
      // activityIntro 不再是必经阶段，避免再向电脑主屏塞入一次提示，
      // 把选择权完全交给挂灯本身。
      return ACTIVITY_TRIGGERS.includes(s.phase)
        ? {
            ...s,
            phase: "lampSelection",
            pending: null,
            reminderGeneration: s.reminderGeneration + 1,
            reminderDueAt: null,
            snoozeUntil: null,
            overlay: "none",
            selectionIndex: 0,
            selectionDevNotice: null,
          }
        : s;
    case "BEGIN":
      return s.phase === "activityIntro"
        ? { ...s, phase: "calibration", overlay: "none", step: 0 }
        : s;
    case "DISABLE":
      return {
        ...s,
        phase: "focus",
        pending: null,
        reminderGeneration: s.reminderGeneration + 1,
        reminderDueAt: null,
        snoozeUntil: null,
        overlay: "none",
        remindersPaused: true,
      };
    case "RETURN_WORK":
      return {
        ...s,
        phase: "focus",
        pending: null,
        overlay: "none",
        step: 0,
        activeGame: null,
        reminderGeneration: s.reminderGeneration + 1,
        reminderDueAt: null,
        snoozeUntil: null,
      };
    case "ENTER_LAMP_SELECTION":
      return ACTIVITY_TRIGGERS.includes(s.phase) || s.phase === "reward"
        ? {
            ...s,
            phase: "lampSelection",
            pending: null,
            reminderGeneration: s.reminderGeneration + 1,
            reminderDueAt: null,
            snoozeUntil: null,
            overlay: "none",
            selectionIndex: 0,
            selectionDevNotice: null,
          }
        : s;
    case "EXIT_LAMP_SELECTION":
      return s.phase === "lampSelection"
        ? {
            ...s,
            phase: "focus",
            overlay: "none",
            selectionDevNotice: null,
          }
        : s;
    case "LAMP_NEXT":
      return s.phase === "lampSelection" && s.overlay === "none"
        ? {
            ...s,
            selectionIndex: wrapIndex(s.selectionIndex + 1, e.totalCount),
            selectionDevNotice: null,
          }
        : s;
    case "LAMP_PREV":
      return s.phase === "lampSelection" && s.overlay === "none"
        ? {
            ...s,
            selectionIndex: wrapIndex(s.selectionIndex - 1, e.totalCount),
            selectionDevNotice: null,
          }
        : s;
    case "LAMP_CONFIRM":
      return s.phase === "lampSelection" && s.overlay === "none"
        ? e.available
          ? {
              ...s,
              // 点头确认后不再停在 activityIntro 等二次点击：
              // 420ms 确认反馈由调用方完成，随后直接进入真人检测。
              // G02 需要身体关键点，走独立的肩臂校准；G01 保持原有头部校准。
              phase: e.gameId === "leanSurf" ? "leanCalibration" : e.gameId === "winglight" ? "wingCalibration" : "calibration",
              activeGame: e.gameId === "leanSurf" ? "leanSurf" : e.gameId === "winglight" ? "winglight" : "yukeeRun",
              overlay: "none",
              step: 0,
              selectionDevNotice: null,
            }
          : { ...s, selectionDevNotice: e.gameId }
        : s;
    case "CLEAR_DEV_NOTICE":
      return { ...s, selectionDevNotice: null };
    case "OPEN":
      return { ...s, overlay: e.overlay };
    case "RESUME":
      return { ...s, overlay: "none" };
    case "SAVE_QUIT":
      return {
        ...s,
        // 摄像头在退出时释放，恢复需重新经过真实校准
        saved: {
          phase:
            s.phase === "leanSurf" || s.phase === "leanCalibration"
              ? "leanCalibration"
              : s.phase === "winglight" || s.phase === "wingCalibration"
              ? "wingCalibration"
              : isGame(s.phase) || s.phase === "calibration"
                ? "calibration"
                : s.phase,
          step: 0,
          game: s.activeGame,
        },
        phase: "focus",
        step: 0,
        overlay: "none",
        pending: null,
        reminderGeneration: s.reminderGeneration + 1,
        reminderDueAt: null,
        snoozeUntil: null,
      };
    case "RESTORE":
      if (!s.saved) return s;
      return {
        ...s,
        phase: s.saved.phase,
        step: s.saved.step,
        activeGame: s.saved.game,
        overlay: "none",
        pending: null,
      };
    case "FINISH_GAME":
      // G02 自带完成页：直接计数并回到工作态，不经过通用 reward 页
      if (s.phase !== "winglight" && s.phase !== "leanSurf") return s;
      if (s.phase === "leanSurf" && (e.result.reps !== 6 || s.overlay !== "none" || !Number.isFinite(e.result.effectiveMs) || e.result.effectiveMs < 0)) return s;
      return {
        ...s,
        phase: "focus",
        activeGame: null,
        overlay: "none",
        step: 0,
        completed: s.completed + 1,
        lastGame: { game: s.phase === "leanSurf" ? "leanSurf" : "winglight", ...e.result },
        saved: null,
        pending: null,
        reminderGeneration: s.reminderGeneration + 1,
        reminderDueAt: null,
        snoozeUntil: null,
      };
    case "NEW_GAME":
      return {
        ...s,
        phase: "calibration",
        activeGame: "yukeeRun",
        overlay: "none",
        pending: null,
        reminderGeneration: s.reminderGeneration + 1,
        reminderDueAt: null,
        snoozeUntil: null,
        step: 0,
      };
    case "MOTION": {
      if (s.overlay !== "none" || !sequences[s.phase]?.includes(e.input.action))
        return s;
      if (s.phase === "calibration" && e.input.action === "calibrated")
        return { ...s, phase: "yukeeRun", step: 0, activeGame: "yukeeRun" };
      if (s.phase === "leanCalibration" && e.input.action === "calibrated")
        return { ...s, phase: "leanSurf", step: 0, activeGame: "leanSurf" };
      if (s.phase === "wingCalibration" && e.input.action === "calibrated")
        return { ...s, phase: "winglight", step: 0, activeGame: "winglight" };
      if (s.phase === "winglight" && e.input.action === "gameComplete")
        // 兜底路径（正常由 FINISH_GAME 收尾），仍计入完成数
        return {
          ...s,
          phase: "reward",
          step: 0,
          completed: s.completed + 1,
          saved: null,
        };
      if (s.phase === "yukeeRun" && e.input.action === "gameComplete")
        return {
          ...s,
          phase: "reward",
          step: 0,
          completed: s.completed + 1,
          saved: null,
        };
      return s;
    }
  }
}
