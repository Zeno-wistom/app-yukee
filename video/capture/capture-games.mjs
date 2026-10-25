// 录制四款真实游戏（键盘演示接口，不改游戏代码），虚拟时间逐帧截图 + 事件日志 + 游戏音效。
// 用法：node capture-games.mjs g01|g02|g03|g05|select
// 音乐音量在录制时设为 0（只录交互音效）：成片使用一首连续的 CC0 背景音乐；G01 原曲版权待确认，不进入成片。
import { chromium } from "playwright";
import fs from "node:fs";
const which = process.argv[2];
const OUT = `/workspace/work/hark-video-demo/video/out/games/${which}`;
const FPS = 30, DT = 1000 / FPS;
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT + "/frames", { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--autoplay-policy=no-user-gesture-required", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.addInitScript(`window.__VT_DATE=${Date.parse("2026-10-23T15:31:00Z")}; window.__VT_AUDIO_SEC=60;
  try { localStorage.setItem("yukee.audio.v2", JSON.stringify({ music: 0, sfx: 0.9, muted: false })); } catch {}`);
await ctx.addInitScript({ path: new URL("./vtime.js", import.meta.url).pathname });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text().slice(0, 160)); });
await page.goto("http://127.0.0.1:5188/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  const c = document.createElement("div"); c.id = "__cursor";
  c.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px)";
  c.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#fff" stroke="#1a1a1a" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(c);
});
let frame = 0, cur = { x: 1560, y: 900 }, rec = which === "select";
const events = [];
const ev = (type, extra = {}) => { const e = { type, frame, t: +(frame / FPS).toFixed(3), ...extra }; events.push(e); console.log(JSON.stringify(e)); };
const setCursor = (x, y, down = false) => page.evaluate(([x, y, d]) => { const c = document.getElementById("__cursor"); c.style.transform = `translate(${x - 4}px,${y - 2}px) scale(${d ? 0.85 : 1})`; }, [x, y, down]);
async function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((dt) => window.__vt.step(dt), DT);
    if (rec) await page.screenshot({ path: `${OUT}/frames/${String(frame).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
    frame++;
  }
}
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function tickUntil(fn, max = 240) { for (let i = 0; i < max; i++) { if (await fn()) return; await tick(); } throw new Error("tickUntil timeout"); }
async function moveTo(x, y, frames = 16) {
  const s = { ...cur };
  for (let i = 1; i <= frames; i++) { const k = ease(i / frames); cur = { x: s.x + (x - s.x) * k, y: s.y + (y - s.y) * k }; await setCursor(cur.x, cur.y); await page.mouse.move(cur.x, cur.y); await tick(); }
}
async function clickOn(locator, name, hold = 4, mf = 16) {
  const bb = await locator.boundingBox(); if (!bb) throw new Error("no box " + name);
  await moveTo(bb.x + bb.width / 2, bb.y + bb.height / 2, mf);
  await tick(hold);
  await setCursor(cur.x, cur.y, true); await page.mouse.down(); await tick(2);
  await page.mouse.up(); await setCursor(cur.x, cur.y, false); ev("click", { name });
  await tick(1);
}
const TITLES = { g01: "拾光跑者", g02: "展翼接光", g03: "星海冲浪", g05: "浅蹲跳一跳" };
const TEST = { g01: "yukee-run", g02: "winglight", g03: "lean-surf", g05: "squat-jump" };
await setCursor(cur.x, cur.y);
await tick(1); ev("selection-visible");

if (which === "select") {
  // 选择页：依次浏览四款游戏卡片（跳过 G04 占位），最后回到拾光跑者并进入
  await tick(14);
  for (const g of ["g02", "g03", "g05", "g01"]) {
    await clickOn(page.getByRole("button", { name: `查看${TITLES[g]}`, exact: true }), "查看" + TITLES[g], 1, 8);
    ev("card", { game: g });
    await tick(g === "g01" ? 8 : 10);
  }
  await clickOn(page.getByRole("button", { name: "进入游戏", exact: true }), "进入游戏", 2, 10);
  await tick(20);
  ev("end");
} else {
  await clickOn(page.getByRole("button", { name: `查看${TITLES[which]}`, exact: true }), "查看");
  await tick(20);
  await clickOn(page.getByRole("button", { name: "进入游戏", exact: true }), "进入游戏");
  await tickUntil(() => page.getByRole("button", { name: /键盘演示/ }).isVisible());
  await tick(6);
  await clickOn(page.getByRole("button", { name: /键盘演示/ }), "键盘演示");
  await tickUntil(() => page.getByTestId(TEST[which]).isVisible());
  await page.evaluate(() => { document.getElementById("__cursor").style.display = "none"; });
  await page.locator("main").click({ position: { x: 1, y: 74 } });
  rec = true; ev("game-visible");
  const game = page.getByTestId(TEST[which]);
  const attr = (n) => game.getAttribute(n);

  if (which === "g01") {
    // 关卡是固定编排（src/games/level.ts）：以开场提示消失（世界时间 t=3s）为基准安排输入
    await tickUntil(async () => !(await page.locator(".yukee-intro").isVisible()), 300);
    const base = frame - 3 * FPS; ev("world-zero", { worldZeroFrame: base });
    const at = async (w) => { while (frame < base + Math.round(w * FPS)) await tick(); };
    const press = async (key, w, hold, action) => {
      await at(w); await page.keyboard.down(key); ev("press", { key, action, world: w });
      await tick(Math.round(hold * FPS)); await page.keyboard.up(key); ev("release", { key, action });
    };
    await press("ArrowUp", 5.18, 0.4, "up"); // 箱子：抬头 = 跳
    await press("ArrowUp", 7.88, 0.4, "up"); // 石头
    await press("ArrowLeft", 9.75, 0.7, "left"); // 左侧能量：往左转头
    await press("ArrowDown", 13.8, 0.65, "down"); // 横杆：低头 = 蹲
    await at(15.5);
    ev("energy", { value: await page.getByTestId("energy-count").innerText() });
  } else if (which === "g02") {
    await tick(45);
    for (let i = 1; i <= 3; i++) {
      await page.keyboard.down("Space"); ev("press", { rep: i });
      await tickUntil(async () => (await attr("data-charged")) === "1", 300); ev("charged", { rep: i });
      await tick(8);
      await page.keyboard.up("Space"); ev("release", { rep: i });
      await tickUntil(async () => (await attr("data-reps")) === String(i), 300); ev("rep", { rep: i });
      await tick(16);
    }
    await tick(30);
  } else if (which === "g03") {
    await tick(45);
    for (let i = 1; i <= 4; i++) {
      const side = await attr("data-target");
      const key = side === "-1" ? "ArrowLeft" : "ArrowRight";
      await page.keyboard.down(key); ev("press", { rep: i, side: +side, key });
      await tickUntil(async () => (await attr("data-reps")) === String(i), 300); ev("rep", { rep: i });
      await tick(11);
      await page.keyboard.up(key); ev("release", { rep: i });
      if (i < 4) await tickUntil(async () => (await attr("data-returning")) === "0", 300);
      ev("centered", { rep: i });
      await tick(6);
    }
    await tick(30);
  } else if (which === "g05") {
    await tick(36);
    for (let j = 1; j <= 3; j++) {
      const need = Number(await attr("data-need-charge"));
      const holdFrames = Math.max(4, Math.round(need * FPS));
      await page.keyboard.down("Space"); ev("press", { jump: j, need, holdFrames });
      await tick(holdFrames);
      await page.keyboard.up("Space"); ev("release", { jump: j });
      let landed = false;
      for (let k = 0; k < 90; k++) {
        await tick(1);
        const st = await attr("data-state");
        if (!landed && st !== "flying" && st !== "charging") { landed = true; ev("landed", { jump: j, state: st, last: await attr("data-last"), score: await attr("data-score") }); }
        if (landed && k > 30) break;
      }
      await tick(10);
    }
    await tick(20);
  }
  ev("end");
}
const sounds = await page.evaluate(() => window.__vt.sounds);
const audioT0 = await page.evaluate(() => window.__vt.audioT0);
const wav = await page.evaluate(() => window.__vt.audioWav());
if (wav) fs.writeFileSync(`${OUT}/game-audio.wav`, Buffer.from(wav, "base64"));
fs.writeFileSync(`${OUT}/events.json`, JSON.stringify({ game: which, fps: FPS, frames: frame, audioT0, events, sounds }, null, 1));
await b.close();
console.log("frames", frame, "audioT0", audioT0);
