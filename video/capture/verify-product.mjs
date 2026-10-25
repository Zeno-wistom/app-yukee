// 产品材质验收：正面 / 顶部 / 两侧 / 背面 / 摄像头特写，以及三种光照（暖白、提醒粉紫、傍晚侧光）。隐藏人物。
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = "/workspace/work/hark-video-demo/docs/video-final/product";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5290/scene.html?w=1600&h=900");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const d = await page.evaluate(() => window.__dims);
const T = d.monTop, F = d.monFront, C = [0, T + 0.012, F - 0.02];
const views = {
  "01-front-warm": [60, [0, T + 0.03, F + 0.62], C, 24],
  "02-top": [60, [0.02, T + 0.5, F - 0.01], C, 30],
  "03-left-side": [60, [-0.75, T + 0.04, F - 0.02], C, 14],
  "04-right-side": [60, [0.75, T + 0.04, F - 0.02], C, 14],
  "05-back": [60, [0.12, T + 0.18, F - 0.6], C, 24],
  "06-camera-closeup": [60, [0.05, T + 0.03, F + 0.16], [0.055, T + 0.028, F - 0.01], 22],
  "07-front-reminder-pink": [395, [-0.22, T + 0.02, F + 0.5], C, 26],
  "08-front-late-sunlight": [1300, [0.25, T + 0.05, F + 0.55], C, 26],
};
for (const [n, [f, p, t, fov]] of Object.entries(views)) {
  await page.evaluate(([f, p, t, fov]) => window.__renderCustom(f, p, t, fov, true), [f, p, t, fov]);
  const data = await page.evaluate(() => document.getElementById("c").toDataURL("image/jpeg", 0.93));
  fs.writeFileSync(`${OUT}/${n}.jpg`, Buffer.from(data.split(",")[1], "base64"));
  console.log(n);
}
await b.close();
