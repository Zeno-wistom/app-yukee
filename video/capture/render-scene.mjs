// 逐帧渲染三维场景（SwiftShader 软件 WebGL，离线确定性，不受实时帧率影响）。
// 用法：node render-scene.mjs <outDir> <from> <to> [cam] [w] [h]
import { chromium } from "playwright";
import fs from "node:fs";
const [out, from, to, cam = "", w = "1920", h = "1080", list = ""] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await b.newPage({ viewport: { width: +w, height: +h } });
page.on("pageerror", (e) => console.log("[err]", e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("[page]", m.text().slice(0, 200)); });
await page.goto(`http://127.0.0.1:5290/scene.html?w=${w}&h=${h}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const frames = list ? list.split(",").map(Number) : Array.from({ length: +to - +from }, (_, i) => +from + i);
const t0 = Date.now();
for (const f of frames) {
  const p = `${out}/${String(f).padStart(5, "0")}.jpg`;
  if (fs.existsSync(p) && !list) continue;
  await page.evaluate(([f, cam]) => window.__renderFrame(f, cam || undefined), [f, cam]);
  const data = await page.evaluate(() => document.getElementById("c").toDataURL("image/jpeg", 0.93));
  fs.writeFileSync(p, Buffer.from(data.split(",")[1], "base64"));
}
console.log("rendered", frames.length, "in", ((Date.now() - t0) / 1000).toFixed(1), "s");
await b.close();
