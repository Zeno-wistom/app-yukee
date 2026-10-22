import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";

// Read the real selector after normal mouse navigation; no layout overrides.
const baseURL = process.env.G05_AUDIT_URL ?? "http://127.0.0.1:5186";
const output = "docs/screenshots/g05-preview-audit";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const results = [];
try {
  for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(baseURL);
    await page.getByRole("button", { name: "开始体验", exact: true }).click();
    await page.locator("main.arrived").waitFor({ timeout: 30000 });
    await page.getByTestId("lamp-home").getByRole("button", { name: "开始活动", exact: true }).click();
    for (let index = 0; index < 4; index++) {
      await page.getByRole("button", { name: "下一个活动", exact: true }).click();
      await page.locator(".lamp-card-stage.is-transitioning").waitFor({ state: "detached" });
    }
    const card = page.locator('.lamp-card.is-current[data-card-id="squatJump"]');
    await card.waitFor();
    await card.locator("img").evaluate(image => image.decode());
    const measured = await card.evaluate(element => {
      const image = element.querySelector("img");
      const preview = image.parentElement;
      const side = element.querySelector(".lamp-card-side");
      const rect = node => {
        const box = node.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      };
      const styles = node => {
        const css = getComputedStyle(node);
        return Object.fromEntries(["width", "height", "boxSizing", "borderRadius", "overflow", "objectFit", "objectPosition", "imageRendering", "background", "paddingLeft", "paddingRight", "transform", "filter", "aspectRatio"].map(key => [key, css[key]]));
      };
      return {
        card: rect(element), preview: rect(preview), side: rect(side),
        portal: rect(element.closest(".lamp-portal")),
        cardStyles: styles(element), previewStyles: styles(preview), imageStyles: styles(image),
        sideStyles: styles(side), selectionStyles: styles(element.closest(".lamp-selection")),
        image: { src: image.getAttribute("src"), width: image.naturalWidth, height: image.naturalHeight },
        pageOverflowX: document.documentElement.scrollWidth > innerWidth,
      };
    });
    const screenshot = `${output}/${width}x${height}.png`;
    await page.screenshot({ path: screenshot });
    await card.screenshot({ path: `${output}/${width}x${height}-card.png` });
    results.push({ viewport: { width, height }, ...measured, errors, screenshot });
    console.log(JSON.stringify({ viewport: `${width}x${height}`, card: measured.card, preview: measured.preview, errors }));
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/measurements.json`, JSON.stringify(results, null, 2) + "\n");
}
