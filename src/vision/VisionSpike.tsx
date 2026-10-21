import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { cameraError, matrixAngles } from "./pose";
type Metrics = {
  frames: number;
  faces: number;
  points: number;
  fps: number;
  ms: number;
  p95: number;
  sourceFps: number;
  displayFps: number;
  yaw: number | null;
  pitch: number | null;
};
const empty: Metrics = {
  frames: 0,
  faces: 0,
  points: 0,
  fps: 0,
  ms: 0,
  p95: 0,
  sourceFps: 0,
  displayFps: 0,
  yaw: null,
  pitch: null,
};
export default function VisionSpike() {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    model = useRef<FaceLandmarker | null>(null),
    raf = useRef(0),
    generation = useRef(0);
  const [status, setStatus] = useState("未启动"),
    [error, setError] = useState(""),
    [metrics, setMetrics] = useState(empty),
    [running, setRunning] = useState(false),
    [loading, setLoading] = useState(false);
  function release() {
    generation.current++;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    model.current?.close();
    model.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => () => release(), []);
  function stop() {
    release();
    setRunning(false);
    setLoading(false);
    setStatus("已停止 · 视频轨道已释放");
  }
  async function start() {
    release();
    const id = generation.current;
    setError("");
    setLoading(true);
    setMetrics(empty);
    let stage = "摄像头";
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error("请通过 localhost 或 HTTPS 打开");
      setStatus("请求摄像头权限…");
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      });
      if (id !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      video.current!.srcObject = media;
      await video.current!.play();
      if (id !== generation.current) return;
      stage = "本地 Face Landmarker 模型加载";
      setStatus("摄像头成功 · 正在加载本地模型…");
      const files = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
      if (id !== generation.current) return;
      const detector = await FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task" },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
        outputFaceBlendshapes: false,
      });
      if (id !== generation.current) {
        detector.close();
        return;
      }
      model.current = detector;
      setStatus("摄像头与模型已就绪 · 正在检测");
      setRunning(true);
      setLoading(false);
      stage = "人脸推理";
      let last = 0,
        lastVideo = -1,
        frames = 0,
        startTime = performance.now();
      let renderFrames = 0;
      const firstVideoFrames =
        video.current!.getVideoPlaybackQuality().totalVideoFrames;
      const times: number[] = [];
      const loop = (now: number) => {
        if (id !== generation.current) return;
        renderFrames++;
        if (
          now - last >= 1000 / 15 &&
          video.current &&
          video.current.readyState >= 2 &&
          video.current.currentTime !== lastVideo
        ) {
          last = now;
          lastVideo = video.current.currentTime;
          try {
            const begin = performance.now();
            const result = detector.detectForVideo(video.current, now);
            const ms = performance.now() - begin;
            times.push(ms);
            if (times.length > 180) times.shift();
            frames++;
            const matrix = result.facialTransformationMatrixes[0];
            const angles = matrix
              ? matrixAngles(matrix.data)
              : { yaw: null, pitch: null };
            const sorted = [...times].sort((a, b) => a - b);
            setMetrics({
              frames,
              faces: result.faceLandmarks.length,
              points: result.faceLandmarks[0]?.length ?? 0,
              fps: frames / ((now - startTime) / 1000),
              ms,
              p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
              sourceFps:
                (video.current.getVideoPlaybackQuality().totalVideoFrames -
                  firstVideoFrames) /
                Math.max((now - startTime) / 1000, 0.1),
              displayFps:
                renderFrames / Math.max((now - startTime) / 1000, 0.1),
              ...angles,
            });
          } catch (e) {
            setError(cameraError(e, stage));
            stop();
            return;
          }
        }
        raf.current = requestAnimationFrame(loop);
      };
      raf.current = requestAnimationFrame(loop);
    } catch (e) {
      if (id !== generation.current) return;
      release();
      setError(cameraError(e, stage));
      setStatus("预检未通过");
      setRunning(false);
      setLoading(false);
    }
  }
  return (
    <section className="spike">
      <h2>独立摄像头技术预检</h2>
      <p>
        此页只验证视频与人脸数据，不控制主原型。画面仅在本机处理，不保存、不上传。
      </p>
      <button onClick={start} disabled={loading || running}>
        启用真实摄像头
      </button>
      <button onClick={stop} disabled={!loading && !running}>
        停止摄像头
      </button>
      <p role="status">{status}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="spike-grid">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="真实摄像头视频"
        />
        <dl>
          <dt>输入来源</dt>
          <dd>浏览器真实摄像头</dd>
          <dt>检测人脸</dt>
          <dd data-testid="faces">{metrics.faces} / 1</dd>
          <dt>关键点数量</dt>
          <dd>{metrics.points}</dd>
          <dt>检测帧数</dt>
          <dd data-testid="frames">{metrics.frames}</dd>
          <dt>实际推理 FPS</dt>
          <dd>{metrics.fps.toFixed(1)}</dd>
          <dt>视频源 / 回调 FPS</dt>
          <dd>
            {metrics.sourceFps.toFixed(1)} / {metrics.displayFps.toFixed(1)}
          </dd>
          <dt>本帧 / P95</dt>
          <dd>
            {metrics.ms.toFixed(1)} / {metrics.p95.toFixed(1)} ms
          </dd>
          <dt>原始 yaw / pitch</dt>
          <dd>
            {metrics.yaw?.toFixed(1) ?? "—"}° /{" "}
            {metrics.pitch?.toFixed(1) ?? "—"}°
          </dd>
        </dl>
      </div>
      <small>
        VIDEO · 单人脸 · 本地 WASM / 模型 · 推理上限 15
        FPS。角度为原始估计值，正负方向和自然坐姿基准留待下一批真人校准。P95
        是最近 180 帧中 95% 帧的耗时上界。
      </small>
    </section>
  );
}
