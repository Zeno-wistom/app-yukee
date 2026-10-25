// 虚拟时间垫片：逐帧确定性录制真实网页（不修改游戏代码）。
// 接管 performance.now / Date.now / rAF / setTimeout / setInterval，并把 Web Animations（含 CSS 动画、过渡）
// 暂停后按虚拟时间设置 currentTime。window.__vt.step(ms) 推进一帧。
(() => {
  // 固定随机种子，保证每次录制关卡一致
  let seed = +(window.__VT_SEED || 20261025) >>> 0;
  Math.random = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now;
  const realSetTimeout = window.setTimeout.bind(window);
  const t0Date = window.__VT_DATE || realDateNow();
  let vnow = 0; // 虚拟毫秒
  let seq = 1;
  const timers = new Map(); // id -> {at, fn, args, interval}
  let rafs = new Map();
  performance.now = () => vnow;
  Date.now = () => t0Date + vnow;
  const RD = Date;
  // new Date() 无参时也用虚拟时间
  window.Date = new Proxy(RD, { construct(t, a) { return a.length ? new t(...a) : new t(t0Date + vnow); }, apply(t, th, a) { return new t(t0Date + vnow).toString(); } });
  window.Date.now = () => t0Date + vnow;
  window.setTimeout = (fn, ms = 0, ...args) => { const id = seq++; timers.set(id, { at: vnow + Math.max(0, +ms || 0), fn, args, interval: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...args) => { const id = seq++; const iv = Math.max(1, +ms || 1); timers.set(id, { at: vnow + iv, fn, args, interval: iv }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = seq++; rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { rafs.delete(id); };
  window.requestIdleCallback = (fn) => window.setTimeout(() => fn({ didTimeout: false, timeRemaining: () => 10 }), 1);
  window.cancelIdleCallback = (id) => window.clearTimeout(id);
  const animStart = new WeakMap();
  const syncAnims = () => {
    for (const a of document.getAnimations()) {
      if (a.playState === "finished" && !animStart.has(a)) continue;
      if (!animStart.has(a)) { const ct = a.currentTime || 0; animStart.set(a, vnow - ct); a.pause(); }
      try { a.currentTime = vnow - animStart.get(a); } catch {}
    }
  };
  const runTimers = () => {
    for (let guard = 0; guard < 10000; guard++) {
      let best = null, bid = 0;
      for (const [id, t] of timers) if (t.at <= vnow && (!best || t.at < best.at)) { best = t; bid = id; }
      if (!best) break;
      if (best.interval) best.at += best.interval; else timers.delete(bid);
      try { typeof best.fn === "function" ? best.fn(...best.args) : eval(best.fn); } catch (e) { console.error(e); }
    }
  };
  const sounds = [];
  // —— 离线音频：用 OfflineAudioContext 替代 AudioContext，按虚拟时间逐帧渲染，得到游戏引擎的真实输出 ——
  const SR = 48000, MAXSEC = +(window.__VT_AUDIO_SEC || 90);
  let offline = null, rendered = null, lastSuspend = 0, audioT0 = 0;
  const RealOffline = window.OfflineAudioContext;
  function OfflineAsRealtime() {
    if (offline) return offline;
    const o = new RealOffline(2, SR * MAXSEC, SR);
    Object.defineProperty(o, "state", { get: () => "running" });
    o.resume = () => Promise.resolve(); o.suspendReal = RealOffline.prototype.suspend.bind(o); o.suspend = () => Promise.resolve(); o.close = () => Promise.resolve();
    o.baseLatency = 0; o.outputLatency = 0; o.getOutputTimestamp = () => ({ contextTime: o.currentTime, performanceTime: vnow });
    offline = o; audioT0 = vnow;
    return o;
  }
  window.AudioContext = function () { return OfflineAsRealtime(); };
  window.webkitAudioContext = window.AudioContext;
  const quant = (t) => Math.ceil((t * SR) / 128) * 128 / SR;
  let started = false, resolveSusp = null;
  async function advanceAudio(tSec) {
    if (!offline) return;
    const q = quant(tSec);
    if (q <= lastSuspend + 1e-9) return;
    const p = offline.suspendReal(q).then(() => {});
    lastSuspend = q;
    if (!started) { started = true; offline.startRendering().then((buf) => { rendered = buf; }); }
    else RealOffline.prototype.resume.call(offline);
    await p;
  }
  window.__vt = {
    get now() { return vnow; },
    get audioT0() { return offline ? audioT0 : null; },
    sounds,
    async step(ms) {
      const target = vnow + ms;
      // 定时器在帧内按时间顺序推进
      while (true) {
        let next = Infinity;
        for (const t of timers.values()) if (t.at < next) next = t.at;
        if (next > target) break;
        vnow = Math.max(vnow, next); runTimers();
        await new Promise((r) => realSetTimeout(r, 0));
      }
      vnow = target; runTimers();
      const cbs = rafs; rafs = new Map();
      for (const fn of cbs.values()) { try { fn(vnow); } catch (e) { console.error(e); } }
      // 让 React 调度（MessageChannel）与微任务落地
      await new Promise((r) => realSetTimeout(r, 0));
      await new Promise((r) => realSetTimeout(r, 0));
      syncAnims();
      await advanceAudio((vnow - audioT0) / 1000);
    },
    async audioWav() {
      if (!offline) return null;
      const endSec = lastSuspend;
      if (!rendered) { RealOffline.prototype.resume.call(offline); while (!rendered) await new Promise((r) => realSetTimeout(r, 20)); }
      const n = Math.min(rendered.length, Math.round(endSec * SR));
      const L = rendered.getChannelData(0), R = rendered.getChannelData(1);
      const buf = new ArrayBuffer(44 + n * 4), dv = new DataView(buf);
      const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
      w(0, "RIFF"); dv.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true); dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) { dv.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true); dv.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true); }
      let bin = ""; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i += 32768) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
      return btoa(bin);
    },
    flush: () => new Promise((r) => realSetTimeout(r, 0)),
  };
  // —— 声音触发日志（真实游戏触发的音效与时间点，混音时用） ——
  const urlOfBuf = new WeakMap();
  const of = window.fetch.bind(window);
  window.fetch = async (u, o) => { const res = await of(u, o); const url = typeof u === "string" ? u : u.url; const ab = res.arrayBuffer.bind(res); res.arrayBuffer = async () => { const b = await ab(); b.__url = url; return b; }; return res; };
  const AC = RealOffline ? window.BaseAudioContext : null;
  if (AC) {
    const dec = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (buf, ...r) { const url = buf && buf.__url; return dec.call(this, buf, ...r).then((ab) => { if (url) urlOfBuf.set(ab, url); return ab; }); };
    const st = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when, offset, dur) {
      const url = this.buffer ? urlOfBuf.get(this.buffer) : null;
      sounds.push({ t: vnow, url: url || "(synth-buffer)", rate: this.playbackRate.value, loop: this.loop, offset: offset || 0, dur: dur ?? null });
      return st.call(this, when, offset, dur);
    };
    const ost = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) { sounds.push({ t: vnow, url: "(oscillator)", type: this.type, freq: this.frequency.value }); return ost.call(this, when); };
    const sp = AudioScheduledSourceNode.prototype.stop;
  }
})();
