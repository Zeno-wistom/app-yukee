import { PoseControl, anglesFromMatrix } from './pose-control.mjs';
const $ = id => document.getElementById(id);
const control = new PoseControl();
let landmarker, stream, timer, running = false, lastVideoTime = -1, token, sending = false;
let lastPacket = control.packet(false);
const stages = {
  neutral: ['1 / 5 · 正视镜头', '自然坐好，正视镜头并保持约 1.5 秒。'],
  left: ['2 / 5 · 向左转头', '向你自己的左侧轻轻转头，并保持片刻。'],
  center: ['3 / 5 · 回到正脸', '面向镜头，回到刚才的自然姿势。'],
  up: ['4 / 5 · 轻轻抬头', '抬起下巴、向上看，并保持片刻。'],
  finish: ['5 / 5 · 回到正脸', '再次面向镜头，完成校准。'],
  ready: ['已就绪 · 回到游戏开始冒险', '左转左移，右转右移，抬头跳跃。每次跳跃后回到正脸。']
};
async function send(packet) {
  lastPacket = packet;
  if (sending || !token) return;
  sending = true;
  try {
    const result = await fetch('/pose', { method: 'POST', headers: { 'Content-Type':'application/json', 'X-CloudHop-Token':token }, body:JSON.stringify(packet), signal:AbortSignal.timeout(700) });
    if (!result.ok) throw new Error('连接失败');
  } catch { $('error').textContent = '游戏连接已断开。请确认 Processing 游戏仍在运行，并从游戏重新打开此页面。'; }
  finally { sending = false; }
}
function status(tracked) {
  const [heading, text] = stages[control.stage];
  $('heading').textContent = heading;
  $('status').textContent = tracked ? text : '暂未识别到完整人脸，请回到镜头前。游戏会自动暂停。';
  $('action').textContent = !tracked ? '寻找人脸…' : control.stage !== 'ready' ? '跟随提示完成校准' : control.direction < 0 ? '← 向左移动' : control.direction > 0 ? '向右移动 →' : !control.armed ? '↑ 已起跳，请回正' : '正脸 · 停止移动';
}
function loop() {
  if (!running) return;
  try {
    const video = $('video');
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const now = performance.now();
      const result = landmarker.detectForVideo(video, now);
      const pose = anglesFromMatrix(result.facialTransformationMatrixes?.[0]);
      const packet = pose ? control.feed(pose.yaw, pose.pitch, now, +$('turn').value, +$('jump').value) : control.lose();
      send(packet); status(!!pose);
      $('detail').textContent = pose ? `镜像预览 · 人脸已识别 · 转头 ${pose.yaw.toFixed(0)}° / 抬头 ${pose.pitch.toFixed(0)}°` : '镜像预览 · 未识别到人脸';
    }
  } catch (error) { $('error').textContent = '识别中断，请关闭后重新开启摄像头。\n' + error.message; stop(); return; }
  // A timer keeps sampling when the Processing window has focus. Browsers may
  // still throttle fully hidden tabs; the game fails closed and pauses then.
  timer = setTimeout(loop, 40);
}
async function start() {
  $('start').disabled = true; $('error').textContent = ''; $('status').textContent = '正在加载本地人脸识别模型…';
  try {
    token = (await (await fetch('/session')).json()).token;
    if (!landmarker) {
      const { FaceLandmarker, FilesetResolver } = await import('./vendor/vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks('./vendor/wasm');
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions:{ modelAssetPath:'./vendor/face_landmarker.task', delegate:'CPU' },
        runningMode:'VIDEO', numFaces:1, outputFacialTransformationMatrixes:true,
        minFaceDetectionConfidence:0.65, minFacePresenceConfidence:0.65, minTrackingConfidence:0.65
      });
    }
    stream = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
    $('video').srcObject = stream; await $('video').play();
    control.reset(); lastVideoTime = -1; running = true; $('stop').disabled = false; loop();
  } catch(error) {
    if (stream) stream.getTracks().forEach(t => t.stop());
    $('start').disabled = false;
    $('status').textContent = '摄像头未能启动';
    $('error').textContent = error.name === 'NotAllowedError' ? '请在浏览器中允许摄像头访问，然后重试。' : error.name === 'NotFoundError' ? '没有找到摄像头，请连接摄像头后重试。' : '请确认模型文件完整、摄像头未被其他软件占用。\n' + error.message;
    await send(control.lose());
  }
}
function stop() {
  running = false; clearTimeout(timer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; $('video').srcObject = null;
  $('start').disabled = false; $('stop').disabled = true;
  send(control.lose()); $('action').textContent = '摄像头已关闭';
}
$('start').onclick = start; $('stop').onclick = stop;
$('reset').onclick = () => { control.reset(); send(control.packet(false)); if (running) status(true); };
for (const id of ['turn','jump']) $(id).oninput = () => $(id+'Value').textContent = $(id).value+'°';
window.addEventListener('pagehide', () => { if (stream) stream.getTracks().forEach(t => t.stop()); });
