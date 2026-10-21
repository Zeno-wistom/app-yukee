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
  await page.getByRole("button", { name: "开始这个活动", exact: true }).click();
  await page.getByRole("button", { name: /开发者演示/ }).click();
  await page.getByTestId("winglight").waitFor();
  await page.waitForTimeout(1200);
  await page
    .locator(".moon-world")
    .screenshot({ path: "docs/screenshots/g02-v2-preview-source.png" });
  // Recompose the existing actual SVG foreground over the existing original high-resolution landscape.
  const foreground = await page
    .locator(".moon-world .wing-svg")
    .evaluate((el) => {
      const svg = el.cloneNode(true);
      const originals = [el, ...el.querySelectorAll("*")],
        copies = [svg, ...svg.querySelectorAll("*")];
      originals.forEach((node, i) => {
        const css = getComputedStyle(node);
        for (const key of [
          "fill",
          "stroke",
          "stroke-width",
          "fill-opacity",
          "stroke-opacity",
          "opacity",
          "transform",
          "transform-origin",
          "stop-color",
          "stop-opacity",
        ]) {
          const value = css
            .getPropertyValue(key)
            .replace(/url\(["']?[^#)]*#([^"')]+)["']?\)/g, "url(#$1)");
          copies[i].style.setProperty(key, value);
        }
        copies[i].style.setProperty("animation", "none");
      });
      svg.querySelectorAll("image").forEach((e) => e.remove());
      const boat = svg.querySelector(".moon-voyage > g");
      boat.style.transform =
        "translate(380px, 500px) scale(1.1) translate(-320px, -282px)";
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", "1600");
      svg.setAttribute("height", "254");
      svg.setAttribute("viewBox", "0 280 1600 254");
      return new XMLSerializer().serializeToString(svg);
    });
  const bg = await sharp("public/art/g02/moon-night.png")
    .resize(1600, 900)
    .extract({ left: 0, top: 310, width: 1600, height: 254 })
    .toBuffer();
  await sharp(bg)
    .composite([{ input: Buffer.from(foreground) }])
    .webp({ quality: 92 })
    .toFile("public/game-previews/winglight-scene.webp");
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
    .screenshot({ path: "docs/screenshots/g03-v2-game.png" });
  const data = await page.evaluate(async () => {
    const { drawSurfBackdrop, drawSurfRider, surfStar } =
      await import("/src/games/leanSurfArt.ts");
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 254;
    const c = canvas.getContext("2d");
    c.save();
    c.scale(1600 / 960, 1600 / 960);
    c.translate(0, -180);
    drawSurfBackdrop(c, 1.6);
    c.restore();
    c.save();
    c.translate(510, 225);
    c.scale(1.25, 1.25);
    drawSurfRider(c, -0.15, 1.6);
    c.restore();
    c.fillStyle = "#f4d99b";
    c.shadowColor = "#f4d99b";
    c.shadowBlur = 18;
    surfStar(c, 225, 149, 25);
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
    .screenshot({ path: "docs/screenshots/g03-v2-selection.png" });
  await page
    .locator(".lamp-card.is-current")
    .screenshot({ path: "docs/screenshots/g03-v2-card.png" });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Captured actual game, recomposed G02 SVG, G03 canvas and both full-bleed cards; pageerrors=0",
  );
} finally {
  await browser.close();
}
