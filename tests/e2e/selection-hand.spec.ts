import { test, expect, chromium } from '@playwright/test';

/** 选择页明确改用鼠标；旧 head/hand 偏好和视觉事件不能偷偷接管。 */
test('鼠标选择：忽略旧手势设置与视觉事件，连续三次进入后仍可点击进入 G02/G01', async () => {
  test.setTimeout(80000);
  const browser = await chromium.launch({channel:'chrome', args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    // 模拟旧用户的配置：即便保存了 hand，也只能通过鼠标选游戏。
    await page.addInitScript(() => localStorage.setItem('gameSelectionInputMode','hand'));
    await page.goto('http://127.0.0.1:5176/');
    await page.getByRole('button',{name:'开始体验',exact:true}).click();
    await expect(page.locator('main')).toHaveClass(/arrived/);
    for(let entry=0; entry<3; entry++) {
      await page.getByTestId('lamp-home').getByRole('button',{name:'开始活动',exact:true}).click();
      await expect(page.getByTestId('lamp-selection')).toBeVisible();
      await expect(page.locator('.lamp-selection-mode')).toHaveText('鼠标选择');
      expect(await page.evaluate(async()=>{
        const {cameraVision:c} = await import(/* @vite-ignore */ performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts')!.name);
        // 只注入已识别事件，不能切换/确认；不改变识别模型或游戏输入。
        c.emitAction('left'); c.emitHandSwipe('left'); c.emitNod();
        return c.selectionActive;
      })).toBe(false);
      await expect(page.locator('.lamp-card.is-current')).toHaveAttribute('data-card-id','yukeeRun');
      await page.getByRole('button',{name:'下一个活动',exact:true}).click();
      await expect(page.locator('.lamp-card.is-current')).toHaveAttribute('data-card-id','winglight');
      await page.getByRole('button',{name:'上一个活动',exact:true}).click();
      await expect(page.locator('.lamp-card.is-current')).toHaveAttribute('data-card-id','yukeeRun');
      await page.getByRole('button',{name:'退出选择',exact:true}).click();
      await expect(page.getByTestId('lamp-home')).toBeVisible();
    }
    await page.getByTestId('lamp-home').getByRole('button',{name:'开始活动',exact:true}).click();
    await page.getByRole('button',{name:'下一个活动',exact:true}).click();
    await expect(page.locator('.lamp-card.is-current')).toHaveAttribute('data-card-id','winglight');
    await page.waitForTimeout(100);
    await page.screenshot({path:'docs/screenshots/mouse-selection-controls.png'});
    await page.getByRole('button',{name:'选择展翼接光',exact:true}).click();
    await expect(page.getByTestId('wing-calibration')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'保存并退出',exact:true}).click();
    await page.getByTestId('lamp-home').getByRole('button',{name:'开始活动',exact:true}).click();
    await page.getByRole('button',{name:'开始这个活动',exact:true}).click();
    await expect(page.getByTestId('calibration-view')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
});
