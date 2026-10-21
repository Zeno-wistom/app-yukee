// 融球分裂转场性能测量：调试旁路触发 YukeeCast，测量转场期间页面 rAF FPS
// 用法：先启动 dev server（npm run dev），再运行 node scripts/measure-cast-fps.mjs
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "开始体验" }).click();
  await page.locator("main.arrived").waitFor();
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.getByRole("button", { name: "准备好了" }).click();
  // 调试旁路跳过真实校准
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await page.getByTestId("yukee-cast").waitFor({ state: "visible" });

  // 转场全程（约 2.3s）逐帧测量
  const result = await page.evaluate(
    () =>
      new Promise((res) => {
        const frames = [];
        let last = performance.now();
        const t0 = last;
        const loop = (now) => {
          frames.push(now - last);
          last = now;
          if (now - t0 < 2600) requestAnimationFrame(loop);
          else {
            const sorted = [...frames].sort((a, b) => a - b);
            res({
              fps: ((frames.length / (now - t0)) * 1000).toFixed(1),
              frames: frames.length,
              avgMs: (sorted.reduce((a, b) => a + b, 0) / sorted.length).toFixed(2),
              p95Ms: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
              worstMs: sorted[sorted.length - 1].toFixed(2),
              dropped: frames.filter((f) => f > 33).length, // 掉帧（<30fps 的帧）
            });
          }
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log("转场期间页面 rAF：", JSON.stringify(result, null, 2));
  await page.screenshot({ path: "docs/screenshots/v4-cast-fps-end.png" });
} finally {
  await browser.close();
}
