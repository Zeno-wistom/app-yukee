/**
 * YUKEE 音频素材目录（唯一来源）。
 *
 * 所有文件与授权记录见 docs/AUDIO-LICENSES.md、docs/audio/audio-manifest.json；
 * 构建脚本 scripts/audio/build_audio.py 可从原始发布页重新生成全部文件。
 *
 * - G01 保留用户提供的原曲（版权待确认），不复制给其他游戏；
 * - G02 / G03 / G05 各用一首不同的 CC0 曲目；
 * - UI 音效统一取自 Kenney Interface Sounds（同一位作者、同一套音色），
 *   游戏完成/得分短乐句取自 Kenney Music Jingles；均为 CC0。
 */

export type BgmId = "yukeeRun" | "winglight" | "leanSurf" | "squatJump";

export interface BgmTrack {
  url: string;
  /** 曲目相对电平（文件已统一到约 -16 LUFS；G01 原曲约 -9 LUFS，保持原 0.5） */
  level: number;
  title: string;
}

export const BGM_TRACKS: Record<BgmId, BgmTrack> = {
  yukeeRun: { url: "/audio/yukee-run-bgm.mp3", level: 0.5, title: "G01 原曲（用户提供，版权待确认）" },
  winglight: { url: "/audio/bgm/g02-happy-lullaby.mp3", level: 0.56, title: "Happy Lullaby (song17) — cynicmusic" },
  leanSurf: { url: "/audio/bgm/g03-8bit-summer-memory.mp3", level: 0.5, title: "8 bit summer memory — Tarush Singhal" },
  squatJump: { url: "/audio/bgm/g05-flowerbed-fields.mp3", level: 0.48, title: "Flowerbed Fields [Loop] — Zane Little Music" },
};

export const isBgmId = (id: string | null | undefined): id is BgmId =>
  !!id && Object.prototype.hasOwnProperty.call(BGM_TRACKS, id);

export type SfxGroup = "ui" | "winglight" | "leanSurf" | "squatJump";

export interface SampleDef {
  group: SfxGroup;
  /** 相对增益（Kenney 素材峰值约 0.9；NES 乐句约 0.55，所以给得更高） */
  gain: number;
  /** 同一音效最短间隔（毫秒），用来挡住识别抖动造成的连发 */
  cooldown: number;
  /** 同一音效最多同时发声数，超过时淡出最早的那一个 */
  voices: number;
}

const def = (group: SfxGroup, gain: number, cooldown = 60, voices = 2): SampleDef => ({ group, gain, cooldown, voices });

export const SAMPLES = {
  // —— 全站 UI ——
  "ui-click": def("ui", 0.32, 50),
  "ui-move": def("ui", 0.34, 70),
  "ui-confirm": def("ui", 0.4, 300, 1),
  "ui-pause": def("ui", 0.36, 200, 1),
  "ui-resume": def("ui", 0.36, 200, 1),
  "ui-back": def("ui", 0.36, 200, 1),
  "ui-restart": def("ui", 0.38, 300, 1),
  "ui-error": def("ui", 0.34, 1200, 1),
  // —— G02 展翼接光 ——
  "g02-wing-open": def("winglight", 0.42, 420, 1),
  "g02-wing-close": def("winglight", 0.36, 420, 1),
  "g02-star": def("winglight", 0.26, 75, 3),
  "g02-gather": def("winglight", 0.46, 300, 2),
  "g02-complete": def("winglight", 0.6, 2000, 1),
  // —— G03 躯干重心冲浪 ——
  "g03-lean": def("leanSurf", 0.28, 500, 1),
  "g03-catch": def("leanSurf", 0.46, 300, 2),
  "g03-streak": def("leanSurf", 0.46, 600, 1),
  "g03-complete": def("leanSurf", 0.58, 2000, 1),
  // —— G05 浅蹲跳一跳 ——
  "g05-score": def("squatJump", 0.5, 200, 2),
  "g05-perfect": def("squatJump", 0.55, 200, 2),
  "g05-streak": def("squatJump", 0.5, 400, 1),
  "g05-fail": def("squatJump", 0.5, 800, 1),
  "g05-complete": def("squatJump", 0.62, 2000, 1),
  "g05-restart": def("squatJump", 0.46, 600, 1),
} satisfies Record<string, SampleDef>;

export type SampleId = keyof typeof SAMPLES;

export const sampleUrl = (id: SampleId) => `/audio/sfx/${id}.wav`;

export const samplesInGroup = (group: SfxGroup) =>
  (Object.keys(SAMPLES) as SampleId[]).filter((id) => SAMPLES[id].group === group);

/** 游戏 → 需要预载的音效组 */
export const GAME_SFX_GROUP: Partial<Record<BgmId, SfxGroup>> = {
  winglight: "winglight",
  leanSurf: "leanSurf",
  squatJump: "squatJump",
};

// ---------------------------------------------------------------
// 用户音量设置（刷新后保留）
// ---------------------------------------------------------------

export interface AudioSettings {
  music: number;
  sfx: number;
  muted: boolean;
}

export const SETTINGS_KEY = "yukee.audio.v2";
const LEGACY_VOLUME_KEY = "yukee.masterVolume";
export const DEFAULT_SETTINGS: AudioSettings = { music: 0.8, sfx: 0.9, muted: false };

const clamp01 = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
};

export function parseSettings(raw: string | null, legacy: string | null): AudioSettings {
  if (raw) {
    try {
      const j = JSON.parse(raw) as Partial<AudioSettings>;
      return {
        music: clamp01(j.music, DEFAULT_SETTINGS.music),
        sfx: clamp01(j.sfx, DEFAULT_SETTINGS.sfx),
        muted: j.muted === true,
      };
    } catch {
      /* 损坏的值回落默认 */
    }
  }
  // 旧版只有一个总音量开关：0 视为静音，其余沿用默认分轨音量
  if (legacy !== null && clamp01(legacy, 1) === 0) return { ...DEFAULT_SETTINGS, muted: true };
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings(): AudioSettings {
  try {
    return parseSettings(window.localStorage.getItem(SETTINGS_KEY), window.localStorage.getItem(LEGACY_VOLUME_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: AudioSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 隐私模式等：只在本次会话生效 */
  }
}

/** 解码后 BGM 的有效循环区间：去掉编码器在首尾补的静音（最多各 0.1 秒）。 */
export function findLoopRegion(channel: Float32Array, sampleRate: number, threshold = 2e-4) {
  const max = Math.min(channel.length >> 1, Math.round(sampleRate * 0.1));
  let a = 0;
  while (a < max && Math.abs(channel[a]) < threshold) a++;
  let b = channel.length;
  while (channel.length - b < max && b > a + 1 && Math.abs(channel[b - 1]) < threshold) b--;
  return { start: a / sampleRate, end: b / sampleRate };
}
