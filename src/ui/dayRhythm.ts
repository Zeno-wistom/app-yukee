/**
 * 实时节律（REAL-TIME RHYTHM）——只根据浏览器本地时间判断时段。
 * 不做任何健康诊断；文案保持极短、无医疗暗示。
 */

export type RhythmKey =
  | "dawn"
  | "morning"
  | "noon"
  | "afternoon"
  | "dusk"
  | "night";

export interface Rhythm {
  key: RhythmKey;
  /** 时段名（两字） */
  label: string;
  /** 极短陪伴文案 */
  phrase: string;
}

const TABLE: { from: number; to: number; rhythm: Rhythm }[] = [
  { from: 5, to: 9, rhythm: { key: "dawn", label: "清晨", phrase: "新的一天，慢慢来" } },
  { from: 9, to: 12, rhythm: { key: "morning", label: "上午", phrase: "专注进行中" } },
  { from: 12, to: 14, rhythm: { key: "noon", label: "午间", phrase: "吃点东西，歇一下" } },
  { from: 14, to: 18, rhythm: { key: "afternoon", label: "下午", phrase: "保持轻松节奏" } },
  { from: 18, to: 21, rhythm: { key: "dusk", label: "傍晚", phrase: "适合舒展一下" } },
  { from: 21, to: 24, rhythm: { key: "night", label: "夜间", phrase: "慢一点，也很好" } },
  { from: 0, to: 5, rhythm: { key: "night", label: "夜间", phrase: "慢一点，也很好" } },
];

export function rhythmForHour(hour: number): Rhythm {
  const hit = TABLE.find((row) => hour >= row.from && hour < row.to);
  return hit ? hit.rhythm : TABLE[TABLE.length - 1].rhythm;
}

/** 24 格时间矩阵单元状态 */
export type DayCellState = "past" | "now" | "future";

export function dayCellState(index: number, hour: number): DayCellState {
  if (index < hour) return "past";
  if (index === hour) return "now";
  return "future";
}
