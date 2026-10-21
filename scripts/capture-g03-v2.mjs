import { chromium } from "@playwright/test";
import sharp from "sharp";
const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    permissions: ["camera"],
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const home = async () => {
    await page.goto("http://127.0.0.1:5174/");
    await page.getByRole("button", { name: "开始体验", exact: true }).click();
    await page.locator("main.arrived").waitFor();
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动", exact: true })
      .click();
  };
  const next = async () => {
    await page.getByRole("button", { name: "下一个活动", exact: true }).click();
    await page.waitForTimeout(750);
  };
  await home();
  await next();
  await next();
  await page.getByRole("button", { name: "开始这个活动", exact: true }).click();
  await page
    .getByRole("button", { name: "键盘演示 · 非人体识别", exact: true })
    .click();
  await page.getByTestId("lean-surf").waitFor();
  await page.waitForTimeout(1600);
  await page
    .getByTestId("lean-surf")
    .screenshot({ path: "docs/screenshots/g03-sunlight-game.png" });
  const data = await page.evaluate(async () => {
    const { drawSurfRider, surfSun } =
      await import("/src/games/leanSurfArt.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 254;
    const c = canvas.getContext("2d");
    const image = new Image();
    image.src = "/art/g03-sunlit-castle.png";
    await image.decode();
    // Wide card composition: a native aspect crop, with the scout fully inside the image.
    c.imageSmoothingEnabled = false;
    c.drawImage(
      image,
      0,
      390,
      image.naturalWidth,
      (image.naturalWidth * 254) / 1600,
      0,
      0,
      1600,
      254,
    );
    c.save();
    c.translate(510, 225);
    c.scale(1.25, 1.25);
    drawSurfRider(c, -0.15, 1.6);
    c.restore();
    c.fillStyle = "#f4d99b";
    c.shadowColor = "#f4d99b";
    c.shadowBlur = 18;
    surfSun(c, 225, 149, 25);
    c.shadowBlur = 0;
    c.strokeStyle = "#f4d99b88";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(225, 197, 72, 16, 0, 0, Math.PI * 2);
    c.stroke();
    return canvas.toDataURL("image/png");
  });
  await sharp(Buffer.from(data.split(",")[1], "base64"))
    .webp({ quality: 92 })
    .toFile("public/game-previews/lean-surf-scene.webp");
  await home();
  await next();
  await page.locator(".lamp-card.is-current img").evaluate((el) => el.decode());
  await page
    .getByTestId("lamp-selection")
    .screenshot({ path: "docs/screenshots/g02-v2-selection.png" });
  await page
    .locator(".lamp-card.is-current")
    .screenshot({ path: "docs/screenshots/g02-v2-card.png" });
  await next();
  await page.locator(".lamp-card.is-current img").evaluate((el) => el.decode());
  await page
    .getByTestId("lamp-selection")
    .screenshot({ path: "docs/screenshots/g03-sunlight-selection.png" });
  await page
    .locator(".lamp-card.is-current")
    .screenshot({ path: "docs/screenshots/g03-sunlight-card.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("Captured sunny G03 game and full-bleed cards; pageerrors=0");
} finally {
  await browser.close();
}
