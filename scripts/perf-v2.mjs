// 性能对比（生产构建，本沙箱：2 vCPU、软件渲染，绝对值不代表用户电脑，只看同条件前后差）
// 指标：CDP Performance 每秒主线程 Script/Layout/Style/Task 耗时、RAF 帧间隔 P50/P95、>50ms 长任务。
// 用法：node scripts/perf-v2.mjs <label> <baseURL> [w] [h]
import { chromium } from "@playwright/test";
import fs from "node:fs";
const [label, base, W = "1920", H = "1080"] = process.argv.slice(2);
const out = "docs/final-polish-v2/perf";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const cdp = await page.context().newCDPSession(page);
await cdp.send("Performance.enable");
await page.addInitScript(() => {
  const w = window;
  w.__frames = [];
  w.__long = [];
  const loop = (t) => { w.__frames.push(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(e.duration); }).observe({ type: "longtask", buffered: true }); } catch {}
});
const metrics = async () => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]));
async function sample(name, ms, action) {
  await page.evaluate(() => { window.__frames = []; window.__long = []; });
  const a = await metrics();
  const t0 = Date.now();
  if (action) await action();
  const rest = ms - (Date.now() - t0);
  if (rest > 0) await page.waitForTimeout(rest);
  const b = await metrics();
  const secs = (Date.now() - t0) / 1000;
  const { frames, long } = await page.evaluate(() => ({ frames: window.__frames, long: window.__long }));
  const iv = frames.slice(1).map((t, i) => t - frames[i]).sort((x, y) => x - y);
  const q = (f) => (iv.length ? +iv[Math.min(iv.length - 1, Math.floor(f * (iv.length - 1)))].toFixed(1) : 0);
  const per = (k) => +(((b[k] - a[k]) * 1000) / secs).toFixed(1); // ms per second
  return { name, secs: +secs.toFixed(2), scriptMsPerS: per("ScriptDuration"), layoutMsPerS: per("LayoutDuration"), styleMsPerS: per("RecalcStyleDuration"), taskMsPerS: per("TaskDuration"), rafP50: q(0.5), rafP95: q(0.95), over33: iv.filter((x) => x > 33.4).length, long50: long.length, longMax: long.length ? Math.round(Math.max(...long)) : 0, layouts: b.LayoutCount - a.LayoutCount, styles: b.RecalcStyleCount - a.RecalcStyleCount };
}
const games = [["拾光跑者", "calibration-view", "yukee-run"], ["展翼接光", "wing-calibration", "winglight"], ["星海冲浪", "lean-calibration", "lean-surf"], ["浅蹲跳一跳", "squat-calibration", "squat-jump"]];
const rows = [];
await page.goto(base + "/");
await page.getByTestId("game-selection").waitFor();
await page.waitForTimeout(2000);
rows.push(await sample("选择页空闲", 3000));
rows.push(await sample("切卡 ×4", 3200, async () => { for (let i = 0; i < 4; i++) { await page.getByRole("button", { name: "下一款游戏", exact: true }).click(); await page.waitForTimeout(700); } }));
for (const [title, cal, test] of games) {
  await page.getByRole("button", { name: `查看${title}`, exact: true }).click();
  await page.waitForTimeout(800);
  rows.push(await sample(`${test} 进入转场`, 1500, async () => { await page.getByRole("button", { name: "进入游戏", exact: true }).click(); await page.getByTestId(cal).waitFor(); }));
  await page.getByRole("button", { name: /键盘演示/ }).click();
  await page.getByTestId(test).waitFor();
  await page.waitForTimeout(1500);
  rows.push(await sample(`${test} 游戏空闲`, 4000));
  rows.push(await sample(`${test} 暂停→退出`, 1600, async () => {
    await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
    await page.getByTestId("session-dialog").waitFor();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
    await page.getByTestId("game-selection").waitFor();
  }));
  await page.waitForTimeout(800);
}
await browser.close();
fs.writeFileSync(`${out}/${label}-${W}x${H}.json`, JSON.stringify(rows, null, 1));
console.log(`# ${label} ${W}x${H}`);
for (const r of rows) console.log(`${r.name.padEnd(20)} script ${String(r.scriptMsPerS).padStart(6)} layout ${String(r.layoutMsPerS).padStart(5)} style ${String(r.styleMsPerS).padStart(5)} task ${String(r.taskMsPerS).padStart(6)} ms/s | raf p50 ${r.rafP50} p95 ${r.rafP95} >33ms ${r.over33} | long ${r.long50} max ${r.longMax}`);
