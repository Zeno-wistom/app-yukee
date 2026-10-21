import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Hand, Pause, ScanLine, Sparkles, X } from "lucide-react";
import MoonWingScene from "./MoonWingScene";
import type { YukeeState } from "../yukee/yukeeTypes";
import { audioEngine } from "../audio/engine";
import type { WingProfile, WingUpdate } from "../vision/wingPose";
import { useWingSession, type WingInputMode } from "./useWingSession";
import { computeRobotPose, robotCssVars } from "./robotRig";
import { moonRopes } from "./moonRig";
import type { MoonFirefliesHandle } from "./MoonFireflies";
import { WAVES, type MoonVisitorsHandle } from "./MoonVisitors";

/** 首屏静态姿态：双臂收起的待机机器人（避免首帧跳变） */
const INITIAL_ROBOT_VARS = robotCssVars(
  computeRobotPose(0, 0),
) as React.CSSProperties;

/**
 * G02「展翼接光」游戏画面。
 *
 * 视觉：Yukee 在像素月夜的前景河面航行，左右展开量分别驱动关节与翼帆，
 * 展开吸光，完整「展开→保持→回位」后才汇光、点亮进度并前进。
 *
 * 性能约定：
 * - 连续变化通过 RAF 写 CSS 变量与缆绳端点，不走 React；帧率以设备实测为准；
 * - 10Hz 的 HUD（指令、计时、进度）才进入 React state；
 * - 场景 SVG 用 memo 固定，避免计时刷新引起整棵树重渲染。
 */

function formatMs(ms: number) {
  const total = Math.floor(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export default function Winglight({
  paused,
  profile,
  mode,
  onPause,
  onQuit,
  onFinish,
  onEarlyExit,
}: {
  paused: boolean;
  profile: WingProfile | null;
  mode: WingInputMode;
  onPause: () => void;
  onQuit: () => void;
  onFinish: (result: {
    effectiveMs: number;
    reps: number;
    source: "camera" | "keyboard-demo";
  }) => void;
  onEarlyExit: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [finished, setFinished] = useState(false);
  /** 45 秒提示点过「继续」后不再反复打扰 */
  const [softAck, setSoftAck] = useState(false);
  const [result, setResult] = useState<{ effectiveMs: number; reps: number }>({
    effectiveMs: 0,
    reps: 0,
  });
  const finishedRef = useRef(false);
  const firefliesRef = useRef<MoonFirefliesHandle>(null);
  const visitorsRef = useRef<MoonVisitorsHandle>(null);
  const source: "camera" | "keyboard-demo" =
    mode === "demo" ? "keyboard-demo" : "camera";

  /**
   * 60fps：只写 CSS 变量，不触发 React 渲染。
   * 显示侧对 uL/uR 再做一层 70ms 指数趋近：识别短暂丢失后平滑器会重置，
   * 恢复瞬间姿态数据可能跳变，这里把跳变吸收成快速平滑过渡，
   * 同时不影响上游计分（计分只用 WingSession 内部数据）。
   */
  const dispRef = useRef({ uL: 0, uR: 0, at: 0 });
  const applyFrame = useCallback((update: WingUpdate) => {
    const el = rootRef.current;
    if (!el) return;
    const now = performance.now();
    const disp = dispRef.current;
    const dt = disp.at ? Math.min(now - disp.at, 120) : 16.7;
    disp.at = now;
    const k = 1 - Math.exp(-Math.max(dt, 1) / 70);
    // 完成后只让显示层舒展庆祝；计分会话和结果仍使用原始识别数据。
    disp.uL += ((finishedRef.current ? 1 : update.uL) - disp.uL) * k;
    disp.uR += ((finishedRef.current ? 1 : update.uR) - disp.uR) * k;
    const u = Math.min(disp.uL, disp.uR);
    el.style.setProperty("--wing-open", u.toFixed(4));
    el.style.setProperty("--wing-left", disp.uL.toFixed(4));
    el.style.setProperty("--wing-right", disp.uR.toFixed(4));
    el.style.setProperty("--wing-hold", update.hold.toFixed(4));
    el.style.setProperty(
      "--wing-orb",
      Math.max(0, Math.min(1, (u - 0.42) / 0.58)).toFixed(4),
    );
    // 机器人关节与缆绳：纯几何计算，每帧约二十次浮点运算
    const vars = robotCssVars(computeRobotPose(disp.uL, disp.uR));
    for (const key of Object.keys(vars)) el.style.setProperty(key, vars[key]);
    for (const rope of moonRopes(disp.uL, disp.uR)) {
      el.querySelector(`[data-moon-rope="${rope.side}"]`)?.setAttribute(
        "d",
        rope.d,
      );
    }
    // 互动粒子仅消费显示数据；手动暂停由原 RAF 门控，身体丢失/恢复也冻结粒子时钟。
    if (update.tracking === "ok" && !update.resuming) {
      const targets = firefliesRef.current?.step(
        dt,
        u,
        update.openValid,
        update.reps,
        finishedRef.current,
      );
      // 每次收集换一种「光之访客」，动作不变
      visitorsRef.current?.step(
        dt,
        u,
        update.openValid,
        update.reps,
        finishedRef.current,
        targets ?? null,
      );
    }
  }, []);

  const complete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    audioEngine.sfx("complete");
    setFinished(true);
  }, []);

  const { hud, demoHoldRef, sessionRef } = useWingSession({
    paused,
    profile,
    mode,
    onFrame: applyFrame,
    onRep: () => audioEngine.sfx("reward"),
    onComplete: complete,
  });

  // 完成时抓取最终结果（HUD 以 10Hz 刷新，这里取会话内的精确值）
  useEffect(() => {
    if (!finished) return;
    const elapsed = sessionRef.current?.elapsed ?? hud.effectiveMs;
    setResult({
      effectiveMs: elapsed,
      reps: sessionRef.current?.repCount ?? 5,
    });
  }, [finished, hud.effectiveMs, sessionRef]);

  // 键盘演示：按住空格/↑ 模拟展开，松开回位。
  // 用 layout effect 同步绑定，避免「进入游戏瞬间按下」被漏掉。
  useLayoutEffect(() => {
    if (mode !== "demo") return;
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowUp") {
        e.preventDefault();
        demoHoldRef.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === "ArrowUp") {
        e.preventDefault();
        demoHoldRef.current = false;
      }
    };
    const blur = () => {
      demoHoldRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [mode, demoHoldRef]);

  const mood: YukeeState = finished
    ? "celebrate"
    : hud.tracking === "lost" || hud.resuming
      ? "confused"
      : hud.openValid
        ? "playful"
        : hud.u > 0.4
          ? "focused"
          : "attentive";

  const finish = () => {
    onFinish({
      effectiveMs: result.effectiveMs || sessionRef.current?.elapsed || 0,
      reps: result.reps || sessionRef.current?.repCount || 0,
      source,
    });
  };

  return (
    <div
      ref={rootRef}
      className={`wing-game ${paused ? "is-paused" : ""} ${finished ? "is-finished" : ""}`}
      style={INITIAL_ROBOT_VARS}
      data-testid="winglight"
      data-mode={mode}
      data-stage={hud.stage}
      data-tracking={hud.tracking}
      data-paused={
        paused
          ? "manual"
          : hud.tracking === "lost"
            ? "body"
            : hud.resuming
              ? "recovering"
              : "none"
      }
      data-charged={hud.openValid ? "1" : "0"}
      data-reps={hud.reps}
      data-complete={finished ? "1" : "0"}
    >
      <div className="wing-hud-top">
        <span className="wing-title">
          WINGLIGHT <small>展翼接光 · 肩臂</small>
        </span>
        <div className="wing-pips" aria-label={`已收集 ${hud.reps} / 5`}>
          {[0, 1, 2, 3, 4].map((i) => (
            <i key={i} className={i < hud.reps ? "lit" : ""} />
          ))}
          <b data-testid="wing-reps">{hud.reps}/5</b>
          {!finished && (
            <span className="wing-wave" data-testid="wing-wave" key={hud.reps}>
              {WAVES[Math.min(hud.reps, WAVES.length - 1)].name}
            </span>
          )}
        </div>
        <div className="wing-meta">
          <span className="wing-time" data-testid="wing-time">
            {formatMs(hud.effectiveMs)}
          </span>
          <span
            className={`wing-cam ${mode === "demo" ? "demo" : hud.tracking}`}
            data-testid="wing-cam"
          >
            {mode === "demo"
              ? "键盘演示"
              : hud.tracking === "lost"
                ? "身体未识别"
                : hud.tracking === "unstable"
                  ? "确认身体中"
                  : "双臂已识别"}
          </span>
          <button aria-label="暂停" onClick={onPause}>
            <Pause size={12} />
          </button>
          <button aria-label="退出游戏" onClick={onQuit}>
            <X size={12} />
          </button>
        </div>
      </div>

      {hud.reps > 0 && (
        <span
          key={hud.reps}
          className="moon-progress-delivery"
          aria-hidden="true"
        />
      )}
      <div className="wing-stage">
        <MoonWingScene
          finished={finished}
          mood={mood}
          reps={hud.reps}
          firefliesRef={firefliesRef}
          visitorsRef={visitorsRef}
        />

        {!finished && (
          <div className="wing-guide">
            <span
              key={hud.instruction}
              className="wing-instruction"
              role="status"
            >
              {hud.instruction}
            </span>
            <i className="wing-hold">
              <em style={{ width: `${Math.round(hud.hold * 100)}%` }} />
            </i>
          </div>
        )}

        {(hud.tracking === "lost" || hud.resuming) && !finished && (
          <div className="wing-lost" role="alert">
            <ScanLine size={18} />
            <b>{hud.tracking === "lost" ? hud.instruction : "识别已恢复"}</b>
            <span>
              {hud.tracking === "lost"
                ? "让双肩、双肘和双手留在画面内"
                : "双臂慢慢收回，准备继续"}
            </span>
            <small>计时与计数已暂停</small>
          </div>
        )}

        {hud.overSoftLimit && !softAck && !finished && (
          <div className="wing-soft-limit">
            <b>已经活动 45 秒了</b>
            <span>不用赶，想继续就继续，想休息也可以。</span>
            <div>
              <button
                className="primary"
                onClick={() => setSoftAck(true)}
                data-testid="wing-soft-continue"
              >
                继续
              </button>
              <button className="quiet" onClick={onEarlyExit}>
                结束本次
              </button>
            </div>
          </div>
        )}

        {finished && (
          <div className="wing-complete" data-testid="wing-complete">
            <div className="wing-complete-glow" />
            <span className="eyebrow">LIGHT GATHERED</span>
            <h2>光能量充满了</h2>
            <p className="wing-complete-quote">
              每一次展开都很慢、很稳，这就够了。
            </p>
            <div className="wing-complete-stats">
              <span>
                <b data-testid="wing-final-reps">{result.reps}/5</b>
                <small>完整动作</small>
              </span>
              <i />
              <span>
                <b>{formatMs(result.effectiveMs)}</b>
                <small>有效时间</small>
              </span>
            </div>
            {source === "keyboard-demo" && (
              <p className="wing-demo-note">
                键盘演示数据 · 未经摄像头识别验证
              </p>
            )}
            <button
              className="primary"
              onClick={finish}
              data-testid="wing-back"
            >
              回到专注
            </button>
          </div>
        )}
      </div>

      {mode === "demo" && !finished && (
        <div className="wing-demo-bar">
          <span className="wing-demo-badge">
            <Hand size={10} /> 键盘演示
          </span>
          <button
            className="wing-demo-hold"
            onPointerDown={() => {
              demoHoldRef.current = true;
            }}
            onPointerUp={() => {
              demoHoldRef.current = false;
            }}
            onPointerLeave={() => {
              demoHoldRef.current = false;
            }}
          >
            按住 = 展开双臂
          </button>
          <span className="wing-demo-hint">
            <Sparkles size={10} /> 正式游戏请用摄像头
          </span>
        </div>
      )}
    </div>
  );
}
