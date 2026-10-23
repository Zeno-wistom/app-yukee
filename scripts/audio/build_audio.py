#!/usr/bin/env python3
"""
YUKEE 音频素材构建脚本（可复现）。

依赖：python3 + numpy + soundfile、ffmpeg（含 libmp3lame）。
用法：python3 scripts/audio/build_audio.py [--cache DIR]

1. 从原始发布页的直链下载素材（全部 CC0，见 docs/AUDIO-LICENSES.md）；
2. BGM：按小节网格切出循环区间，把超出的混响尾巴叠回开头（tail-wrap），
   做到无缝循环；统一响度到 -16 LUFS、真峰值 ≤ -1.5 dBTP；编码 MP3 128k；
3. SFX：去掉开头静音、单声道 32 kHz 16-bit WAV（无编码器填充，首包延迟最低）。
CC0 允许修改，以上编辑不改变授权。
"""
import argparse, hashlib, json, os, subprocess, sys, urllib.request, zipfile
import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_BGM = os.path.join(ROOT, "public", "audio", "bgm")
OUT_SFX = os.path.join(ROOT, "public", "audio", "sfx")

OGA = "https://opengameart.org/sites/default/files/"
BGM = [
    # id, 源文件 URL, 循环终点（秒，None=整段即循环）, 额外滤波
    dict(id="g02-happy-lullaby", url=OGA + "song17.mp3", loop_end=38.540, af=None),
    dict(id="g03-8bit-summer-memory", url=OGA + "8_bit_memory_indie_proj_2_ma_0.mp3", loop_end=121.010, af=None),
    # 明亮的方波芯片乐：5 kHz 以上轻压 3 dB，降低长时间试玩的听觉疲劳
    dict(id="g05-flowerbed-fields", url=OGA + "flowerbed_fields.ogg", loop_end=None, af="highshelf=f=5000:g=-3"),
]

KENNEY = {
    "interface": "https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip",
    "jingles": "https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip",
}
# 输出名 → (包, 包内文件名)
SFX = {
    # 全站 UI（同一套 Kenney Interface Sounds，统一音色）
    "ui-click": ("interface", "select_002.ogg"),
    "ui-move": ("interface", "pluck_001.ogg"),
    "ui-confirm": ("interface", "confirmation_002.ogg"),
    "ui-pause": ("interface", "minimize_009.ogg"),
    "ui-resume": ("interface", "maximize_009.ogg"),
    "ui-back": ("interface", "back_002.ogg"),
    "ui-restart": ("interface", "toggle_001.ogg"),
    "ui-error": ("interface", "error_008.ogg"),
    # G02 展翼接光
    "g02-wing-open": ("interface", "maximize_008.ogg"),
    "g02-wing-close": ("interface", "minimize_008.ogg"),
    "g02-star": ("interface", "glass_002.ogg"),
    "g02-gather": ("interface", "glass_001.ogg"),
    "g02-complete": ("jingles", "jingles_PIZZI02.ogg"),
    # G03 躯干重心冲浪
    "g03-lean": ("interface", "pluck_002.ogg"),
    "g03-catch": ("jingles", "jingles_STEEL09.ogg"),
    "g03-streak": ("jingles", "jingles_STEEL10.ogg"),
    "g03-complete": ("jingles", "jingles_STEEL02.ogg"),
    # G05 浅蹲跳一跳
    "g05-score": ("jingles", "jingles_NES09.ogg"),
    "g05-perfect": ("jingles", "jingles_NES14.ogg"),
    "g05-streak": ("jingles", "jingles_NES08.ogg"),
    "g05-fail": ("jingles", "jingles_NES10.ogg"),
    "g05-complete": ("jingles", "jingles_NES12.ogg"),
    "g05-restart": ("jingles", "jingles_NES16.ogg"),
}

def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read())
    return h.hexdigest()

def fetch(url, cache):
    os.makedirs(cache, exist_ok=True)
    dst = os.path.join(cache, url.rsplit("/", 1)[-1])
    if not os.path.exists(dst):
        print("download", url)
        req = urllib.request.Request(url, headers={"User-Agent": "yukee-audio-build"})
        with urllib.request.urlopen(req, timeout=120) as r, open(dst, "wb") as f:
            f.write(r.read())
    return dst

def decode(path, sr=44100, ch=2):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", str(ch), "-ar", str(sr), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, ch).copy()

def loudness_gain(wav, target=-16.0, tp=-1.5):
    out = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "loudnorm=print_format=json", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    j = json.loads(out[out.rindex("{"):out.rindex("}") + 1])
    i, p = float(j["input_i"]), float(j["input_tp"])
    return min(target - i, tp - p), i, p

def build_bgm(cache, manifest):
    os.makedirs(OUT_BGM, exist_ok=True)
    sr = 44100
    for b in BGM:
        src = fetch(b["url"], cache)
        y = decode(src, sr)
        if b["loop_end"]:
            e = int(round(b["loop_end"] * sr))
            loop, tail = y[:e].copy(), y[e:]
            n = min(len(tail), len(loop))
            loop[:n] += tail[:n]          # 混响尾巴叠回开头 → 首尾连续
        else:
            loop = y
        tmp = os.path.join(cache, b["id"] + ".wav")
        sf.write(tmp, loop, sr, subtype="FLOAT")
        g, li, lp = loudness_gain(tmp)
        g = -16.0 - li                     # 统一到 -16 LUFS；峰值由限制器兜住
        af = f"volume={g:.2f}dB" + ("," + b["af"] if b["af"] else "") + ",alimiter=limit=0.84:attack=5:release=50:level=disabled"
        dst = os.path.join(OUT_BGM, b["id"] + ".mp3")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", tmp, "-af", af, "-c:a", "libmp3lame", "-b:a", "128k",
                        "-ar", "44100", dst], check=True)
        manifest["bgm"][b["id"]] = dict(source=b["url"], source_sha256=sha(src), loop_sec=round(len(loop) / sr, 3),
                                        input_lufs=li, gain_db=round(g, 2), file=os.path.relpath(dst, ROOT),
                                        bytes=os.path.getsize(dst))
        print("bgm", b["id"], manifest["bgm"][b["id"]])

def build_sfx(cache, manifest):
    os.makedirs(OUT_SFX, exist_ok=True)
    dirs = {}
    for k, url in KENNEY.items():
        z = fetch(url, cache)
        d = os.path.join(cache, k)
        if not os.path.isdir(d):
            zipfile.ZipFile(z).extractall(d)
        dirs[k] = (d, url, sha(z))
    for name, (pack, fn) in SFX.items():
        d, url, zsha = dirs[pack]
        path = next(os.path.join(r, fn) for r, _, fs in os.walk(d) if fn in fs)
        y = decode(path, 32000, 1)[:, 0]
        thr = 10 ** (-50 / 20) * max(1e-6, np.abs(y).max())
        start = max(0, int(np.argmax(np.abs(y) > thr)) - 32)   # 保留 1 ms 起音
        end = len(y) - int(np.argmax(np.abs(y[::-1]) > thr * 0.3))
        y = y[start:end]
        fade = min(len(y), 320)                                  # 10 ms 尾部淡出，防止截断爆音
        y[-fade:] *= np.linspace(1, 0, fade)
        dst = os.path.join(OUT_SFX, name + ".wav")
        sf.write(dst, y, 32000, subtype="PCM_16")
        manifest["sfx"][name] = dict(pack_url=url, pack_sha256=zsha, file_in_pack=fn,
                                     file=os.path.relpath(dst, ROOT), sec=round(len(y) / 32000, 3), bytes=os.path.getsize(dst))

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.join(ROOT, ".audio-cache"))
    a = ap.parse_args()
    m = {"bgm": {}, "sfx": {}}
    build_bgm(a.cache, m)
    build_sfx(a.cache, m)
    with open(os.path.join(ROOT, "docs", "audio", "audio-manifest.json"), "w") as f:
        json.dump(m, f, ensure_ascii=False, indent=2)
    print("ok", len(m["bgm"]), "bgm", len(m["sfx"]), "sfx")
