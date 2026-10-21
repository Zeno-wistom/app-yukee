import { chromium } from '@playwright/test';
const b = await chromium.launch({channel:'chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
const p = await b.newPage({viewport:{width:1440,height:900}});
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto('http://127.0.0.1:5173/');
await p.evaluate(async()=>{
 const {cameraVision:c}=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts').name);
 window.testQ=0.1;
 c.ensurePoseModel=async()=>{Object.defineProperty(c.video,'videoWidth',{configurable:true,value:640});Object.defineProperty(c.video,'videoHeight',{configurable:true,value:480});c.poseModelReady=true; c.poseModel={detectForVideo(){const q=window.testQ;window.poseCalls=(window.poseCalls||0)+1;const a=Array.from({length:33},()=>({x:.5,y:.5,visibility:0})); for(const [i,x,y] of [[11,.42,.4],[12,.58,.4],[13,.42-q*.08,.55],[14,.58+q*.08,.55],[15,.42-q*.16,.7],[16,.58+q*.16,.7]])a[i]={x,y,visibility:.99}; return {landmarks:[a]};}};return c.poseModel;};
 c.onPose(f=>window.lastPF=f); window.diag=()=>({calls:window.poseCalls,now:performance.now(),active:c.poseActive,listeners:c.poseListeners.size,video:c.video&&{paused:c.video.paused,time:c.video.currentTime,connected:c.video.isConnected,state:c.video.readyState},last:c.lastPoseInfer,running:c.isRunning});
});
await p.getByRole('button',{name:'开始体验'}).click();
await p.getByTestId('lamp-home').getByRole('button',{name:'开始活动'}).click();
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);await p.keyboard.press('Enter');
await p.getByRole('heading',{name:'慢慢向两侧展开双臂',exact:true}).waitFor({timeout:30000}); console.log('BEFORE SPREAD',await p.locator('[data-phase]').getAttribute('data-phase'),await p.locator('.wing-calib-hint').allTextContents(),await p.evaluate(()=>window.diag())); await p.screenshot({path:'docs/screenshots/g02-review-calibration-current.png'});
console.log('LAYOUT',await p.evaluate(()=>['.monitor-portal','.monitor-display','.monitor-top','.screen-content','.wing-calibration','.wing-calib-head','.wing-calib-body'].map(sel=>{const e=document.querySelector(sel);const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {sel,x:b.x,y:b.y,w:b.width,h:b.height,position:s.position,transform:s.transform}})));console.log('CALIBRATING',await p.evaluate(()=>window.diag()));
console.log('MODEL',await p.evaluate(async()=>{const {cameraVision:c}=await import(performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname==='/src/vision/CameraVision.ts').name);const {measureWing,keypointsVisible}=await import('/src/vision/wingPose.ts');const r=c.poseModel.detectForVideo().landmarks[0];return {m:measureWing(r,480,270),vis:keypointsVisible(r)}})); await p.evaluate(()=>window.testQ=.8);
await p.getByTestId('winglight').waitFor({timeout:15000});
console.log('GAME-IMMEDIATE',await p.evaluate(()=>window.diag()));
await p.waitForTimeout(1700);
console.log('GAME-LATER',await p.evaluate(()=>window.diag()),await p.locator('.wing-lost').allTextContents());
await p.screenshot({path:'docs/screenshots/g02-review-lifecycle.png'});
await b.close();







