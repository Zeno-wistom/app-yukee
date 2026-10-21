import { test, expect } from "@playwright/test";

test.describe("Goal regression visual QA", () => {
  test("AFTER 1 · HOME safe area", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "开始体验" }).click();
    await expect(page.locator("main")).toHaveClass(/arrived/);
    await expect(page.getByTestId("lamp-home")).toBeVisible();
    await page.waitForTimeout(600);

    const portal = page.locator(".lamp-portal");
    const checked = page.locator(
      ".lamp-display, .lamp-home, .lamp-home-time, .day-matrix, .lamp-home-yukee .yukee-root, .lamp-home-actions",
    );
    const bounds = await Promise.all([
      portal.boundingBox(),
      ...(await checked.all()).map((item) => item.boundingBox()),
    ]);
    const frame = bounds[0];
    expect(frame).not.toBeNull();
    for (const box of bounds.slice(1)) {
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(frame!.x);
      expect(box!.y).toBeGreaterThanOrEqual(frame!.y);
      expect(box!.x + box!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(
        frame!.y + frame!.height,
      );
    }

    await page.screenshot({
      path: "docs/screenshots/regression-after-01-home.png",
    });

    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "弱提示" })
      .click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "weakReminder",
    );
    await page.waitForTimeout(850);
    await page.screenshot({
      path: "docs/screenshots/regression-after-02-weak-light.png",
    });

    await page.getByRole("button", { name: "继续工作", exact: true }).click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "focus",
    );
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "强提示" })
      .click();
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "strongReminder",
    );

    for (const [delay, name] of [
      [260, "03-strong-frame-a"],
      [460, "04-strong-frame-b"],
      [620, "05-strong-frame-c"],
    ] as const) {
      await page.waitForTimeout(delay);
      await page.screenshot({
        path: `docs/screenshots/regression-after-${name}.png`,
      });
    }

    const strongLamp = await page.locator(".lamp-portal").boundingBox();
    const strongYukee = await page
      .locator(".lamp-display.strongReminder .lamp-avatar .yukee-root")
      .boundingBox();
    expect(strongLamp).not.toBeNull();
    expect(strongYukee).not.toBeNull();
    expect(strongYukee!.y).toBeGreaterThanOrEqual(strongLamp!.y);
    expect(strongYukee!.y + strongYukee!.height).toBeLessThanOrEqual(
      strongLamp!.y + strongLamp!.height,
    );
  });

  test("AFTER 8–11 · complete reset and celebrate", async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto("/");
    await page.getByRole("button", { name: "开始体验" }).click();
    await expect(page.locator("main")).toHaveClass(/arrived/);
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动" })
      .click();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "calibration",
    );
    await page.keyboard.press("d");
    await page
      .getByRole("button", { name: "校准成功（跳过真实校准）" })
      .click();
    await page.keyboard.press("d");
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "yukeeRun",
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { __yukeeAudio: { bgmActive: boolean } })
              .__yukeeAudio.bgmActive,
        ),
      )
      .toBe(true);
    await page.evaluate(() => {
      const audio = (
        window as unknown as {
          __yukeeAudio: {
            sfx: (kind: "hit") => void;
          };
        }
      ).__yukeeAudio;
      audio.sfx("hit");
    });
    const readBgmGain = () =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __yukeeAudio: { bgmGain: GainNode };
            }
          ).__yukeeAudio.bgmGain.gain.value,
      );
    await page.waitForTimeout(40);
    const duckAttack = await readBgmGain();
    await page.waitForTimeout(140);
    const duckHold = await readBgmGain();
    await page.waitForTimeout(150);
    const duckRecovered = await readBgmGain();
    expect(duckAttack).toBeLessThanOrEqual(0.28);
    expect(duckHold).toBeLessThanOrEqual(0.28);
    expect(duckRecovered).toBeGreaterThan(0.45);
    await page.keyboard.press("d");
    await page.getByRole("button", { name: "直接完成游戏" }).click();
    await page.keyboard.press("d");
    await expect(page.locator("[data-phase]")).toHaveAttribute(
      "data-phase",
      "reward",
    );

    let celebrateElapsed = 0;
    for (const [targetTime, name] of [
      [160, "09-celebrate-frame-a"],
      [360, "10-celebrate-frame-b"],
      [520, "11-celebrate-frame-c"],
    ] as const) {
      await page.waitForTimeout(targetTime - celebrateElapsed);
      celebrateElapsed = targetTime;
      await page.screenshot({
        path: `docs/screenshots/regression-after-${name}.png`,
      });
      const transforms = await page
        .locator(".monitor-display.reward .reward-yukee")
        .evaluate((root) => ({
          expressive: getComputedStyle(
            root.querySelector<HTMLElement>(".yukee-motion")!,
          ).transform,
          follow: getComputedStyle(
            root.querySelector<HTMLElement>(".yukee-body-x")!,
          ).transform,
          mode: root.querySelector<HTMLElement>(".yukee-root")?.className ?? "",
        }));
      expect(transforms.mode).toContain("yukee-motion-mode-celebrate");
      expect(transforms.expressive).not.toBe("none");
      expect(
        transforms.follow === "none" ||
          transforms.follow === "matrix(1, 0, 0, 1, 0, 0)",
      ).toBe(true);
    }

    const lampFrame = await page.locator(".lamp-portal").boundingBox();
    const lampYukee = await page
      .locator(".lamp-display.reward .lamp-avatar .yukee-root")
      .boundingBox();
    expect(lampFrame).not.toBeNull();
    expect(lampYukee).not.toBeNull();
    expect(lampYukee!.y).toBeGreaterThanOrEqual(lampFrame!.y);
    expect(lampYukee!.y + lampYukee!.height).toBeLessThanOrEqual(
      lampFrame!.y + lampFrame!.height,
    );
  });

  test("AFTER 7 · GAME SELECT keeps old and new cards", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "开始体验" }).click();
    await expect(page.locator("main")).toHaveClass(/arrived/);
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动" })
      .click();
    await expect(page.getByTestId("lamp-selection")).toBeVisible();
    await page.waitForTimeout(120);
    await page.keyboard.press("ArrowRight");
    await expect(page.locator(".lamp-card.is-leaving")).toHaveCount(1);
    await expect(page.locator(".lamp-card.is-entering")).toHaveCount(1);
    await expect(page.locator(".lamp-card.is-leaving")).toContainText(
      "拾光跑者",
    );
    await expect(page.locator(".lamp-card.is-entering")).toContainText(
      "展翼接光",
    );
    await page.waitForTimeout(170);
    await page.screenshot({
      path: "docs/screenshots/regression-after-07-selection-transition.png",
    });
    await page.waitForTimeout(360);
    await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
      "data-card-id",
      "winglight",
    );

    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".lamp-card-stage")).toHaveAttribute(
      "data-transition-direction",
      "-1",
    );
    await expect(page.locator(".lamp-card.is-leaving")).toHaveCount(1);
    await expect(page.locator(".lamp-card.is-entering")).toHaveCount(1);
    await page.waitForTimeout(650);
    await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
      "data-card-id",
      "yukeeRun",
    );
  });

  test("GAME SELECT 逐帧保持真实旧卡与目标卡", async ({ page }) => {
    test.setTimeout(60_000);
    const captureAt = async (delay: number, name: string) => {
      await page.goto("/");
      await page.getByRole("button", { name: "开始体验" }).click();
      await expect(page.locator("main")).toHaveClass(/arrived/);
      await page
        .getByTestId("lamp-home")
        .getByRole("button", { name: "开始活动" })
        .click();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() =>
        Boolean(
          document.querySelector<HTMLElement>(".lamp-card-stage")?.dataset
            .transitionStartedAt,
        ),
      );
      await page.evaluate(async (targetDelay) => {
        const stage = document.querySelector<HTMLElement>(".lamp-card-stage");
        const startedAt = Number(
          stage?.dataset.transitionStartedAt ?? performance.now(),
        );
        const remaining = Math.max(
          0,
          startedAt + targetDelay - performance.now(),
        );
        await new Promise((resolve) => window.setTimeout(resolve, remaining));
      }, delay);
      // 先在同一帧原子读取，再截图；避免断言与截图本身的耗时把 550ms 推过 600ms 终点。
      const frame = await page.locator(".lamp-card-stage").evaluate((stage) => {
        const cards = [...stage.querySelectorAll<HTMLElement>(".lamp-card")];
        const read = (role: string) => {
          const card = cards.find((node) => node.dataset.cardRole === role);
          return card
            ? {
                text: card.textContent ?? "",
                opacity: Number(getComputedStyle(card).opacity),
              }
            : null;
        };
        return {
          count: cards.length,
          leaving: read("leaving"),
          entering: read("entering"),
        };
      });
      expect(frame.count).toBe(6);
      expect(frame.leaving?.text).toContain("拾光跑者");
      expect(frame.entering?.text).toContain("展翼接光");
      expect(frame.leaving?.opacity ?? 0).toBeGreaterThan(0.2);
      expect(frame.entering?.opacity ?? 0).toBeGreaterThan(0.2);
      await page.screenshot({
        path: `docs/screenshots/game-select-${name}.png`,
      });
    };

    await captureAt(20, "000ms");
    await captureAt(150, "150ms");
    await captureAt(300, "300ms");
    await captureAt(450, "450ms");
    await captureAt(550, "550ms");
    await page.waitForTimeout(100);
    await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
      "data-card-id",
      "winglight",
    );

    // 同一 transition 内的连续事件不会 restart；最多排队一个方向。
    // 从 winglight(1) 出发：三次按下 = 立即 +1，队列只保留最后一个方向再 +1
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(1320);
    await expect(page.locator(".lamp-card.is-current")).toHaveAttribute(
      "data-card-id",
      "moonwindVillage",
    );
  });
});
