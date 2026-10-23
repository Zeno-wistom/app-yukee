// 布局审计：四个桌面视口 × 选择页 + 四款游戏（键盘演示）。
// 记录整页/根容器溢出、导致溢出的元素、游戏画布与舞台尺寸，并截图。
// 用法：node scripts/audit-layout-v2.mjs <label> [baseURL]
import { chromium } from "@playwright/test";
import fs from "node:fs";
const label = process.argv[2] || "now";
const base = process.argv[3] || "http://127.0.0.1:5188";
const out = `docs/final-polish-v2/${label}`;
fs.mkdirSync(out, { recursive: true });
const sizes = process.env.SIZES ? JSON.parse(process.env.SIZES) : [[1280, 720], [1366, 768], [1920, 1080], [2560, 1440]];
const onlySel = !!process.env.ONLY_SEL;
const games = [
  ["yukeeRun", "拾光跑者", "yukee-run", "calibration-view"],
  ["winglight", "展翼接光", "winglight", "wing-calibration"],
  ["leanSurf", "星海冲浪", "lean-surf", "lean-calibration"],
  ["squatJump", "浅蹲跳一跳", "squat-jump", "squat-calibration"],
];
const measure = (page) =>
  page.evaluate(() => {
    const de = document.documentElement;
    const app = document.querySelector(".arcade-app");
    const vw = innerWidth, vh = innerHeight;
    const over = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && cs.visibility === "hidden") continue;
      if (r.bottom > vh + 1 || r.right > vw + 1) {
        // 只记录被父级裁剪之外仍可见的外层元素
        let p = el.parentElement, clipped = false;
        while (p && p !== document.body) {
          const pc = getComputedStyle(p);
          if (/(hidden|clip)/.test(pc.overflow + pc.overflowY + pc.overflowX) && p !== app) {
            const pr = p.getBoundingClientRect();
            if (pr.bottom <= vh + 1 && pr.right <= vw + 1) { clipped = true; break; }
          }
          p = p.parentElement;
        }
        if (!clipped) over.push({ el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 2).join(".") : "") + (el.dataset.testid ? `[${el.dataset.testid}]` : ""), bottom: Math.round(r.bottom), right: Math.round(r.right) });
      }
    }
    const canvas = [...document.querySelectorAll("main canvas, .arcade-app canvas")].map((c) => {
      const r = c.getBoundingClientRect();
      return { cls: c.className, css: [Math.round(r.width), Math.round(r.height)], buf: [c.width, c.height], x: Math.round(r.x), y: Math.round(r.y) };
    }).filter((c) => c.css[0] > 50);
    const sel = document.querySelector(".selection-screen");
    const clip = sel ? [sel.scrollHeight, sel.clientHeight] : null;
    const card = document.querySelector(".selection-active");
    const cardClip = card ? [card.scrollHeight, card.clientHeight] : null;
    const stage = document.querySelector("main");
    const sr = stage?.getBoundingClientRect();
    return {
      vw, vh,
      docScroll: [de.scrollWidth, de.scrollHeight],
      bodyScroll: [document.body.scrollWidth, document.body.scrollHeight],
      appScroll: app ? [app.scrollWidth, app.scrollHeight, app.clientWidth, app.clientHeight] : null,
      scrollbarW: app ? app.offsetWidth - app.clientWidth : 0,
      pageScrolls: de.scrollHeight > vh + 1 || de.scrollWidth > vw + 1 || (app ? app.scrollHeight > app.clientHeight + 1 || app.scrollWidth > app.clientWidth + 1 : false),
      over: over.slice(0, 8),
      stage: sr ? [Math.round(sr.x), Math.round(sr.y), Math.round(sr.width), Math.round(sr.height)] : null,
      canvas, clip, cardClip,
    };
  });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const report = {};
for (const [w, h] of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto(base + "/");
  await page.getByTestId("game-selection").waitFor();
  await page.waitForTimeout(1600);
  const key = `${w}x${h}`;
  report[key] = { selection: await measure(page) };
  await page.screenshot({ path: `${out}/selection-${w}x${h}.png` });
  for (const [id, title, test, cal] of onlySel ? [] : games) {
    await page.getByRole("button", { name: `查看${title}`, exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "进入游戏", exact: true }).click();
    await page.getByTestId(cal).waitFor();
    await page.waitForTimeout(900);
    report[key][`${id}-cal`] = await measure(page);
    await page.getByRole("button", { name: /键盘演示/ }).click();
    await page.getByTestId(test).waitFor();
    await page.waitForTimeout(1500);
    report[key][id] = await measure(page);
    await page.screenshot({ path: `${out}/${id}-${w}x${h}.png` });
    await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
    await page.getByTestId("session-dialog").waitFor();
    await page.waitForTimeout(400);
    if (w === 1920) await page.screenshot({ path: `${out}/${id}-pause-${w}.png` });
    report[key][`${id}-pause`] = await measure(page);
    await page.getByRole("button", { name: "退出并返回选择", exact: true }).click();
    await page.getByTestId("game-selection").waitFor();
    await page.waitForTimeout(800);
  }
  await page.close();
}
await browser.close();
fs.writeFileSync(`${out}/layout.json`, JSON.stringify(report, null, 1));
for (const [k, v] of Object.entries(report)) {
  for (const [s, m] of Object.entries(v)) {
    const c = m.canvas[0];
    console.log(`${k} ${s.padEnd(16)} scroll=${m.pageScrolls ? "YES" : "no "} app=${m.appScroll?.join("/")} sb=${m.scrollbarW} stage=${m.stage?.join(",")} canvas=${c ? c.css.join("x") + "@" + c.x + "," + c.y : "-"} selClip=${m.clip?.join('/')} card=${m.cardClip?.join('/')} over=${m.over.map((o) => o.el + ":" + o.bottom).join(" ").slice(0, 160)}`);
  }
}
