/**
 * Yukee 音频引擎（单例）。
 *
 * 结构：master ← bgmGain（BGM 循环）/ sfxGain（合成音效）。
 * - unlock() 必须在用户手势调用栈内执行（开始活动 / 准备好了），
 *   只创建并 resume AudioContext + 预载 BGM，不播放任何声音。
 * - BGM 播放时机严格绑定「游戏世界被唤醒」（进入 yukeeRun 相位），
 *   由 ProductApp 相位驱动；finale / complete 事件负责 duck 与收尾。
 * - SFX 全部由 WebAudio 合成：无第三方素材、无版权问题，
 *   风格目标「温暖 + 清楚 + 短促 + 有反馈力度」。
 *
 * 任何公开方法都不会抛异常：自动化 / 无音频设备环境下静默降级。
 */

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

const BGM_URL = "/audio/yukee-run-bgm.mp3";
/** BGM 相对响度（master 之前） */
const BGM_LEVEL = 0.5;
/** SFX 相对响度（master 之前） */
const SFX_LEVEL = 0.98;
const VOLUME_KEY = "yukee.masterVolume";

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  at: number; // 相对 now 的秒偏移
  dur: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private bgmBuffer: AudioBuffer | null = null;
  private bgmSource: AudioBufferSourceNode | null = null;
  private bgmLoading: Promise<AudioBuffer | null> | null = null;
  private bgmPlaying = false;
  /** 递增令牌：取消在途的「等解码完再播」回调 */
  private bgmToken = 0;
  private masterVolume = 0.9;
  private effects = new Map<AudioScheduledSourceNode, () => void>();

  private trackEffect(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.effects.set(source, cleanup);
    source.onended = () => { this.effects.delete(source); cleanup(); };
  }

  /** 暂停或切换活动时连同尚未播放的奖励音一起取消，不能串到下一局。 */
  stopEffects() {
    this.chargeStop();
    for (const [source, cleanup] of this.effects) {
      source.onended = null;
      try { source.stop(); } catch { /* 已结束 */ }
      cleanup();
    }
    this.effects.clear();
  }

  getDiagnostics() {
    return { bgmActive: this.bgmPlaying, effectsActive: this.effects.size, charging: !!this.charge };
  }

  /** Idle warm-up: construct the local audio graph only. No resume, fetch or playback. */
  prepare() {
    try {
      if (!this.ctx) {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.connect(this.master);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = SFX_LEVEL;
        this.sfxGain.connect(this.master);
        let saved = 0.9;
        try {
          const raw = window.localStorage.getItem(VOLUME_KEY);
          if (raw !== null) saved = Math.min(1, Math.max(0, Number(raw)));
        } catch {
          /* localStorage 不可用时用默认值 */
        }
        this.masterVolume = saved;
        this.master.gain.value = saved;
      }
    } catch {
      /* 无音频环境：静默 */
    }
  }

  /** 用户手势内调用：恢复 AudioContext 并预载 BGM，不播放声音。 */
  unlock() {
    this.prepare();
    try {
      if (this.ctx?.state === "suspended") void this.ctx.resume().catch(() => {});
      this.preloadBgm();
    } catch { /* 无音频环境：静默 */ }
  }

  setMasterVolume(v: number) {
    try {
      this.masterVolume = Math.min(1, Math.max(0, v));
      if (this.master && this.ctx)
        this.master.gain.setTargetAtTime(
          this.masterVolume,
          this.ctx.currentTime,
          0.05,
        );
      window.localStorage.setItem(VOLUME_KEY, String(this.masterVolume));
    } catch {
      /* 静默 */
    }
  }

  getMasterVolume() {
    if (!this.ctx) {
      try {
        const raw = window.localStorage.getItem(VOLUME_KEY);
        if (raw !== null) return Math.min(1, Math.max(0, Number(raw)));
      } catch {
        /* 默认 */
      }
    }
    return this.masterVolume;
  }

  private preloadBgm() {
    if (!this.ctx || this.bgmBuffer || this.bgmLoading) return;
    const ctx = this.ctx;
    this.bgmLoading = fetch(BGM_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`bgm ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => ctx.decodeAudioData(buf))
      .then((audio) => {
        this.bgmBuffer = audio;
        return audio;
      })
      .catch(() => {
        this.bgmLoading = null;
        return null;
      });
  }

  /** 游戏世界被唤醒：BGM 淡入循环。 */
  playBgm(fadeInSec = 1.8) {
    try {
      if (!this.ctx || !this.bgmGain || this.bgmPlaying) return;
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const token = ++this.bgmToken;
      const start = (buffer: AudioBuffer) => {
        if (token !== this.bgmToken || this.bgmPlaying || !this.bgmGain) return;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.connect(this.bgmGain);
        const now = ctx.currentTime;
        this.bgmGain.gain.cancelScheduledValues(now);
        this.bgmGain.gain.setValueAtTime(0.0001, now);
        this.bgmGain.gain.exponentialRampToValueAtTime(
          BGM_LEVEL,
          now + fadeInSec,
        );
        source.start();
        this.bgmSource = source;
        this.bgmPlaying = true;
      };
      if (this.bgmBuffer) start(this.bgmBuffer);
      else if (this.bgmLoading)
        void this.bgmLoading.then((buf) => {
          if (buf) start(buf);
        });
    } catch {
      /* 静默 */
    }
  }

  /** 临近终点 / 长奖励音：压低 BGM，不抢戏。 */
  duckBgm(factor = 0.38, rampSec = 0.9) {
    try {
      if (!this.ctx || !this.bgmGain || !this.bgmPlaying) return;
      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(
        BGM_LEVEL * Math.min(1, Math.max(0, factor)),
        now,
        rampSec / 3,
      );
    } catch {
      /* 静默 */
    }
  }

  /** 结束 / 退出：淡出并停止。 */
  stopBgm(fadeOutSec = 1.6) {
    try {
      this.bgmToken++;
      if (!this.ctx || !this.bgmGain) {
        this.bgmPlaying = false;
        return;
      }
      const source = this.bgmSource;
      this.bgmSource = null;
      this.bgmPlaying = false;
      if (!source) return;
      const now = this.ctx.currentTime;
      this.bgmGain.gain.cancelScheduledValues(now);
      this.bgmGain.gain.setTargetAtTime(0.0001, now, fadeOutSec / 3);
      source.stop(now + fadeOutSec + 0.1);
      source.onended = () => {
        try {
          source.disconnect();
        } catch {
          /* 已断开 */
        }
      };
    } catch {
      /* 静默 */
    }
  }

  get bgmActive() {
    return this.bgmPlaying;
  }

  // ---------------------------------------------------------------
  // SFX 合成
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

  private noise(
    at: number,
    dur: number,
    gain: number,
    filterFreq: number,
    q = 1,
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    this.trackEffect(src, () => { src.disconnect(); filter.disconnect(); g.disconnect(); });
    src.start(t0);
  }

  /** SFX 触发瞬间让 BGM 让位；Hit 使用更深、更完整的 220ms 窗口。 */
  private microDuck(ratio = 0.62, hold = 0.1) {
    try {
      if (!this.ctx || !this.bgmGain || !this.bgmPlaying) return;
      const now = this.ctx.currentTime;
      const g = this.bgmGain.gain;
      const current = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(Math.min(current, BGM_LEVEL), now);
      g.linearRampToValueAtTime(BGM_LEVEL * ratio, now + 0.025);
      g.setValueAtTime(BGM_LEVEL * ratio, now + hold);
      g.linearRampToValueAtTime(BGM_LEVEL, now + hold + 0.055);
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
}

export const audioEngine = new AudioEngine();

// 调试 / 验收探针：允许 e2e 与演示面板直接读取音频状态
if (typeof window !== "undefined")
  (window as unknown as { __yukeeAudio?: AudioEngine }).__yukeeAudio =
    audioEngine;
