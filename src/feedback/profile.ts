import type { Phase } from "../state/machine";
export type Mood = "calm" | "aware" | "remind" | "urgent" | "play" | "happy";
export function feedback(phase: Phase): {
  mood: Mood;
  color: string;
  label: string;
} {
  if (phase === "weakReminder")
    return { mood: "aware", color: "#8cd9bf", label: "我在这里" };
  if (phase === "secondaryReminder")
    return { mood: "remind", color: "#efbd76", label: "休息一下吧" };
  if (phase === "strongReminder")
    return { mood: "urgent", color: "#f4a17f", label: "给自己一点时间" };
  if (phase === "reward")
    return { mood: "happy", color: "#8de9bc", label: "做得很好" };
  if (phase === "yukeeRun" || phase === "calibration")
    return { mood: "play", color: "#92e7d0", label: "跟着我，慢慢来" };
  if (phase === "leanCalibration" || phase === "leanSurf")
    return { mood: "play", color: "#8de9bc", label: "慢慢侧倾，回中收集阳光" };
  if (phase === "wingCalibration" || phase === "winglight")
    return { mood: "play", color: "#ffd98e", label: "展开就好，不用快" };
  return { mood: "calm", color: "#b8e7d7", label: "陪你专注" };
}
