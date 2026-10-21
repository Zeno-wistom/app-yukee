import { chromium, expect, test, type Page } from '@playwright/test';

/** B级：真实浏览器、真实视频流时钟与 React 生命周期；仅模型输出为合成肩肘腕。
 * 不跳过个人校准、不使用键盘完成动作，不代表真人摄像头验收。
 * 使用本机 Canvas.captureStream 合成视频，视频解码/播放/卸载遵循浏览器真实生命周期。
 */
async function withPose(run: (page: Page, errors: string[]) => Promise<void>) {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && m.text() !== 'INFO: Created TensorFlow Lite XNNPACK delegate for CPU.') errors.push(m.text()); });
  try {
    await page.goto('http://127.0.0.1:5176/');
    const installPose = async () => page.evaluate(async () => {
      const { cameraVision: c } = await import(/* @vite-ignore */ performance.getEntriesByType('resource').find(r => new URL(r.name).pathname === '/src/vision/CameraVision.ts')!.name);
      const w = window as any;
      w.poseInput = { l: .1, r: .1, missing: -1, empty: false, frozen: false };
      navigator.mediaDevices.getUserMedia = async () => {
        if (w.cameraFailure) throw new DOMException('test camera failure', w.cameraFailure);
        const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
        const ctx = canvas.getContext('2d')!; let count = 0;
        const stream = canvas.captureStream(15);
        const timer = setInterval(() => {
          if (stream.getTracks().every(t => t.readyState === 'ended')) { clearInterval(timer); return; }
          ctx.fillStyle = count++ % 2 ? '#15252b' : '#16262c'; ctx.fillRect(0, 0, 640, 480);
        }, 65);
        return stream;
      };
      const tick = c.tickPose.bind(c);
      c.tickPose = (at: number) => { if (!w.poseInput.frozen && at > (w.holdUntil ?? 0)) tick(at); };
      w.realEnsurePose = c.ensurePoseModel.bind(c);
      c.ensurePoseModel = async () => {
        c.poseModelReady = true;
        c.poseModel = { detectForVideo() {
          const { l, r, missing, empty } = w.poseInput;
          if (empty) return { landmarks: [] };
          const a = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 0 }));
          for (const [i, x, y] of [[11,.42,.4],[12,.58,.4],[13,.42-l*.08,.55],[14,.58+r*.08,.55],[15,.42-l*.16,.7],[16,.58+r*.16,.7]]) a[i] = {x,y,visibility:i === missing ? 0 : .99};
          return { landmarks: [a] };
        } };
        return c.poseModel;
      };
      w.trackingTrace = [];
      w.poseDiag = () => ({ ...c.getPoseDiagnostics(), facePresent: c.facePresent });
      // 切换瞬间故意不送新 Pose 帧，验证交接不会凭空进入 Lost。
      new MutationObserver(() => {
        const state = document.querySelector('[data-testid=winglight]')?.getAttribute('data-tracking');
        if(state && w.trackingTrace.at(-1) !== state) w.trackingTrace.push(state);
        if (!w.handoverSeen && document.querySelector('[data-testid="winglight"]')) {
          w.handoverSeen = true;
          w.holdUntil = performance.now() + 160;
        }
      }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tracking'] });
    });
    await installPose();
    (page as any).installPose = installPose;
    await page.getByRole('button', { name: '开始体验' }).click();
    await expect(page.locator('main')).toHaveClass(/arrived/);
    await run(page, errors);
  } finally { await browser.close(); }
}
async function selectWing(page: Page, capturePreview = false) {
  await page.getByTestId('lamp-home').getByRole('button', { name: '开始活动' }).click();
  await expect(page.getByTestId('lamp-selection')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  if (capturePreview) {
    const image = page.locator('[data-card-id="winglight"] .lamp-card-preview img');
    await expect(image).toHaveAttribute('src', /winglight-card/);
    expect(await image.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>1000)).toBe(true);
    await page.screenshot({path:'docs/screenshots/g02-r2-selection.png'});
  }
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('wing-calibration')).toBeVisible();
}
async function input(page: Page, value: Record<string, unknown>) {
  await page.evaluate(v => Object.assign((window as any).poseInput, v), value);
}
async function calibrate(page: Page) {
  await input(page, { l: .1, r: .1, missing: -1, empty: false, frozen: false });
  await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage', 'spread', { timeout: 20000 });
  await input(page, { l: .8, r: .8 });
  await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage', 'ready');
  await page.screenshot({path:'docs/screenshots/g02-review-camera-calibration.png'});
  await expect(page.getByTestId('winglight')).toBeVisible({ timeout: 12000 });
  await expect(page.getByTestId('winglight')).toHaveAttribute('data-mode', 'camera');
  await input(page, { l: .1, r: .1 });
  await page.waitForTimeout(750);
}
async function open(page: Page) {
  await input(page, { l: .8, r: .8 });
  await expect(page.getByTestId('winglight')).toHaveAttribute('data-stage', 'open');
  await expect(page.locator('.wing-instruction')).toHaveText('放松回位');
}
async function rep(page: Page, count: number) {
  await open(page);
  await input(page, { l: .1, r: .1 });
  await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', String(count));
  await page.waitForTimeout(500);
}
async function quit(page: Page) {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '保存并退出' }).click();
  await expect(page.locator('[data-phase]')).toHaveAttribute('data-phase', 'focus');
}

test('B：真实校准交接后视频和 Pose 持续更新；无脸也能完成五次', async () => {
  test.setTimeout(100000);
  await withPose(async (page, errors) => {
    await selectWing(page, true);
    await calibrate(page);
    const before = await page.evaluate(() => (window as any).poseDiag());
    expect(before.videoPaused).toBe(false);
    expect(before.facePresent).toBe(false);
    expect(before.subscribers).toBe(1);
    expect(await page.evaluate(() => (window as any).trackingTrace)).not.toContain('lost');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => (window as any).poseDiag());
    expect(after.videoTime).toBeGreaterThan(before.videoTime);
    expect(after.frames).toBeGreaterThan(before.frames);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'ok');
    await page.screenshot({ path: 'docs/screenshots/g02-moon-ready.png' });
    await page.screenshot({ path: 'docs/screenshots/g02-r2-ready.png' });
    const geometry = await page.locator('.moon-world svg').evaluate((svg:SVGSVGElement)=>{
      const boat=svg.querySelector<SVGGElement>('[data-moon-boat]')!;
      const inverse=svg.getCTM()!.inverse();
      const p=(x:number,y:number)=>new DOMPoint(x,y).matrixTransform(boat.getCTM()!).matrixTransform(inverse);
      return {water:p(320,282).y,top:p(320,86).y};
    });
    expect(geometry.water).toBeGreaterThan(500);expect(geometry.water).toBeLessThan(511);
    expect(geometry.top).toBeGreaterThan(190);expect(geometry.top).toBeLessThan(205);
    for (const width of [1024,768]) {
      await page.setViewportSize({width,height:800});
      await page.waitForTimeout(400);
      const stage = await page.locator('.wing-stage').boundingBox();
      const quitButton = await page.getByRole('button',{name:'退出游戏',exact:true}).boundingBox();
      expect(stage!.width).toBeGreaterThan(300);
      expect(quitButton!.x+quitButton!.width).toBeLessThanOrEqual(width);
      await page.screenshot({path:`docs/screenshots/g02-moon-${width}.png`});
    }
    await page.setViewportSize({width:1440,height:900});
    await input(page, { l: .45, r: .45 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/g02-moon-half.png' });
    await expect.poll(()=>page.getByTestId('moon-fireflies').getAttribute('data-flights').then(Number)).toBeGreaterThan(0);
    expect(await page.getByTestId('moon-fireflies').evaluate(el=>el.parentElement?.tagName.toLowerCase())).toBe('svg');
    await page.screenshot({ path: 'docs/screenshots/g02-r2-half.png' });
    await input(page, { l: .1, r: .1 });
    await page.waitForTimeout(650);
    // 单手无法展开；两翼分别响应。
    await input(page, { l: .8 });
    await page.waitForTimeout(1300);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '0');
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-stage', 'ready');
    await input(page, { l: .1 }); await page.waitForTimeout(600);
    await open(page);
    await page.screenshot({ path: 'docs/screenshots/g02-moon-open.png' });
    await page.waitForTimeout(700);
    const travelling = await page.locator('[data-firefly][data-flight-phase="flight"]').evaluateAll(nodes=>nodes.map(node=>{
      const g=node as SVGGElement;
      const m=g.transform.baseVal.consolidate()!.matrix;
      return {sourceY:Number(g.dataset.sourceY),distance:Math.hypot(m.e-Number(g.dataset.sourceX),m.f-Number(g.dataset.sourceY))};
    }));
    expect(travelling.some(p=>p.sourceY<200 && p.distance>20)).toBe(true);
    await page.screenshot({ path: 'docs/screenshots/g02-r2-gathering.png' });
    await page.keyboard.press('Escape');
    const clock=Number(await page.getByTestId('moon-fireflies').getAttribute('data-clock'));
    await page.waitForTimeout(400);
    expect(Number(await page.getByTestId('moon-fireflies').getAttribute('data-clock'))).toBe(clock);
    await page.getByRole('button',{name:'继续活动',exact:true}).click();
    await input(page,{l:.1,r:.1});
    await expect(page.locator('.wing-instruction')).toHaveText('缓慢展开双臂');
    await open(page);
    await page.waitForTimeout(1600);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '0');
    await input(page, { l: .1 }); await page.waitForTimeout(1000);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '0');
    await input(page, { r: .1 });
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '1');
    await page.waitForTimeout(500);
    await page.screenshot({path:'docs/screenshots/g02-r2-return.png'});
    await page.screenshot({ path: 'docs/screenshots/g02-review-camera-game.png' });
    for (let i = 2; i <= 5; i++) await rep(page, i);
    await expect(page.getByTestId('wing-complete')).toBeVisible();
    await expect(page.getByTestId('wing-final-reps')).toHaveText('5/5');
    await page.waitForTimeout(1900);
    await page.screenshot({path:'docs/screenshots/g02-moon-complete.png'});
    await page.screenshot({ path: 'docs/screenshots/g02-review-camera-complete.png' });
    await page.getByTestId('wing-back').click();
    await expect(page.locator('[data-phase]')).toHaveAttribute('data-phase', 'focus');
    expect((await page.evaluate(() => (window as any).poseDiag())).subscribers).toBe(0);
    expect(errors).toEqual([]);
  });
});

test('B：肘/腕丢失、断帧与连续恢复；暂停期间不补分；退出重进和 G01 往返', async () => {
  test.setTimeout(150000);
  await withPose(async (page, errors) => {
    await selectWing(page); await calibrate(page);
    await open(page);
    await input(page, { missing: 13 });
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'lost');
    await expect(page.locator('.wing-lost b')).toHaveText('请让双肘进入画面');
    const time = await page.getByTestId('wing-time').innerText();
    await page.waitForTimeout(600);
    expect(await page.getByTestId('wing-time').innerText()).toBe(time);
    await input(page, { missing: -1 });
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'ok');
    await input(page, { l: .1, r: .1 }); await page.waitForTimeout(1000);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '0');
    await rep(page, 1);
    await input(page, { missing: 15 });
    await expect(page.locator('.wing-lost b')).toHaveText('请让双手进入画面');
    await input(page, { missing: -1 });
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'ok');
    await input(page, { frozen: true });
    await expect(page.locator('.wing-lost b')).toHaveText('正在重新识别身体');
    await input(page, { frozen: false, empty: true });
    await page.waitForTimeout(600);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'lost');
    await input(page, { empty: false });
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking', 'ok');
    await page.waitForTimeout(600);
    await open(page); await page.keyboard.press('Escape');
    const frozen = await page.getByTestId('wing-time').innerText();
    await input(page, { l: .1, r: .1 }); await page.waitForTimeout(1000);
    expect(await page.getByTestId('wing-time').innerText()).toBe(frozen);
    await page.keyboard.press('Escape'); await page.waitForTimeout(2200);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '1');
    await rep(page, 2);
    await quit(page);
    await selectWing(page); await calibrate(page);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps', '0');
    await quit(page);
    await page.getByTestId('lamp-home').getByRole('button', { name: '开始活动' }).click();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('calibration-view')).toBeVisible();
    expect((await page.evaluate(() => (window as any).poseDiag())).poseActive).toBe(false);
    await page.getByRole('button', { name: '暂停游戏', exact: true }).click();
    await page.getByRole('button', { name: '保存并退出' }).click();
    await selectWing(page); await calibrate(page);
    await rep(page, 1);
    expect(errors).toEqual([]);
  });
});

test('B：校准时暂停不偷偷进入游戏，重试仍复用视频且更新预览', async () => {
  test.setTimeout(80000);
  await withPose(async (page) => {
    await selectWing(page);
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','spread',{timeout:20000});
    await input(page,{l:.8,r:.8});
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','ready');
    await page.keyboard.press('Escape'); await page.waitForTimeout(3600);
    await expect(page.getByTestId('wing-calibration')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('winglight')).toBeVisible({timeout:8000});
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking','ok');
    await quit(page);
    await selectWing(page);
    await input(page,{l:.1,r:.1});
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','spread',{timeout:20000});
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','rejected',{timeout:17000});
    await page.getByRole('button',{name:'重新校准',exact:true}).click();
    await calibrate(page);
    expect((await page.evaluate(()=>(window as any).poseDiag())).subscribers).toBe(1);
  });
});




test('B：权限拒绝和设备占用均显示原因，重新连接后仍可校准', async () => {
  test.setTimeout(85000);
  await withPose(async (page, errors) => {
    for (const name of ['NotAllowedError', 'NotReadableError']) {
      await page.evaluate(async failure => {
        const {cameraVision:c} = await import(/* @vite-ignore */ performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts')!.name);
        c.stop(); (window as any).cameraFailure = failure;
      }, name);
      await selectWing(page);
      await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage', 'error');
      await expect(page.locator('.wing-calib-panel p')).toContainText(name === 'NotAllowedError' ? '权限被拒绝' : '占用');
      await page.evaluate(() => (window as any).cameraFailure = null);
      await page.getByRole('button', {name:'重新连接', exact:true}).click();
      await calibrate(page); await quit(page);
    }
    expect(errors).toEqual([]);
  });
});

test('回归敏感性：重新引入旧版的移动推理视频行为，确实触发停帧和 Lost', async () => {
  test.setTimeout(50000);
  await withPose(async (page) => {
    await selectWing(page);
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','spread',{timeout:20000});
    // 精确注入旧实现的关键操作：将全局 video 放入即将卸载的校准 DOM。
    await page.evaluate(async () => {
      const {cameraVision:c} = await import(/* @vite-ignore */ performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts')!.name);
      document.querySelector('.wing-camera-slot')!.appendChild(c.getVideoElement());
    });
    await input(page,{l:.8,r:.8});
    await expect(page.getByTestId('winglight')).toBeVisible({timeout:10000});
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-tracking','lost');
    const diag = await page.evaluate(()=>(window as any).poseDiag());
    expect(diag.videoPaused).toBe(true);
    await page.waitForTimeout(500);
    expect((await page.evaluate(()=>(window as any).poseDiag())).frames).toBe(diag.frames);
  });
});


test('B：实际本地 PoseLandmarker 在合成空视频上持续推理，报告无身体而非伪造正常', async () => {
  test.setTimeout(70000);
  await withPose(async (page, errors) => {
    await page.evaluate(async () => {
      const {cameraVision:c} = await import(/* @vite-ignore */ performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts')!.name);
      c.ensurePoseModel = (window as any).realEnsurePose;
      await c.ensurePoseModel();
    });
    await selectWing(page);
    await expect.poll(async ()=>(await page.evaluate(()=>(window as any).poseDiag())).frames,{timeout:30000}).toBeGreaterThan(5);
    const d = await page.evaluate(()=>(window as any).poseDiag());
    expect(d.videoPaused).toBe(false); expect(d.error).toBeNull();
    await expect(page.getByTestId('wing-calibration')).toHaveAttribute('data-stage','framing');
    await expect(page.locator('.wing-calib-hint')).toHaveText('正在重新识别身体');
    expect(errors).toEqual([]);
  });
});


test('B：G02 游戏中刷新后从原网站重新进入，重新校准并正常计数', async () => {
  test.setTimeout(70000);
  await withPose(async (page, errors) => {
    await selectWing(page); await calibrate(page); await rep(page, 1);
    await page.reload();
    await (page as any).installPose();
    await page.getByRole('button', {name:'开始体验'}).click();
    await expect(page.locator('main')).toHaveClass(/arrived/);
    await selectWing(page); await calibrate(page);
    await expect(page.getByTestId('winglight')).toHaveAttribute('data-reps','0');
    await rep(page, 1);
    expect(errors).toEqual([]);
  });
});
