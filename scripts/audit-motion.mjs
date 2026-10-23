/** Reproducible local Chrome audit. Keyboard demonstration, never human-camera evidence. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const tag = process.argv[2] || 'after';
const url = process.env.YUKEE_MOTION_URL || 'http://127.0.0.1:5194';
const out = `docs/screenshots/motion-polish/${tag}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: `${out}/video`, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const errors = [], metrics = [], layouts = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Keyboard audit only', 'NotAllowedError'); };
  window.audit = { frames: [], tasks: [], active: false, last: 0 };
  new PerformanceObserver(list => { for (const e of list.getEntries()) if (window.audit.active) window.audit.tasks.push(e.duration); }).observe({ type: 'longtask', buffered: false });
  const tick = now => { const a = window.audit; if (a.active && a.last) a.frames.push(now - a.last); a.last = a.active ? now : 0; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
});
const begin = () => page.evaluate(() => { Object.assign(window.audit, { frames: [], tasks: [], active: true, last: 0 }); });
const end = async label => {
  const a = await page.evaluate(() => { window.audit.active = false; return window.audit; });
  const sorted = [...a.frames].sort((a,b) => a-b), elapsed = a.frames.reduce((a,b) => a+b,0);
  metrics.push({ label, sampleMs: +elapsed.toFixed(1), rafFps: +(a.frames.length / elapsed * 1000).toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * .95)]?.toFixed(2), over33ms: a.frames.filter(v=>v>33.4).length, longTasks: a.tasks.length, maxLongTaskMs: Math.max(0,...a.tasks) });
};
const titles = ['拾光跑者','展翼接光','星海冲浪','浅蹲跳一跳'];
try {
  await page.goto(url); await page.waitForTimeout(1100);
  await page.screenshot({ path: `${out}/selection-1920.png` });
  await begin();
  for (let i=0;i<8;i++) { await page.getByRole('button', { name: '下一款游戏', exact: true }).click(); await page.waitForTimeout(480); }
  await end('selection-8-switches');
  for (let i=0;i<4;i++) {
    await page.getByRole('button', { name: `查看${titles[i]}`, exact: true }).click();
    await page.getByRole('button', { name: '进入游戏', exact: true }).hover();
    if (!i) await page.screenshot({ path: `${out}/button-hover.png` });
    await begin();
    await page.getByRole('button', { name: '进入游戏', exact: true }).click();
    await page.getByRole('button', { name: /键盘演示/ }).waitFor();
    await page.waitForTimeout(850); await end(`enter-${i+1}`);
    await page.getByRole('button', { name: /键盘演示/ }).click();
    await page.waitForTimeout(1200);
    await begin(); await page.waitForTimeout(2400); await end(`game-${i+1}-idle`);
    await page.screenshot({ path: `${out}/game-${i+1}.png` });
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
    await page.waitForTimeout(360);
    if (!i) await page.screenshot({ path: `${out}/pause.png` });
    await page.getByRole('button', { name: '继续游戏', exact: true }).click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
    await page.getByRole('button', { name: '退出并返回选择', exact: true }).click();
    await page.getByTestId('game-selection').waitFor(); await page.waitForTimeout(800);
  }
  for (const [width,height] of [[1280,720],[1366,768],[1920,1080],[2560,1440],[390,844]]) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(300);
    layouts.push(await page.evaluate(() => { const p = document.querySelector('.selection-preview'), r=p.getBoundingClientRect(), img=p.querySelector('img:not([hidden])'), f=document.querySelector('.selection-footer').getBoundingClientRect(); return { width: innerWidth, height: innerHeight, preview: {width:r.width,height:r.height}, objectFit:getComputedStyle(img).objectFit, objectPosition:getComputedStyle(img).objectPosition, overflow:document.querySelector('main').scrollWidth>innerWidth, footerBottom:f.bottom }; }));
    await page.screenshot({path:`${out}/selection-${width}.png`});
  }
  await writeFile(`${out}/audit.json`, JSON.stringify({ tag,url,testedAt:new Date().toISOString(), browser: await browser.version(), evidence:'local Chrome headless, keyboard demonstration, no camera inference, video recording enabled', metrics,layouts,errors },null,2));
  console.log(JSON.stringify({tag,metrics,layouts,errors},null,2));
} finally {
  const video = page.video();
  await context.close();
  if (video) { await video.saveAs(`${out}/flow.webm`); await video.delete(); }
  await browser.close();
}
