import { test, expect } from "@playwright/test";
import { demo, jump } from "./helpers";
test("窄屏三款结算完整、文字可读、返回按钮可用（演示输入）", async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  for (const index of [1, 2, 3]) {
    await demo(page, index);
    if (index === 1) for (let i = 1; i <= 5; i++) {
      await page.keyboard.down("Space"); await expect(page.getByTestId("winglight")).toHaveAttribute("data-charged", "1");
      await page.keyboard.up("Space"); await expect(page.getByTestId("winglight")).toHaveAttribute("data-reps", String(i)); await page.waitForTimeout(500);
    }
    if (index === 2) for (let i = 1; i <= 6; i++) {
      const game = page.getByTestId("lean-surf"), key = await game.getAttribute("data-target") === "-1" ? "ArrowLeft" : "ArrowRight";
      await page.keyboard.down(key); await expect(game).toHaveAttribute("data-reps", String(i)); await page.keyboard.up(key);
      if (i < 6) await expect(game).toHaveAttribute("data-returning", "0");
    }
    if (index === 3) for (let i = 1; i <= 5; i++) { await jump(page); await expect(page.getByTestId("squat-jump")).toHaveAttribute("data-jumps", String(i)); }
    const result = page.getByTestId(index === 1 ? "wing-complete" : index === 2 ? "lean-complete" : "squat-clear");
    await expect(result).toBeVisible(); await page.waitForTimeout(1700);
    const r = await result.boundingBox(); expect(r!.x).toBeGreaterThanOrEqual(0); expect(r!.y).toBeGreaterThanOrEqual(60);
    expect(r!.x + r!.width).toBeLessThanOrEqual(391); expect(r!.y + r!.height).toBeLessThanOrEqual(844);
    expect(r!.width).toBeGreaterThanOrEqual(330);
    if (index === 2) {
      const contrast = await result.locator("button.quiet").evaluate(el => {
        const style = getComputedStyle(el);
        const luminance = (color: string) => {
          const values = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    }
    await page.screenshot({ path: `docs/screenshots/final-polish/mobile-result-${index}.png` });
    await result.getByRole("button", { name: "返回游戏选择", exact: true }).click(); await expect(page.getByTestId("game-selection")).toBeVisible();
  }
});
