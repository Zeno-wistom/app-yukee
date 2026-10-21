// 布局诊断：检查 Yukee Run 各容器实际尺寸
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "认识 yukee" }).click();
  await page.locator("main.arrived").waitFor();
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.getByRole("button", { name: "准备好了" }).click();
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.locator('[data-phase="yukeeRun"]').waitFor();
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { w: Math.round(r.width), h: Math.round(r.height), display: cs.display, flex: cs.flex, height: cs.height };
    };
    return {
      portal: pick(".monitor-portal"),
      display: pick(".monitor-display"),
      content: pick(".screen-content"),
      run: pick(".yukee-run"),
      hudTop: pick(".yukee-hud-top"),
      stage: pick(".yukee-stage"),
      canvas: pick(".yukee-stage canvas"),
      hudBottom: pick(".yukee-hud-bottom"),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "docs/screenshots/debug-yukeerun.png" });
} finally {
  await browser.close();
}
