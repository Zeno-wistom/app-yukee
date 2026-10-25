// 模型安装验证截图：同一场景、同一安装参数，任意机位（隐藏人物）。
import { chromium } from "playwright";
const OUT = "/workspace/work/hark-video-demo/docs/video-demo/model";
const b = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await b.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:5290/scene.html?w=1600&h=900");
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const d = await page.evaluate(() => window.__dims);
const T = d.monTop, F = d.monFront;
const views = {
  "01-front": [[0, T + 0.02, F + 0.5], [0, T + 0.015, F], 22],
  "02-side-section": [[1.6, T + 0.012, F - 0.02], [0, T + 0.012, F - 0.02], 3.6],
  "03-three-quarter": [[0.32, T + 0.14, F + 0.36], [0, T + 0.01, F - 0.02], 22],
  "04-rear": [[-0.3, T + 0.16, F - 0.42], [0, T + 0.0, F - 0.03], 24],
  "05-in-context": [[0.55, 1.28, 0.95], [0, 1.05, F], 34],
};
for (const [n, [p, t, fov]] of Object.entries(views)) {
  await page.evaluate(([p, t, fov]) => window.__renderCustom(170, p, t, fov, true), [p, t, fov]);
  const data = await page.evaluate(() => document.getElementById("c").toDataURL("image/png"));
  (await import("node:fs")).writeFileSync(`${OUT}/${n}.png`, Buffer.from(data.split(",")[1], "base64"));
  console.log(n);
}
await b.close();
