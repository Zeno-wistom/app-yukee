// 复现 e2e 截图异常：headed + 完整提醒流程 → yukeeRun，分时刻量 stage 尺寸
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: false });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto("http://127.0.0.1:5173/");
  await page.waitForTimeout(4500);
  await page.getByRole("button", { name: "认识 yukee" }).click();
  await page.locator("main.arrived").waitFor();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: "体验一次提醒" }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "继续工作", exact: true }).click();
  await page.getByRole("button", { name: "稍后", exact: true }).click();
  await page.getByRole("button", { name: "开始活动", exact: true }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "准备好了" }).click();
  await page.waitForTimeout(700);
  await page.keyboard.press("d");
  await page.getByRole("button", { name: "校准成功（跳过真实校准）" }).click();
  await page.keyboard.press("d");
  await page.locator('[data-phase="yukeeRun"]').waitFor();
  for (const t of [1200, 3000, 8000]) {
    await page.waitForTimeout(t === 1200 ? 1200 : t === 3000 ? 1800 : 5000);
    const info = await page.evaluate(() => {
      const m = document.querySelector(".monitor-portal").getBoundingClientRect();
      const s = document.querySelector(".yukee-stage")?.getBoundingClientRect();
      const hud = document.querySelector(".yukee-hud-top")?.getBoundingClientRect();
      const vis = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), op: cs.opacity, vis: cs.visibility };
      };
      return {
        portal: { w: Math.round(m.width), h: Math.round(m.height) },
        stage: vis(document.querySelector(".yukee-stage")),
        hudTop: vis(document.querySelector(".yukee-hud-top")),
        content: vis(document.querySelector(".screen-content")),
      };
    });
    console.log(`t=${t}:`, JSON.stringify(info));
  }
  await page.screenshot({ path: "docs/screenshots/repro-headed.png" });
} finally {
  await browser.close();
}
