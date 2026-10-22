import { expect, type Page } from "@playwright/test";
export const games = [
  {
    id: "yukeeRun",
    title: "拾光跑者",
    test: "yukee-run",
    cal: "calibration-view",
  },
  {
    id: "winglight",
    title: "展翼接光",
    test: "winglight",
    cal: "wing-calibration",
  },
  {
    id: "leanSurf",
    title: "星海冲浪",
    test: "lean-surf",
    cal: "lean-calibration",
  },
  {
    id: "squatJump",
    title: "浅蹲跳一跳",
    test: "squat-jump",
    cal: "squat-calibration",
  },
];
export async function choose(page: Page, index: number) {
  await expect(page.getByTestId("game-selection")).toBeVisible();
  await page
    .getByRole("button", { name: `查看${games[index].title}`, exact: true })
    .click();
  await expect(page.getByTestId("selection-preview")).toHaveAttribute(
    "data-card-id",
    games[index].id,
  );
  await page.getByRole("button", { name: "进入游戏", exact: true }).click();
  await expect(page.getByTestId(games[index].cal)).toBeVisible();
}
export async function demo(page: Page, index: number) {
  await choose(page, index);
  await page.getByRole("button", { name: /键盘演示/ }).click();
  await expect(page.getByTestId(games[index].test)).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "demo");
  // 控件保留键盘可访问性；方向与空格演示从主舞台接收。
  await page.locator("main").click({ position: { x: 1, y: 74 } });
  if (index === 1) { await page.waitForTimeout(700); await expect(page.locator(".wing-instruction")).toHaveText("缓慢展开双臂"); }
}
export async function leave(page: Page) {
  await page.getByRole("button", { name: "暂停游戏", exact: true }).click();
  await expect(page.getByTestId("session-dialog")).toBeVisible();
  await page
    .getByRole("button", { name: "退出并返回选择", exact: true })
    .click();
  await expect(page.getByTestId("game-selection")).toBeVisible();
}
export async function jump(page: Page, factor = 1) {
  const game = page.getByTestId("squat-jump");
  const charge = Number(await game.getAttribute("data-need-charge"));
  await page.keyboard.down("Space");
  await page.waitForTimeout(charge * factor * 1000);
  await page.keyboard.up("Space");
  await expect(game).toHaveAttribute("data-state", /ready|over/, {
    timeout: 6000,
  });
}
/** D 级：真实视频流时钟 + 合成肩点模型输出。绝不代表真人。 */
export async function installPose(page: Page) {
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find(
        (r) => new URL(r.name).pathname === "/src/vision/CameraVision.ts",
      )!.name;
    const { cameraVision: c } = await import(/* @vite-ignore */ url);
    const w = window as any;
    w.poseInput = {
      drop: 0,
      empty: false,
      missing: -1,
      frozen: false,
      wing: 0.1,
      lean: 0,
    };
    w.streams = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const cv = document.createElement("canvas");
      cv.width = 640;
      cv.height = 480;
      const ctx = cv.getContext("2d")!;
      let count = 0;
      const stream = cv.captureStream(20);
      w.streams.push(stream);
      const timer = setInterval(() => {
        if (stream.getTracks().every((t) => t.readyState === "ended")) {
          clearInterval(timer);
          return;
        }
        ctx.fillStyle = count++ % 2 ? "#14261e" : "#15271f";
        ctx.fillRect(0, 0, 640, 480);
      }, 48);
      return stream;
    };
    // 人脸不参与这两个身体游戏，仅替换模型输出以隔离测量条件。
    c.ensureModel = async () => {
      c.model = { detectForVideo: () => ({ faceLandmarks: [] }) };
      return c.model;
    };
    const tick = c.tickPose.bind(c);
    c.tickPose = (at: number) => {
      if (!w.poseInput.frozen) tick(at);
    };
    c.ensurePoseModel = async () => {
      c.poseModelReady = true;
      c.poseModel = {
        detectForVideo() {
          const { drop, empty, missing, wing, lean = 0 } = w.poseInput;
          if (empty) return { landmarks: [] };
          const a = Array.from({ length: 33 }, () => ({
            x: 0.5,
            y: 0.5,
            visibility: 0,
          }));
          for (const [i, x, y] of [
            [11, 0.625, (200 + drop + lean * 8) / 480],
            [12, 0.375, (200 + drop - lean * 8) / 480],
            [13, 0.625 + wing * 0.08, 0.55],
            [14, 0.375 - wing * 0.08, 0.55],
            [15, 0.625 + wing * 0.16, 0.7],
            [16, 0.375 - wing * 0.16, 0.7],
          ])
            a[i] = { x, y, visibility: i === missing ? 0 : 0.99 };
          return { landmarks: [a] };
        },
      };
      return c.poseModel;
    };
    w.poseDiag = () => c.getPoseDiagnostics();
  });
}
export async function pose(page: Page, value: Record<string, unknown>) {
  await page.evaluate(
    (v) => Object.assign((window as any).poseInput, v),
    value,
  );
}
