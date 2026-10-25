"""
最终版混音（48 kHz 立体声）。

  · 连续背景音乐：Flowerbed Fields（OpenGameArt，CC0；仓库 public/audio/bgm/g05-flowerbed-fields.mp3）。
    全片一首，不按游戏换曲；G01 原曲版权待确认，不使用。
  · 真实游戏交互音效：四款游戏录制时由游戏音频引擎实时输出（音乐音量设为 0，只保留音效），
    按各段源时间窗对齐，段首尾 60 ms 淡入淡出；录制环境「摄像头不可用」提示音（ui-error）不进入成片。
  · 真实 UI 音效：选择页切卡 / 进入（选择页录制），「开始活动」点击（产品 ui-click.wav）。
  · 演示合成音（产品里没有，交接文档已标注）：键盘敲击、YUKEE 提醒音（两次：呼吸提示、变色提示）、
    转场气流声。
  · 成功反馈收尾：产品素材 g05-complete.wav（Kenney CC0）。
"""
import json, subprocess, wave
import numpy as np

ROOT = "/workspace/work/hark-video-demo"
OUT = f"{ROOT}/video/out"
SR = 48000
TL = json.load(open(f"{OUT}/timeline2.json"))
DUR = TL["DURATION"]; N = int(DUR * SR)
GAMES, CUES = TL["GAMES"], TL["CUES"]
rng = np.random.default_rng(11)
mix = np.zeros((N, 2), np.float32)


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def put(sig, t, gain=1.0, buf=None):
    buf = mix if buf is None else buf
    i = int(round(t * SR))
    if i < 0: sig = sig[-i:]; i = 0
    n = min(len(sig), N - i)
    if n > 0: buf[i:i + n] += sig[:n] * gain


def env_curve(points):
    """分段线性包络 [(t, gain), ...]"""
    t = np.arange(N) / SR
    xs, ys = zip(*points)
    return np.interp(t, xs, ys).astype(np.float32)


# —— 1. 背景音乐（全片连续） ——
bgm = load(f"{ROOT}/public/audio/bgm/g05-flowerbed-fields.mp3")
bgm = np.concatenate([bgm, bgm])[:N]
bgm = np.pad(bgm, ((0, max(0, N - len(bgm))), (0, 0)))
g = env_curve([(0, 0), (1.6, 0.42), (10.4, 0.42), (10.6, 0.26), (13.6, 0.26), (14.2, 0.42), (17.9, 0.42),
               (18.2, 0.3), (39.8, 0.3), (40.3, 0.44), (45.0, 0.44), (46.0, 0.4), (DUR - 0.2, 0.0), (DUR, 0)])
mix += bgm * g[:, None]

# —— 2. 键盘敲击（人物打字时段；时间流逝镜头里更快） ——
def key_click():
    n = int(0.028 * SR)
    s = rng.standard_normal(n).astype(np.float32) * np.exp(-np.linspace(0, 9, n)).astype(np.float32)
    s = np.convolve(s, np.ones(6) / 6, mode="same")
    return np.stack([s, s], 1)

t = 0.3
while t < CUES["reminder"]:
    if not (3.0 < t < 4.5) and not (8.2 < t < 8.9) and not (CUES["neckRub"] < t < CUES["neckRub"] + 1.4):
        pan = rng.uniform(0.85, 1.0)
        put(key_click() * np.array([pan, 2 - pan], np.float32), t, rng.uniform(0.045, 0.08))
    fast = 1.8 if CUES["timelapseStart"] < t < CUES["timelapseEnd"] else 1.0
    t += (rng.uniform(0.09, 0.22) if rng.random() > 0.08 else rng.uniform(0.4, 0.7)) / fast
t = CUES["returnClick"] + 0.55  # 点完「回到专注」后手回到键盘再打字；44.4–45.4 s 用鼠标，不出键声
while t < DUR - 1.0:
    if not (44.4 < t < 45.4):
        put(key_click(), t, rng.uniform(0.03, 0.05))
    t += rng.uniform(0.12, 0.3)

# —— 3. 转场气流（时间流逝、进入游戏、回到产品） ——
def whoosh(d=0.9):
    n = int(d * SR); s = rng.standard_normal(n).astype(np.float32)
    for _ in range(3): s = np.convolve(s, np.ones(24) / 24, mode="same")
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    return np.stack([s * e, s * e], 1).astype(np.float32)

for tt, gn in [(CUES["timelapseStart"] - 0.35, 0.5), (GAMES["g01"]["start"] - 0.4, 0.45), (40.0 - 0.35, 0.4), (CUES["endTitle"] - 0.5, 0.35)]:
    put(whoosh(), tt, gn)

# —— 4. YUKEE 提醒音（演示合成：柔和两音 → 稍明亮的变色提示） ——
def chime(freq, dur=1.5, bright=0.35):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * tt) + bright * np.sin(2 * np.pi * freq * 2 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 3.0)
    s[: int(0.006 * SR)] *= np.linspace(0, 1, int(0.006 * SR))
    return np.stack([s, s], 1).astype(np.float32)

r = CUES["reminder"]
put(chime(1046.5), r, 0.16); put(chime(1318.5), r + 0.18, 0.13)
c = CUES["colorCue"]
put(chime(1318.5, bright=0.5), c, 0.13); put(chime(1568.0, bright=0.5), c + 0.14, 0.12); put(chime(2093.0, bright=0.5), c + 0.28, 0.08)

# —— 5. 「开始活动」点击 ——
put(load(f"{ROOT}/public/audio/sfx/ui-click.wav"), CUES["click"], 0.4)
put(load(f"{ROOT}/public/audio/sfx/ui-click.wav"), CUES["returnClick"], 0.3)  # 奖励页「回到专注」

# —— 6. 选择页真实 UI 音效 ——
sel_t0 = CUES["selectStart"] - TL["SELECT_LEAD"]
sel = load(f"{OUT}/games/select/game-audio.wav")
seg = np.zeros((N, 2), np.float32)
put(sel, sel_t0 + TL["selectAudioT0"], 1.0, seg)
gate = env_curve([(0, 0), (CUES["selectStart"] - 0.05, 0), (CUES["selectStart"], 1), (GAMES["g01"]["start"] - 0.2, 1), (GAMES["g01"]["start"], 0), (DUR, 0)])
mix += seg * gate[:, None] * 0.8

# —— 7. 四款游戏真实交互音效 ——
for gid, G in GAMES.items():
    ev = json.load(open(f"{OUT}/games/{gid}/events.json"))
    wav = load(f"{OUT}/games/{gid}/game-audio.wav")
    seg = np.zeros((N, 2), np.float32)
    off = G["start"] - G["src"]  # 成片时间 = 源时间 + off
    put(wav, off + ev["audioT0"] / 1000, 1.0, seg)
    for s in ev["sounds"]:  # 录制环境的「摄像头不可用」提示音
        if s["url"].endswith("ui-error.wav"):
            a = int((s["t"] / 1000 + off - 0.02) * SR); seg[max(0, a): max(0, a) + int(0.5 * SR)] = 0
    gate = env_curve([(0, 0), (G["start"] - 0.06, 0), (G["start"], 1), (G["end"] - 0.06, 1), (G["end"] + 0.12, 0), (DUR, 0)])
    mix += seg * gate[:, None] * 1.0

# —— 8. 正向反馈与片尾 ——
put(load(f"{ROOT}/public/audio/sfx/g05-complete.wav"), 40.05, 0.3)
put(chime(1568.0, 2.2, 0.2), CUES["endTitle"] + 0.05, 0.06); put(chime(2093.0, 2.2, 0.2), CUES["endTitle"] + 0.3, 0.05)

peak = float(np.abs(mix).max())
mix = mix / max(1.0, peak / 0.89)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(f"{OUT}/mix2.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("mix2.wav", DUR, "s, peak", round(peak, 3))
