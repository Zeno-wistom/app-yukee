// 导出最终版时间轴（含四款游戏真实事件推导出的动作区间），供合成与混音使用
import fs from "node:fs";
import * as T from "../src/timeline.mjs";
const OUT = new URL("../out/", import.meta.url).pathname;
const all = {}; for (const g of ["g01", "g02", "g03", "g05"]) all[g] = JSON.parse(fs.readFileSync(`${OUT}games/${g}/events.json`, "utf8"));
const sel = JSON.parse(fs.readFileSync(`${OUT}games/select/events.json`, "utf8"));
const tl = T.buildTimeline(all);
fs.writeFileSync(OUT + "timeline2.json", JSON.stringify({ FPS: T.FPS, DURATION: T.DURATION, GAMES: T.GAMES, SHOTS: T.SHOTS, CUES: T.CUES, SELECT_LEAD: 0.35, selectFrames: sel.frames, selectSounds: sel.sounds, selectAudioT0: sel.audioT0 / 1000, ...tl }, null, 1));
for (const [g, s] of Object.entries(tl.games)) console.log(g, JSON.stringify(s.acts.map((a) => [a.kind, +a.press.toFixed(2)])));
console.log("success", tl.success.map((s) => s.g + "@" + s.t.toFixed(2)).join(" "));
