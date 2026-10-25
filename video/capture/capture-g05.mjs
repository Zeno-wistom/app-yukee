// 录制真实 G05：选择页 → 浅蹲跳一跳 → 键盘演示（既有演示输入接口）→ 两次起跳。
// 虚拟时间逐帧截图（30fps），同时输出事件日志 events.json，供三维人物动作与混音使用。
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = process.argv[2] || "/workspace/work/hark-video-demo/video/out/g05";
const FPS = 30, DT = 1000 / FPS;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT + "/frames", { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`window.__VT_DATE=${Date.parse(process.env.VT_DATE || "2026-10-23T15:41:00Z")};`);
await ctx.addInitScript({ path: new URL("./vtime.js", import.meta.url).pathname });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text().slice(0, 200)); });
await page.goto("http://127.0.0.1:5188/", { waitUntil: "networkidle" });
// 光标覆盖层（只用于成片可读性，不参与页面逻辑）
await page.evaluate(() => {
  const c = document.createElement("div"); c.id = "__cursor";
  c.style.cssText = "position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none";
  c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
});
let frame = 0, cur = { x: 1500, y: 900 };
const events = [];
const ev = (type, extra = {}) => { const e = { type, frame, t: +(frame / FPS).toFixed(3), ...extra }; events.push(e); console.log(JSON.stringify(e)); };
const setCursor = (x, y, down = false) => page.evaluate(([x, y, d]) => { const c = document.getElementById("__cursor"); c.style.transform = `translate(${x - 4}px,${y - 2}px) scale(${d ? 0.85 : 1})`; }, [x, y, down]);
async function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((dt) => window.__vt.step(dt), DT);
    await page.screenshot({ path: `${OUT}/frames/${String(frame).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    frame++;
  }
}
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
async function tickUntil(fn, max = 150) { for (let i = 0; i < max; i++) { if (await fn()) return; await tick(); } throw new Error("tickUntil timeout"); }
async function moveTo(x, y, frames = 18) {
  const s = { ...cur };
  for (let i = 1; i <= frames; i++) { const k = ease(i / frames); cur = { x: s.x + (x - s.x) * k, y: s.y + (y - s.y) * k }; await setCursor(cur.x, cur.y); await page.mouse.move(cur.x, cur.y); await tick(); }
}
async function clickOn(locator, name) {
  const bb = await locator.boundingBox(); if (!bb) throw new Error("no box " + name);
  await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await tick(4);
  await setCursor(cur.x, cur.y, true); await page.mouse.down(); await tick(2);
  await page.mouse.up(); await setCursor(cur.x, cur.y, false); ev("click", { name });
  await tick(1);
}
await setCursor(cur.x, cur.y);
await tick(1); ev("selection-visible");
await tick(30);
await clickOn(page.getByRole("button", { name: "查看浅蹲跳一跳", exact: true }), "查看浅蹲跳一跳");
await tick(24);
await clickOn(page.getByRole("button", { name: "进入游戏", exact: true }), "进入游戏");
await tick(14);
await tickUntil(() => page.getByTestId("squat-calibration").isVisible());
await tick(6);
ev("calibration-visible");
await clickOn(page.getByRole("button", { name: /键盘演示/ }), "键盘演示");
await tick(12);
await tickUntil(() => page.getByTestId("squat-jump").isVisible()); ev("game-visible");
// 移开光标
await moveTo(1880, 1060, 14);
await page.evaluate(() => { document.getElementById("__cursor").style.display = "none"; });
// 让主舞台接收键盘（与 e2e helpers 相同）
await page.locator("main").click({ position: { x: 1, y: 74 } });
await tick(36);
const game = page.getByTestId("squat-jump");
const JUMPS = +(process.env.JUMPS || 2);
for (let j = 1; j <= JUMPS; j++) {
  const need = Number(await game.getAttribute("data-need-charge"));
  const holdFrames = Math.max(4, Math.round(need * FPS));
  await page.keyboard.down("Space"); ev("press", { jump: j, need, holdFrames });
  await tick(holdFrames);
  await page.keyboard.up("Space"); ev("release", { jump: j });
  let landed = false;
  for (let k = 0; k < 90; k++) {
    await tick(1);
    const st = await game.getAttribute("data-state");
    if (!landed && st !== "flying" && st !== "charging") { landed = true; ev("landed", { jump: j, state: st, last: await game.getAttribute("data-last"), score: await game.getAttribute("data-score"), jumps: await game.getAttribute("data-jumps") }); }
    if (landed && k > 40) break;
  }
  await tick(j < JUMPS ? 20 : 200);
}
ev("end");
const sounds = await page.evaluate(() => window.__vt.sounds);
const audioT0 = await page.evaluate(() => window.__vt.audioT0);
const wav = await page.evaluate(() => window.__vt.audioWav());
if (wav) fs.writeFileSync(`${OUT}/game-audio.wav`, Buffer.from(wav, "base64"));
console.log("audioT0(ms)", audioT0);
fs.writeFileSync(`${OUT}/events.json`, JSON.stringify({ fps: FPS, frames: frame, audioT0, events, sounds }, null, 1));
await b.close();
console.log("frames", frame);
