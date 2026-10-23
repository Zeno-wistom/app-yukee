import { useEffect, useState } from "react";
import { setSquatDebug, squatDebugAllowed, squatDebugEnabled, squatDebugLog } from "../../vision/squatPose";

/** 调试开关：?g05debug=1，或在开发构建 / 调试地址下按 D 切换（记在本机 localStorage） */
export function useSquatDebugToggle() {
  const [on, setOn] = useState(squatDebugEnabled);
  useEffect(() => {
    if (!squatDebugAllowed()) return;
    const key = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "d" || e.key === "D") {
        setOn((v) => {
          setSquatDebug(!v);
          return !v;
        });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return on;
}

export type DebugRow = [label: string, value: string, state?: "ok" | "bad" | "warn" | ""];

/** 真人测试用调试面板：数值 + 阈值刻度 + 导出日志（只含数值，不含画面） */
export function SquatDebugPanel({
  title,
  rows,
  meter,
}: {
  title: string;
  rows: DebugRow[];
  /** 下降量刻度：当前值与各阈值（同一单位） */
  meter?: { value: number; max: number; marks: { at: number; label: string }[] };
}) {
  const [copied, setCopied] = useState("");
  const exportLog = () => {
    const text = squatDebugLog.dump();
    const done = (m: string) => {
      setCopied(m);
      window.setTimeout(() => setCopied(""), 1600);
    };
    try {
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `g05-squat-log-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      done(`已导出 ${squatDebugLog.rows.length} 行`);
    } catch {
      void navigator.clipboard?.writeText(text).then(() => done("已复制"));
    }
  };
  return (
    <aside className="squat-debug" data-testid="squat-debug">
      <header>
        <b>{title}</b>
        <small>D 关闭</small>
      </header>
      {meter && (
        <div className="squat-debug-meter">
          <i style={{ width: `${Math.max(0, Math.min(1, meter.value / meter.max)) * 100}%` }} />
          {meter.marks.map((m) => (
            <span key={m.label} style={{ left: `${Math.min(1, m.at / meter.max) * 100}%` }}>
              {m.label}
            </span>
          ))}
        </div>
      )}
      <dl>
        {rows.map(([k, v, st]) => (
          <div key={k} className={st || ""}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <footer>
        <button onClick={exportLog}>导出日志</button>
        <button onClick={() => squatDebugLog.clear()}>清空</button>
        <small>{copied || `${squatDebugLog.rows.length} 行`}</small>
      </footer>
    </aside>
  );
}

export const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "–");
export const f3 = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : "–");
