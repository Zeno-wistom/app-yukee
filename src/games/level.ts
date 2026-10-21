/**
 * YUKEE RUN 固定编排关卡。
 * 不用随机生成：课堂体验必须可预期。
 * at 为事件「到达 Yukee」的世界时间（秒）。
 */
export type LevelEvent =
  | { kind: "jump"; at: number; variant: "box" | "rock" | "stack" }
  | { kind: "duck"; at: number; variant: "bar" | "bird" }
  | { kind: "energy"; at: number; side: "left" | "right" };

export const LEVEL: LevelEvent[] = [
  // 0–3s 起跑 / 教学，无事件
  { kind: "jump", at: 5.5, variant: "box" }, // 3–8s 第一个简单跳跃
  { kind: "jump", at: 8.2, variant: "rock" },
  { kind: "energy", at: 11, side: "left" }, // 8–13s 左侧能量
  { kind: "duck", at: 14.2, variant: "bar" }, // 13–18s 低头障碍
  { kind: "jump", at: 16.6, variant: "box" },
  { kind: "energy", at: 19.2, side: "right" }, // 18–23s 右侧能量
  { kind: "duck", at: 22, variant: "bird" },
  { kind: "jump", at: 24.6, variant: "rock" }, // 23–28s 连续两个简单障碍
  { kind: "jump", at: 26.4, variant: "box" },
  { kind: "energy", at: 28.6, side: "left" }, // 28–34s 混合事件
  { kind: "duck", at: 30.4, variant: "bar" },
  { kind: "energy", at: 32.2, side: "right" },
  { kind: "jump", at: 33.8, variant: "stack" },
];
/** 终点线到达时间 */
export const FINISH_AT = 36;
/** 过终点后庆祝并结束的时长 */
export const OUTRO_SECONDS = 2.6;
export const TOTAL_SECONDS = FINISH_AT + OUTRO_SECONDS;
/** 能量信号提前出现 & 可收集窗口（秒）。窗口刻意宽松：舒适、容易触发 */
export const ENERGY_LEAD = 2.0;
export const ENERGY_WINDOW = 2.4;
