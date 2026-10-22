/** 独立生产构建审计。只用键盘演示；帧率不代表真人摄像头性能。 */
import { chromium } from "@playwright/test";
import { mkdir, readdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
const url = process.env.YUKEE_PRODUCTION_URL || "http://127.0.0.1:5189";
const out = "docs/screenshots/final-polish";
await mkdir(out, { recursive: true });
const runtimeFiles = [];
async function inventory(dir, base = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = `${base}/${entry.name}`;
    if (entry.isDirectory()) await inventory(path.join(dir, entry.name), rel);
    else if (!entry.name.endsWith(".md")) runtimeFiles.push(rel);
  }
}
await inventory("dist");
const assets = [];
for (const file of runtimeFiles) {
  const response = await fetch(url + file);
  const bytes = (await response.arrayBuffer()).byteLength;
  const expected = (await stat(path.join("dist", file))).size;
  if (!response.ok || bytes !== expected) throw new Error(`Production asset mismatch: ${file} ${response.status} ${bytes}/${expected}`);
  assets.push({ file, status: response.status, bytes });
}
const browser = await chromium.launch({ channel: "chrome" });
const metrics = [], errors = [], external = [], layouts = [];
const games = [["yukeeRun", "拾光跑者"], ["winglight", "展翼接光"], ["leanSurf", "星海冲浪"], ["squatJump", "浅蹲跳一跳"]];
try {
  for (const [dpr, cpu] of [[1, 1], [2, 4]]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: dpr });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    await page.route("**/*", route => {
      if (new URL(route.request().url()).origin !== url) { external.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Benchmark uses keyboard only", "NotAllowedError"); };
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    await page.goto(url);
    await page.getByRole("button", { name: "查看浅蹲跳一跳", exact: true }).click();
    await page.getByRole("button", { name: "进入游戏", exact: true }).waitFor({ state: "visible" });
    await page.waitForTimeout(500);
    if (dpr === 1) {
      for (const [width, height] of [[1280,720], [1366,768], [1920,1080], [2560,1440], [390,844]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        await page.screenshot({ path: `${out}/production-selection-${width}.png` });
        layouts.push(await page.getByTestId("selection-preview").evaluate((el, viewport) => {
          const r = el.getBoundingClientRect(), img = el.querySelector("img:not([hidden])"), i = img.getBoundingClientRect();
          return { viewport, width: r.width, height: r.height, imageWidth: i.width, imageHeight: i.height };
        }, `${width}x${height}`));
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
    layouts.push(await page.getByTestId("selection-preview").evaluate(el => {
      const r = el.getBoundingClientRect(), img = el.querySelector("img:not([hidden])"), caption = el.querySelector(".selection-preview-caption");
      return { width: r.width, height: r.height, fit: getComputedStyle(img).objectFit, position: getComputedStyle(img).objectPosition,
        captionFraction: caption.getBoundingClientRect().width / r.width, source: img.getAttribute("src"), naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
    }));
    for (const [id, title] of games) {
      await page.getByRole("button", { name: `查看${title}`, exact: true }).click();
      await page.getByRole("button", { name: "进入游戏", exact: true }).click();
      await page.getByRole("button", { name: /键盘演示/ }).click();
      await page.getByRole("button", { name: "暂停游戏", exact: true }).waitFor();
      await page.waitForTimeout(1500);
      const frameTimes = await page.evaluate(() => new Promise(resolve => {
        const values = []; let start = 0, last = 0;
        const frame = now => { if (!start) start = last = now; else { values.push(now - last); last = now; }
          if (now - start >= 2200) resolve(values); else requestAnimationFrame(frame); };
        requestAnimationFrame(frame);
      }));
      const sorted = [...frameTimes].sort((a,b)=>a-b), elapsed = frameTimes.reduce((a,b)=>a+b,0);
      metrics.push({ id, source: "keyboard-demo", viewport: "1920x1080", dpr, cpuThrottling: cpu, sampleMs: elapsed,
        rafFps: +(frameTimes.length / elapsed * 1000).toFixed(2), p95Ms: +sorted[Math.floor(sorted.length*.95)].toFixed(2),
        framesOver33ms: frameTimes.filter(t=>t>33.4).length });
      await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
      await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
    }
    await context.close();
  }
} finally { await browser.close(); }
if (errors.length || external.length) throw new Error(JSON.stringify({ errors, external }));
const result = { testedAt: new Date().toISOString(), url, browser: "Chrome", evidence: "D keyboard-demo; no human camera test", assets, layouts, metrics, errors, external };
await writeFile(`${out}/production-audit.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ assets: assets.length, metrics, layouts, errors, external }, null, 2));
