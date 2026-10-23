import { describe, expect, it } from "vitest";
import { LeanCues, PENTATONIC, SquatCues, WingCues, type CueSink, type LeanCueState } from "./gameCues";
import { BGM_TRACKS, SAMPLES, findLoopRegion, parseSettings } from "./catalog";

function sink() {
  const log: string[] = [];
  const rates: number[] = [];
  const s: CueSink = {
    play: (id, o) => { log.push(id); rates.push(o?.rate ?? 1); },
    synth: (k) => { log.push(`synth:${k}`); },
    duck: () => { log.push("duck"); },
  };
  return { s, log, rates };
}

describe("BGM 目录", () => {
  it("G01 保持原曲，G02/G03/G05 各自独立且互不重复", () => {
    expect(BGM_TRACKS.yukeeRun.url).toBe("/audio/yukee-run-bgm.mp3");
    const urls = [BGM_TRACKS.winglight.url, BGM_TRACKS.leanSurf.url, BGM_TRACKS.squatJump.url];
    expect(new Set([...urls, BGM_TRACKS.yukeeRun.url]).size).toBe(4);
    for (const u of urls) expect(u.startsWith("/audio/bgm/")).toBe(true);
  });
  it("BGM 电平低于重要交互音效", () => {
    const loudestBgm = Math.max(BGM_TRACKS.winglight.level, BGM_TRACKS.leanSurf.level, BGM_TRACKS.squatJump.level);
    expect(loudestBgm).toBeLessThanOrEqual(SAMPLES["g05-complete"].gain);
  });
});

describe("音量设置", () => {
  it("解析与回落", () => {
    expect(parseSettings(null, null)).toEqual({ music: 0.8, sfx: 0.9, muted: false });
    expect(parseSettings('{"music":0.3,"sfx":2,"muted":true}', null)).toEqual({ music: 0.3, sfx: 1, muted: true });
    expect(parseSettings("{oops", null).muted).toBe(false);
    // 旧版总音量 0 迁移为静音
    expect(parseSettings(null, "0").muted).toBe(true);
    expect(parseSettings(null, "0.6").muted).toBe(false);
  });
});

describe("循环区间", () => {
  it("只去掉首尾编码器静音，最多各 0.1 秒", () => {
    const sr = 1000;
    const a = new Float32Array(1000).fill(0.2);
    a.fill(0, 0, 30);
    a.fill(0, 980);
    expect(findLoopRegion(a, sr)).toEqual({ start: 0.03, end: 0.98 });
    const quiet = new Float32Array(1000); // 全静音也不会把区间切没
    const r = findLoopRegion(quiet, sr);
    expect(r.end - r.start).toBeGreaterThan(0.7);
  });
});

describe("G02 展翼接光", () => {
  it("展开 / 收拢只在阶段跃迁时各响一次", () => {
    const { s, log } = sink();
    const c = new WingCues(s, () => 0);
    for (let i = 0; i < 30; i++) c.stageChanged("ready", true);
    for (let i = 0; i < 30; i++) c.stageChanged("open", true);
    for (let i = 0; i < 30; i++) c.stageChanged("return", true);
    c.stageChanged("ready", true);
    expect(log).toEqual(["g02-wing-open", "g02-wing-close"]);
  });
  it("识别丢失时不响", () => {
    const { s, log } = sink();
    const c = new WingCues(s, () => 0);
    c.stageChanged("open", false);
    expect(log).toEqual([]);
  });
  it("星光：同帧合并、连续升调、隔开后重置", () => {
    const { s, log, rates } = sink();
    let t = 0;
    const c = new WingCues(s, () => t);
    c.star(); c.star(); c.star(); // 同一时刻三颗 → 一声
    expect(log.length).toBe(1);
    for (let i = 0; i < 8; i++) { t += 200; c.star(); }
    expect(log.length).toBe(9);
    expect(rates[1]).toBeGreaterThan(rates[0]);
    expect(Math.max(...rates)).toBe(PENTATONIC[PENTATONIC.length - 1]);
    t += 3000; c.star();
    expect(rates[rates.length - 1]).toBe(1);
  });
  it("完成只响一次且之后静默", () => {
    const { s, log } = sink();
    const c = new WingCues(s, () => 0);
    c.complete(); c.complete(); c.star(); c.gathered(3);
    expect(log).toEqual(["duck", "g02-complete"]);
  });
});

describe("G03 躯干重心冲浪", () => {
  const base: LeanCueState = { arrived: false, returning: false, reps: 0, target: -1, complete: false, tracking: "ok" };
  it("连续帧不重复：到位、回正、接住各一次", () => {
    const { s, log } = sink();
    let t = 0;
    const c = new LeanCues(s, () => t);
    c.update(base);
    for (let i = 0; i < 20; i++) { t += 16; c.update({ ...base, arrived: true }); }
    t += 16; c.update({ ...base, arrived: true, reps: 1, returning: true, target: 1 });
    for (let i = 0; i < 20; i++) { t += 16; c.update({ ...base, reps: 1, returning: true, target: 1 }); }
    t += 700; c.update({ ...base, reps: 1, returning: false, target: 1 });
    expect(log).toEqual(["g03-lean", "g03-catch", "synth:whoosh"]);
  });
  it("到位音有冷却，识别抖动不会连发", () => {
    const { s, log } = sink();
    let t = 0;
    const c = new LeanCues(s, () => t);
    c.update(base);
    for (let i = 0; i < 10; i++) {
      t += 50; c.update({ ...base, arrived: true });
      t += 50; c.update({ ...base, arrived: false });
    }
    expect(log.filter((x) => x === "g03-lean").length).toBe(2);
  });
  it("每第三次连续接住给奖励乐句；完成时压低音乐", () => {
    const { s, log } = sink();
    let t = 0;
    const c = new LeanCues(s, () => t);
    c.update(base);
    for (let r = 1; r <= 3; r++) { t += 3000; c.update({ ...base, reps: r }); }
    expect(log).toEqual(["g03-catch", "g03-catch", "g03-streak"]);
    t += 3000; c.update({ ...base, reps: 3, complete: true });
    expect(log.slice(-2)).toEqual(["duck", "g03-complete"]);
  });
  it("识别不稳时不发侧倾提示", () => {
    const { s, log } = sink();
    const c = new LeanCues(s, () => 0);
    c.update({ ...base, tracking: "unstable" });
    c.update({ ...base, arrived: true, tracking: "unstable" });
    expect(log).toEqual([]);
  });
});

describe("G05 浅蹲跳一跳", () => {
  it("蓄力刻度与蓄力值一一对应，回退不重复", () => {
    const { s, log } = sink();
    const c = new SquatCues(s);
    c.chargeStart();
    for (let l = 0; l <= 0.6; l += 0.01) c.chargeLevel(l, null);
    for (let l = 0.6; l >= 0.45; l -= 0.01) c.chargeLevel(l, null); // 摄像头起身回退
    for (let l = 0.45; l <= 1.0001; l += 0.01) c.chargeLevel(l, null);
    expect(log.filter((x) => x === "synth:tick").length).toBe(1 + 4); // 开始 + 25/50/75/100%
  });
  it("进入落点区只提示一次", () => {
    const { s, log } = sink();
    const c = new SquatCues(s);
    c.chargeStart();
    for (let l = 0; l <= 0.7; l += 0.02) c.chargeLevel(l, { lo: 0.4, hi: 0.55 });
    expect(log.filter((x) => x === "synth:spark").length).toBe(1);
  });
  it("未开始蓄力时不响", () => {
    const { s, log } = sink();
    const c = new SquatCues(s);
    c.chargeLevel(0.8, null);
    expect(log).toEqual([]);
  });
  it("落地、连击、失败、完成、重开", () => {
    const { s, log } = sink();
    const c = new SquatCues(s);
    c.landed("hit", 0);
    c.landed("perfect", 1);
    c.landed("perfect", 2);
    expect(log).toEqual(["g05-score", "g05-perfect", "g05-perfect", "g05-streak"]);
    log.length = 0;
    c.fail(); c.complete(); c.restart();
    expect(log).toEqual(["duck", "g05-fail", "duck", "g05-complete", "g05-restart"]);
  });
});
