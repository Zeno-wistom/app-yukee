// MediaPipe Matrix.data is column-major; values are raw estimates until personal calibration.
export function matrixAngles(data: number[]) {
  const deg = 180 / Math.PI;
  return {
    yaw: Math.atan2(data[8], data[10]) * deg,
    pitch: Math.atan2(-data[9], Math.hypot(data[8], data[10])) * deg,
  };
}
export function cameraError(error: unknown, stage: string) {
  const name = error instanceof Error ? error.name : "";
  const messages: Record<string, string> = {
    NotAllowedError:
      "摄像头权限被拒绝。请在地址栏站点设置中允许摄像头，然后重试。",
    NotFoundError: "未找到摄像头。请检查设备连接。",
    NotReadableError:
      "摄像头无法读取，可能被其他软件占用。请关闭占用程序后重试。",
    OverconstrainedError: "摄像头不支持请求的视频设置。",
  };
  return (
    messages[name] ??
    `${stage}失败：${error instanceof Error ? error.message : String(error)}`
  );
}
