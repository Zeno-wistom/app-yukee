import { useEffect, useRef, useState } from "react";
import { ScanFace, RefreshCcw } from "lucide-react";
import { cameraVision } from "../vision/CameraVision";

/**
 * 真实摄像头自然姿态校准：
 * 允许摄像头 → 检测人脸 → 自然面对屏幕稳定 ~1.3s → 记录 baseline → 开始游戏。
 * 画面仅在本机处理，不保存、不上传。
 *
 * 进度动画原则：Vision FPS ≠ UI Animation FPS。
 * MediaPipe 只提供 targetProgress（~10Hz 且丢脸即重置）；
 * 视觉层用独立 rAF 以弹簧插值连续逼近 target：
 * - 稳定检测中 target 增长 → displayed 平滑跟随；
 * - 短暂丢脸 target 归零 → 视觉不回退，原地平滑停住；
 * - 恢复后 target 重新增长 → 从停住的位置继续。
 * 全程 direct-DOM 写入，不触发 React 重渲染。
 */

/** 视觉进度环：rAF 弹簧逼近 target，永不回退 */
function useSmoothProgress() {
  const ringRef = useRef<SVGCircleElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const targetRef = useRef(0);
  const displayedRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const CIRC = 213.6;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const target = targetRef.current;
      let d = displayedRef.current;
      if (d < target) {
        // 弹簧逼近 + 最小爬行速度，保证小步长也能连续填满
        d += (target - d) * (1 - Math.exp(-dt * 7));
        d += dt * 0.06;
        if (d > target) d = target;
      }
      displayedRef.current = d;
      const ring = ringRef.current;
      if (ring) ring.style.strokeDasharray = `${d * CIRC} ${CIRC}`;
      const dot = dotRef.current;
      if (dot) {
        // 端点 glow：SVG 整体 rotate(-90deg)，dash 起点在 SVG 坐标 3 点方向
        const angle = d * Math.PI * 2;
        dot.setAttribute("cx", String(40 + Math.cos(angle) * 34));
        dot.setAttribute("cy", String(40 + Math.sin(angle) * 34));
        dot.style.opacity = d > 0.02 && d < 1 ? "1" : "0";
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { ringRef, dotRef, targetRef, displayedRef };
}

export default function CalibrationView({
  onCalibrated,
  onDemo,
}: {
  onCalibrated: () => void;
  onDemo?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [stage, setStage] = useState<
    "starting" | "waiting-face" | "holding" | "done" | "error"
  >("starting");
  const [error, setError] = useState("");
  const done = useRef(false);
  const { ringRef, dotRef, targetRef, displayedRef } = useSmoothProgress();

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    done.current = false;
    (async () => {
      try {
        await cameraVision.start();
        if (cancelled) return;
        cameraVision.beginCalibration(() => {
          if (cancelled || done.current) return;
          done.current = true;
          targetRef.current = 1;
          displayedRef.current = 1;
          setStage("done");
          // bloom pulse 结束后自动进入分裂动画
          timer = setTimeout(() => { if (!cancelled) onCalibrated(); }, 620);
        });
        unsubscribe = cameraVision.onStatus((status) => {
          if (done.current) return;
          if (!status.facePresent) {
            // 短暂丢脸：target 保持历史最高，视觉平滑停住
            setStage("waiting-face");
          } else {
            setStage("holding");
            const p = status.calibrating ?? 0;
            if (p > targetRef.current) targetRef.current = p;
          }
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStage("error");
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
      if (!done.current) cameraVision.cancelCalibration();
    };
  }, [onCalibrated, targetRef, displayedRef, attempt]);

  return (
    <div className="calibration-view" data-testid="calibration-view">
      <span className="eyebrow">CALIBRATION · 自然姿态校准</span>
      <div className={`calibration-orb ${stage}`}>
        <ScanFace size={34} />
        <svg viewBox="0 0 80 80" className="calibration-ring">
          <circle cx="40" cy="40" r="34" />
          <circle ref={ringRef} cx="40" cy="40" r="34" />
          <circle
            ref={dotRef}
            className="calibration-ring-dot"
            cx="40"
            cy="6"
            r="3"
          />
        </svg>
      </div>
      {stage === "error" ? (
        <>
          <h2>摄像头暂时不可用</h2>
          <p role="alert" className="error">
            {error}
          </p>
          <button
            className="primary"
            onClick={() => {
              setStage("starting");
              setError("");
              cameraVision.stop();
              targetRef.current = 0; displayedRef.current = 0;
              setAttempt((n) => n + 1);
            }}
          >
            <RefreshCcw size={14} /> 重试
          </button>
        </>
      ) : (
        <>
          <h2>保持舒适坐姿，看向屏幕</h2>
          <p
            className="calibration-stage-text"
            data-testid="calibration-stage-text"
          >
            {stage === "starting"
              ? "正在请求摄像头并加载本地模型…"
              : stage === "waiting-face"
                ? "正在寻找你"
                : stage === "done"
                  ? "准备好了"
                  : "看见你了 · 保持自然姿势"}
          </p>
          <small className="privacy-note">
            画面仅在本机实时处理，不保存、不上传。
          </small>
        </>
      )}
      {onDemo && <button className="quiet" onClick={onDemo}>键盘演示 · 非人体识别</button>}
    </div>
  );
}
