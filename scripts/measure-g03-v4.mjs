import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const label = process.argv[2] || "baseline";
const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
const results = [];
try {
  for (const scenario of [
    { w: 1440, h: 900, dpr: 1, throttle: 1 },
    { w: 1920, h: 1080, dpr: 2, throttle: 1 },
    { w: 1920, h: 1080, dpr: 2, throttle: 4 },
  ].filter(s=>!process.argv.includes("--stress") || s.throttle===4)) {
    const page = await browser.newPage({
      viewport: { width: scenario.w, height: scenario.h },
      deviceScaleFactor: scenario.dpr,
      permissions: ["camera"],
    });
    await page.addInitScript(() => {
      const originalRAF = window.requestAnimationFrame.bind(window);
      const originalClear = CanvasRenderingContext2D.prototype.clearRect;
      let scene = false;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (
          this.canvas instanceof HTMLCanvasElement &&
          this.canvas.classList.contains("lean-ocean")
        )
          scene = true;
        return originalClear.apply(this, args);
      };
      window.requestAnimationFrame = (cb) =>
        originalRAF((now) => {
          scene = false;
          const start = performance.now();
          cb(now);
          const p = window.__g03PerfV4;
          if (scene && p?.active) p.draw.push(performance.now() - start);
        });
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.goto("http://127.0.0.1:5176/");
    await page.getByRole("button", { name: "开始体验", exact: true }).click();
    await page.locator("main.arrived").waitFor();
    await page
      .getByTestId("lamp-home")
      .getByRole("button", { name: "开始活动", exact: true })
      .click();
    for (let i = 0; i < 2; i++) {
      await page
        .getByRole("button", { name: "下一个活动", exact: true })
        .click();
      await page.waitForTimeout(750);
    }
    await page
      .getByRole("button", { name: "开始这个活动", exact: true })
      .click();
    await page
      .getByRole("button", { name: "键盘演示 · 非人体识别", exact: true })
      .click();
    await page.waitForTimeout(1800);
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: scenario.throttle,
    });
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    await page.evaluate(() => {
      const p = (window.__g03PerfV4 = {
        frames: [],
        tasks: [],
        draw: [],
        background: 0,
        gradients: 0,
        resizes: 0,
        positions: [],
        start: performance.now(),
        active: true,
      });
      new PerformanceObserver((list) => {
        if (p.active)
          p.tasks.push(
            ...list
              .getEntries()
              .map((e) => ({ start: e.startTime, duration: e.duration })),
          );
      }).observe({ type: "longtask", buffered: false });
      const el = document.querySelector(".lean-ocean");
      let last = 0;
      for (const key of ["width", "height"]) {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLCanvasElement.prototype,
          key,
        );
        Object.defineProperty(el, key, {
          get() {
            return descriptor.get.call(this);
          },
          set(v) {
            p.resizes++;
            descriptor.set.call(this, v);
          },
        });
      }
      const origDraw = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (...args) {
        if (this.canvas === el && p.active) {
          if (args[0] instanceof HTMLImageElement) p.background++;
          else if (args[0].width === args[0].height && args[0].width !== 256) {
            const a = args;
            p.positions.push({
              at: performance.now() - p.start,
              x: a[1],
              y: a[2],
              w: el.width,
              h: el.height,
            });
          }
        }
        return origDraw.apply(this, args);
      };
      // RAF cadence observer; scene callback duration is measured by the init-script wrapper.
      const frame = (now) => {
        if (!p.active) return;
        if (last) p.frames.push(now - last);
        last = now;
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const origGradient =
        CanvasRenderingContext2D.prototype.createRadialGradient;
      CanvasRenderingContext2D.prototype.createRadialGradient = function (
        ...args
      ) {
        if (this.canvas === el && p.active) p.gradients++;
        return origGradient.apply(this, args);
      };
    });

    const before = (await cdp.send("Performance.getMetrics")).metrics;
    await page.waitForTimeout(5000);
    for (const key of [
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
    ]) {
      await page.keyboard.down(key);
      await page.waitForTimeout(650);
      await page.keyboard.up(key);
      await page.waitForTimeout(550);
    }
    await page.waitForTimeout(5000);
    await page.evaluate(() => { window.__g03PerfV4.active=false; window.__g03PerfV4.end=performance.now(); });
    const after = (await cdp.send("Performance.getMetrics")).metrics;
    const { profile } = await cdp.send("Profiler.stop");
    const byId = new Map(profile.nodes.map((n) => [n.id, n.callFrame]));
    const self = new Map();
    for (let i = 0; i < profile.samples.length; i++) {
      const f = byId.get(profile.samples[i]);
      const key = `${f.functionName} ${f.url}:${f.lineNumber + 1}`;
      self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0) / 1000);
    }
    const hotFunctions = [...self]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([callFrame, selfMs]) => ({ callFrame, selfMs }));
    const data = await page.evaluate(async () => {
      const p = window.__g03PerfV4;
      p.active = false;
      const quant = (a, q) => {
        const v = [...a].sort((x, y) => x - y);
        return v[Math.floor((v.length - 1) * q)] || 0;
      };
      const canvas = document.querySelector(".lean-ocean"),
        game = document.querySelector('[data-testid="lean-surf"]');
      const { cameraVision } = await import("/src/vision/CameraVision.ts");
      const f = p.frames,
        d = p.draw.filter((v) => v > 0 && v < 1000),
        duration = p.end - p.start;
      return {
        durationMs: duration,
        frames: f.length,
        frameIntervals: f,
        fps: 1000 / (f.reduce((a, b) => a + b, 0) / f.length),
        frameP50: quant(f, 0.5),
        frameP95: quant(f, 0.95),
        frameP99: quant(f, 0.99),
        maxFrame: Math.max(...f),
        over25: f.filter((v) => v > 25).length,
        over50: f.filter((v) => v > 50).length,
        longTasks: p.tasks,
        sceneCallbackP50: quant(d, 0.5),
        sceneCallbackP95: quant(d, 0.95),
        backgroundDraws: p.background,
        radialGradients: p.gradients,
        canvasResets: p.resizes,
        backing: [canvas.width, canvas.height],
        reps: game.dataset.reps,
        positions: p.positions,
        pose: cameraVision.getPoseDiagnostics(),
        environment: {userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,devicePixelRatio:window.devicePixelRatio},
      };
    });
    const delta = {};
    for (const m of after) {
      const b = before.find((x) => x.name === m.name);
      if (
        b &&
        [
          "TaskDuration",
          "ScriptDuration",
          "LayoutDuration",
          "RecalcStyleDuration",
          "JSHeapUsedSize",
        ].includes(m.name)
      )
        delta[m.name] = m.value - b.value;
    }
    // Controlled renderer workload: same 2200x1238 output, force raster completion per batch.
    const bench = await page.evaluate(async () => {
      const { drawSunSurf, layoutFor } =
        await import("/src/games/sunSurfScene.ts");
      const image = new Image();
      image.src = "/art/g03-sunlit-castle.png";
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 2200;
      canvas.height = 1238;
      const c = canvas.getContext("2d");
      const assets = { img: image, off: { c: null } };
      const costs = [];
      for (let i = 0; i < 90; i++) {
        const s = {
          t: i / 60,
          x: layoutFor(2200, 1238).cx + Math.sin(i / 20) * 120,
          u: Math.sin(i / 20) * 0.7,
          target: -1,
          approach: 0.7,
          hold: 0.3,
          arrived: true,
          returning: false,
          reps: 3,
          complete: false,
          catchT: -10,
          catchSide: -1,
          spawnT: -2,
          completeT: 0,
          tracking: "ok",
        };
        const start = performance.now();
        drawSunSurf(c, s, assets);
        c.getImageData(0, 0, 1, 1);
        if (i >= 10) costs.push(performance.now() - start);
      }
      costs.sort((a, b) => a - b);
      return {
        samples: costs.length,
        median: costs[Math.floor(costs.length * 0.5)],
        p95: costs[Math.floor(costs.length * 0.95)],
      };
    });
    results.push({
      scenario,
      ...data,
      metricsDelta: delta,
      hotFunctions,
      forcedRasterBenchMs: bench,
      errors,
    });
    console.log(
      label,
      scenario,
      "fps",
      data.fps.toFixed(1),
      "p95",
      data.frameP95.toFixed(1),
      "long",
      data.longTasks.length,
      "bench",
      bench.median.toFixed(2),
    );
    await page.screenshot({
      path: `docs/screenshots/g03-v4-${label}-dpr${scenario.dpr}-cpu${scenario.throttle}.png`,
    });
    await page.close();
  }
  await writeFile(
    `docs/performance/g03-v4-${label}.json`,
    JSON.stringify(
      {
        label,
        chrome: await browser.version(),
        node: process.version,
        at: new Date().toISOString(),
        mode: "keyboard-demo, fake video, no human input; Chrome headless",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
