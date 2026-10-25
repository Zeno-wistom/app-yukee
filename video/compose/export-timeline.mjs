// 导出成片时间轴（含由真实游戏事件推导出的跳跃时刻），供 Python 合成与混音使用
import fs from "node:fs";
import * as T from "../src/timeline.mjs";
const OUT = new URL("../out/", import.meta.url).pathname;
const ev = JSON.parse(fs.readFileSync(OUT + "g05/events.json", "utf8"));
const tl = T.buildTimeline(ev);
fs.writeFileSync(OUT + "timeline.json", JSON.stringify({ FPS: T.FPS, DURATION: T.DURATION, GAME_OFFSET: T.GAME_OFFSET, SHOTS: T.SHOTS, CUES: T.CUES, audioT0: ev.audioT0, ...tl }, null, 1));
console.log(JSON.stringify(tl.jumps));
