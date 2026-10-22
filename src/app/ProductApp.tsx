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
} from "react";
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
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
import { GAMES } from "../selection/games";
import SelectionScreen from "../selection/SelectionScreen";
import type { WingProfile } from "../vision/wingPose";
import type { LeanMode, LeanProfile } from "../vision/leanPose";
import type { SquatProfile } from "../vision/squatPose";
import type { GameEventKind } from "../games/YukeeRun";
import type { MotionAction } from "../vision/types";
import YukeeFace from "../yukee/YukeeFace";
import "./arcade.css";

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
  const [volume, setVolume] = useState(() => audioEngine.getMasterVolume());
  const [restartKey, setRestartKey] = useState(0);
  const [vision, setVision] = useState(location.hash === "#vision");
  const root = useRef<HTMLElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const phaseRef = useRef(state.phase);
  phaseRef.current = state.phase;
  useLayoutEffect(() => { if (root.current) root.current.scrollTop = 0; }, [state.phase]);
  const selection = state.phase === "lampSelection";
  const playing = isGame(state.phase);
  const paused = state.overlay !== "none";
  const game = GAMES.find((g) => g.id === state.activeGame);
  const toSelection = useCallback(
    () => dispatch({ type: "BACK_TO_SELECTION" }),
    [],
  );
  const calibrated = useCallback(() => bus.emit("calibrated", "camera"), [bus]);
  const finish = useCallback((result: Omit<GameResult, "game">) => {
    dispatch({ type: "FINISH_GAME", result });
    dispatch({ type: "BACK_TO_SELECTION" });
  }, []);
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
    if (phaseRef.current === "squatJump") return; // G05 自带音效，避免重复。
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
      audioEngine.chargeStop();
    },
    [],
  );
  useEffect(() => {
    if (playing && !paused) audioEngine.playBgm(0.5);
    else {
      audioEngine.stopBgm(0.15);
      audioEngine.chargeStop();
    }
    return () => audioEngine.stopBgm(0.1);
  }, [playing, paused, state.activeGame]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === "Escape" && playing) {
        e.preventDefault();
        dispatch(
          paused ? { type: "RESUME" } : { type: "OPEN", overlay: "pause" },
        );
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
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.fromTo(
        ".arcade-surface",
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.38, ease: "power2.out" },
      );
    },
    {
      scope: root,
      dependencies: [state.phase, restartKey],
      revertOnUpdate: true,
    },
  );
  useEffect(() => {
    const el = dialog.current;
    if (paused && !el?.open) el?.showModal();
    else if (!paused && el?.open) el.close();
  }, [paused]);
  const restart = () => {
    setMode("camera");
    setRestartKey((n) => n + 1);
    dispatch({ type: "RESTART_GAME" });
  };
  const pause = () => dispatch({ type: "OPEN", overlay: "pause" });
  const quit = () => dispatch({ type: "OPEN", overlay: "quit" });
  const shared = {
    paused,
    onPause: pause,
    onQuit: quit,
    onFinish: finish,
    onEarlyExit: toSelection,
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
    >
      <header className="arcade-header">
        <button
          className="arcade-brand"
          onClick={playing ? quit : toSelection}
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
          <button
            className="icon-button"
            aria-label={volume === 0 ? "开启声音" : "静音"}
            onClick={() => {
              audioEngine.unlock();
              const v = volume === 0 ? 0.5 : 0;
              setVolume(v);
              audioEngine.setMasterVolume(v);
            }}
          >
            {volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
          </button>
          {!selection && (
            <button
              className="icon-button"
              aria-label="返回游戏选择"
              onClick={playing ? quit : toSelection}
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
          onMove={(direction) =>
            dispatch({
              type: direction === 1 ? "LAMP_NEXT" : "LAMP_PREV",
              totalCount: GAMES.length,
            })
          }
          onStart={() => {
            audioEngine.unlock();
            setMode("camera");
            const card = GAMES[state.selectionIndex];
            dispatch({
              type: "LAMP_CONFIRM",
              gameId: card.id,
              available: card.available,
            });
          }}
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
                  paused={paused}
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
                <p>
                  {mode === "demo"
                    ? "键盘演示完成 · 非真人体感记录"
                    : "和 Yukee 一起，让身体换了个姿势。"}
                </p>
                <div className="button-row">
                  <button className="primary" onClick={restart}>
                    <RotateCcw size={16} /> 再玩一次
                  </button>
                  <button className="quiet" onClick={toSelection}>
                    返回游戏选择
                  </button>
                </div>
              </section>
            )}
          </Suspense>
        </div>
      )}
      <dialog
        ref={dialog}
        className="arcade-dialog"
        data-testid="session-dialog"
        onCancel={(e) => {
          e.preventDefault();
          dispatch({ type: "RESUME" });
        }}
      >
        <button
          className="icon-button dialog-dismiss"
          aria-label="关闭弹窗"
          onClick={() => dispatch({ type: "RESUME" })}
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
          onClick={() => dispatch({ type: "RESUME" })}
        >
          <Play size={16} /> 继续游戏
        </button>
        <button className="quiet" onClick={restart}>
          <RotateCcw size={16} /> 重新校准并重开
        </button>
        <button className="quiet" onClick={toSelection}>
          退出并返回选择
        </button>
      </dialog>
    </main>
  );
}
