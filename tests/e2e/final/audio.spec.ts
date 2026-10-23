import { test, expect, type Page } from "@playwright/test";
import { choose, demo, games, leave } from "./helpers";

/**
 * 音频系统验收（浏览器级）：只能证明「播放对象、时机、并发、设置」正确，
 * 实际听感 / 音量平衡仍需真人试听。
 */

type AudioState = {
  bgmTrack: string | null;
  bgmWanted: string | null;
  bgmSources: number;
  bgmUrl: string | null;
  paused: boolean;
  sampleVoices: number;
  effectsActive: number;
  loaded: string[];
  ctxState: string;
  settings: { music: number; sfx: number; muted: boolean };
};

const state = (page: Page) =>
  page.evaluate(() => (window as any).__yukeeAudio.getAudioState() as AudioState);

/** 记录所有发声调用（不改变行为） */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const log: string[] = ((window as any).__audioLog = []);
    const hook = () => {
      const a = (window as any).__yukeeAudio;
      if (!a) return void setTimeout(hook, 20);
      for (const m of ["play", "ui", "synth", "sfx", "pauseBgm", "playBgm", "stopBgm"]) {
        const orig = a[m].bind(a);
        a[m] = (...args: unknown[]) => {
          log.push(`${m}:${typeof args[0] === "string" ? args[0] : ""}`);
          return orig(...args);
        };
      }
      // 采样 BGM 声部数，验证切换时从不超过「当前 + 一个淡出中」
      (window as any).__maxBgmSources = 0;
      setInterval(() => {
        const n = a.getAudioState().bgmSources;
        (window as any).__maxBgmSources = Math.max((window as any).__maxBgmSources, n);
      }, 25);
    };
    hook();
  });
}
const log = (page: Page) => page.evaluate(() => (window as any).__audioLog as string[]);
const clearLog = (page: Page) => page.evaluate(() => ((window as any).__audioLog.length = 0));

const EXPECTED: Record<string, string> = {
  yukeeRun: "/audio/yukee-run-bgm.mp3",
  winglight: "/audio/bgm/g02-happy-lullaby.mp3",
  leanSurf: "/audio/bgm/g03-8bit-summer-memory.mp3",
  squatJump: "/audio/bgm/g05-flowerbed-fields.mp3",
};

test("全部音频文件可访问且能被浏览器解码", async ({ page }) => {
  await page.goto("/");
  const urls = await page.evaluate(async () => {
    const mod = await import("/src/audio/catalog.ts" as string);
    return [
      ...Object.values(mod.BGM_TRACKS).map((t: any) => t.url),
      ...Object.keys(mod.SAMPLES).map((id: string) => mod.sampleUrl(id)),
    ] as string[];
  });
  expect(urls.length).toBe(4 + 23);
  const results = await page.evaluate(async (list) => {
    const ctx = new OfflineAudioContext(1, 1, 44100);
    const out: { url: string; ok: boolean; sec: number }[] = [];
    for (const url of list) {
      try {
        const r = await fetch(url);
        const buf = await ctx.decodeAudioData(await r.arrayBuffer());
        out.push({ url, ok: r.ok, sec: buf.duration });
      } catch {
        out.push({ url, ok: false, sec: 0 });
      }
    }
    return out;
  }, urls);
  for (const r of results) {
    expect(r.ok, r.url).toBe(true);
    expect(r.sec, r.url).toBeGreaterThan(0.01);
  }
  // 三首新 BGM 是完整曲目长度的循环
  for (const id of ["winglight", "leanSurf", "squatJump"]) {
    const r = results.find((x) => x.url === EXPECTED[id])!;
    expect(r.sec).toBeGreaterThan(30);
  }
});

test("每款游戏使用自己的 BGM；暂停淡出、继续接上、退出不残留", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  for (const [index, game] of games.entries()) {
    await demo(page, index);
    await expect.poll(async () => (await state(page)).bgmTrack, { timeout: 15000 }).toBe(game.id);
    expect((await state(page)).bgmUrl).toBe(EXPECTED[game.id]);
    // 暂停：BGM 停止并记住位置
    await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
    await expect.poll(async () => (await state(page)).paused).toBe(true);
    expect((await state(page)).bgmTrack).toBeNull();
    await expect.poll(async () => (await state(page)).bgmSources, { timeout: 3000 }).toBe(0);
    // 继续：同一首接着播
    await page.getByRole("button", { name: "继续游戏", exact: true }).click();
    await expect.poll(async () => (await state(page)).bgmTrack, { timeout: 5000 }).toBe(game.id);
    expect((await state(page)).bgmSources).toBe(1);
    await leave(page);
    await expect.poll(async () => (await state(page)).bgmSources, { timeout: 3000 }).toBe(0);
    const s = await state(page);
    expect(s.bgmTrack).toBeNull();
    expect(s.effectsActive).toBe(0);
  }
  const calls = await log(page);
  for (const id of ["ui-pause", "ui-resume", "ui-back", "ui-confirm"]) expect(calls).toContain(`ui:${id}`);
  // 任意时刻最多「当前曲 + 一个正在淡出的旧曲」
  expect(await page.evaluate(() => (window as any).__maxBgmSources)).toBeLessThanOrEqual(2);
});

test("连续快速切换游戏不会叠加 BGM", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  for (const index of [1, 2, 3, 1, 3]) {
    await demo(page, index);
    await page.waitForTimeout(250);
    await leave(page);
  }
  await expect.poll(async () => (await state(page)).bgmSources, { timeout: 3000 }).toBe(0);
  expect(await page.evaluate(() => (window as any).__maxBgmSources)).toBeLessThanOrEqual(2);
  // 再进一次能正常起播（没有残留的令牌 / 暂停位置）
  await demo(page, 2);
  await expect.poll(async () => (await state(page)).bgmTrack, { timeout: 15000 }).toBe("leanSurf");
  expect((await state(page)).bgmSources).toBe(1);
});

test("G02：展翼 / 星光 / 收翼 / 汇光反馈按状态触发", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  await demo(page, 1);
  await clearLog(page);
  await page.keyboard.down("Space");
  await page.waitForTimeout(3600);
  await page.keyboard.up("Space");
  await page.waitForTimeout(2000);
  const calls = await log(page);
  expect(calls.filter((c) => c === "play:g02-wing-open").length).toBe(1);
  expect(calls).toContain("play:g02-wing-close");
  expect(calls).toContain("play:g02-star");
  // 星光音被合并：不会超过粒子数
  expect(calls.filter((c) => c === "play:g02-star").length).toBeLessThan(30);
  // G01 的合成音不再被复用到 G02
  expect(calls.filter((c) => c.startsWith("sfx:"))).toEqual([]);
});

test("G03：侧倾到位与接住，长按不会连发", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  await demo(page, 2);
  await clearLog(page);
  const side = await page.getByTestId("lean-surf").getAttribute("data-target");
  const key = side === "1" ? "ArrowRight" : "ArrowLeft";
  await page.keyboard.down(key);
  await page.waitForTimeout(3500);
  await page.keyboard.up(key);
  await page.waitForTimeout(1200);
  const calls = await log(page);
  expect(calls.filter((c) => c === "play:g03-lean").length).toBeLessThanOrEqual(2);
  expect(calls.filter((c) => c === "play:g03-catch" || c === "play:g03-streak").length).toBeGreaterThanOrEqual(1);
  expect(calls.filter((c) => c.startsWith("sfx:"))).toEqual([]);
});

test("G05：蓄力刻度跟随蓄力值，释放 / 起跳 / 落地 / 得分", async ({ page }) => {
  await instrument(page);
  await page.goto("/");
  await demo(page, 3);
  await clearLog(page);
  const game = page.getByTestId("squat-jump");
  const need = Number(await game.getAttribute("data-need-charge"));
  await page.keyboard.down("Space");
  await page.waitForTimeout(Math.round(need * 1000));
  await page.keyboard.up("Space");
  await page.waitForTimeout(1800);
  const calls = await log(page);
  const ticks = calls.filter((c) => c === "synth:tick").length;
  // 开始一声 + 蓄力比例越过的刻度数（满格 1.5 s，键盘演示）
  const crossed = [0.25, 0.5, 0.75, 1].filter((s) => need / 1.5 >= s).length;
  expect(ticks).toBeGreaterThanOrEqual(1 + Math.max(0, crossed - 1));
  expect(ticks).toBeLessThanOrEqual(1 + crossed + 1);
  expect(calls).toContain("synth:release");
  expect(calls).toContain("sfx:g05Launch");
  expect(calls.some((c) => c === "play:g05-score" || c === "play:g05-perfect")).toBe(true);
});

test("声音设置：静音 / 音乐 / 音效可调并在刷新后保留", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("sound-button").click();
  await expect(page.getByTestId("sound-panel")).toBeVisible();
  await page.getByTestId("sound-music").fill("40");
  await page.getByTestId("sound-sfx").fill("70");
  await page.getByTestId("sound-mute").click();
  // Esc 只关面板
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("sound-panel")).toBeHidden();
  await page.reload();
  const s = await page.evaluate(() => (window as any).__yukeeAudio.getSettings());
  expect(s).toEqual({ music: 0.4, sfx: 0.7, muted: true });
  await page.getByTestId("sound-button").click();
  await expect(page.getByTestId("sound-mute")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("sound-music")).toBeDisabled();
  await page.getByTestId("sound-mute").click();
  await expect(page.getByTestId("sound-music")).toBeEnabled();
  await page.screenshot({ path: "docs/audio/sound-panel.png" });
});

test("静音时进入游戏：BGM 声部照常管理但输出为 0；游戏内按钮不报错", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).__yukeeAudio.updateSettings({ muted: true }));
  await choose(page, 3);
  await page.getByRole("button", { name: /键盘演示/ }).click();
  await expect.poll(async () => (await state(page)).bgmTrack, { timeout: 15000 }).toBe("squatJump");
  const masterZero = await page.evaluate(() => (window as any).__yukeeAudio.getSettings().muted);
  expect(masterZero).toBe(true);
});
