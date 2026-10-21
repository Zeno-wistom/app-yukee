import { FINISH_AT, TOTAL_SECONDS } from "./level";

/**
 * 人脸丢失只暂停仍需要体感输入的玩法段。
 * 越过终点后是确定性的庆祝收尾，不能再被识别状态冻结。
 */
export function shouldPauseForTracking({
  visionWatching,
  facePresent,
  worldTime,
  completed,
}: {
  visionWatching: boolean;
  facePresent: boolean;
  worldTime: number;
  completed: boolean;
}) {
  return visionWatching && !facePresent && !completed && worldTime < FINISH_AT;
}

/** 完成只由世界时钟越过唯一边界触发，调用方再用 completed 保证一次性。 */
export const hasReachedCompletion = (worldTime: number) =>
  worldTime >= TOTAL_SECONDS;
