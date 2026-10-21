/**
 * OfficeView —— 第一人称办公场景（focus 相位的电脑主屏）。
 *
 * Windows-like 但不复制 Windows：多窗口（表格/文档/聊天）、
 * 任务栏、实时时钟、文本光标与轻微工作动画。
 * 目标：观众一眼看懂「用户正在长时间办公」。
 * Yukee 的提醒入口收进右下助手挂件。
 */
import { useEffect, useState } from "react";

const SHEET_ROWS = [42, 67, 53, 88, 71, 96, 62, 79];
const CHAT = [
  { from: "PM", text: "周报数据今天能定稿吗？" },
  { from: "我", text: "在看，下午给你" },
  { from: "PM", text: "好，别忘了 Q3 复盘那页" },
];

export default function OfficeView() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const hhmm = now.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="office" data-testid="office-view">
      {/* 文档窗口 */}
      <div className="office-window office-doc">
        <div className="office-titlebar">
          <i />
          <span>产品方案 · 文档</span>
          <b />
        </div>
        <div className="office-doc-body">
          <div className="doc-line w60" />
          <div className="doc-line w90" />
          <div className="doc-line w85" />
          <div className="doc-line w40" />
          <div className="doc-gap" />
          <div className="doc-line w90" />
          <div className="doc-line w75" />
          <div className="doc-line typing">
            <span className="doc-caret" />
          </div>
        </div>
      </div>
      {/* 表格窗口 */}
      <div className="office-window office-sheet">
        <div className="office-titlebar">
          <i />
          <span>Q3 周报 · 表格</span>
          <b />
        </div>
        <div className="office-sheet-body">
          <div className="sheet-grid">
            {SHEET_ROWS.map((v, i) => (
              <div key={i} className="sheet-row">
                <span>{`10-${String(i + 8).padStart(2, "0")}`}</span>
                <div className="sheet-bar">
                  <i style={{ width: `${v}%` }} />
                </div>
                <em>{v}</em>
              </div>
            ))}
          </div>
          <div className="sheet-chart">
            {SHEET_ROWS.slice(0, 6).map((v, i) => (
              <i key={i} style={{ height: `${v * 0.72}%` }} />
            ))}
          </div>
        </div>
      </div>
      {/* 聊天窗口 */}
      <div className="office-window office-chat">
        <div className="office-titlebar">
          <i />
          <span>项目群 · 聊天</span>
          <b />
        </div>
        <div className="office-chat-body">
          {CHAT.map((m, i) => (
            <div key={i} className={`chat-msg ${m.from === "我" ? "me" : ""}`}>
              <b>{m.from}</b>
              <span>{m.text}</span>
            </div>
          ))}
          <div className="chat-typing">
            <i />
            <i />
            <i />
          </div>
        </div>
      </div>
      {/* 任务栏 */}
      <div className="office-taskbar">
        <span className="taskbar-start" />
        <span className="taskbar-app active" />
        <span className="taskbar-app" />
        <span className="taskbar-app" />
        <span className="taskbar-clock">{hhmm}</span>
      </div>
    </div>
  );
}
