// Yukee 视觉验收：headed Chrome 走完整角色弧线并逐段截图
// 正常工作 → 三级提醒 → 投屏 → 游戏 → 完成 → 返回挂灯
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: false });
try {
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.screenshot({ path: "docs/screenshots/yukee-00-home.png" });

  // 进入体验 → 正常工作（calm + 办公场景）
  await page.getByRole("button", { name: "认识 Yukee" }).click();
  await page.locator("main.arrived").waitFor();
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "docs/screenshots/yukee-01-focus-calm.png" });

  // 三级提醒情绪
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "docs/screenshots/yukee-02-weak-attentive.png" });
  await page.getByRole("button", { name: "继续工作", exact: true }).click();
  await page.locator('[data-phase="focus"]').waitFor();
  await page.locator('[data-phase="secondaryReminder"]').waitFor();
  await page.waitForTimeout(1400);
  await page.screenshot({
    path: "docs/screenshots/yukee-03-secondary-concerned.png",
  });
  await page.getByRole("button", { name: "稍后", exact: true }).click();
  await page.locator('[data-phase="focus"]').waitFor();
  await page.locator('[data-phase="strongReminder"]').waitFor();
  await page.waitForTimeout(1400);
  await page.screenshot({
    path: "docs/screenshots/yukee-04-strong-anxious.png",
  });

  // 开始活动 → 投屏动画（中段截帧）
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "准备好了" }).click();
  await page.waitForTimeout(750); // 滑入中段
  await page.screenshot({ path: "docs/screenshots/yukee-05-cast-mid.png" });
  await page.locator('[data-phase="calibration"]').waitFor();
  await page.waitForTimeout(1200); // ripple + 到达展开
  await page.screenshot({ path: "docs/screenshots/yukee-06-calibration.png" });

  // 调试旁路进游戏
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await page.locator('[data-phase="yukeeRun"]').waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "docs/screenshots/yukee-07-game-playful.png" });

  // 游戏事件 → Yukee success 反馈
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "↑ 抬头=跳" }).click();
  await page.keyboard.press("d");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "docs/screenshots/yukee-08-game-success.png" });

  // 直接完成 → 奖励 celebrate
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "直接完成游戏" }).click();
  await page.keyboard.press("d");
  await page.locator('[data-phase="reward"]').waitFor();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "docs/screenshots/yukee-09-reward-celebrate.png" });

  // 返回挂灯（反向投屏）
  await page.getByRole("button", { name: "回到专注" }).click();
  await page.waitForTimeout(800); // 回程中段
  await page.screenshot({ path: "docs/screenshots/yukee-10-cast-back.png" });
  await page.locator('[data-phase="focus"]').waitFor();
  await page.waitForTimeout(1400); // Yukee 已在挂灯恢复
  await page.screenshot({ path: "docs/screenshots/yukee-11-back-calm.png" });

  console.log("errors:", JSON.stringify(errors));
} finally {
  await browser.close();
}
