/**
 * YukeeFace —— Yukee 的 SVG 面孔。
 *
 * 身体轮廓与眼睛几何复用 LaoA-GrokBot 数据（MIT，见 THIRD_PARTY_NOTICES.md），
 * 动画由 YukeeEngine 驱动（spring morph / blink / gaze / 呼吸 / 身体跟随）。
 *
 * 性能约定：8~12Hz 的摄像头输入与 60fps 的动画帧都通过
 * imperative handle 直写 DOM，不经过 React re-render。
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { YukeeEngine } from "./YukeeEngine";
import { YUKEE_STATES } from "./yukeeStateMap";
import type { YukeeEvent, YukeeState } from "./yukeeTypes";
import "./yukee.css";

gsap.registerPlugin(useGSAP);

export type YukeeSizeVariant =
  "home" | "select" | "reminder" | "completion" | "default";
export type YukeeMotionMode = "normal" | "celebrate";

/** LaoA-GrokBot 原版 blob 身体轮廓（original-data / index.html shape-body-path） */
const BODY_PATH =
  "M228.541 114.228C228.541 130.133 225.184 145.994 218.738 160.534" +
  "C212.674 174.217 203.904 186.669 193.065 196.988C155.933 232.34 " +
  "99.497 238.596 55.5255 212.24C45.097 205.99 35.6851 198.072 " +
  "27.7451 188.866C19.1926 178.953 12.3686 167.569 7.65781 155.351" +
  "C2.60712 142.264 0 128.257 0 114.228C0 98.3219 3.35751 82.4611 " +
  "9.80315 67.9215C15.8672 54.2382 24.6377 41.7862 35.4767 31.4668" +
  "C72.6081 -3.88483 129.044 -10.1413 173.016 16.2153C183.444 22.4653 " +
  "192.856 30.3829 200.796 39.5896C209.349 49.5018 216.173 60.8859 " +
  "220.883 73.1037C225.934 86.1906 228.541 100.198 228.541 114.228Z";

export interface YukeeFaceHandle {
  /** MediaPipe 头部姿态驱动的视线（-1 ~ 1） */
  setGaze: (x: number, y: number) => void;
  /** faceCenterX 驱动的身体目标（-1 ~ 1，引擎内阻尼） */
  setBody: (v: number) => void;
  /** yaw 驱动的头部透视转向（度，引擎内阻尼） */
  setTurn: (deg: number) => void;
  /** 瞬时反馈事件 */
  event: (e: YukeeEvent) => void;
}

const YukeeFace = forwardRef<
  YukeeFaceHandle,
  {
    state: YukeeState;
    /** 渲染边长（px），默认填满父容器 */
    size?: number;
    /** 身体 X 最大位移 px（约容器宽 5%~8%） */
    maxBodyX?: number;
    className?: string;
    sizeVariant?: YukeeSizeVariant;
    motionMode?: YukeeMotionMode;
  }
>(function YukeeFace(
  {
    state,
    size,
    maxBodyX = 0,
    className = "",
    sizeVariant = "default",
    motionMode = "normal",
  },
  ref,
) {
  const eye0 = useRef<SVGPathElement>(null);
  const eye1 = useRef<SVGPathElement>(null);
  const breathRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const motionModeRef = useRef<YukeeMotionMode>(motionMode);
  const engineRef = useRef<YukeeEngine | null>(null);

  motionModeRef.current = motionMode;

  // 引擎生命周期：只挂载一次；状态切换走 setState
  useEffect(() => {
    const engine = new YukeeEngine({
      maxBodyX,
      maxGazeX: 20,
      maxGazeY: 11,
      onFrame: (frame) => {
        const targets = [eye0.current, eye1.current];
        frame.eyes.forEach((eye, i) => {
          const el = targets[i];
          if (!el) return;
          el.setAttribute("d", eye.d);
          el.setAttribute(
            "transform",
            `translate(${eye.x.toFixed(2)} ${eye.y.toFixed(2)}) ` +
              `scale(${eye.perspective.toFixed(3)} ${eye.blinkScale.toFixed(3)}) ` +
              `translate(${(-eye.cx).toFixed(2)} ${(-eye.cy).toFixed(2)})`,
          );
          el.style.opacity = eye.visible ? "1" : "0";
        });
        if (breathRef.current)
          breathRef.current.style.transform =
            motionModeRef.current === "celebrate"
              ? "scale(1)"
              : `scale(${frame.breath.toFixed(4)})`;
        if (bodyRef.current)
          bodyRef.current.style.transform =
            motionModeRef.current === "celebrate" || maxBodyX <= 0
              ? "translateX(0) rotate(0)"
              : `translateX(${frame.bodyX.toFixed(2)}px) rotate(${frame.bodyTilt.toFixed(2)}deg)`;
      },
    });
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setState(state);
  }, [state]);

  useGSAP(
    () => {
      const target = motionRef.current;
      if (!target || motionMode !== "celebrate") return;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(target, { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 });
        return;
      }
      const timeline = gsap.timeline({
        defaults: { overwrite: "auto" },
        onComplete: () =>
          gsap.set(target, {
            x: 0,
            y: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          }),
      });
      timeline
        .to(target, {
          yPercent: 4,
          scaleX: 1.08,
          scaleY: 0.9,
          duration: 0.14,
          ease: "power2.in",
        })
        .to(target, {
          yPercent: -29,
          scaleX: 0.94,
          scaleY: 1.1,
          rotation: -4,
          duration: 0.31,
          ease: "power3.out",
        })
        .to(target, {
          yPercent: 5,
          scaleX: 1.09,
          scaleY: 0.9,
          rotation: 3,
          duration: 0.25,
          ease: "power2.in",
        })
        .to(target, {
          yPercent: -12,
          scaleX: 0.97,
          scaleY: 1.06,
          rotation: 4,
          duration: 0.23,
          ease: "power2.out",
        })
        .to(target, {
          yPercent: 2,
          scaleX: 1.04,
          scaleY: 0.95,
          rotation: -3,
          duration: 0.2,
          ease: "power2.in",
        })
        .to(target, {
          yPercent: 0,
          rotation: 5,
          duration: 0.18,
          ease: "sine.inOut",
        })
        .to(target, { rotation: -4, duration: 0.18, ease: "sine.inOut" })
        .to(target, { rotation: 2.5, duration: 0.15, ease: "sine.inOut" })
        .to(target, {
          rotation: 0,
          scaleX: 1.02,
          scaleY: 0.98,
          duration: 0.12,
          ease: "sine.out",
        })
        .to(target, {
          scaleX: 1,
          scaleY: 1,
          duration: 0.24,
          ease: "elastic.out(1, 0.5)",
        });
      return () => timeline.kill();
    },
    { scope: rootRef, dependencies: [motionMode], revertOnUpdate: true },
  );

  useImperativeHandle(ref, () => ({
    setGaze: (x, y) => engineRef.current?.setGaze(x, y),
    setBody: (v) => engineRef.current?.setBodyX(v),
    setTurn: (deg) => engineRef.current?.setTurn(deg),
    event: (e) => {
      engineRef.current?.event(e);
      // success 类事件附加一次小幅弹跳（CSS one-shot，不污染引擎状态）
      if (e === "success" && motionRef.current) {
        const el = motionRef.current;
        el.classList.remove("yukee-event-bounce");
        void el.offsetWidth; // 重新触发动画
        el.classList.add("yukee-event-bounce");
      }
    },
  }));

  const profile = YUKEE_STATES[state];
  return (
    <div
      ref={rootRef}
      className={`yukee-root yukee-state-${state} yukee-size-${sizeVariant} yukee-motion-mode-${motionMode} ${className}`}
      style={
        {
          "--yukee-color": profile.color,
          width: size,
          height: size,
        } as React.CSSProperties
      }
      aria-label={`Yukee 当前状态 ${state}`}
      role="img"
    >
      <div ref={bodyRef} className="yukee-body-x">
        <div
          ref={motionRef}
          className={`yukee-motion yukee-motion-${profile.motion}`}
        >
          <div ref={breathRef} className="yukee-breath">
            <svg viewBox="-28 -28 285 285" className="yukee-svg">
              <defs>
                <clipPath id="yukee-head-clip">
                  <path d={BODY_PATH} />
                </clipPath>
              </defs>
              <path className="yukee-blob" d={BODY_PATH} />
              <g clipPath="url(#yukee-head-clip)">
                <path ref={eye0} className="yukee-eye" />
                <path ref={eye1} className="yukee-eye" />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
});

export default YukeeFace;
