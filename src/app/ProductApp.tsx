import type { SquatProfile } from "../vision/squatPose";
import type { SquatMode } from "../games/squatJump/SquatJump";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  SlidersHorizontal,
  X,
  Sun,
  Volume2,
} from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { initialState, reducer, sequences } from "../state/machine";
import { MotionBus } from "../demo/MotionBus";
import DeskScene from "../scene/DeskScene";
import { LampDisplay, MonitorDisplay } from "../ui/Experience";
import { cameraVision } from "../vision/CameraVision";
import YukeeCast from "../yukee/YukeeCast";
import { pickHurtEvent, yukeeStateForPhase } from "../yukee/yukeeStateMap";
import {
  GazeCenter,
  bodyFromFaceCenter,
  gazeFromHead,
} from "../yukee/yukeeMotion";
import type { YukeeFaceHandle } from "../yukee/YukeeFace";
import type { GameEventKind } from "../games/YukeeRun";
import type { MotionAction, VisionStatus } from "../vision/types";
import { GAMES } from "../selection/games";
import type { LeanProfile, LeanMode } from "../vision/leanPose";
import type { WingProfile } from "../vision/wingPose";
import type { WingInputMode } from "../games/useWingSession";
import { useSelectionPreference } from "../selection/preference";
import { useLampInput } from "../vision/lampInput";
import { audioEngine } from "../audio/engine";
gsap.registerPlugin(useGSAP);
const VisionSpike = lazy(() => import("../vision/VisionSpike"));
const labels: Partial<Record<MotionAction, string>> = {
  calibrated: "校准成功（跳过真实校准）",
  gameComplete: "直接完成游戏",
};
const debugDirections: { action: MotionAction; label: string }[] = [
  { action: "up", label: "↑ 抬头=跳" },
  { action: "down", label: "↓ 低头=蹲" },
  { action: "left", label: "← 左转" },
  { action: "right", label: "→ 右转" },
];
/** 调试面板内的实时推理指标（8Hz） */
function VisionStats({ phase }: { phase: string }) {
  const [status, setStatus] = useState<VisionStatus | null>(null);
  const [pose, setPose] = useState(cameraVision.getPoseDiagnostics());
  useEffect(() => cameraVision.onStatus(setStatus), []);
  useEffect(() => {
    const timer = window.setInterval(() => setPose(cameraVision.getPoseDiagnostics()), 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
    <p className="vision-stats">
      {status?.running
        ? `推理 ${status.fps.toFixed(1)} FPS · 单帧 ${status.inferMs.toFixed(0)}ms · ${status.frames} 帧 · 矩阵角 yaw ${cameraVision.matrixYawDeg?.toFixed(1) ?? "—"}° / pitch ${cameraVision.matrixPitchDeg?.toFixed(1) ?? "—"}° · HandReady=${status.handModelReady ? "1" : "0"} · palmX=${status.palmX?.toFixed(2) ?? "—"}`
        : "摄像头未运行"}
    </p>
    <p className="pose-stats" data-testid="pose-diagnostics">
      G02 · {phase} · 视频轨道 {pose.track} · 播放 {pose.videoPaused ? "暂停" : "持续"} · 时间 {pose.videoTime.toFixed(2)}s<br />
      Pose {pose.poseActive ? "开启" : "关闭"} / {pose.poseReady ? "就绪" : "未就绪"} · {pose.subscribers} 订阅 · {pose.frames} 帧 · 最新帧 {pose.frameAgeMs?.toFixed(0) ?? "—"}ms · 最近识别 {pose.lastSuccessAgeMs?.toFixed(0) ?? "—"}ms<br />
      肩L/R 肘L/R 腕L/R：{pose.visibility.map(v => v?.toFixed(2) ?? "—").join(" / ")}<br />
      动作 {document.querySelector('[data-testid="winglight"]')?.getAttribute("data-stage") ?? "—"} · 暂停原因 {document.querySelector('[data-testid="winglight"]')?.getAttribute("data-paused") ?? "—"}<br />
      {pose.error ? `Pose错误：${pose.error}` : "Pose无错误"} {pose.faceError ? `人脸错误：${pose.faceError}` : ""}
    </p>
    </>
  );
}
export default function ProductApp() {
  const [state, dispatch] = useReducer(reducer, initialState),
    [entered, setEntered] = useState(false),
    [ready, setReady] = useState(false),
    [panel, setPanel] = useState(false),
    [spike, setSpike] = useState(location.hash === "#vision"),
    [brightness, setBrightness] = useState(0.8),
    [direction, setDirection] = useState(0),
    [pulse, setPulse] = useState<{ kind: GameEventKind; at: number } | null>(
      null,
    ),
    [castActive, setCastActive] = useState(false),
    [faceGone, setFaceGone] = useState(false),
    [selectionVisionReady, setSelectionVisionReady] = useState(false),
    [selectionConfirming, setSelectionConfirming] = useState(false),
    [visionError, setVisionError] = useState<string | null>(null),
    [masterVolume, setMasterVolume] = useState(() =>
      audioEngine.getMasterVolume(),
    );
  const selection = useSelectionPreference();
  /** G02/G03 的个人阈值各自独立；键盘演示单独记录来源。 */
  const [leanProfile, setLeanProfile] = useState<LeanProfile | null>(null);
  const [leanMode, setLeanMode] = useState<LeanMode>("camera");
  const [wingProfile, setWingProfile] = useState<WingProfile | null>(null);
  /** G05 浅蹲个人档案（站立基线 + 本人舒适浅蹲幅度）；键盘演示使用合成档案 */
  const [squatProfile, setSquatProfile] = useState<SquatProfile | null>(null);
  const [squatMode, setSquatMode] = useState<SquatMode>("camera");
  const [wingMode, setWingMode] = useState<WingInputMode>("camera");
  const [hintDismissed, setHintDismissed] = useState(
    selection.hasSeenFirstHint,
  );
  const lamp = useRef<HTMLDivElement>(null),
    monitor = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    lampYukee = useRef<YukeeFaceHandle>(null),
    monitorYukee = useRef<YukeeFaceHandle>(null),
    castActiveRef = useRef(false),
    selectionConfirmingRef = useRef(false),
    selectionConfirmTimer = useRef<number | null>(null),
    selectionTransitionTimer = useRef<number | null>(null),
    selectionTransitionLocked = useRef(false),
    queuedSelectionDirection = useRef<-1 | 1 | null>(null),
    phaseRef = useRef(state.phase),
    /** GAME COMPLETE 庆祝窗口：期间暂停摄像头 gaze / body 跟随 */
    celebrateUntilRef = useRef(0);
  const bus = useMemo(() => new MotionBus(), []);
  const leanCalibrated = useCallback((profile: LeanProfile, mode: LeanMode) => {
    setLeanProfile(profile); setLeanMode(mode); bus.emit("calibrated", mode === "camera" ? "camera" : "debug");
  }, [bus]);
  const squatCalibrated = useCallback((profile: SquatProfile, mode: SquatMode) => {
    setSquatProfile(profile); setSquatMode(mode); bus.emit("calibrated", mode === "camera" ? "camera" : "debug");
  }, [bus]);
  const gazeCenter = useMemo(() => new GazeCenter(), []);
  // 选择页改为鼠标操作。保留底层实验配置，但不再激活任何视觉选择输入。
  // G01 的游戏内头部控制、G02 的身体动作识别不受此开关影响。
  const selectionMode = selection.inputMode;
  const selectionActive = state.phase === "lampSelection";
  /** 唯一体验入口：只开启镜头序列，业务状态在 CameraRig 完成后再进入 focus。 */
  const enter = useCallback(() => {
    // 首个明确手势：尽早解锁 AudioContext 并预载 BGM（不播放）
    audioEngine.unlock();
    setReady(false);
    setEntered(true);
  }, []);
  const arrive = useCallback(() => {
    setReady(true);
    dispatch({ type: "ENTER" });
  }, []);
  const motion = useCallback((action: MotionAction) => bus.emit(action), [bus]);
  // 选择阶段 Yukee 轻反馈：切卡 → notice（好奇一瞥），确认 → success（轻弹跳）
  const moveSelection = useCallback((nextDirection: -1 | 1) => {
    if (selectionTransitionLocked.current) {
      // 当前卡栈 timeline 不被重启；过渡期间最多记住最后一个方向。
      queuedSelectionDirection.current = nextDirection;
      return;
    }
    selectionTransitionLocked.current = true;
    lampYukee.current?.event("notice");
    dispatch({
      type: nextDirection === 1 ? "LAMP_NEXT" : "LAMP_PREV",
      totalCount: GAMES.length,
    });
    selectionTransitionTimer.current = window.setTimeout(() => {
      selectionTransitionLocked.current = false;
      selectionTransitionTimer.current = null;
      const queued = queuedSelectionDirection.current;
      queuedSelectionDirection.current = null;
      if (queued !== null) moveSelection(queued);
    }, 630);
  }, []);
  const lampNext = useCallback(() => moveSelection(1), [moveSelection]);
  const lampPrev = useCallback(() => moveSelection(-1), [moveSelection]);
  const lampConfirm = useCallback(() => {
    if (
      state.phase !== "lampSelection" ||
      selectionConfirmingRef.current ||
      selectionTransitionLocked.current
    )
      return;
    const card =
      GAMES[
        ((state.selectionIndex % GAMES.length) + GAMES.length) % GAMES.length
      ];
    if (card.available) {
      selectionConfirmingRef.current = true;
      setSelectionConfirming(true);
      lampYukee.current?.event("success");
      selectionConfirmTimer.current = window.setTimeout(() => {
        dispatch({ type: "LAMP_CONFIRM", gameId: card.id, available: true });
        selectionConfirmingRef.current = false;
        setSelectionConfirming(false);
        selectionConfirmTimer.current = null;
      }, 420);
    } else {
      dispatch({
        type: "LAMP_CONFIRM",
        gameId: card.id,
        available: false,
      });
      lampYukee.current?.event("miss");
      window.setTimeout(() => {
        dispatch({ type: "CLEAR_DEV_NOTICE" });
      }, 2200);
    }
  }, [state]);
  const lampCancel = useCallback(() => {
    if (selectionTransitionTimer.current !== null)
      window.clearTimeout(selectionTransitionTimer.current);
    selectionTransitionTimer.current = null;
    selectionTransitionLocked.current = false;
    queuedSelectionDirection.current = null;
    dispatch({ type: "EXIT_LAMP_SELECTION" });
  }, []);
  /** hand 模型加载状态（用于 hand→head 会话内降级与调试面板显示） */
  const [handReady, setHandReady] = useState(false);
  useEffect(
    () =>
      cameraVision.onStatus((status) => {
        setHandReady(status.handModelReady);
        setSelectionVisionReady(status.selectionReady);
      }),
    [],
  );
  useEffect(
    () => () => {
      if (selectionConfirmTimer.current !== null)
        window.clearTimeout(selectionConfirmTimer.current);
      if (selectionTransitionTimer.current !== null)
        window.clearTimeout(selectionTransitionTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (selectionActive) return;
    if (selectionTransitionTimer.current !== null)
      window.clearTimeout(selectionTransitionTimer.current);
    selectionTransitionTimer.current = null;
    selectionTransitionLocked.current = false;
    queuedSelectionDirection.current = null;
  }, [selectionActive]);
  /** 实际接入视觉输入：hand → swipe 事件；head → 左右转头；两种模式共用点头确认 */
  useLampInput(
    false,
    selectionMode,
    useMemo(
      () => ({
        next: lampNext,
        prev: lampPrev,
        confirm: lampConfirm,
        cancel: lampCancel,
      }),
      [lampNext, lampPrev, lampConfirm, lampCancel],
    ),
  );
  /** 受伤严重度：短窗口内连续 stumble 次数（窗口 2.5s） */
  const hurtStreak = useRef({ at: 0, streak: 0 });
  const gameEvent = useCallback((kind: GameEventKind) => {
    setPulse({ kind, at: performance.now() });
    if (kind === "left") setDirection(-1);
    else if (kind === "right") setDirection(1);
    // 声音反馈：动作 → 声音必须立即、清楚、短促
    if (kind === "stumble") audioEngine.sfx("hit");
    else if (kind === "left" || kind === "right") audioEngine.sfx("reward");
    else if (kind === "complete") {
      // 长奖励音播放时 BGM 深压，随后由相位 effect 淡出
      audioEngine.duckBgm(0.12, 0.5);
      audioEngine.sfx("complete");
    } else if (kind === "finale") audioEngine.duckBgm(0.42, 1.1);
    // 游戏分身与挂灯本体共用事件语言；屏幕分身由 Canvas 自己切换 sprite。
    if (
      kind === "jump" ||
      kind === "duck" ||
      kind === "left" ||
      kind === "right"
    )
      lampYukee.current?.event("success");
    else if (kind === "stumble") {
      const now = performance.now();
      const h = hurtStreak.current;
      h.streak = now - h.at < 2500 ? h.streak + 1 : 0;
      h.at = now;
      lampYukee.current?.event(pickHurtEvent(h.streak));
    } else if (kind === "complete") lampYukee.current?.event("success");
  }, []);
  const leave = useCallback(() => {
    setReady(false);
    setEntered(false);
    castActiveRef.current = false;
    setCastActive(false);
    audioEngine.stopBgm(0.5);
    cameraVision.stop();
    dispatch({ type: "RESET" });
  }, []);
  /**
   * 校准完成后只析出一颗 Yukee 能量分身；挂灯本体不离开载体。
   * 游戏相位由 YukeeCast 抵达主屏的时间线回调触发，避免视觉与状态计时漂移。
   */
  const beginYukeeCast = useCallback(() => {
    if (castActiveRef.current) return;
    castActiveRef.current = true;
    lampYukee.current?.event("enterGame");
    setCastActive(true);
  }, []);
  const castArrived = useCallback(() => motion("calibrated"), [motion]);
  const castComplete = useCallback(() => {
    castActiveRef.current = false;
    setCastActive(false);
  }, []);
  /** 分身在屏幕内结束庆祝，本体从陪伴态直接回到工作态。 */
  const returnToWork = useCallback(() => {
    monitorYukee.current?.event("exitGame");
    lampYukee.current?.event("exitGame");
    dispatch({ type: "RETURN_WORK" });
  }, []);
  /** G02 校准完成：记下个人阈值，再由状态机切到游戏相位 */
  const wingCalibrated = useCallback(
    (profile: WingProfile, mode: WingInputMode) => {
      setWingProfile(profile);
      setWingMode(mode);
      audioEngine.unlock();
      motion("calibrated");
    },
    [motion],
  );
  /** G02 完成：双角色轻反馈 + 记录结果（仅内存，不上传） */
  const wingFinish = useCallback(
    (result: {
      effectiveMs: number;
      reps: number;
      source: "camera" | "keyboard-demo";
    }) => {
      lampYukee.current?.event("success");
      monitorYukee.current?.event("success");
      audioEngine.stopBgm(0.4);
      dispatch({ type: "FINISH_GAME", result });
    },
    [],
  );
  /** 超过建议时长后主动结束：返回工作态，不计入完成 */
  const wingEarlyExit = useCallback(() => {
    dispatch({ type: "RETURN_WORK" });
  }, []);
  // 统一动作总线 → 状态机（相位级动作）
  useEffect(
    () => bus.subscribe((input) => dispatch({ type: "MOTION", input })),
    [bus],
  );
  // 抬头起跳瞬间的弹性音效（与摄像头 / 调试按钮同一总线，时机一致）
  useEffect(
    () =>
      bus.subscribe((input) => {
        if (phaseRef.current === "yukeeRun" && input.action === "up")
          audioEngine.sfx("jump");
      }),
    [bus],
  );
  /**
   * BGM 生命周期（与相位严格绑定）：
   * yukeeRun 进入 → 「游戏世界被唤醒」BGM 淡入；
   * reward 进入 → 长奖励音优先，BGM 淡出；
   * 中途退出 / 返回工作 → 快速淡出。
   * 同时记录 GAME COMPLETE 庆祝窗口，暂停 Yukee 的 gaze / body 跟随。
   */
  useEffect(() => {
    const prev = phaseRef.current;
    phaseRef.current = state.phase;
    if (state.phase === prev) return;
    if (state.phase === "yukeeRun") audioEngine.playBgm();
    else if (state.phase === "reward") {
      // GAME COMPLETE 庆祝窗口：gaze/body 跟随锁定，双 Yukee 专心庆祝
      celebrateUntilRef.current = performance.now() + 2600;
      audioEngine.stopBgm(2.4);
      // 双角色的完整位移由 reward 专属 keyframes 驱动；结尾只触发眨眼，
      // 避免两次 imperative success 与 CSS 动画叠加后产生 transform 残留。
      const blinkTimer = window.setTimeout(() => {
        lampYukee.current?.event("blink");
        monitorYukee.current?.event("blink");
      }, 2050);
      return () => window.clearTimeout(blinkTimer);
    } else if (prev === "yukeeRun" || prev === "reward")
      audioEngine.stopBgm(0.9);
  }, [state.phase]);
  // 摄像头识别到的方向动作 → 总线（游戏与状态机共享）
  useEffect(
    () => cameraVision.onAction((dir) => bus.emit(dir, "camera")),
    [bus],
  );
  /**
   * 摄像头生命周期：进入体验后持续运行（Yukee 的视线与身体跟随
   * 在正常工作阶段也依赖它），离开体验即释放轨道。
   * 权限被拒绝时静默降级：Yukee 进入自主眼神微动，游戏校准仍会
   * 在 CalibrationView 中单独处理错误提示。
   */
  useEffect(() => {
    if (!ready) return;
    setVisionError(null);
    cameraVision.start().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setVisionError(error instanceof Error ? error.message : "摄像头未连接");
    });
  }, [ready]);
  const retryVision = useCallback(() => {
    setVisionError(null);
    cameraVision.start().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setVisionError(error instanceof Error ? error.message : "摄像头未连接");
    });
  }, []);
  /**
   * 阶段切换 → 首次进入 selection 时启用 onboarding 提示；
   * 设置项里也有同样的 hint dismiss hook。
   */
  useEffect(() => {
    if (!selectionActive) return;
    if (selection.hasSeenFirstHint) {
      setHintDismissed(true);
      return;
    }
    setHintDismissed(false);
    const t = window.setTimeout(() => {
      selection.markHintSeen();
      setHintDismissed(true);
    }, 4200);
    return () => clearTimeout(t);
  }, [selectionActive]); // eslint-disable-line react-hooks/exhaustive-deps
  // MediaPipe → Yukee：头部姿态驱动 gaze，脸部中心驱动身体 X 跟随
  useEffect(
    () =>
      cameraVision.onStatus((status) => {
        setFaceGone(status.running && !status.facePresent);
        if (!status.running || !status.facePresent) return;
        // GAME COMPLETE 庆祝窗口：两个 Yukee 专心庆祝，暂停跟随
        if (performance.now() < celebrateUntilRef.current) return;
        gazeCenter.push(status.rawYaw, status.rawPitch);
        const center = gazeCenter.current;
        const gaze = gazeFromHead(
          status.rawYaw,
          status.rawPitch,
          center.yaw,
          center.pitch,
        );
        const body =
          status.faceCenterX !== null
            ? bodyFromFaceCenter(status.faceCenterX)
            : 0;
        lampYukee.current?.setGaze(gaze.x, gaze.y);
        lampYukee.current?.setBody(body);
        lampYukee.current?.setTurn(gaze.x * 18);
        monitorYukee.current?.setGaze(gaze.x, gaze.y);
        monitorYukee.current?.setBody(body);
        monitorYukee.current?.setTurn(gaze.x * 18);
      }),
    [gazeCenter],
  );
  // 调试面板打开时允许鼠标驱动视线（仅调试，正式体验为摄像头）
  useEffect(() => {
    if (!panel) return;
    const move = (e: PointerEvent) => {
      const x = (e.clientX / innerWidth) * 2 - 1;
      const y = (e.clientY / innerHeight) * 2 - 1;
      lampYukee.current?.setGaze(x, y);
      lampYukee.current?.setBody(x);
      lampYukee.current?.setTurn(x * 18);
      monitorYukee.current?.setGaze(x, y);
      monitorYukee.current?.setBody(x);
      monitorYukee.current?.setTurn(x * 18);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [panel]);
  useEffect(() => {
    if (
      !state.pending ||
      state.reminderDueAt === null ||
      state.overlay !== "none"
    )
      return;
    const generation = state.reminderGeneration;
    const timer = window.setTimeout(
      () =>
        dispatch({
          type: "DELAY_DONE",
          now: Date.now(),
          generation,
        }),
      Math.max(0, state.reminderDueAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [
    state.pending,
    state.reminderDueAt,
    state.reminderGeneration,
    state.overlay,
  ]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === "d" &&
        !(e.target instanceof HTMLInputElement)
      )
        setPanel((v) => !v);
      if (e.key === "Escape") {
        if (panel) setPanel(false);
        else if (selectionActive) dispatch({ type: "EXIT_LAMP_SELECTION" });
        else if (
          state.overlay !== "none" &&
          (state.phase === "winglight" || state.phase === "wingCalibration" || state.phase === "leanSurf" || state.phase === "leanCalibration" || state.phase === "squatJump" || state.phase === "squatCalibration")
        )
          // G02：Esc 在暂停弹窗内再次按下 = 继续
          dispatch({ type: "RESUME" });
        else if (
          state.phase === "winglight" ||
          state.phase === "wingCalibration" || state.phase === "leanSurf" || state.phase === "leanCalibration" ||
          state.phase === "squatJump" || state.phase === "squatCalibration"
        )
          // G02：游戏中 Esc = 暂停（继续/退出由弹窗决定）
          dispatch({ type: "OPEN", overlay: "pause" });
        else leave();
      }
      // 调试快捷键：←/→ 在 selection 阶段手动切换，对应开发与课堂紧急兜底
      if (selectionActive) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          if (e.key === "ArrowLeft") lampPrev();
          else lampNext();
          e.preventDefault();
        }
        if (e.key === "Enter") lampConfirm();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    leave,
    panel,
    selectionActive,
    lampPrev,
    lampNext,
    lampConfirm,
    state.overlay,
    state.phase,
  ]);
  useGSAP(
    () => {
      gsap
        .timeline()
        .from(".brand", { autoAlpha: 0, y: -12, duration: 0.8 })
        .from(
          ".hero-copy > *",
          {
            autoAlpha: 0,
            y: 24,
            stagger: 0.13,
            duration: 0.9,
            ease: "power3.out",
          },
          0.2,
        )
        .from(".scene-caption", { autoAlpha: 0, duration: 1 }, 0.8);
    },
    { scope: root },
  );
  // 游戏中丢脸 → Yukee confused；其余按相位映射（Visual Adapter）
  const yukeeState =
    faceGone && state.phase === "yukeeRun"
      ? "confused"
      : yukeeStateForPhase(state.phase);
  const lampSelectionProps = useMemo(
    () => ({
      selectionIndex: state.selectionIndex,
      selectionDevNoticeId: state.selectionDevNotice,
      selectionHintDismissed: hintDismissed,
      selectionMode,
      selectionVisionReady,
      selectionHandReady: handReady,
      selectionConfirming,
      selectionVisionError: visionError,
      selectionOnRetryVision: retryVision,
      selectionTotalCount: GAMES.length,
      selectionOnNext: lampNext,
      selectionOnPrev: lampPrev,
      selectionOnConfirm: lampConfirm,
      selectionOnCancel: lampCancel,
    }),
    [
      state.selectionIndex,
      state.selectionDevNotice,
      hintDismissed,
      selectionMode,
      selectionVisionReady,
      handReady,
      selectionConfirming,
      visionError,
      retryVision,
      lampNext,
      lampPrev,
      lampConfirm,
      lampCancel,
    ],
  );
  return (
    <main
      ref={root}
      className={`product-experience ${entered ? "entered" : ""} ${ready ? "arrived" : ""}`}
    >
      <div className="scene">
        <DeskScene
          entered={entered}
          phase={state.phase}
          onArrive={arrive}
          lampPortal={lamp}
          monitorPortal={monitor}
          direction={direction}
          brightness={brightness}
          pulse={pulse}
        />
      </div>
      <header className="site-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            leave();
          }}
        >
          <span className="brand-symbol">
            <i />
            <i />
          </span>
          yukee<span className="brand-caption">屏幕挂灯机器人</span>
        </a>
        <div className="header-right">
          <span>LIGHT. MOVE. FEEL BETTER.</span>
          {entered ? (
            <button className="overview-button" onClick={leave}>
              <ArrowLeft size={15} />
              返回桌面
            </button>
          ) : (
            <span className="edition">INTERACTIVE EXPERIENCE / 01</span>
          )}
        </div>
      </header>
      {!entered && (
        <section className="hero-copy">
          <span className="eyebrow">YOUR LITTLE DESK COMPANION</span>
          <h1>
            认真陪你，
            <br />
            <em>也提醒你休息。</em>
          </h1>
          <p>
            一盏灯，一个叫 Yukee 的小伙伴。
            <br />
            在每一次专注之间，给你一点温柔的关心。
          </p>
          <button className="hero-start" onClick={enter}>
            开始体验 <ArrowUpRight size={18} />
          </button>
          <div className="hero-footnote">
            <span className="status-dot" />
            光，刚刚好。陪伴，也是。
          </div>
        </section>
      )}
      {!entered && (
        <div className="scene-caption">
          <span>01 — YUKEE ON YOUR DESK</span>
          <b>你的桌面，多了一点关心。</b>
        </div>
      )}
      {entered && !ready && (
        <div className="approaching">
          坐下来，和 Yukee 打个招呼。
          <span />
        </div>
      )}
      <div
        ref={lamp}
        className={`projected lamp-portal ${ready ? "visible" : ""}`}
      >
        {ready && (
          <LampDisplay
            state={state}
            dispatch={dispatch}
            yukeeState={yukeeState}
            yukeeRef={lampYukee}
            linked={
              castActive ||
              state.phase === "yukeeRun" || state.phase === "leanSurf" || state.phase === "squatJump" ||
              state.phase === "reward"
            }
            splitting={castActive}
            eventPulse={pulse}
            selectionProps={lampSelectionProps}
          />
        )}
      </div>
      <div
        ref={monitor}
        className={`projected monitor-portal ${ready ? "visible" : ""}`}
      >
        {ready && (
          <MonitorDisplay
            key={state.phase}
            state={state}
            dispatch={dispatch}
            onMotion={motion}
            bus={bus}
            onGameEvent={gameEvent}
            onDirection={setDirection}
            yukeeState={yukeeState}
            yukeeRef={monitorYukee}
            onBegin={() => dispatch({ type: "BEGIN" })}
            onCalibrationComplete={beginYukeeCast}
            onReturnWork={returnToWork}
            leanProfile={leanProfile}
            leanMode={leanMode}
            onLeanCalibrated={leanCalibrated}
            squatProfile={squatProfile}
            squatMode={squatMode}
            onSquatCalibrated={squatCalibrated}
            wingProfile={wingProfile}
            wingMode={wingMode}
            onWingCalibrated={wingCalibrated}
            onWingFinish={wingFinish}
            onWingEarlyExit={wingEarlyExit}
          />
        )}
      </div>
      <YukeeCast
        active={castActive}
        lampPortal={lamp}
        monitorPortal={monitor}
        onArrive={castArrived}
        onComplete={castComplete}
      />
      <div className="bottom-bar">
        <span>
          {ready
            ? "头部体感控制，和 Yukee 一起活动。"
            : "专注时安静相伴 · 休息时一起活动"}
        </span>
        <div>
          {ready && (
            <label className="brightness-control">
              <Sun size={15} />
              <input
                aria-label="灯光亮度"
                type="range"
                min=".2"
                max="1.4"
                step=".05"
                value={brightness}
                onChange={(e) => setBrightness(Number(e.target.value))}
              />
            </label>
          )}
          <button
            className="settings-button"
            aria-label="打开演示面板"
            title="演示面板 · D"
            onClick={() => setPanel((v) => !v)}
          >
            <SlidersHorizontal size={17} />
          </button>
        </div>
      </div>
      {panel && (
        <aside className="demo-drawer">
          <div>
            <h2>演示控制</h2>
            <button aria-label="关闭演示面板" onClick={() => setPanel(false)}>
              <X size={18} />
            </button>
          </div>
          <p>仅演示者可见 · 按 D 收起 · 面板打开时鼠标可临时驱动 Yukee 视线</p>
          <button
            disabled={state.phase !== "focus" || !!state.pending}
            onClick={() => dispatch({ type: "SIMULATE_45" })}
          >
            模拟久坐 45 分钟
          </button>
          <button onClick={leave}>重置演示</button>
          <hr />
          {/* Hand 模式暂未稳定：课堂版本隐藏切换器，正式唯一输入为 HEAD。
              preference / handSwipe 管线保留为 experimental，不在 UI 暴露。 */}
          <p>游戏选择：左右转头切换 · 点头确认</p>
          <hr />
          <p>主音量（BGM 与音效共用 · 刷新后保持）</p>
          <label className="brightness-control drawer-volume">
            <Volume2 size={14} />
            <input
              aria-label="主音量"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={masterVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMasterVolume(v);
                audioEngine.setMasterVolume(v);
              }}
            />
          </label>
          <hr />
          <p>调试输入 · 非正式体验（正式游戏仅摄像头体感）</p>
          <div className="debug-actions">
            {Object.entries(labels).map(([action, label]) => (
              <button
                key={action}
                disabled={
                  state.overlay !== "none" ||
                  !sequences[state.phase]?.includes(action as MotionAction) ||
                  state.phase === "leanCalibration" ||
                  state.phase === "squatCalibration"
                }
                onClick={() =>
                  action === "calibrated" && state.phase !== "wingCalibration" && state.phase !== "leanCalibration" && state.phase !== "squatCalibration"
                    ? beginYukeeCast()
                    : motion(action as MotionAction)
                }
              >
                {label}
              </button>
            ))}
            {debugDirections.map(({ action, label }) => (
              <button
                key={action}
                disabled={
                  state.phase !== "yukeeRun" || state.overlay !== "none"
                }
                onClick={() => motion(action)}
              >
                {label}
              </button>
            ))}
          </div>
          <VisionStats phase={state.phase} />
          <hr />
          <button
            onClick={() => {
              setSpike(true);
              setPanel(false);
            }}
          >
            摄像头技术预检
          </button>
        </aside>
      )}
      {spike && (
        <div className="spike-modal">
          <button
            className="spike-close"
            onClick={() => {
              setSpike(false);
              location.hash = "";
            }}
          >
            <X size={20} />
            返回体验
          </button>
          <Suspense fallback={<p>加载摄像头模块…</p>}>
            <VisionSpike />
          </Suspense>
        </div>
      )}
    </main>
  );
}
