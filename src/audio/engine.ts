/**
 * Yukee 音频引擎（单例）。
 *
 * 结构：
 *   master(静音) ← musicBus(音乐音量) ← bgmGain(让位/duck) ← 每首 BGM 的独立 voice 增益
 *   master(静音) ← sfxBus(音效音量)   ← sfxGain ← 合成音效 / 素材音效
 *   master(静音) ← sfxBus             ← uiGain  ← 全站交互音效（不被游戏暂停清掉）
 *
 * - unlock() 必须在用户手势调用栈内执行，只 resume AudioContext + 预载，不播放；
 * - 每款游戏一首独立 BGM（catalog.ts），切换时旧曲 0.35 s 内淡出，绝不长时间叠放；
 * - 暂停：BGM 平滑淡出并记住播放位置，继续时从原位置淡入；
 * - 素材音效：每个音效有冷却、最大并发，全局并发上限，超出时淡出最早的那一个；
 * - G01 的合成音效与原曲保持不变。
 *
 * 任何公开方法都不会抛异常：自动化 / 无音频设备环境下静默降级。
 */
import {
  BGM_TRACKS,
  GAME_SFX_GROUP,
  SAMPLES,
  findLoopRegion,
  isBgmId,
  loadSettings,
  sampleUrl,
  samplesInGroup,
  saveSettings,
  type AudioSettings,
  type BgmId,
  type SampleId,
  type SfxGroup,
} from "./catalog";
import type { CueSink, PlayOpts } from "./gameCues";

export type SfxKind =
  | "jump"
  | "hit"
  | "reward"
  | "complete"
  // G05 浅蹲跳一跳（同一引擎、同一 sfxGain，只是新增几段合成音色）
  | "g05Launch"
  | "g05Land"
  | "g05Perfect"
  | "g05Bonus"
  | "g05Fail";

/** SFX 相对响度（master 之前） */
const SFX_LEVEL = 0.98;
/** 全局素材音效并发上限 */
const MAX_SAMPLE_VOICES = 10;

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  at: number; // 相对 now 的秒偏移
  dur: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
}

interface BgmVoice {
  id: BgmId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** ctx 时间：offset 0 对应的时刻（用于算暂停位置） */
  startedAt: number;
  offset: number;
  loopStart: number;
  loopEnd: number;
}

interface SampleVoice {
  id: SampleId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  ui: boolean;
  startedAt: number;
}

interface LoadedBuffer {
  buffer: AudioBuffer;
  loopStart: number;
  loopEnd: number;
}

type Listener = (s: AudioSettings) => void;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  /** BGM 让位节点（1 = 不让位）；e2e 读取它验证 duck */
  bgmGain: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private uiGain: GainNode | null = null;

  private settings: AudioSettings = loadSettings();
  private listeners = new Set<Listener>();

  private buffers = new Map<string, LoadedBuffer>();
  private loading = new Map<string, Promise<LoadedBuffer | null>>();

  private bgm: BgmVoice | null = null;
  /** 正在淡出的旧 BGM（最多一个，第二个立刻停） */
  private bgmFading: BgmVoice | null = null;
  private bgmWanted: BgmId | null = null;
  private bgmPlaying = false;
  /** 暂停时记住的位置，继续时从这里淡入 */
  private bgmResume: { id: BgmId; offset: number } | null = null;
  /** 递增令牌：取消在途的「等解码完再播」回调 */
  private bgmToken = 0;

  private effects = new Map<AudioScheduledSourceNode, () => void>();
  private sampleVoices: SampleVoice[] = [];
  private lastPlayed = new Map<SampleId, number>();
  private noiseBuffer: AudioBuffer | null = null;

  private trackEffect(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.effects.set(source, cleanup);
    source.onended = () => { this.effects.delete(source); cleanup(); };
  }

  /** 暂停或切换活动时连同尚未播放的奖励音一起取消，不能串到下一局。UI 音不受影响。 */
  stopEffects() {
    this.chargeStop();
    for (const [source, cleanup] of this.effects) {
      source.onended = null;
      try { source.stop(); } catch { /* 已结束 */ }
      cleanup();
    }
    this.effects.clear();
    this.sampleVoices = this.sampleVoices.filter((v) => v.ui);
  }

  getDiagnostics() {
    return { bgmActive: this.bgmPlaying, effectsActive: this.effects.size, charging: !!this.charge };
  }

  /** 扩展诊断：e2e / 调试面板读取，不影响上面的兼容结构 */
  getAudioState() {
    const sources = [this.bgm, this.bgmFading].filter(Boolean).length;
    return {
      bgmTrack: this.bgmPlaying ? (this.bgm?.id ?? null) : null,
      bgmWanted: this.bgmWanted,
      bgmSources: sources,
      bgmUrl: this.bgm ? BGM_TRACKS[this.bgm.id].url : null,
      paused: !!this.bgmResume,
      sampleVoices: this.sampleVoices.length,
      effectsActive: this.effects.size,
      loaded: [...this.buffers.keys()],
      ctxState: this.ctx?.state ?? "none",
      settings: { ...this.settings },
    };
  }

  // ---------------------------------------------------------------
  // 初始化 / 解锁
  // ---------------------------------------------------------------

  /** Idle warm-up: construct the local audio graph only. No resume, fetch or playback. */
  prepare() {
    try {
      if (this.ctx) return;
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.bgmGain = ctx.createGain();
      this.bgmGain.connect(this.musicBus);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = SFX_LEVEL;
      this.sfxGain.connect(this.sfxBus);
      this.uiGain = ctx.createGain();
      this.uiGain.connect(this.sfxBus);
      this.applySettings(true);
    } catch {
      /* 无音频环境：静默 */
    }
  }

  /** 用户手势内调用：恢复 AudioContext 并预载 UI 音效，不播放声音。 */
  unlock() {
    this.prepare();
    try {
      if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {});
      this.preloadGroup("ui");
      if (this.bgmWanted) this.preloadGame(this.bgmWanted);
    } catch { /* 无音频环境：静默 */ }
  }

  // ---------------------------------------------------------------
  // 音量设置
  // ---------------------------------------------------------------

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  updateSettings(patch: Partial<AudioSettings>) {
    const next = { ...this.settings, ...patch };
    next.music = Math.min(1, Math.max(0, next.music));
    next.sfx = Math.min(1, Math.max(0, next.sfx));
    this.settings = next;
    saveSettings(next);
    this.applySettings(false);
    for (const fn of this.listeners) fn({ ...next });
  }

  private applySettings(immediate: boolean) {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    // 人耳对音量是对数感知：滑杆值平方后再作为增益，低段更细腻
    const set = (p: AudioParam, v: number) => {
      if (immediate) p.value = v;
      else p.setTargetAtTime(v, t, 0.04);
    };
    set(this.master.gain, this.settings.muted ? 0 : 1);
    set(this.musicBus.gain, this.settings.music * this.settings.music);
    set(this.sfxBus.gain, this.settings.sfx * this.settings.sfx);
  }

  /** 兼容旧接口：0 = 静音，其余视为取消静音 */
  setMasterVolume(v: number) {
    this.updateSettings({ muted: v <= 0 });
  }

  getMasterVolume() {
    return this.settings.muted ? 0 : 1;
  }

  private get silent() {
    return this.settings.muted;
  }

  // ---------------------------------------------------------------
  // 资源加载（fetch + 异步解码，结果缓存；解码在浏览器后台线程）
  // ---------------------------------------------------------------

  private load(url: string, loop = false): Promise<LoadedBuffer | null> {
    const hit = this.buffers.get(url);
    if (hit) return Promise.resolve(hit);
    const pending = this.loading.get(url);
    if (pending) return pending;
    if (!this.ctx) return Promise.resolve(null);
    const ctx = this.ctx;
    const p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url} ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((buffer) => {
        const region = loop
          ? findLoopRegion(buffer.getChannelData(0), buffer.sampleRate)
          : { start: 0, end: buffer.duration };
        const loaded = { buffer, loopStart: region.start, loopEnd: region.end };
        this.buffers.set(url, loaded);
        this.loading.delete(url);
        return loaded;
      })
      .catch(() => {
        this.loading.delete(url);
        return null;
      });
    this.loading.set(url, p);
    return p;
  }

  preloadGroup(group: SfxGroup) {
    if (!this.ctx) return;
    for (const id of samplesInGroup(group)) void this.load(sampleUrl(id));
  }

  /** 选择页意图 / 进入校准时调用：提前取回该游戏的 BGM 与音效 */
  preloadGame(game: string) {
    this.prepare();
    if (!isBgmId(game) || !this.ctx) return;
    void this.load(BGM_TRACKS[game].url, true);
    const group = GAME_SFX_GROUP[game];
    if (group) this.preloadGroup(group);
  }

  // ---------------------------------------------------------------
  // BGM
  // ---------------------------------------------------------------

  /** 选定当前游戏的 BGM（不播放）；切换到别的游戏时立即淡出旧曲 */
  setBgmTrack(id: string | null) {
    const next = isBgmId(id) ? id : null;
    if (next === this.bgmWanted) return;
    this.bgmWanted = next;
    if (this.bgmResume && this.bgmResume.id !== next) this.bgmResume = null;
    if (this.bgm && this.bgm.id !== next) this.fadeOutVoice(0.35);
    if (next) this.preloadGame(next);
  }

  /** 游戏世界被唤醒 / 继续：淡入当前游戏的 BGM 循环（暂停过则从原位置继续） */
  playBgm(fadeInSec = 1.8, track?: BgmId) {
    try {
      if (track) this.setBgmTrack(track);
      const id = this.bgmWanted;
      if (!this.ctx || !this.bgmGain || !id) return;
      if (this.bgmPlaying && this.bgm?.id === id) return;
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const token = ++this.bgmToken;
      this.bgmPlaying = true;
      const resume = this.bgmResume?.id === id ? this.bgmResume.offset : null;
      const start = (loaded: LoadedBuffer | null) => {
        if (!loaded || token !== this.bgmToken || this.bgmWanted !== id || !this.bgmGain) return;
        if (this.bgm) this.fadeOutVoice(0.25);
        const source = ctx.createBufferSource();
        source.buffer = loaded.buffer;
        source.loop = true;
        source.loopStart = loaded.loopStart;
        source.loopEnd = loaded.loopEnd;
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(this.bgmGain);
        const now = ctx.currentTime;
        const level = BGM_TRACKS[id].level;
        const fade = resume !== null ? Math.min(fadeInSec, 0.6) : fadeInSec;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(level, now + Math.max(0.02, fade));
        // 让位节点回到 1（上一局结算时可能还压着）
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setTargetAtTime(1, now, 0.08);
        const offset = resume ?? loaded.loopStart;
        source.start(now, offset);
        this.bgm = { id, source, gain, startedAt: now - (offset - loaded.loopStart), offset: loaded.loopStart, loopStart: loaded.loopStart, loopEnd: loaded.loopEnd };
        this.bgmResume = null;
      };
      const cached = this.buffers.get(BGM_TRACKS[id].url);
      if (cached) start(cached);
      else void this.load(BGM_TRACKS[id].url, true).then(start);
    } catch {
      /* 静默 */
    }
  }

  /** 暂停：平滑淡出并记住位置；继续时 playBgm() 从这里接上 */
  pauseBgm(fadeOutSec = 0.3) {
    try {
      this.bgmToken++;
      this.bgmPlaying = false;
      const v = this.bgm;
      if (!v || !this.ctx) return;
      const len = Math.max(0.01, v.loopEnd - v.loopStart);
      const played = this.ctx.currentTime - v.startedAt;
      this.bgmResume = { id: v.id, offset: v.loopStart + (((played % len) + len) % len) };
      this.fadeOutVoice(fadeOutSec);
    } catch {
      /* 静默 */
    }
  }

  /** 临近终点 / 长奖励音：压低 BGM，不抢戏。holdSec>0 时之后自动恢复。 */
  duckBgm(factor = 0.38, rampSec = 0.9, holdSec = 0) {
    try {
      if (!this.ctx || !this.bgmGain || !this.bgmPlaying) return;
      const now = this.ctx.currentTime;
      const g = this.bgmGain.gain;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(Math.min(1, Math.max(0, factor)), now, rampSec / 3);
      if (holdSec > 0) g.setTargetAtTime(1, now + rampSec + holdSec, 0.5);
    } catch {
      /* 静默 */
    }
  }

  /** 结束 / 退出：淡出并停止，清除暂停位置 */
  stopBgm(fadeOutSec = 1.6) {
    try {
      this.bgmToken++;
      this.bgmPlaying = false;
      this.bgmResume = null;
      this.fadeOutVoice(fadeOutSec);
    } catch {
      /* 静默 */
    }
  }

  private fadeOutVoice(sec: number) {
    const v = this.bgm;
    this.bgm = null;
    if (!v || !this.ctx) return;
    // 同一时刻最多只保留一个正在淡出的旧声部，不让三首叠在一起
    if (this.bgmFading) this.killVoice(this.bgmFading, 0);
    this.bgmFading = v;
    this.killVoice(v, sec);
  }

  private killVoice(v: BgmVoice, sec: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const end = now + Math.max(0.015, sec);
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), now);
      v.gain.gain.exponentialRampToValueAtTime(0.0001, end);
      v.source.stop(end + 0.02);
    } catch { /* 已停止 */ }
    v.source.onended = () => {
      if (this.bgmFading === v) this.bgmFading = null;
      try { v.source.disconnect(); v.gain.disconnect(); } catch { /* 已断开 */ }
    };
    if (sec <= 0 && this.bgmFading === v) this.bgmFading = null;
  }

  get bgmActive() {
    return this.bgmPlaying;
  }

  // ---------------------------------------------------------------
  // 素材音效
  // ---------------------------------------------------------------

  /** 全站交互音：在点击 / 按键处理里调用（属于用户手势，可顺带解锁） */
  ui(id: SampleId, opts: PlayOpts = {}) {
    this.markUi();
    this.unlock();
    this.playSample(id, opts, true);
  }

  /** 最近一次「已有专属交互音」的时间：全站通用点击音据此避免同一下点击响两次 */
  lastUiAt = -1e9;
  markUi() {
    this.lastUiAt = performance.now();
  }

  /** 游戏内素材音效：暂停 / 退出时会被 stopEffects 清掉 */
  play(id: SampleId, opts: PlayOpts = {}) {
    this.playSample(id, opts, false);
  }

  private playSample(id: SampleId, opts: PlayOpts, ui: boolean) {
    try {
      if (!this.ctx || !this.sfxGain || !this.uiGain || this.silent || this.settings.sfx <= 0) return;
      const def = SAMPLES[id];
      const t = performance.now();
      if (t - (this.lastPlayed.get(id) ?? -1e9) < def.cooldown) return;
      const loaded = this.buffers.get(sampleUrl(id));
      if (!loaded) {
        // 未加载完不补播（迟到的反馈比没有更糟），只触发加载
        void this.load(sampleUrl(id));
        return;
      }
      this.lastPlayed.set(id, t);
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      const same = this.sampleVoices.filter((v) => v.id === id);
      if (same.length >= def.voices) this.releaseSample(same[0]);
      if (this.sampleVoices.length >= MAX_SAMPLE_VOICES) this.releaseSample(this.sampleVoices[0]);
      const ctx = this.ctx;
      const t0 = ctx.currentTime + Math.max(0, opts.at ?? 0);
      const source = ctx.createBufferSource();
      source.buffer = loaded.buffer;
      source.playbackRate.value = opts.rate ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = def.gain * (opts.gain ?? 1);
      source.connect(gain);
      gain.connect(ui ? this.uiGain : this.sfxGain);
      const voice: SampleVoice = { id, source, gain, ui, startedAt: t0 };
      this.sampleVoices.push(voice);
      const cleanup = () => {
        this.sampleVoices = this.sampleVoices.filter((v) => v !== voice);
        try { source.disconnect(); gain.disconnect(); } catch { /* 已断开 */ }
      };
      if (ui) source.onended = cleanup;
      else this.trackEffect(source, cleanup);
      source.start(t0);
    } catch {
      /* 静默 */
    }
  }

  /** 抢占：15 ms 快速淡出，避免硬切爆音 */
  private releaseSample(v: SampleVoice) {
    this.sampleVoices = this.sampleVoices.filter((x) => x !== v);
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(now);
      v.gain.gain.setValueAtTime(v.gain.gain.value, now);
      v.gain.gain.linearRampToValueAtTime(0, now + 0.015);
      v.source.stop(now + 0.02);
    } catch { /* 已结束 */ }
  }

  // ---------------------------------------------------------------
  // 合成音效
  // ---------------------------------------------------------------

  private tone({
    freq,
    freqEnd,
    at,
    dur,
    type = "sine",
    gain,
    attack = 0.008,
  }: ToneOpts) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd && freqEnd !== freq)
      osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur * 0.85);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    this.trackEffect(osc, () => { osc.disconnect(); g.disconnect(); });
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** 白噪声缓冲只生成一次（原来每次音效都新建并填充，首个音效会卡一下） */
  private getNoise() {
    if (!this.ctx) return null;
    if (!this.noiseBuffer) {
      const len = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    return this.noiseBuffer;
  }

  private noise(
    at: number,
    dur: number,
    gain: number,
    filterFreq: number,
    q = 1,
    type: BiquadFilterType = "bandpass",
    freqEnd?: number,
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const buf = this.getNoise();
    if (!buf) return;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = dur > buf.duration;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(filterFreq, t0);
    if (freqEnd) filter.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.006, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    this.trackEffect(src, () => { src.disconnect(); filter.disconnect(); g.disconnect(); });
    src.start(t0, Math.random() * Math.max(0, buf.duration - Math.min(dur, buf.duration)));
    src.stop(t0 + dur + 0.02);
  }

  /** SFX 触发瞬间让 BGM 让位；Hit 使用更深、更完整的 220ms 窗口。 */
  private microDuck(ratio = 0.62, hold = 0.1) {
    try {
      if (!this.ctx || !this.bgmGain || !this.bgmPlaying) return;
      const now = this.ctx.currentTime;
      const g = this.bgmGain.gain;
      const current = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.min(current, 1), now);
      g.linearRampToValueAtTime(ratio, now + 0.025);
      g.setValueAtTime(ratio, now + hold);
      g.linearRampToValueAtTime(1, now + hold + 0.055);
    } catch {
      /* 静默 */
    }
  }

  /** 抬头起跳：轻快短促的弹性 pop（中高频瞬态强化）。 */
  private sfxJump() {
    this.noise(0, 0.05, 0.24, 3000, 0.8);
    this.tone({
      freq: 400,
      freqEnd: 1120,
      at: 0,
      dur: 0.17,
      gain: 0.9,
      attack: 0.003,
    });
    this.tone({
      freq: 820,
      freqEnd: 1840,
      at: 0.008,
      dur: 0.11,
      type: "triangle",
      gain: 0.32,
      attack: 0.003,
    });
  }

  /** 碰撞：果冻感 soft thump（短促 attack + 低中频 body 强化），克制、不惩罚。 */
  private sfxHit() {
    this.tone({
      freq: 210,
      freqEnd: 72,
      at: 0,
      dur: 0.26,
      gain: 1.2,
      attack: 0.002,
    });
    this.tone({
      freq: 330,
      freqEnd: 116,
      at: 0.008,
      dur: 0.19,
      type: "triangle",
      gain: 0.56,
      attack: 0.002,
    });
    this.noise(0, 0.1, 0.42, 680, 0.9);
    // 极短的软 pop 帮助撞击穿过 BGM；高频受控，不产生金属感。
    this.tone({
      freq: 760,
      freqEnd: 420,
      at: 0,
      dur: 0.055,
      type: "triangle",
      gain: 0.22,
      attack: 0.001,
    });
  }

  /** 左右收集成功：两三个很短的高音 chime，~300ms。 */
  private sfxReward() {
    const notes = [1318.5, 1760, 2217.5]; // E6 A6 C#7
    notes.forEach((f, i) => {
      this.tone({
        freq: f,
        at: i * 0.07,
        dur: 0.16,
        gain: 0.44,
        attack: 0.004,
      });
      this.tone({
        freq: f * 2,
        at: i * 0.07,
        dur: 0.1,
        type: "triangle",
        gain: 0.12,
        attack: 0.004,
      });
    });
  }

  /** 整关完成：原创小扇奏 ~1.8s，经典平台游戏通关气质。 */
  private sfxComplete() {
    // 上行跑动：C5 E5 G5 C6
    const run = [523.25, 659.25, 783.99, 1046.5];
    run.forEach((f, i) =>
      this.tone({
        freq: f,
        at: i * 0.11,
        dur: 0.2,
        type: "triangle",
        gain: 0.4,
        attack: 0.006,
      }),
    );
    // 落点长音：E6 + G6 双音保持，尾部回落 C6 收束
    this.tone({
      freq: 1318.5,
      at: 0.46,
      dur: 0.5,
      type: "triangle",
      gain: 0.38,
      attack: 0.01,
    });
    this.tone({ freq: 1568, at: 0.46, dur: 0.5, gain: 0.22, attack: 0.01 });
    this.tone({
      freq: 1046.5,
      at: 1.02,
      dur: 0.34,
      type: "triangle",
      gain: 0.36,
      attack: 0.01,
    });
    this.tone({
      freq: 1318.5,
      at: 1.4,
      dur: 0.55,
      type: "triangle",
      gain: 0.4,
      attack: 0.012,
    });
    this.tone({ freq: 1568, at: 1.4, dur: 0.55, gain: 0.18, attack: 0.012 });
    // 底部柔和垫音，给满足感一点厚度
    [261.63, 329.63, 392].forEach((f) =>
      this.tone({ freq: f, at: 0.44, dur: 1.5, gain: 0.07, attack: 0.06 }),
    );
    // 顶部闪烁
    this.tone({ freq: 2093, at: 1.02, dur: 0.18, gain: 0.1, attack: 0.005 });
  }

  // ---------------------------------------------------------------
  // G05：蓄力音（持续音，随蓄力升调）+ 起跳 / 落地 / 完美 / 奖励 / 失败
  // ---------------------------------------------------------------
  private charge: { osc: OscillatorNode; sub: OscillatorNode; lfo: OscillatorNode; g: GainNode } | null = null;

  /** 开始蓄力：柔和的方波+三角双振荡，带轻微颤音，音量很低 */
  chargeStart() {
    try {
      if (!this.ctx || !this.sfxGain || this.charge) return;
      if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      const ctx = this.ctx,
        t0 = ctx.currentTime;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.11, t0 + 0.06);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(196, t0);
      const sub = ctx.createOscillator();
      sub.type = "triangle";
      sub.frequency.setValueAtTime(392, t0);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 7;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 6;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      osc.connect(lp);
      sub.connect(subGain);
      subGain.connect(lp);
      lp.connect(g);
      g.connect(this.sfxGain);
      osc.start(t0);
      sub.start(t0);
      lfo.start(t0);
      this.charge = { osc, sub, lfo, g };
    } catch {
      /* 静默 */
    }
  }

  /** 蓄力 0..1：音高从 G3 升到约 G5，满蓄力时颤音更快 */
  chargeLevel(level: number) {
    try {
      if (!this.ctx || !this.charge) return;
      const t = this.ctx.currentTime;
      const l = Math.max(0, Math.min(1, level));
      const f = 196 * Math.pow(2, l * 2);
      this.charge.osc.frequency.setTargetAtTime(f, t, 0.03);
      this.charge.sub.frequency.setTargetAtTime(f * 2, t, 0.03);
      this.charge.lfo.frequency.setTargetAtTime(l >= 0.99 ? 14 : 7, t, 0.05);
    } catch {
      /* 静默 */
    }
  }

  chargeStop() {
    try {
      if (!this.ctx || !this.charge) return;
      const t = this.ctx.currentTime;
      const c = this.charge;
      this.charge = null;
      c.g.gain.cancelScheduledValues(t);
      c.g.gain.setValueAtTime(Math.max(0.0001, c.g.gain.value), t);
      c.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      for (const o of [c.osc, c.sub, c.lfo]) o.stop(t + 0.08);
    } catch {
      /* 静默 */
    }
  }

  /** 起跳：弹簧「啵」+ 上滑，力度随蓄力 */
  private sfxG05Launch(power = 0.5) {
    this.noise(0, 0.04, 0.18, 2600, 0.9);
    this.tone({ freq: 300 + power * 120, freqEnd: 900 + power * 500, at: 0, dur: 0.16, type: "square", gain: 0.22, attack: 0.002 });
    this.tone({ freq: 600, freqEnd: 1500 + power * 400, at: 0.01, dur: 0.12, type: "triangle", gain: 0.3, attack: 0.002 });
  }

  /** 落地：石台上的短促「哒」 */
  private sfxG05Land() {
    this.tone({ freq: 180, freqEnd: 90, at: 0, dur: 0.12, gain: 0.9, attack: 0.002 });
    this.noise(0, 0.05, 0.3, 1400, 1.2);
    this.tone({ freq: 523.25, at: 0.02, dur: 0.09, type: "square", gain: 0.08, attack: 0.002 });
  }

  /** 中心命中：落地 + 两音上行晶体 chime */
  private sfxG05Perfect() {
    this.sfxG05Land();
    [1046.5, 1568, 2093].forEach((f, i) => {
      this.tone({ freq: f, at: 0.05 + i * 0.06, dur: 0.22, type: "triangle", gain: 0.3, attack: 0.003 });
      this.tone({ freq: f * 2, at: 0.05 + i * 0.06, dur: 0.1, gain: 0.08, attack: 0.003 });
    });
  }

  /** 奖励台：一串像素风琶音 */
  private sfxG05Bonus() {
    [783.99, 987.77, 1174.66, 1567.98, 1975.53].forEach((f, i) =>
      this.tone({ freq: f, at: 0.08 + i * 0.05, dur: 0.12, type: "square", gain: 0.12, attack: 0.002 }),
    );
  }

  /** 掉落：下滑 + 远处的软落地，不惩罚感 */
  private sfxG05Fail() {
    this.tone({ freq: 660, freqEnd: 140, at: 0, dur: 0.55, type: "triangle", gain: 0.34, attack: 0.01 });
    this.tone({ freq: 330, freqEnd: 82, at: 0.05, dur: 0.6, type: "square", gain: 0.08, attack: 0.01 });
    this.tone({ freq: 120, freqEnd: 60, at: 0.62, dur: 0.22, gain: 0.5, attack: 0.004 });
    this.noise(0.62, 0.12, 0.16, 500, 0.8);
  }

  /** G05 起跳音力度（0..1），sfx("g05Launch") 前设置 */
  launchPower = 0.5;

  sfx(kind: SfxKind) {
    try {
      if (!this.ctx || !this.sfxGain) return;
      if (this.ctx.state === "suspended")
        void this.ctx.resume().catch(() => {});
      // 动作类音效触发时 BGM 轻微让位（complete 已有深度 duck）
      if (kind === "hit") this.microDuck(0.5, 0.22);
      else if (kind === "jump" || kind === "reward") this.microDuck();
      switch (kind) {
        case "jump":
          this.sfxJump();
          break;
        case "hit":
          this.sfxHit();
          break;
        case "reward":
          this.sfxReward();
          break;
        case "complete":
          this.sfxComplete();
          break;
        case "g05Launch":
          this.sfxG05Launch(this.launchPower);
          break;
        case "g05Land":
          this.sfxG05Land();
          break;
        case "g05Perfect":
          this.sfxG05Perfect();
          break;
        case "g05Bonus":
          this.sfxG05Bonus();
          break;
        case "g05Fail":
          this.sfxG05Fail();
          break;
      }
    } catch {
      /* 静默 */
    }
  }

  // ---------------------------------------------------------------
  // 新增的轻量合成提示音（参数随游戏状态变化，素材文件做不到）
  // ---------------------------------------------------------------

  /** synth cue：whoosh = G03 重心回正浪花；tick = G05 蓄力刻度；release = 站起释放；spark = 进入落点区 */
  synth(kind: "whoosh" | "tick" | "release" | "spark", opts: PlayOpts & { freq?: number } = {}) {
    try {
      if (!this.ctx || !this.sfxGain || this.silent) return;
      const g = opts.gain ?? 1;
      const at = opts.at ?? 0;
      switch (kind) {
        case "whoosh":
          // 带通噪声从低扫到高再淡出：一道轻柔的浪
          this.noise(at, 0.42, 0.16 * g, 380, 0.9, "bandpass", 1600);
          this.tone({ freq: 220, freqEnd: 330, at, dur: 0.3, gain: 0.05 * g, attack: 0.06 });
          break;
        case "tick":
          this.tone({ freq: opts.freq ?? 523.25, at, dur: 0.07, type: "square", gain: 0.07 * g, attack: 0.002 });
          this.tone({ freq: (opts.freq ?? 523.25) * 2, at, dur: 0.05, gain: 0.05 * g, attack: 0.002 });
          break;
        case "release":
          this.noise(at, 0.035, 0.14 * g, 2400, 1.1);
          this.tone({ freq: 880, freqEnd: 1320, at, dur: 0.06, type: "triangle", gain: 0.1 * g, attack: 0.002 });
          break;
        case "spark":
          [1568, 2093].forEach((f, i) =>
            this.tone({ freq: f, at: at + i * 0.045, dur: 0.12, type: "triangle", gain: 0.08 * g, attack: 0.003 }),
          );
          break;
      }
    } catch {
      /* 静默 */
    }
  }

  /** 给 gameCues 用的发声接口 */
  readonly sink: CueSink = {
    play: (id, opts) => this.play(id, opts),
    synth: (kind, opts) => this.synth(kind, opts),
    duck: (factor, holdSec) => this.duckBgm(factor, 0.25, holdSec),
  };
}

export const audioEngine = new AudioEngine();

// 调试 / 验收探针：允许 e2e 与演示面板直接读取音频状态
if (typeof window !== "undefined")
  (window as unknown as { __yukeeAudio?: AudioEngine }).__yukeeAudio =
    audioEngine;
