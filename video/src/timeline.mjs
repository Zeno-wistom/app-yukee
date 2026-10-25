/**
 * YUKEE 产品体验演示 · 最终版统一时间轴（唯一来源）
 *
 * 成片时间（秒）。四款真实游戏各自录制（out/games/<id>/events.json），
 * 每款截取一段源时间窗 [src, src + 段长]，映射到成片时间；人物动作、屏幕贴图、
 * 挂灯表情、混音全部从这里推导，保证「人物动作 ↔ 游戏输入 ↔ 游戏反馈」同一时刻。
 * Node 与浏览器共用（纯 ESM，无依赖）。
 */
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const DURATION = 48.0;

/** 游戏段：成片 [start,end) ← 源录制 src 起点 */
export const GAMES = {
  g01: { start: 18.0, end: 23.5, src: 8.9, title: "拾光跑者", motion: "头部" },
  g02: { start: 23.5, end: 29.0, src: 5.3, title: "展翼接光", motion: "双臂" },
  g03: { start: 29.0, end: 34.5, src: 4.6, title: "星海冲浪", motion: "躯干重心" },
  g05: { start: 34.5, end: 40.0, src: 5.1, title: "浅蹲跳一跳", motion: "浅蹲" },
};

/** 镜头表（start ≤ t < end） */
export const SHOTS = [
  { id: "S1-establish", start: 0.0, end: 6.5, kind: "3d", cam: "establish" },
  { id: "S2-timelapse", start: 6.5, end: 10.5, kind: "3d", cam: "profile" },
  { id: "S3a-notice", start: 10.5, end: 12.2, kind: "3d", cam: "lampClose" },
  { id: "S3b-respond", start: 12.2, end: 14.0, kind: "3d", cam: "overShoulder" },
  { id: "S4a-stand", start: 14.0, end: 15.4, kind: "3d", cam: "standSide" },
  { id: "S4b-select", start: 15.4, end: 18.0, kind: "screen" },
  { id: "G01", start: 18.0, end: 23.5, kind: "game", game: "g01", pip: "headCam" },
  { id: "G02", start: 23.5, end: 29.0, kind: "game", game: "g02", pip: "backCam", insert: { end: 25.1, cam: "backWide" } },
  { id: "G03", start: 29.0, end: 34.5, kind: "game", game: "g03", pip: "backCam" },
  { id: "G05", start: 34.5, end: 40.0, kind: "game", game: "g05", pip: "sideCam", insert: { end: 36.3, cam: "squatSide" } },
  { id: "S6a-celebrate", start: 40.0, end: 42.6, kind: "3d", cam: "lampHero" },
  { id: "S6b-back-to-work", start: 42.6, end: 45.2, kind: "3d", cam: "relaxed" },
  { id: "S6c-end", start: 45.2, end: 48.0, kind: "3d", cam: "heroEnd" },
];

/** 场景事件（成片时间） */
export const CUES = {
  timelapseStart: 6.5,
  timelapseEnd: 10.5,
  clockFrom: "14:40",
  clockTo: "15:25",
  neckRub: 9.0,
  reminder: 10.6, // YUKEE：小屏 notice → attentive，灯条先呼吸
  colorCue: 11.9, // 呼吸后转入更明确的颜色提示（海报：Soft breathing first, a clearer colour cue）
  monitorReminder: 11.0, // 主显示器 weakReminder：开始活动 / 继续工作
  lookUp: 11.2,
  nod: 12.55,
  reachMouse: 12.75,
  click: 13.55, // 点击「开始活动」
  standUp: 14.0,
  stepBack: 14.55,
  standing: 15.4,
  selectStart: 15.4,
  backToWork: 42.6,
  returnReach: 42.75, // 坐下后伸手握鼠标
  returnClick: 43.25, // 奖励界面点「回到专注」（产品真实流程：reward → RETURN_WORK → focus）
  endTitle: 45.5,
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 源时间 → 成片时间 */
export const toMaster = (g, srcT) => GAMES[g].start + (srcT - GAMES[g].src);

/** 由各游戏真实事件推导的动作区间（成片时间） */
export function buildTimeline(allEvents) {
  const out = { games: {} };
  for (const [g, ev] of Object.entries(allEvents)) {
    const E = ev.events;
    const m = (e) => toMaster(g, e.t);
    const inSeg = (x) => x > GAMES[g].start - 0.6 && x < GAMES[g].end - 0.3;
    const acts = [];
    if (g === "g01") {
      for (const p of E.filter((e) => e.type === "press")) {
        const r = E.find((e) => e.type === "release" && e.frame > p.frame);
        if (inSeg(m(p))) acts.push({ kind: p.action, press: m(p), release: m(r) });
      }
    } else if (g === "g02") {
      for (const p of E.filter((e) => e.type === "press")) {
        const c = E.find((e) => e.type === "charged" && e.rep === p.rep), r = E.find((e) => e.type === "release" && e.rep === p.rep), rep = E.find((e) => e.type === "rep" && e.rep === p.rep);
        if (inSeg(m(p))) acts.push({ kind: "wings", press: m(p), charged: m(c), release: m(r), rep: m(rep) });
      }
    } else if (g === "g03") {
      for (const p of E.filter((e) => e.type === "press")) {
        const r = E.find((e) => e.type === "release" && e.rep === p.rep), rep = E.find((e) => e.type === "rep" && e.rep === p.rep);
        if (inSeg(m(p))) acts.push({ kind: "lean", side: p.side, press: m(p), rep: m(rep), release: m(r) });
      }
    } else if (g === "g05") {
      for (const p of E.filter((e) => e.type === "press")) {
        const r = E.find((e) => e.type === "release" && e.jump === p.jump), l = E.find((e) => e.type === "landed" && e.jump === p.jump);
        if (inSeg(m(p))) acts.push({ kind: "squat", press: m(p), release: m(r), landed: m(l), result: l.last, score: +l.score });
      }
    }
    const sounds = ev.sounds.map((s) => ({ t: toMaster(g, s.t / 1000), url: s.url }));
    out.games[g] = { acts, sounds, frames: ev.frames, fps: ev.fps, firstFrame: ev.events.find((e) => e.type === "game-visible").frame, audioT0: ev.audioT0 / 1000 };
  }
  // 成功反馈时刻（挂灯小屏 success 事件）
  const success = [];
  for (const [g, s] of Object.entries(out.games)) {
    for (const a of s.acts) {
      const t = g === "g01" ? (a.kind === "left" ? a.press + 0.15 : null) : g === "g02" ? a.rep : g === "g03" ? a.rep : a.landed;
      if (t && t >= GAMES[g].start && t < GAMES[g].end) success.push({ g, t });
    }
  }
  out.success = success.sort((a, b) => a.t - b.t);
  // 挂灯小屏 YukeeFace（与产品 yukeeStateForPhase 映射一致）
  out.lamp = [
    { t: 0, state: "calm" },
    { t: CUES.reminder, state: "attentive", event: "notice" }, // weakReminder → attentive
    { t: CUES.click + 0.1, state: "attentive" }, // lampSelection → attentive
    { t: GAMES.g01.start - 0.3, state: "playful", event: "enterGame" }, // 游戏中 → playful
    ...out.success.map((s) => ({ t: s.t, state: "playful", event: "success" })),
    { t: 40.0, state: "celebrate" }, // reward → celebrate
    { t: CUES.returnClick + 0.2, state: "calm" },
  ];
  return out;
}

/** 成片时间 → 某游戏录制帧号（相对于已保存的第一帧） */
export function gameFrameAt(g, t, tl) {
  const s = tl.games[g];
  const f = Math.round((t - GAMES[g].start + GAMES[g].src) * FPS);
  return clamp(f, s.firstFrame, s.frames - 1);
}

export function shotAt(t) {
  return SHOTS.find((s) => t >= s.start && t < s.end) ?? SHOTS[SHOTS.length - 1];
}

export function gameAt(t) {
  for (const [g, v] of Object.entries(GAMES)) if (t >= v.start && t < v.end) return g;
  return null;
}

/** 主显示器内容来源 */
export function monitorSourceAt(t) {
  const g = gameAt(t);
  if (g) return { kind: "game", game: g };
  if (t >= CUES.click + 0.15 && t < GAMES.g01.start) return { kind: "select" };
  return { kind: "monitor" }; // 办公 / 提醒 / 回到办公（out/monitor 全程录制）
}
