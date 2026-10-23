import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  arcadeInitialState,
  isGame,
  reducer,
  type GameResult,
} from "../state/machine";
import { MotionBus } from "../demo/MotionBus";
import { cameraVision } from "../vision/CameraVision";
import { audioEngine } from "../audio/engine";
import SoundControl from "./SoundControl";
import { GAMES } from "../selection/games";
import SelectionScreen from "../selection/SelectionScreen";
import type { WingProfile } from "../vision/wingPose";
import type { LeanMode, LeanProfile } from "../vision/leanPose";
import type { SquatProfile } from "../vision/squatPose";
import type { GameEventKind } from "../games/YukeeRun";
import type { MotionAction } from "../vision/types";
import YukeeFace from "../yukee/YukeeFace";
import { MOTION, reducedMotion } from "../motion/tokens";
import { useStageTransition } from "../motion/useStageTransition";
import "./arcade.css";
import "./motion.css";
import "./viewport.css";

const Calibration = lazy(() => import("../games/CalibrationView"));
const WingCalibration = lazy(() => import("../games/WingCalibrationView"));
const LeanCalibration = lazy(() => import("../games/LeanCalibrationView"));
const SquatCalibration = lazy(
  () => import("../games/squatJump/SquatCalibrationView"),
);
const Run = lazy(() => import("../games/YukeeRun"));
const Wing = lazy(() => import("../games/Winglight"));
const Lean = lazy(() => import("../games/LeanSurf"));
const Squat = lazy(() => import("../games/squatJump/SquatJump"));
const VisionSpike = lazy(() => import("../vision/VisionSpike"));
gsap.registerPlugin(useGSAP);

export default function ProductApp() {
  const [state, dispatch] = useReducer(reducer, arcadeInitialState);
  const bus = useMemo(() => new MotionBus(), []);
  const [wingProfile, setWingProfile] = useState<WingProfile | null>(null);
  const [leanProfile, setLeanProfile] = useState<LeanProfile | null>(null);
  const [squatProfile, setSquatProfile] = useState<SquatProfile | null>(null);
  const [mode, setMode] = useState<LeanMode>("camera");
  const [restartKey, setRestartKey] = useState(0);
  const [vision, setVision] = useState(location.hash === "#vision");
  const root = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const { navigate, transition, locked } = useStageTransition(root);
  const { contextSafe } = useGSAP({ scope: root });
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  useLayoutEffect(() => { if (root.current) root.current.scrollTop = 0; }, [state.phase]);
  const selection = state.phase === "lampSelection";
  const playing = isGame(state.phase);
  const paused = state.overlay !== "none";
  const game = GAMES.find((g) => g.id === state.activeGame);
  const selectedGame = game ?? GAMES[state.selectionIndex];
  useEffect(() => {
    if (!selection) return;
    let idle: number | undefined;
    // The native AudioContext constructor measured 83ms on this PC. Warm it
    // after entrance motion, while idle, rather than inside the first start click.
    const timer = setTimeout(() => {
      // 空闲预热只建音频图，不发任何音频请求（motion.spec 契约）
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(() => audioEngine.prepare());
      else audioEngine.prepare();
    }, 1100);
    return () => { clearTimeout(timer); if (idle !== undefined) window.cancelIdleCallback(idle); };
  }, [selection]);
  const prepare = () => {
    const id = GAMES[state.selectionIndex].id;
    // 意图阶段（悬停 / 聚焦 / 点击）才取回 UI 音效与该游戏的 BGM、音效（异步解码，不阻塞点击）
    audioEngine.preloadGame(id);
    audioEngine.preloadGroup("ui");
    // Warm the existing split chunk on intent, without mounting calibration or requesting camera access.
    const loaders: Record<string, () => Promise<unknown>> = {
      yukeeRun: () => import("../games/CalibrationView"),
      winglight: () => import("../games/WingCalibrationView"),
      leanSurf: () => import("../games/LeanCalibrationView"),
      squatJump: () => import("../games/squatJump/SquatCalibrationView"),
    };
    void loaders[id]().catch(() => { /* Suspense retains the normal loading path. */ });
  };
  const toSelection = useCallback(
    () => navigate(() => dispatch({ type: "BACK_TO_SELECTION" })),
    [navigate],
  );
  /** 用户主动退出 / 返回：带返回音 */
  const exitToSelection = useCallback(() => {
    audioEngine.ui("ui-back");
    toSelection();
  }, [toSelection]);
  const calibrated = useCallback(() => bus.emit("calibrated", "camera"), [bus]);
  const finish = useCallback((result: Omit<GameResult, "game">) => {
    dispatch({ type: "FINISH_GAME", result });
    navigate(() => dispatch({ type: "BACK_TO_SELECTION" }));
  }, [navigate]);
  const resume = contextSafe(() => {
    audioEngine.ui("ui-resume");
    const commit = () => dispatch({ type: "RESUME" });
    if (reducedMotion() || !dialog.current?.open) { commit(); return; }
    gsap.to(dialog.current, { opacity: 0, y: 10, scale: 0.985, duration: MOTION.micro, overwrite: true, onComplete: commit });
  });
  const wingCalibrated = useCallback(
    (profile: WingProfile, input: LeanMode) => {
      setWingProfile(profile);
      setMode(input);
      bus.emit("calibrated", input === "camera" ? "camera" : "debug");
    },
    [bus],
  );
  const leanCalibrated = useCallback(
    (profile: LeanProfile, input: LeanMode) => {
      setLeanProfile(profile);
      setMode(input);
      bus.emit("calibrated", input === "camera" ? "camera" : "debug");
    },
    [bus],
  );
  const squatCalibrated = useCallback(
    (profile: SquatProfile, input: LeanMode) => {
      setSquatProfile(profile);
      setMode(input);
      bus.emit("calibrated", input === "camera" ? "camera" : "debug");
    },
    [bus],
  );
  const runDemo = useCallback(() => {
    setMode("demo");
    cameraVision.stop();
    bus.emit("calibrated");
  }, [bus]);
  const runComplete = useCallback(
    (energy: number) =>
      dispatch({
        type: "FINISH_RUN",
        source: mode === "camera" ? "camera" : "keyboard-demo",
        energy,
      }),
    [mode],
  );
  const gameEvent = useCallback((kind: GameEventKind) => {
    // G02 / G03 / G05 各自用 gameCues 发声；这里只保留 G01 原有合成音效。
    if (phaseRef.current !== "yukeeRun") return;
    if (kind === "stumble") audioEngine.sfx("hit");
    else if (kind === "jump") audioEngine.sfx("jump");
    else if (kind === "left" || kind === "right") audioEngine.sfx("reward");
    else if (kind === "complete") audioEngine.sfx("complete");
  }, []);
  useEffect(
    () => bus.subscribe((input) => dispatch({ type: "MOTION", input })),
    [bus],
  );
  useEffect(
    () =>
      cameraVision.onAction((action) => {
        if (phaseRef.current === "yukeeRun") bus.emit(action, "camera");
      }),
    [bus],
  );
  // 主动进入校准后才请求权限；选择、演示与结算阶段立即释放轨道。
  useEffect(() => {
    if (selection || state.phase === "reward" || (playing && mode === "demo"))
      cameraVision.stop();
    if (selection) setMode("camera");
  }, [selection, state.phase, playing, mode]);
  useEffect(
    () => () => {
      cameraVision.stop();
      audioEngine.stopBgm(0);
      audioEngine.stopEffects();
    },
    [],
  );
  // 每款游戏一首独立 BGM：进入游戏淡入；暂停淡出并记住位置，继续时接着播；
  // 校准 / 结算 / 选择页淡出停止。切换游戏时旧曲由引擎在 0.35 s 内淡出。
  useEffect(() => {
    audioEngine.setBgmTrack(selection ? null : state.activeGame);
    if (playing && !paused) audioEngine.playBgm(0.9);
    else if (playing && paused) {
      audioEngine.pauseBgm(0.3);
      audioEngine.stopEffects();
    } else {
      audioEngine.stopBgm(selection ? 0.6 : 0.4);
      audioEngine.chargeStop();
      if (selection) audioEngine.stopEffects();
    }
  }, [playing, paused, selection, state.activeGame]);
  // 第一次真实交互（按下鼠标 / 触摸 / 按键）时预取约 60 KB 的 UI 音效
  useEffect(() => {
    const first = () => {
      audioEngine.prepare();
      audioEngine.preloadGroup("ui");
    };
    const opts = { capture: true, once: true } as const;
    window.addEventListener("pointerdown", first, opts);
    window.addEventListener("keydown", first, opts);
    return () => {
      window.removeEventListener("pointerdown", first, opts);
      window.removeEventListener("keydown", first, opts);
    };
  }, []);
  // 主要按钮的通用点击音：已有专属交互音（暂停、继续、退出……）的点击不再叠加
  useEffect(() => {
    const click = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("button");
      if (!el || el.disabled || !root.current?.contains(el)) return;
      if (el.dataset.sound === "none") return;
      if (performance.now() - audioEngine.lastUiAt < 80) return;
      if (el.matches(".primary, .quiet, .icon-button")) audioEngine.ui("ui-click");
    };
    window.addEventListener("click", click);
    return () => window.removeEventListener("click", click);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape" && playing) {
        e.preventDefault();
        if (paused) resume();
        else {
          audioEngine.ui("ui-pause");
          dispatch({ type: "OPEN", overlay: "pause" });
        }
      }
      if (
        state.phase === "yukeeRun" &&
        mode === "demo" &&
        !paused &&
        !e.repeat
      ) {
        const actions: Record<string, MotionAction> = {
          ArrowUp: "up",
          ArrowDown: "down",
          ArrowLeft: "left",
          ArrowRight: "right",
        };
        if (actions[e.key]) {
          e.preventDefault();
          bus.emit(actions[e.key]);
        }
      }
    };
    const hidden = () => {
      if (document.hidden && playing)
        dispatch({ type: "OPEN", overlay: "pause" });
    };
    window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [state.phase, playing, paused, mode, bus]);
  useGSAP(
    () => {
      if (!root.current || selection || reducedMotion()) return;
      gsap.fromTo(
        ".game-viewport",
        { opacity: 0.35, y: 18, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: MOTION.scene, ease: MOTION.ease, clearProps: "transform,opacity" },
      );
    },
    {
      scope: root,
      dependencies: [state.phase, restartKey, vision],
      revertOnUpdate: true,
    },
  );
  useGSAP(() => {
    const el = dialog.current;
    if (!el) return;
    if (paused) {
      if (!el.open) el.showModal();
      if (!reducedMotion()) gsap.fromTo(el, { opacity: 0, y: 20, scale: 0.975 }, {
        opacity: 1, y: 0, scale: 1, duration: 0.3, ease: MOTION.ease,
      });
    } else if (el.open) {
      el.close();
      gsap.set(el, { clearProps: "transform,opacity" });
    }
  }, { scope: root, dependencies: [paused, state.overlay], revertOnUpdate: true });
  const restart = () => {
    audioEngine.ui("ui-restart");
    navigate(() => {
      setMode("camera");
      setRestartKey((n) => n + 1);
      dispatch({ type: "RESTART_GAME" });
    });
  };
  const pause = () => {
    audioEngine.ui("ui-pause");
    dispatch({ type: "OPEN", overlay: "pause" });
  };
  const quit = () => {
    audioEngine.ui("ui-pause");
    dispatch({ type: "OPEN", overlay: "quit" });
  };
  const shared = {
    paused: paused || transition === "returning",
    onPause: pause,
    onQuit: quit,
    onFinish: finish,
    onEarlyExit: exitToSelection,
    onRestart: restart,
  };

  if (vision)
    return (
      <main className="arcade-app">
        <button
          className="quiet"
          onClick={() => {
            cameraVision.stop();
            setVision(false);
            location.hash = "";
          }}
        >
          返回游戏选择
        </button>
        <Suspense fallback={<p>加载摄像头预检…</p>}>
          <VisionSpike />
        </Suspense>
      </main>
    );

  return (
    <main
      ref={root}
      className={`arcade-app ${selection ? "is-selection" : "is-session"}`}
      data-phase={state.phase}
      data-mode={mode}
      data-transition={transition}
      data-game={selectedGame.id}
      data-paused={paused}
      style={{ "--theme-accent": selectedGame.palette.accent, "--theme-sky": selectedGame.palette.sky } as CSSProperties}
    >
      <div className="arcade-atmosphere" aria-hidden="true">
        {GAMES.map(item => <div key={item.id} className={item.id === selectedGame.id ? "is-current" : ""}
          style={{ background: `radial-gradient(ellipse at 74% 20%, ${item.palette.accent}16, transparent 66%), radial-gradient(ellipse at 10% 80%, ${item.palette.ground}3b, transparent 65%)` }} />)}
      </div>
      <header className="arcade-header">
        <button
          className="arcade-brand"
          onClick={playing ? quit : exitToSelection}
          aria-label="YUKEE 游戏选择"
        >
          <span className="brand-eyes" aria-hidden>
            <i />
            <i />
          </span>{" "}
          YUKEE <small>PLAY A LITTLE. FEEL BETTER.</small>
        </button>
        <div className="arcade-tools">
          {!selection && (
            <span className="session-title">{game?.title ?? "活动完成"}</span>
          )}
          <SoundControl />
          {!selection && (
            <button
              className="icon-button"
              aria-label="返回游戏选择"
              onClick={playing ? quit : exitToSelection}
            >
              <ArrowLeft size={19} />
            </button>
          )}
          {playing && (
            <button
              className="icon-button"
              aria-label="暂停游戏"
              onClick={pause}
            >
              <Pause size={19} />
            </button>
          )}
        </div>
      </header>
      {selection ? (
        <SelectionScreen
          selectionIndex={state.selectionIndex}
          onMove={(direction) => {
            audioEngine.ui("ui-move", { rate: direction === 1 ? 1.06 : 0.94 });
            dispatch({
              type: direction === 1 ? "LAMP_NEXT" : "LAMP_PREV",
              totalCount: GAMES.length,
            });
          }}
          onStart={() => {
            if (locked.current) {
              audioEngine.ui("ui-error");
              return;
            }
            audioEngine.ui("ui-confirm");
            prepare();
            setMode("camera");
            const card = GAMES[state.selectionIndex];
            navigate(() => dispatch({
              type: "LAMP_CONFIRM",
              gameId: card.id,
              available: card.available,
            }), true);
          }}
          onPrepare={prepare}
          launching={transition !== "idle"}
        />
      ) : (
        <div
          className={`game-viewport arcade-surface phase-${state.phase}`}
          key={restartKey}
        >
          <Suspense
            fallback={
              <div className="arcade-loading" role="status">
                正在准备活动…
              </div>
            }
          >
            {state.phase === "calibration" && (
              <Calibration onCalibrated={calibrated} onDemo={runDemo} />
            )}
            {state.phase === "wingCalibration" && (
              <WingCalibration paused={paused} onCalibrated={wingCalibrated} />
            )}
            {state.phase === "leanCalibration" && (
              <LeanCalibration paused={paused} onCalibrated={leanCalibrated} />
            )}
            {state.phase === "squatCalibration" && (
              <SquatCalibration
                paused={paused}
                onCalibrated={squatCalibrated}
              />
            )}
            {state.phase === "yukeeRun" && (
              <>
                <Run
                  paused={paused || transition === "returning"}
                  visionActive={mode === "camera"}
                  bus={bus}
                  onGameEvent={gameEvent}
                  onComplete={runComplete}
                  onDirection={() => {}}
                />
                <span className="run-source">
                  {mode === "demo"
                    ? "键盘演示 · ↑ 跳 / ↓ 躲 / ← → 收能量 · 非真人识别"
                    : "本机摄像头识别 · 画面不保存、不上传"}
                </span>
              </>
            )}
            {state.phase === "winglight" && (
              <Wing {...shared} profile={wingProfile} mode={mode} />
            )}
            {state.phase === "leanSurf" && leanProfile && (
              <Lean
                {...shared}
                profile={leanProfile}
                mode={mode}
                onGameEvent={gameEvent}
              />
            )}
            {state.phase === "squatJump" && squatProfile && (
              <Squat
                {...shared}
                profile={squatProfile}
                mode={mode}
                onGameEvent={gameEvent}
              />
            )}
            {state.phase === "reward" && (
              <section className="arcade-reward">
                <YukeeFace
                  state="celebrate"
                  sizeVariant="completion"
                  motionMode="celebrate"
                />
                <span className="arcade-kicker">A LITTLE BETTER, TOGETHER</span>
                <h1>这一小段，完成了。</h1>
                <div className="reward-score"><b>{state.lastGame?.reps ?? 0}</b><span>收集的微光</span></div>
                <p>
                  {mode === "demo"
                    ? "键盘演示完成 · 非真人体感记录"
                    : "和 Yukee 一起，让身体换了个姿势。"}
                </p>
                <div className="button-row">
                  <button className="primary" onClick={restart}>
                    <RotateCcw size={16} /> 再玩一次
                  </button>
                  <button className="quiet" onClick={exitToSelection}>
                    返回游戏选择
                  </button>
                </div>
              </section>
            )}
          </Suspense>
        </div>
      )}
      <div className="stage-transition" aria-hidden="true" data-testid="stage-transition">
        <div className="transition-art"><img src={selectedGame.previewImage} alt="" /></div>
        <div className="transition-label"><span>YUKEE / {selectedGame.en}</span><b>{selectedGame.title}</b><i /></div>
      </div>
      <dialog
        ref={dialog}
        className="arcade-dialog"
        data-testid="session-dialog"
        onCancel={(e) => {
          e.preventDefault();
          resume();
        }}
      >
        <button
          className="icon-button dialog-dismiss"
          aria-label="关闭弹窗"
          onClick={resume}
        >
          <X size={18} />
        </button>
        <span className="arcade-kicker">YUKEE / TAKE YOUR TIME</span>
        <h2>
          {state.overlay === "quit" ? "先休息一下？" : "按自己的节奏来。"}
        </h2>
        <p>
          {state.overlay === "quit"
            ? "退出会结束本局，下一次从校准开始。"
            : "游戏已暂停，准备好了就继续。"}
        </p>
        <button
          className="primary"
          onClick={resume}
        >
          <Play size={16} /> 继续游戏
        </button>
        <button className="quiet" onClick={restart}>
          <RotateCcw size={16} /> 重新校准并重开
        </button>
        <button className="quiet" onClick={exitToSelection}>
          退出并返回选择
        </button>
      </dialog>
    </main>
  );
}
