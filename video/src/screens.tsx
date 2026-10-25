/**
 * 演示视频的「屏幕素材」录制页：直接渲染仓库里的真实组件，供逐帧录制。
 *  - ?view=monitor：主显示器（MonitorDisplay：focus 办公界面 → weakReminder 提醒界面）
 *  - ?view=lamp：YUKEE 挂灯自带小屏（YukeeFace，按 3.33:1 屏幕比例）
 * window.__screen(phase|state) 由录制脚本在指定虚拟时间调用，切换状态。
 * 本文件只「使用」组件，不修改任何正式游戏 / UI 代码。
 */
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { MonitorDisplay } from "../../src/ui/Experience";
import YukeeFace, { type YukeeFaceHandle } from "../../src/yukee/YukeeFace";
import { initialState, type Phase, type State } from "../../src/state/machine";
import { MotionBus } from "../../src/demo/MotionBus";
import type { YukeeState, YukeeEvent } from "../../src/yukee/yukeeTypes";
import "../../src/app/product.css";

const q = new URLSearchParams(location.search);
const noop = () => {};

function Monitor() {
  const [phase, setPhase] = useState<Phase>((q.get("phase") as Phase) || "focus");
  const bus = useMemo(() => new MotionBus(), []);
  const yref = useRef<YukeeFaceHandle>(null);
  useEffect(() => { (window as any).__screen = (p: Phase) => setPhase(p); }, []);
  const state: State = { ...initialState, phase };
  return (
    <div className="projected visible monitor-portal" style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, borderRadius: 0, ["--portal-cqw" as any]: "19.2px" }}>
      <MonitorDisplay
        state={state} dispatch={noop as any} onMotion={noop} bus={bus} onGameEvent={noop} onDirection={noop}
        yukeeState={phase.includes("Reminder") ? "concerned" : "calm"} yukeeRef={yref}
        onBegin={noop} onCalibrationComplete={noop} onReturnWork={noop}
        wingProfile={null} wingMode={"demo" as any} onWingCalibrated={noop} onWingFinish={noop} onWingEarlyExit={noop}
        leanProfile={null} leanMode={"demo" as any} onLeanCalibrated={noop}
        squatProfile={null} squatMode={"demo" as any} onSquatCalibrated={noop}
      />
    </div>
  );
}

function Lamp() {
  const [st, setSt] = useState<YukeeState>((q.get("state") as YukeeState) || "calm");
  const ref = useRef<YukeeFaceHandle>(null);
  useEffect(() => {
    const w = window as any;
    w.__screen = (s: YukeeState) => setSt(s);
    w.__lampEvent = (e: YukeeEvent) => ref.current?.event(e);
    w.__lampGaze = (x: number, y: number) => ref.current?.setGaze(x, y);
  }, []);
  const W = +(q.get("w") || 1200), H = Math.round(W * 27 / 90);
  return (
    <div style={{ width: W, height: H, background: "#050807", display: "grid", placeItems: "center", overflow: "hidden" }}>
      <div style={{ width: H * 0.92, height: H * 0.92 }}>
        <YukeeFace ref={ref} state={st} sizeVariant="default" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(q.get("view") === "lamp" ? <Lamp /> : <Monitor />);
