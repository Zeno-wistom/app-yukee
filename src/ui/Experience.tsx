import { useEffect, useState, type Dispatch, type RefObject } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Play,
  Pause,
  Check,
  Sun,
  Wind,
  RotateCcw,
  X,
  ArrowUp,
  ArrowDown,
  MoveHorizontal,
  ScanFace,
  MousePointer2,
} from "lucide-react";
import { feedback } from "../feedback/profile";
import YukeeFace, { type YukeeFaceHandle } from "../yukee/YukeeFace";
import type { YukeeState } from "../yukee/yukeeTypes";
import { isGame, type State, type Event } from "../state/machine";
import YukeeRun, { type GameEventKind } from "../games/YukeeRun";
import CalibrationView from "../games/CalibrationView";
import WingCalibrationView from "../games/WingCalibrationView";
import Winglight from "../games/Winglight";
import LeanSurf from "../games/LeanSurf";
import LeanCalibrationView from "../games/LeanCalibrationView";
import type { LeanProfile, LeanMode } from "../vision/leanPose";
import type { WingProfile } from "../vision/wingPose";
import type { WingInputMode } from "../games/useWingSession";
import OfficeView from "./OfficeView";
import { cameraVision } from "../vision/CameraVision";
import type { MotionBus } from "../demo/MotionBus";
import type { MotionAction, SelectionInputMode } from "../vision/types";
import { SelectionCardStack } from "../selection/SelectionCardStack";
import { audioEngine } from "../audio/engine";
import { dayCellState, rhythmForHour } from "./dayRhythm";

export interface LampSelectionProps {
  selectionIndex: number;
  selectionDevNoticeId: string | null;
  selectionHintDismissed: boolean;
  selectionMode: SelectionInputMode;
  selectionVisionReady: boolean;
  selectionHandReady: boolean;
  selectionConfirming: boolean;
  selectionVisionError: string | null;
  selectionOnRetryVision: () => void;
  selectionTotalCount: number;
  selectionOnNext: () => void;
  selectionOnPrev: () => void;
  selectionOnConfirm: () => void;
  selectionOnCancel: () => void;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function LampHome({
  dispatch,
  yukeeState,
  yukeeRef,
  pending,
  remindersPaused,
}: {
  dispatch: Dispatch<Event>;
  yukeeState: YukeeState;
  yukeeRef: RefObject<YukeeFaceHandle | null>;
  pending: State["pending"];
  remindersPaused: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const hour = now.getHours();
  const rhythm = rhythmForHour(hour);
  return (
    <div className="lamp-home" data-testid="lamp-home" data-rhythm={rhythm.key}>
      <section className="lamp-home-time" aria-label="当前日期时间">
        <span>
          {String(now.getMonth() + 1).padStart(2, "0")}.
          {String(now.getDate()).padStart(2, "0")} · {WEEKDAYS[now.getDay()]}
        </span>
        <strong>
          {now.toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </strong>
      </section>
      <section
        className="day-matrix"
        data-testid="day-matrix"
        aria-label={`今日时间进度，当前第 ${hour + 1} 小时，共 24 小时`}
      >
        <div className="day-matrix-head">
          <span>TODAY</span>
          <em>{hour + 1} / 24</em>
        </div>
        <div className="day-matrix-grid">
          {Array.from({ length: 24 }, (_, index) => (
            <i key={index} className={dayCellState(index, hour)} />
          ))}
        </div>
      </section>
      <section className="lamp-home-yukee" aria-label="Yukee 陪伴区">
        <YukeeFace
          ref={yukeeRef}
          state={yukeeState}
          maxBodyX={22}
          sizeVariant="home"
        />
        <div
          className="day-rhythm"
          data-testid="day-rhythm"
          aria-label={`当前时段：${rhythm.label}`}
        >
          <b>{rhythm.label}</b>
          <span>{rhythm.phrase}</span>
        </div>
      </section>
      <section className="lamp-home-actions" aria-label="挂灯操作">
        <button
          className="lamp-start-activity"
          onClick={() => {
            // 首次明确手势：解锁 AudioContext 并预载 BGM（不播放）
            audioEngine.unlock();
            dispatch({ type: "ENTER_LAMP_SELECTION" });
          }}
        >
          开始活动 <ArrowUpRight size={13} />
        </button>
        <span className="lamp-demo-label">DEMO</span>
        <div>
          <button
            disabled={!!pending || remindersPaused}
            onClick={() => {
              audioEngine.unlock();
              dispatch({ type: "SIMULATE_45" });
            }}
          >
            弱提示
          </button>
          <button
            onClick={() => {
              audioEngine.unlock();
              dispatch({ type: "SIMULATE_STRONG" });
            }}
          >
            强提示
          </button>
        </div>
      </section>
    </div>
  );
}

export function LampDisplay({
  state,
  dispatch,
  yukeeState,
  yukeeRef,
  linked,
  splitting,
  eventPulse,
  selectionProps,
}: {
  state: State;
  dispatch: Dispatch<Event>;
  yukeeState: YukeeState;
  yukeeRef: RefObject<YukeeFaceHandle | null>;
  /** 游戏期间本体仍留在挂灯，linked 只改变陪伴反馈。 */
  linked: boolean;
  splitting: boolean;
  eventPulse: { kind: GameEventKind; at: number } | null;
  selectionProps: LampSelectionProps;
}) {
  const profile = feedback(state.phase);
  const reminder = state.phase.includes("Reminder");
  if (state.phase === "lampSelection") {
    return (
      <div
        className={`lamp-display lamp-selection ${linked ? "is-linked" : ""}`}
        style={{ "--signal": profile.color } as React.CSSProperties}
        data-testid="lamp-selection"
      >
        <div
          className={`lamp-selection-header ${selectionProps.selectionConfirming ? "is-confirming" : ""}`}
        >
          <div className="lamp-selection-yukee">
            <YukeeFace
              ref={yukeeRef}
              state={yukeeState}
              maxBodyX={15}
              sizeVariant="select"
              className="lamp-selection-yukee-face"
            />
          </div>
          <div className="lamp-selection-message">
            <span>PICK YOUR ACTIVITY</span>
            <strong>挑一个，一起动一动</strong>
          </div>
          <div className="lamp-selection-mode">
            <MousePointer2 size={14} />
            <span>鼠标选择</span>
          </div>
        </div>
        <SelectionCardStack
          selectionIndex={selectionProps.selectionIndex}
          devNoticeId={selectionProps.selectionDevNoticeId}
          confirming={selectionProps.selectionConfirming}
          onConfirm={selectionProps.selectionOnConfirm}
        />
        <nav className="lamp-selection-controls" aria-label="鼠标选择活动">
          <button onClick={selectionProps.selectionOnPrev} disabled={selectionProps.selectionConfirming} aria-label="上一个活动">← 上一款</button>
          <button onClick={selectionProps.selectionOnNext} disabled={selectionProps.selectionConfirming} aria-label="下一个活动">下一款 →</button>
          <button className="lamp-selection-start" onClick={selectionProps.selectionOnConfirm} disabled={selectionProps.selectionConfirming}>开始这个活动</button>
        </nav>
        <button
          className="lamp-selection-cancel"
          onClick={selectionProps.selectionOnCancel}
          aria-label="退出选择"
        >
          <ArrowLeft size={13} />
          返回
        </button>
        <div
          className="signal-strip linked"
          style={{ ["--signal" as string]: profile.color }}
        >
          <i />
          <i />
        </div>
      </div>
    );
  }
  if (state.phase === "focus") {
    return (
      <div
        className="lamp-display focus"
        data-testid="lamp-yukee-body"
        style={{ "--signal": profile.color } as React.CSSProperties}
      >
        <LampHome
          dispatch={dispatch}
          yukeeState={yukeeState}
          yukeeRef={yukeeRef}
          pending={state.pending}
          remindersPaused={state.remindersPaused}
        />
        <div className="signal-strip">
          <i />
          <i />
        </div>
      </div>
    );
  }
  return (
    <div
      className={`lamp-display ${state.phase} ${linked ? "is-linked" : ""} ${splitting ? "is-splitting" : ""}`}
      style={{ "--signal": profile.color } as React.CSSProperties}
      data-testid="lamp-yukee-body"
    >
      <div className="lamp-avatar">
        <YukeeFace
          ref={yukeeRef}
          state={yukeeState}
          maxBodyX={15}
          sizeVariant="reminder"
          motionMode={state.phase === "reward" ? "celebrate" : "normal"}
        />
        {state.phase === "strongReminder" && (
          <div className="strong-lamp-orb" aria-hidden="true" />
        )}
      </div>
      <div className="lamp-message">
        <span>YUKEE / {reminder ? "A LITTLE REMINDER" : "TOGETHER"}</span>
        <strong>{profile.label}</strong>
      </div>
      <div className="lamp-right">
        {reminder ? (
          <button
            onClick={() => {
              audioEngine.unlock();
              dispatch({ type: "START" });
            }}
          >
            活动一下 <ArrowUpRight size={14} />
          </button>
        ) : (
          <>
            <span className="status-dot" />
            <span>
              {linked
                ? "分身联机陪伴中"
                : state.phase === "winglight" ||
                    state.phase === "wingCalibration"
                  ? "展翼接光中"
                  : "肩颈放松时间"}
            </span>
          </>
        )}
      </div>
      <div
        key={eventPulse?.at ?? "steady"}
        className={`signal-strip ${linked ? "linked" : ""} ${eventPulse ? `event-${eventPulse.kind}` : ""}`}
      >
        <i />
        <i />
      </div>
    </div>
  );
}

export function MonitorDisplay({
  state,
  dispatch,
  onMotion,
  bus,
  onGameEvent,
  onDirection,
  yukeeState,
  yukeeRef,
  onBegin,
  onCalibrationComplete,
  onReturnWork,
  wingProfile,
  wingMode,
  onWingCalibrated,
  onWingFinish,
  onWingEarlyExit,
  leanProfile, leanMode, onLeanCalibrated,
}: {
  state: State;
  dispatch: Dispatch<Event>;
  onMotion: (a: MotionAction) => void;
  bus: MotionBus;
  onGameEvent: (kind: GameEventKind) => void;
  onDirection: (x: number) => void;
  yukeeState: YukeeState;
  yukeeRef: RefObject<YukeeFaceHandle | null>;
  onBegin: () => void;
  onCalibrationComplete: () => void;
  onReturnWork: () => void;
  /** G02 个人动作阈值（由校准页生成；键盘演示使用合成阈值） */
  leanProfile: LeanProfile | null;
  leanMode: LeanMode;
  onLeanCalibrated: (p: LeanProfile, mode: LeanMode) => void;
  wingProfile: WingProfile | null;
  wingMode: WingInputMode;
  onWingCalibrated: (profile: WingProfile, mode: WingInputMode) => void;
  onWingFinish: (result: {
    effectiveMs: number;
    reps: number;
    source: "camera" | "keyboard-demo";
  }) => void;
  onWingEarlyExit: () => void;
}) {
  const reminder = state.phase.includes("Reminder"),
    playing =
      isGame(state.phase) ||
      state.phase === "calibration" ||
      state.phase === "wingCalibration" || state.phase === "leanCalibration";
  return (
    <div
      className={`monitor-display ${playing ? "is-playing" : ""} ${state.phase}`}
      data-phase={state.phase}
    >
      <div className="monitor-top">
        <span className="mini-brand">
          <i /> yukee
        </span>
        <span>
          {playing
            ? "MOVE WITH YUKEE"
            : state.phase === "focus"
              ? "YOUR QUIET SPACE"
              : "A MOMENT FOR YOU"}
        </span>
        <div>
          {playing ? (
            <button
              aria-label="暂停游戏"
              onClick={() => dispatch({ type: "OPEN", overlay: "pause" })}
            >
              <Pause size={15} />
            </button>
          ) : (
            <span className="monitor-clock">
              {new Date().toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>
      <div className="screen-content" key={state.phase}>
        {(state.phase === "focus" || state.phase === "lampSelection") && (
          <OfficeView />
        )}
        {reminder && (
          <div className="reminder-view">
            <div
              className={`reminder-avatar ${state.phase === "strongReminder" ? "has-yukee-drop" : ""}`}
            >
              {state.phase === "strongReminder" ? (
                <div
                  className="strong-yukee-drop"
                  data-testid="strong-yukee-drop"
                >
                  <YukeeFace
                    ref={yukeeRef}
                    state="anxious"
                    maxBodyX={7}
                    sizeVariant="reminder"
                  />
                </div>
              ) : (
                <div className="avatar-halo" data-mood={yukeeState}>
                  <i />
                </div>
              )}
              <div className="avatar-orbit" />
              <span className="avatar-hint">
                {state.phase === "strongReminder"
                  ? "Yukee 从挂灯下来陪你了"
                  : "抬头看，Yukee 在挂灯上"}
              </span>
            </div>
            <div>
              <span className="eyebrow">
                {state.phase === "weakReminder"
                  ? "01 / A GENTLE NUDGE"
                  : state.phase === "secondaryReminder"
                    ? "02 / A WARM INVITATION"
                    : "03 / TIME FOR A LITTLE PAUSE"}
              </span>
              <h2>
                {state.phase === "weakReminder" ? (
                  <>
                    已经很专注了。
                    <br />
                    要不要，动一动？
                  </>
                ) : state.phase === "secondaryReminder" ? (
                  <>
                    再忙，也给自己
                    <br />
                    半分钟。
                  </>
                ) : (
                  <>
                    我有点担心你了，
                    <br />
                    和我一起休息吧。
                  </>
                )}
              </h2>
              <p>
                {state.phase === "weakReminder"
                  ? "连续工作 45 分钟，让肩颈换个姿势。"
                  : state.phase === "secondaryReminder"
                    ? "手头的事情收尾了吗？我陪你慢慢活动。"
                    : "不用赶进度，舒服地活动就好。"}
              </p>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => {
                    audioEngine.unlock();
                    dispatch({ type: "START" });
                  }}
                >
                  开始活动 <ArrowUpRight size={15} />
                </button>
                <button
                  className="quiet"
                  onClick={() =>
                    dispatch({
                      type:
                        state.phase === "weakReminder"
                          ? "CONTINUE_WORK"
                          : "LATER",
                    })
                  }
                >
                  {state.phase === "weakReminder" ? "继续工作" : "稍后"}
                </button>
              </div>
              {state.phase === "strongReminder" && (
                <button
                  className="tiny-link"
                  onClick={() => dispatch({ type: "DISABLE" })}
                >
                  今天不再提醒
                </button>
              )}
            </div>
          </div>
        )}
        {state.phase === "activityIntro" && (
          <div className="intro-view">
            <span className="eyebrow">YUKEE RUN · A SMALL RESET</span>
            <h2>和 Yukee 一起，跑一小段。</h2>
            <p>
              抬头跳过障碍，低头躲过横杆，左右转头收集能量。 约 35
              秒，全程用头，不用手。
            </p>
            <div className="activity-steps">
              <div>
                <ArrowUp />
                <b>轻轻抬头</b>
                <span>JUMP · 跳跃</span>
              </div>
              <div>
                <ArrowDown />
                <b>轻轻低头</b>
                <span>DUCK · 下蹲</span>
              </div>
              <div>
                <MoveHorizontal />
                <b>左右转头</b>
                <span>ENERGY · 收集</span>
              </div>
            </div>
            <button
              className="primary"
              onClick={() => {
                audioEngine.unlock();
                onBegin();
              }}
            >
              准备好了 <ScanFace size={15} />
            </button>
            <span className="input-note">
              真实摄像头体感 · 画面仅在本机处理 · 无需鼠标键盘
            </span>
          </div>
        )}
        {state.phase === "calibration" && (
          <CalibrationView onCalibrated={onCalibrationComplete} />
        )}
        {state.phase === "leanCalibration" && <LeanCalibrationView paused={state.overlay !== "none"} onCalibrated={onLeanCalibrated} />}
        {state.phase === "leanSurf" && leanProfile && <LeanSurf
          profile={leanProfile} mode={leanMode} paused={state.overlay !== "none"}
          onPause={() => dispatch({ type: "OPEN", overlay: "pause" })}
          onQuit={() => dispatch({ type: "OPEN", overlay: "quit" })}
          onFinish={onWingFinish} onEarlyExit={onWingEarlyExit} onGameEvent={onGameEvent} />}
        {state.phase === "wingCalibration" && (
          <WingCalibrationView onCalibrated={onWingCalibrated} paused={state.overlay !== "none"} />
        )}
        {state.phase === "winglight" && (
          <Winglight
            paused={state.overlay !== "none"}
            profile={wingProfile}
            mode={wingMode}
            onPause={() => dispatch({ type: "OPEN", overlay: "pause" })}
            onQuit={() => dispatch({ type: "OPEN", overlay: "quit" })}
            onFinish={onWingFinish}
            onEarlyExit={onWingEarlyExit}
          />
        )}
        {state.phase === "yukeeRun" && (
          <YukeeRun
            paused={state.overlay !== "none"}
            visionActive={cameraVision.isRunning}
            bus={bus}
            onGameEvent={onGameEvent}
            onComplete={() => onMotion("gameComplete")}
            onDirection={onDirection}
          />
        )}
        {state.phase === "reward" && (
          <div className="reward-view">
            <div className="reward-burst">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ "--i": i } as React.CSSProperties} />
              ))}
            </div>
            <div className="reward-yukee" data-testid="reward-yukee-celebrate">
              <YukeeFace
                ref={yukeeRef}
                state="celebrate"
                sizeVariant="completion"
                motionMode="celebrate"
              />
            </div>
            <span className="eyebrow">A LITTLE BETTER, TOGETHER</span>
            <h2>舒服一点了吧。</h2>
            <p>这次小小的停顿，也是在认真照顾自己。</p>
            <button className="primary" onClick={onReturnWork}>
              回到专注 <Check size={15} />
            </button>
          </div>
        )}
      </div>
      {state.phase !== "focus" &&
        state.overlay === "none" &&
        state.phase !== "lampSelection" && (
          <button
            className="screen-back"
            aria-label="返回工作"
            onClick={() =>
              dispatch(
                playing
                  ? { type: "OPEN", overlay: "quit" }
                  : { type: "RETURN_WORK" },
              )
            }
          >
            <ArrowLeft size={15} />
          </button>
        )}
      {state.overlay !== "none" && (
        <div className="display-overlay">
          <div className="display-dialog">
            <button
              className="dialog-close"
              aria-label="关闭弹窗"
              onClick={() => dispatch({ type: "RESUME" })}
            >
              <X size={18} />
            </button>
            {state.overlay === "library" ? (
              <>
                <Wind size={32} />
                <h2>选一个放松时刻</h2>
                <button
                  className="activity-card"
                  onClick={() => dispatch({ type: "NEW_GAME" })}
                >
                  <MoveHorizontal />
                  <div>
                    <b>Yukee Run · 头颈活动</b>
                    <span>跳 · 蹲 · 能量收集 · 约 35 秒</span>
                  </div>
                  <ArrowUpRight />
                </button>
                {state.saved && (
                  <button
                    className="quiet"
                    onClick={() => dispatch({ type: "RESTORE" })}
                  >
                    继续上次活动
                  </button>
                )}
                <p className="muted">腰背、腕部等活动后续开放</p>
              </>
            ) : state.overlay === "pause" ? (
              <>
                <Pause size={32} />
                <h2>按自己的节奏来。</h2>
                <p>进度会在这里等你。</p>
                <button
                  className="primary"
                  onClick={() => dispatch({ type: "RESUME" })}
                >
                  <Play size={15} />
                  继续活动
                </button>
                <button
                  className="quiet"
                  onClick={() => dispatch({ type: "SAVE_QUIT" })}
                >
                  保存并退出
                </button>
              </>
            ) : (
              <>
                <Sun size={32} />
                <h2>先休息一下？</h2>
                <p>我们会保留这次活动进度。</p>
                <button
                  className="primary"
                  onClick={() => dispatch({ type: "SAVE_QUIT" })}
                >
                  退出活动
                </button>
                <button
                  className="quiet"
                  onClick={() => dispatch({ type: "RESUME" })}
                >
                  <RotateCcw size={14} />
                  继续
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
