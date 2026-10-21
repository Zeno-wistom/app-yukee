/**
 * Yukee 状态映射表。
 *
 * 产品层只使用 YukeeState；底层 Expression 几何数据暂复用
 * LaoA-GrokBot（MIT，见 THIRD_PARTY_NOTICES.md）。
 *
 * pool 的选择基于 25 套表情的实际渲染速查图
 * （docs/screenshots/laoa-expressions.png）逐张视觉核对，
 * 不是按原状态名机械照搬：
 * - 02 大眼圆睁 / 21 双圆眼（不安）/ 03·18 大小圆眼（吃惊）
 * - 08 外八字（担忧）/ 13 下垂平线（失落）/ 14·23 一眉一挑（疑虑）
 * - 05 不对称（困惑）/ 16 交叉眼（发懵）/ 07 内八字（专注）
 * - 17 弯眼（开心）/ 11·20 大眼（兴奋）/ 12 低垂圆眼（满足）
 */
import type { YukeeState, YukeeStateProfile, YukeeEvent } from "./yukeeTypes";
import type { Phase } from "../state/machine";

export const YUKEE_STATES: Record<YukeeState, YukeeStateProfile> = {
  calm: {
    pool: [0, 1, 19],
    cadence: [7000, 12000],
    blink: [4000, 8000],
    motion: "none",
    color: "#b8f0dc",
  },
  attentive: {
    pool: [10, 2, 19],
    cadence: [2800, 5000],
    blink: [3000, 7000],
    motion: "tilt",
    color: "#8cd9bf",
  },
  concerned: {
    pool: [8, 14, 13],
    cadence: [2600, 4500],
    blink: [2800, 5500],
    motion: "tilt",
    color: "#efbd76",
  },
  anxious: {
    pool: [21, 3, 18],
    cadence: [1400, 2600],
    blink: [1500, 3200],
    motion: "pulse",
    color: "#f4a17f",
  },
  focused: {
    pool: [7, 11, 10],
    cadence: [1800, 3200],
    blink: [2800, 5500],
    motion: "scan",
    color: "#92e7d0",
  },
  playful: {
    pool: [2, 17, 11, 20],
    cadence: [1500, 3000],
    blink: [2200, 4500],
    motion: "bounce",
    color: "#8de9bc",
  },
  confused: {
    pool: [5, 16, 23],
    cadence: [2200, 3800],
    blink: [2800, 5500],
    motion: "tilt",
    color: "#e6d3a3",
  },
  celebrate: {
    pool: [2, 17, 20, 12],
    cadence: [1400, 2600],
    blink: [2500, 5000],
    motion: "bounce",
    color: "#8de9bc",
  },
};

/** 瞬时事件 → 临时表情与持续时长（ms），结束后弹回持续状态 */
export const YUKEE_EVENTS: Record<
  Exclude<YukeeEvent, "enterGame" | "exitGame">,
  { expression: number | null; durationMs: number; bounce: boolean }
> = {
  blink: { expression: null, durationMs: 320, bounce: false },
  success: { expression: 17, durationMs: 460, bounce: true },
  miss: { expression: 5, durationMs: 460, bounce: false },
  notice: { expression: 2, durationMs: 340, bounce: false },
  // ---- 受伤反馈池（分身受伤时本体的联动表情，克制、不惩罚） ----
  wince: { expression: 13, durationMs: 520, bounce: false }, // 下垂平线：轻微吃痛
  startled: { expression: 3, durationMs: 460, bounce: false }, // 大小圆眼：突然吓到
  worried: { expression: 8, durationMs: 640, bounce: false }, // 外八字：担心分身
  pained: { expression: 16, durationMs: 720, bounce: false }, // 交叉眼：较明显受伤发懵
};

/** 轻度受伤池：单次 stumble 随机取其一 */
const HURT_POOL: readonly YukeeEvent[] = ["wince", "startled", "worried"];

/**
 * 受伤事件选择：streak 为短窗口内连续受伤次数（首次为 0）。
 * 偶发受伤 → 轻度池随机；连续受伤（streak ≥ 2）→ pained 明显反馈。
 */
export function pickHurtEvent(
  streak: number,
  random: () => number = Math.random,
): YukeeEvent {
  if (streak >= 2) return "pained";
  return HURT_POOL[Math.floor(random() * HURT_POOL.length)];
}

/**
 * 产品相位 → Yukee 持续状态（Visual Adapter 唯一映射入口）。
 * faceLost 由调用方覆盖为 confused。
 */
export function yukeeStateForPhase(phase: Phase): YukeeState {
  switch (phase) {
    case "weakReminder":
      return "attentive";
    case "secondaryReminder":
      return "concerned";
    case "strongReminder":
      return "anxious";
    // 挂灯选择阶段：Yukee 陪伴用户挑卡片，保持好奇注视
    case "lampSelection":
      return "attentive";
    case "calibration":
    case "wingCalibration":
    case "leanCalibration":
    case "squatCalibration":
      return "focused";
    case "yukeeRun":
    case "winglight":
    case "leanSurf":
    case "squatJump":
      return "playful";
    case "reward":
      return "celebrate";
    default:
      return "calm";
  }
}
