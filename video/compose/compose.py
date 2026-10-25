"""
成片合成：按 out/timeline.json 的镜头表，把三维渲染帧、真实网页录制帧、画中画、字幕与片尾卡
逐帧合成为 1920×1080 / 30fps，直接管道写入 FFmpeg（H.264 High, yuv420p）并封装混音。

用法：python3 compose.py [--preview]   （--preview 只合成每秒 1 帧的接触表，便于检查）
"""
import json, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = "/workspace/work/hark-video-demo/video"
OUT = f"{ROOT}/out"
tl = json.load(open(f"{OUT}/timeline.json"))
FPS, DUR = tl["FPS"], tl["DURATION"]
W, H = 1920, 1080
NFR = int(round(DUR * FPS))
SANS = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SANS_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
font = lambda size, bold=False: ImageFont.truetype(SANS_B if bold else SANS, size, index=2)  # index 2 = SC


def img(path, size=(W, H)):
    im = Image.open(path).convert("RGB")
    return im if im.size == size else im.resize(size, Image.LANCZOS)


def game_frame(t):
    f = round((t - tl["GAME_OFFSET"]) * tl["gameFps"])
    f = max(0, min(tl["gameFrames"] - 1, f))
    return img(f"{OUT}/g05/frames/{f:05d}.jpg")


def main3d(f):
    return img(f"{OUT}/scene/main/{f:05d}.jpg")


def monitor_cap(f):
    return img(f"{OUT}/monitor/{min(f, 353):05d}.jpg")


def blend(a, b, k):
    return Image.blend(a, b, max(0.0, min(1.0, k)))


ease = lambda x: 0 if x <= 0 else 1 if x >= 1 else x * x * (3 - 2 * x)

# —————————— 画中画外框 ——————————
PIP_W, PIP_H, PIP_M = 640, 360, 44
pip_mask = Image.new("L", (PIP_W, PIP_H), 0)
ImageDraw.Draw(pip_mask).rounded_rectangle([0, 0, PIP_W - 1, PIP_H - 1], 18, fill=255)
pip_shadow = Image.new("RGBA", (PIP_W + 80, PIP_H + 80), (0, 0, 0, 0))
ImageDraw.Draw(pip_shadow).rounded_rectangle([40, 46, 40 + PIP_W, 46 + PIP_H], 22, fill=(0, 0, 0, 120))
pip_shadow = pip_shadow.filter(ImageFilter.GaussianBlur(16))


def with_pip(base, f, t, k=1.0):
    p = img(f"{OUT}/scene/pip/{min(max(f, 609), 710):05d}.jpg", (PIP_W, PIP_H))
    x, y = W - PIP_W - PIP_M, H - PIP_H - PIP_M - 70
    canvas = base.convert("RGBA")
    sh = pip_shadow.copy(); sh.putalpha(sh.getchannel("A").point(lambda a: int(a * k)))
    canvas.alpha_composite(sh, (x - 40, y - 40))
    m = pip_mask.point(lambda a: int(a * k))
    canvas.paste(p, (x, y), m)
    d = ImageDraw.Draw(canvas)
    tag = "第三视角 · 同一时间轴"
    fz = font(20)
    tw = d.textlength(tag, font=fz)
    d.rounded_rectangle([x + 14, y + 14, x + 14 + tw + 24, y + 14 + 34], 17, fill=(16, 32, 28, int(200 * k)))
    d.text((x + 26, y + 18), tag, font=fz, fill=(226, 240, 230, int(255 * k)))
    return canvas.convert("RGB")


# —————————— 字幕 ——————————
CAPTIONS = [
    (0.7, 4.7, "YUKEE · 屏幕挂灯健康陪伴机器人", "它安装在显示器上方，安静地陪你工作"),
    (5.3, 8.4, "连续专注 45 分钟", "YUKEE 抬起目光，灯条呼吸，屏幕给出温和提醒"),
    (8.8, 11.3, "抬头回应 YUKEE", "点击「开始活动」，进入体感游戏"),
    (11.9, 16.9, "真实网页录制", "游戏选择 → G05 浅蹲跳一跳"),
    (17.6, 20.1, "浅蹲蓄力，站直起跳", "人物动作与游戏输入由同一条时间轴驱动"),
    (20.6, 23.5, "完美落点", "落在平台中心：+2，连续完美触发连击"),
    (24.0, 28.0, "动一动，再回到工作", "YUKEE 以表情回应完成的每一次活动"),
]


def caption_layer(t):
    for a, b, title, sub in CAPTIONS:
        if a - 0.01 <= t <= b:
            k = min(ease((t - a) / 0.35), ease((b - t) / 0.35))
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(layer)
            x, y = 96, H - 168
            ft, fs = font(44, True), font(26)
            # 柔和底部渐隐，保证文字可读
            grad = Image.new("L", (1, 300))
            for i in range(300):
                grad.putpixel((0, i), int(150 * (i / 299) ** 1.6 * k))
            shade = Image.new("RGBA", (W, 300), (8, 14, 12, 255)); shade.putalpha(grad.resize((W, 300)))
            layer.alpha_composite(shade, (0, H - 300))
            d.rectangle([x, y + 8, x + 4, y + 96], fill=(156, 222, 190, int(255 * k)))
            d.text((x + 24, y - 2), title, font=ft, fill=(246, 244, 238, int(255 * k)))
            d.text((x + 24, y + 62), sub, font=fs, fill=(214, 224, 218, int(235 * k)))
            return layer
    return None


def end_card(t):
    a = tl["CUES"]["endCard"]
    if t < a:
        return None
    k = ease((t - a) / 0.9)
    layer = Image.new("RGBA", (W, H), (12, 26, 22, int(222 * k)))
    d = ImageDraw.Draw(layer)
    c = (240, 244, 238, int(255 * k))
    d.text((W / 2, H / 2 - 80), "YUKEE", font=font(110, True), fill=c, anchor="mm")
    d.text((W / 2, H / 2 + 22), "工作的间隙，和它一起动一动", font=font(36), fill=(214, 230, 220, int(255 * k)), anchor="mm")
    note = "演示说明：人物动作为预设时间轴驱动，游戏输入经由项目既有「键盘演示」接口；画面为真实游戏运行录制，非真人摄像头识别实测。"
    d.text((W / 2, H - 92), note, font=font(21), fill=(170, 192, 182, int(230 * k)), anchor="mm")
    return layer


# —————————— 单帧 ——————————
S = {s["id"]: s for s in tl["SHOTS"]}


def frame(f):
    t = f / FPS
    if t < 11.6:
        im = main3d(f)
        if t >= 11.2:  # 推进到屏幕：三维屏幕 → 平面屏幕画面
            im = blend(im, monitor_cap(f), ease((t - 11.2) / 0.4))
    elif t < 17.3:
        im = game_frame(t)
        if 14.98 <= t < 16.6:
            # 录制环境没有摄像头，校准页会显示「摄像头暂不可用」：此处停在 G05 开场画面并溶解进游戏，
            # 不展示该环境性提示（文档中说明）。游戏本身的画面与时间不受影响。
            hold = img(f"{OUT}/g05/frames/00120.jpg")
            z = 1 + 0.025 * ease((t - 14.98) / 1.6)
            hold = hold.resize((int(W * z), int(H * z)), Image.LANCZOS).crop((int((W * z - W) / 2), int((H * z - H) / 2), int((W * z - W) / 2) + W, int((H * z - H) / 2) + H))
            im = blend(hold, game_frame(max(t, 16.56)), ease((t - 15.85) / 0.7))
        if t < 11.85:  # 点击「开始活动」后：提醒界面 → 游戏选择
            im = blend(monitor_cap(f), im, ease((t - 11.6) / 0.25))
        if t >= 16.95:  # 切回第三视角
            im = blend(im, main3d(max(f, 519)), ease((t - 16.95) / 0.35))
    elif t < 20.3:
        im = main3d(f)
    elif t < 23.7:
        im = with_pip(game_frame(t), f, t, ease((t - 20.3) / 0.25))
        if t >= 23.35:
            im = blend(im, main3d(max(f, 711)), ease((t - 23.35) / 0.35))
    else:
        im = main3d(f)
    cap = caption_layer(t)
    end = end_card(t)
    if cap or end:
        rgba = im.convert("RGBA")
        if cap: rgba.alpha_composite(cap)
        if end: rgba.alpha_composite(end)
        im = rgba.convert("RGB")
    # 开头淡入 / 结尾淡出
    k = min(ease(t / 0.6), ease((DUR - t) / 0.5))
    if k < 1:
        im = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), im, k)
    return im


# S5a 实际从 17.3 s（帧 519）开始，此前 16.95–17.3 的过渡用帧 519 的画面
_main3d = main3d
def main3d(f):  # noqa: F811
    if 348 <= f < 519:
        f = 519
    if 609 <= f < 711:
        f = 711
    return _main3d(min(f, 929))


if __name__ == "__main__":
    if "--preview" in sys.argv:
        fs = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else list(range(0, NFR, 30))
        cols = 4; tw, th = 480, 270
        sheet = Image.new("RGB", (cols * tw, ((len(fs) + cols - 1) // cols) * th))
        for i, f in enumerate(fs):
            sheet.paste(frame(f).resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
        sheet.save(f"{OUT}/preview_sheet.jpg", quality=88)
        print("sheet", len(fs))
        sys.exit(0)
    mp4 = sys.argv[1] if len(sys.argv) > 1 else f"{OUT}/yukee-demo-sample-hark.mp4"
    ff = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", f"{OUT}/mix.wav", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4], stdin=subprocess.PIPE)
    for f in range(NFR):
        ff.stdin.write(frame(f).tobytes())
        if f % 60 == 0:
            print("frame", f, flush=True)
    ff.stdin.close(); ff.wait()
    print("wrote", mp4)
