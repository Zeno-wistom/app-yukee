"""
样片混音（48 kHz 立体声）。

声音来源：
  1. 真实游戏音频：录制 G05 时用 OfflineAudioContext 渲染出的引擎真实输出（out/g05/game-audio.wav），
     包含选择页 UI 音效、G05 BGM（Flowerbed Fields, CC0）、蓄力 / 起跳 / 落地 / 完美命中 / 连击音效。
     按 GAME_OFFSET 对齐成片时间；摄像头不可用提示音（ui-error）所在 0.4 s 被静音。
  2. 开场音乐床：仓库已授权素材 g02-happy-lullaby.mp3（CC0），低电平。
  3. 演示合成音（明确标注，不属于产品既有音效）：房间底噪、键盘敲击、YUKEE 提醒双音、鼠标点击。
"""
import json, subprocess, wave, sys
import numpy as np

ROOT = "/workspace/work/hark-video-demo"
OUT = f"{ROOT}/video/out"
SR = 48000
tl = json.load(open(f"{OUT}/timeline.json"))
DUR = tl["DURATION"]
N = int(DUR * SR)
mix = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(7)


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def put(sig, t, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    if i < 0:
        sig = sig[-i:]; i = 0
    n = min(len(sig), N - i)
    mix[i:i + n] += sig[:n] * gain


def env(n, a, r):
    e = np.ones(n, np.float32)
    na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def fade(sig, t0, t1, fin, fout):
    """在成片时间 [t0,t1] 内淡入淡出（sig 已对齐到 0 秒）"""
    t = np.arange(len(sig)) / SR
    g = np.clip((t - t0) / max(fin, 1e-3), 0, 1) * np.clip((t1 - t) / max(fout, 1e-3), 0, 1)
    return sig * g[:, None]


# —— 1. 开场音乐床 ——
bed = load(f"{ROOT}/public/audio/bgm/g02-happy-lullaby.mp3")
bed = np.concatenate([bed] * 3)[:N]
bed = fade(np.pad(bed, ((0, max(0, N - len(bed))), (0, 0)))[:N], 0.0, 16.9, 2.5, 1.3)
mix += bed * 0.16

# —— 2. 房间底噪（极低） ——
noise = rng.standard_normal((N, 2)).astype(np.float32)
k = np.ones(400, np.float32) / 400
for c in range(2):
    noise[:, c] = np.convolve(noise[:, c], k, mode="same")
noise = fade(noise, 0, tl["CUES"]["screenCut"] + 0.4, 1.0, 0.8)
mix += noise * 0.05

# —— 3. 键盘敲击（与人物打字时段一致：0–5.9 s、7.4–8.6 s） ——
def key_click():
    n = int(0.03 * SR)
    s = rng.standard_normal(n).astype(np.float32) * np.exp(-np.linspace(0, 9, n)).astype(np.float32)
    s = np.convolve(s, np.ones(6) / 6, mode="same")
    return np.stack([s, s], 1)

t = 0.25
while t < 8.55:
    if t < 5.95 or 7.4 < t < 8.55:
        pan = rng.uniform(0.85, 1.0)
        put(key_click() * np.array([pan, 2 - pan], np.float32), t, rng.uniform(0.05, 0.09))
    t += rng.uniform(0.09, 0.22) if rng.random() > 0.08 else rng.uniform(0.4, 0.7)

# —— 4. YUKEE 提醒双音（演示合成；产品当前没有提醒音效） ——
def chime(freq, dur=1.4):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = (np.sin(2 * np.pi * freq * tt) + 0.35 * np.sin(2 * np.pi * freq * 2 * tt) * np.exp(-tt * 6)) * np.exp(-tt * 3.2)
    s *= env(n, 0.006, 0.2)
    return np.stack([s, s], 1).astype(np.float32)

r = tl["CUES"]["reminder"]
put(chime(1318.5), r, 0.16)
put(chime(1975.5), r + 0.16, 0.13)

# —— 5. 鼠标点击「开始活动」（10.9 s，与画面光标按下同一帧） ——
click = load(f"{ROOT}/public/audio/sfx/ui-click.wav")
put(click, 10.9, 0.35)

# —— 6. 真实游戏音频 ——
game = load(f"{OUT}/g05/game-audio.wav")
g0 = tl["GAME_OFFSET"] + tl["audioT0"] / 1000.0
gsig = np.zeros((N, 2), np.float32)
i0 = int(g0 * SR)
n = min(len(game), N - i0)
gsig[i0:i0 + n] = game[:n]
# 摄像头不可用提示音（录制环境无摄像头）静音
err = [s["t"] for s in json.load(open(f"{OUT}/g05/events.json"))["sounds"] if s["url"].endswith("ui-error.wav")]
for e in err:
    a = int((e / 1000 + tl["GAME_OFFSET"] - 0.02) * SR); b = a + int(0.45 * SR)
    gsig[a:b] *= 0
gsig = fade(gsig, tl["CUES"]["screenCut"] - 0.1, DUR - 0.2, 0.3, 2.6)
mix += gsig * 1.0

# —— 7. 结尾：G05 完成乐句（产品素材，Kenney CC0）作为片尾点缀 ——
put(load(f"{ROOT}/public/audio/sfx/g05-complete.wav"), tl["CUES"]["endCard"] + 0.2, 0.32)

# 限幅与归一
peak = np.abs(mix).max()
mix = mix / max(1.0, peak / 0.89)
pcm = (np.clip(mix, -1, 1) * 32767).astype(np.int16)
with wave.open(f"{OUT}/mix.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("mix.wav", DUR, "s, peak", round(float(peak), 3))
