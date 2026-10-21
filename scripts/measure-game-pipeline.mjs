// 真实管线端到端测量：真实校准 → Yukee Run（摄像头体感）→ 游戏期间推理 FPS
// 前提：摄像头前有人脸且大致静止 ~1.5 秒以完成真实校准
import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--use-fake-ui-for-media-stream"],
});
try {
  const page = await (await browser.newContext()).newPage();
  page.on("pageerror", (e) => console.error("PAGE ERROR:", e.message));
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "认识 yukee" }).click();
  await page.locator("main.arrived").waitFor();
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.getByRole("button", { name: "准备好了" }).click();
  await page.bringToFront();
  console.log("已进入真实校准，等待人脸稳定…");
  const phase = page.locator("[data-phase]");
  try {
    await expect(phase).toHaveAttribute("data-phase", "yukeeRun", {
      timeout: 40000,
    });
  } catch {
    console.log("40 秒内未完成真实校准（摄像头前可能无人/不稳），退出");
    const cal = await page.getByTestId("calibration-view").innerText();
    console.log("校准视图状态:", cal.replace(/\n+/g, " | "));
    await browser.close();
    process.exit(0);
  }
  console.log("真实校准完成，已进入 Yukee Run（摄像头体感模式）");
  const mode = await page.locator(".yukee-mode").innerText();
  console.log("输入模式:", mode);
  // 打开调试面板读取 VisionStats
  await page.keyboard.press("d");
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(2500);
    const stats = await page.locator(".vision-stats").innerText();
    const hud = await page.locator(".head-hud i.on").allInnerTexts();
    console.log(`t=${(i + 1) * 2.5}s | ${stats} | HUD方向=${hud.join(",") || "center"}`);
  }
  const fps = await page.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
          else res(((n / (performance.now() - t0)) * 1000).toFixed(1));
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log("游戏期间页面 rAF FPS:", fps);
  console.log("最终相位:", await phase.getAttribute("data-phase"));
} finally {
  await browser.close();
}
import { expect } from "@playwright/test";
