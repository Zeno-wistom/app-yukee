// 录制「主显示器办公/提醒界面」与「YUKEE 挂灯小屏表情」两段真实组件画面（虚拟时间逐帧）。
import { chromium } from "playwright";
import fs from "node:fs";
import { FPS, CUES, DURATION, buildTimeline } from "../src/timeline.mjs";
const ROOT = "/workspace/work/hark-video-demo/video/out";
const all = {}; for (const g of ["g01", "g02", "g03", "g05"]) all[g] = JSON.parse(fs.readFileSync(`${ROOT}/games/${g}/events.json`, "utf8"));
const tl = buildTimeline(all);
const which = process.argv[2] || "monitor,lamp";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium" });
// 显示器光标：用户伸手握鼠标（CUES.reachMouse）后移向「开始活动」，10.9 s 按下（与人物右手点击同一时刻）
// 两次点击：提醒界面的「开始活动」与奖励界面的「回到专注」（与人物右手点击同一时刻）
const CLICKS = [
  { name: /开始活动/, from: CUES.reachMouse + 0.15, at: CUES.click, show: [CUES.monitorReminder + 0.4, CUES.click + 1.0] },
  { name: /回到专注/, from: CUES.returnReach + 0.1, at: CUES.returnClick, show: [CUES.returnReach - 0.3, CUES.returnClick + 0.5] },
];
const btnPos = {};
async function cursorAt(page, t) {
  const seg = CLICKS.find((c) => t >= c.show[0] && t <= c.show[1]);
  if (!seg) { await page.evaluate(() => { const c = document.getElementById("__cursor"); if (c) c.style.display = "none"; }); return; }
  const key = String(seg.name);
  if (!btnPos[key]) { const bb = await page.getByRole("button", { name: seg.name }).boundingBox(); btnPos[key] = { x: bb.x + bb.width * 0.42, y: bb.y + bb.height / 2 }; }
  const btn = btnPos[key];
  const a = { x: 1500, y: 820 }; const k = Math.max(0, Math.min(1, (t - seg.from) / Math.max(0.3, Math.min(0.6, seg.at - seg.from - 0.1)))); const e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
  const x = a.x + (btn.x - a.x) * e, y = a.y + (btn.y - a.y) * e; const down = t >= seg.at && t < seg.at + 0.18;
  await page.evaluate(([x, y, d]) => {
    let c = document.getElementById("__cursor");
    if (!c) { // 录制页重渲染时可能移除覆盖层：重新挂到 body 末尾
      c = document.createElement("div"); c.id = "__cursor";
      c.style.cssText = "position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none";
      c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      document.body.appendChild(c);
    }
    c.style.display = "block";
    c.style.transform = `translate(${x - 5}px,${y - 2}px) scale(${d ? 0.85 : 1})`;
  }, [x, y, down]);
  // 光标只做视觉；状态由时间轴切换（与真实界面流程一致：提醒 → 开始活动；奖励 → 回到专注）
}
async function run(name, url, viewport, endT, schedule) {
  const out = `${ROOT}/${name}`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1, timezoneId: "Asia/Macau", locale: "zh-CN" });
  await ctx.addInitScript(`window.__VT_DATE=${Date.parse("2026-10-23T14:40:10+08:00")};`);
  await ctx.addInitScript({ path: new URL("./vtime.js", import.meta.url).pathname });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("[err]", e.message));
  await page.goto(url, { waitUntil: "networkidle" });
  for (let i = 0; i < 20; i++) await page.evaluate(() => window.__vt.flush());
  if (name === "monitor") await page.evaluate(() => {
    const c = document.createElement("div"); c.id = "__cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(1500px,820px)";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="30" height="30"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
  });
  const n = Math.ceil(endT * FPS); let si = 0;
  for (let f = 0; f < n; f++) {
    const t = f / FPS;
    while (si < schedule.length && schedule[si].t <= t + 1e-6) { await page.evaluate((s) => s.fn === "state" ? window.__screen(s.v) : s.fn === "date" ? window.__vtAddDate(s.v) : window.__lampEvent(s.v), schedule[si]); si++; }
    if (name === "monitor") await cursorAt(page, t);
    await page.evaluate((dt) => window.__vt.step(dt), 1000 / FPS);
    await page.screenshot({ path: `${out}/${String(f).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  await ctx.close(); console.log(name, n, "frames");
}
if (which.includes("monitor"))
  await run("monitor", "http://127.0.0.1:5290/screens.html?view=monitor&phase=focus", { width: 1920, height: 1080 }, DURATION,
    [{ t: CUES.timelapseStart + 2.0, fn: "date", v: 45 * 60000 }, { t: CUES.monitorReminder, fn: "state", v: "weakReminder" },
     { t: 39.0, fn: "date", v: 4 * 60000 }, { t: 40.0, fn: "state", v: "reward" }, { t: CUES.returnClick + 0.2, fn: "state", v: "focus" }]);
if (which.includes("lamp")) {
  const sch = [];
  for (const k of tl.lamp) { sch.push({ t: k.t, fn: "state", v: k.state }); if (k.event) sch.push({ t: k.t + 0.01, fn: "event", v: k.event }); }
  await run("lamp", "http://127.0.0.1:5290/screens.html?view=lamp&w=1200", { width: 1200, height: 360 }, DURATION, sch);
}
await b.close();
