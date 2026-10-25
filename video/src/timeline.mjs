/**
 * YUKEE 演示样片 · 统一时间轴（唯一来源）
 *
 * 所有时间单位为秒（成片时间 master）。真实游戏录制的事件日志（out/g05/events.json）
 * 通过 GAME_OFFSET 映射到成片时间，人物下蹲/起身、屏幕画面、混音都由这里推导，
 * 保证「人物动作 ↔ 游戏输入 ↔ 游戏反馈」严格同一时刻。
 *
 * Node 与浏览器共用（纯 ESM，无依赖）。
 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** 成片时间 = 游戏录制时间 + GAME_OFFSET */
export const GAME_OFFSET = 11.0;

/** 镜头表（start ≤ t < end） */
export const SHOTS = [
  { id: "S1-establish", start: 0.0, end: 5.0, kind: "3d", cam: "establish" },
  { id: "S2-reminder", start: 5.0, end: 8.6, kind: "3d", cam: "lampClose" },
  { id: "S3-respond", start: 8.6, end: 11.6, kind: "3d", cam: "overShoulder" },
  { id: "S4-select", start: 11.6, end: 17.3, kind: "screen" },
  { id: "S5a-squat", start: 17.3, end: 20.3, kind: "3d", cam: "squatSide" },
  { id: "S5b-game", start: 20.3, end: 23.7, kind: "screen+pip", cam: "pip" },
  { id: "S6-outro", start: 23.7, end: 31.0, kind: "3d", cam: "outro" },
];
export const DURATION = 31.0;

/** 场景事件（成片时间） */
export const CUES = {
  reminder: 5.6, // YUKEE 触发休息提醒（挂灯小屏 attentive + notice，灯条呼吸）
  monitorReminder: 6.0, // 主显示器切到提醒界面（MonitorDisplay · weakReminder）
  lookUp: 8.8, // 用户抬头看 YUKEE
  reachMouse: 10.0, // 手伸向鼠标，准备响应
  screenCut: 11.6, // 镜头推进到屏幕，切到真实网页录制
  standing: 17.3, // 用户已起身站到屏幕前（剪辑省略起身过程）
  endCard: 28.4,
};

/** 由真实游戏事件推导人物动作与挂灯状态 */
export function buildTimeline(gameEvents) {
  const ev = gameEvents.events;
  const m = (e) => e.t + GAME_OFFSET;
  const jumps = [];
  for (const p of ev.filter((e) => e.type === "press")) {
    const r = ev.find((e) => e.type === "release" && e.jump === p.jump);
    const l = ev.find((e) => e.type === "landed" && e.jump === p.jump);
    jumps.push({ jump: p.jump, press: m(p), release: m(r), landed: m(l), result: l.last, score: +l.score });
  }
  const gameVisible = m(ev.find((e) => e.type === "game-visible"));
  // 挂灯小屏 YukeeFace 状态（与产品 yukeeStateForPhase 映射一致）
  const lamp = [
    { t: 0, state: "calm" },
    { t: CUES.reminder, state: "attentive", event: "notice" },
    { t: CUES.screenCut, state: "attentive" }, // lampSelection → attentive
    { t: gameVisible, state: "playful", event: "enterGame" },
    ...jumps.map((j) => ({ t: j.landed, state: "playful", event: j.result === "perfect" || j.result === "hit" ? "success" : "miss" })),
    { t: jumps[jumps.length - 1].landed + 1.6, state: "celebrate" },
  ];
  return { jumps, gameVisible, lamp, gameFrames: gameEvents.frames, gameFps: gameEvents.fps };
}

/** 成片时间 → 游戏录制帧号（超出范围时夹取） */
export function gameFrameAt(t, tl) {
  const f = Math.round((t - GAME_OFFSET) * tl.gameFps);
  return Math.max(0, Math.min(tl.gameFrames - 1, f));
}

export function shotAt(t) {
  return SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1];
}

/** 主显示器内容来源 */
export function monitorSourceAt(t) {
  if (t < CUES.monitorReminder) return { kind: "office" };
  if (t < CUES.screenCut) return { kind: "reminder" };
  return { kind: "game" };
}
