import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@mediapipe/tasks-vision', () => ({ FaceLandmarker: {}, FilesetResolver: {}, HandLandmarker: {}, PoseLandmarker: {} }));
import { CameraVision } from './CameraVision';
import type { PoseFrame } from './wingPose';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
function stream() {
  const track = { stop: vi.fn(), readyState: 'live' };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
function environment(getUserMedia: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('document', { createElement: () => ({ muted: false, playsInline: false, srcObject: null, play: async () => {} }) });
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('摄像头/Pose 生命周期边界', () => {
  it('重叠订阅期间，旧校准释放不会关闭游戏订阅；最后一个退出才停 Pose', () => {
    const c = new CameraVision();
    const offOld = c.onPose(vi.fn());
    const offGame = c.onPose(vi.fn());
    offOld(); offOld();
    expect(c.getPoseDiagnostics().subscribers).toBe(1);
    expect(c.getPoseDiagnostics().poseActive).toBe(true);
    offGame();
    expect(c.getPoseDiagnostics().poseActive).toBe(false);
  });
  it('交接回放最近帧保留原时间戳，不把旧帧翻新', () => {
    const c = new CameraVision();
    const frame: PoseFrame = { landmarks: [], at: 100, videoWidth: 640, videoHeight: 480 };
    (c as any).emitPose(frame);
    vi.spyOn(performance, 'now').mockReturnValue(200);
    const listener = vi.fn(); const off = c.onPose(listener);
    expect(listener).toHaveBeenCalledWith(frame);
    expect(frame.at).toBe(100); off();
    vi.spyOn(performance, 'now').mockReturnValue(600);
    const stale = vi.fn(); c.onPose(stale)();
    expect(stale).not.toHaveBeenCalled();
  });
  it('授权结果迟到于退出：释放该结果，不复活摄像头', async () => {
    const media = deferred<any>(); environment(vi.fn(() => media.promise));
    const c = new CameraVision();
    const starting = c.start(); const rejected = expect(starting).rejects.toThrow('取消');
    c.stop(); const old = stream(); media.resolve(old);
    await rejected;
    expect(old.track.stop).toHaveBeenCalledOnce();
    expect(c.isRunning).toBe(false);
  });
  it('旧启动任务失败不能清理新启动成功的视频流', async () => {
    const media = deferred<any>(); const fresh = stream();
    environment(vi.fn().mockImplementationOnce(() => media.promise).mockResolvedValueOnce(fresh));
    const c = new CameraVision();
    (c as any).ensureModel = async () => ({});
    const first = c.start(); const rejected = expect(first).rejects.toThrow('取消');
    c.stop(); await c.start();
    const old = stream(); media.resolve(old); await rejected;
    expect(c.isRunning).toBe(true);
    expect(fresh.track.stop).not.toHaveBeenCalled();
    expect(old.track.stop).toHaveBeenCalledOnce(); c.stop();
    expect(fresh.track.stop).toHaveBeenCalledOnce();
  });
  it('模型加载期间退出也立即释放已获授权的视频轨道', async () => {
    const fresh = stream(); environment(vi.fn().mockResolvedValue(fresh));
    const model = deferred<any>(); const c = new CameraVision();
    (c as any).ensureModel = () => model.promise;
    const first = c.start(); const rejected = expect(first).rejects.toThrow('取消');
    await Promise.resolve(); await Promise.resolve(); c.stop();
    expect(fresh.track.stop).toHaveBeenCalled(); model.resolve({}); await rejected;
    expect(c.isRunning).toBe(false);
  });
});
