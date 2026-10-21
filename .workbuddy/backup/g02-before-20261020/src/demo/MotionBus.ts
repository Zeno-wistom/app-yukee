import type { MotionAction, MotionInput } from "../vision/types";
/**
 * 统一动作总线：调试按钮（source=debug）与摄像头识别（source=camera）
 * 以同一契约分发。reducer 消费相位级动作，YukeeRun 消费游戏内方向动作。
 */
export class MotionBus {
  private listeners = new Set<(input: MotionInput) => void>();
  subscribe(listener: (input: MotionInput) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  emit(action: MotionAction, source: "debug" | "camera" = "debug") {
    this.listeners.forEach((listener) =>
      listener({ action, source, timestamp: performance.now() }),
    );
  }
  stop() {
    this.listeners.clear();
  }
}
