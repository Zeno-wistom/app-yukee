"""
YUKEE 产品体验演示 · 最终版合成（1920×1080 / 30 fps）

输入：
  out/scene/main/*.jpg   三维全画面镜头（Three.js 逐帧渲染）
  out/scene/pip/*.jpg    游戏段人物视角（600×800 竖幅，同一时间轴）
  out/games/<g>/frames   四款真实游戏的浏览器录制帧
  out/games/select/frames 真实游戏选择页录制
  out/monitor            真实主显示器界面录制
视觉规范（统一）：
  安全边距 64 px；字体 Noto Sans CJK SC（中英文同一字族，避免混排间距异常）；
  字号层级：kicker 22 / 标题 46 Bold / 正文 26；品牌紫 #6E56CF 只用于 kicker、强调与图形；
  正文黑灰 #1E1F22 / #5A5C61；暖白底 #F3EFE9。
用法：python3 compose2.py [out.mp4] | --preview f1,f2,...
"""
import json, math, subprocess, sys
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = "/workspace/work/hark-video-demo/video"
OUT = f"{ROOT}/out"
FPS, W, H = 30, 1920, 1080
TL = json.load(open(f"{OUT}/timeline2.json"))
DUR = TL["DURATION"]; NFR = int(round(DUR * FPS))
GAMES, CUES = TL["GAMES"], TL["CUES"]
SANS = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
SANS_B = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
SANS_M = SANS_B  # 系统只有 Regular / Bold 两个字重：kicker 与小标签用 Bold


@lru_cache(None)
def font(size, w="r"):
    return ImageFont.truetype({"r": SANS, "b": SANS_B, "m": SANS_M}[w], size, index=2)


PURPLE = (110, 86, 207)
INK = (30, 31, 34)
INK2 = (90, 92, 97)
PAPER = (243, 239, 233)
M = 64  # 安全边距
TOPY = M + 36  # 三维镜头标题块统一放在左上角（画面下半部常被人物、椅子、屏幕占据）
PREVIEW = "--preview" in sys.argv

ease = lambda x: 0.0 if x <= 0 else 1.0 if x >= 1 else x * x * (3 - 2 * x)
ramp = lambda t, a, b: ease((t - a) / (b - a))


@lru_cache(maxsize=24)
def img(path, size=(W, H)):
    im = Image.open(path).convert("RGB")
    return im if im.size == size else im.resize(size, Image.LANCZOS)


def main3d(f):
    return img(f"{OUT}/scene/main/{f:05d}.jpg")


def pip(f):
    import os
    p = f"{OUT}/scene/pip/{f:05d}.jpg"
    if PREVIEW and not os.path.exists(p):  # 预览时允许用最近的已渲染帧
        have = sorted(int(x[:5]) for x in os.listdir(f"{OUT}/scene/pip"))
        p = f"{OUT}/scene/pip/{min(have, key=lambda x: abs(x - f)):05d}.jpg"
    return img(p, (600, 800))


def game_frame(g, t, size=(W, H)):
    s = TL["games"][g]
    f = round((t - GAMES[g]["start"] + GAMES[g]["src"]) * FPS)
    f = max(s["firstFrame"], min(s["frames"] - 1, f))
    return img(f"{OUT}/games/{g}/frames/{f:05d}.jpg", size)


def select_frame(t):
    f = max(0, min(TL["selectFrames"] - 1, round((t - CUES["selectStart"] + TL["SELECT_LEAD"]) * FPS)))
    return img(f"{OUT}/games/select/frames/{f:05d}.jpg")


def monitor_frame(f):
    return img(f"{OUT}/monitor/{min(f, NFR - 1):05d}.jpg")


def blend(a, b, k):
    return a if k <= 0 else b if k >= 1 else Image.blend(a, b, k)


# —————————— 文字 ——————————
def text_w(d, s, f, spacing=0):
    return d.textlength(s, font=f) + spacing * max(0, len(s) - 1)


def draw_spaced(d, xy, s, f, fill, spacing=0):
    x, y = xy
    if not spacing:
        d.text((x, y), s, font=f, fill=fill); return
    for ch in s:
        d.text((x, y), ch, font=f, fill=fill); x += d.textlength(ch, font=f) + spacing


def caption(layer, t, a, b, kicker, title, body, x=M + 32, ybase=H - M - 18, dark=True, title_size=46, top=None):
    """左下角标题块：kicker / 标题 / 正文，底边对齐 ybase，左对齐 x。进出场 0.35 s 淡入 + 12 px 上移。"""
    if not (a - 0.01 <= t <= b):
        return
    k = min(ease((t - a) / 0.35), ease((b - t) / 0.35))
    dy = (1 - k) * 12
    d = ImageDraw.Draw(layer)
    al = int(255 * k)
    ink = (*INK, al) if dark else (246, 244, 239, al)
    ink2 = (*INK2, al) if dark else (222, 224, 220, al)
    fk, ft, fb = font(22, "m"), font(title_size, "b"), font(26)
    y_body = ybase - 34
    y_title = y_body - (title_size + 22) if body else ybase - title_size - 10
    y_kick = y_title - 40
    if top is not None:  # 顶部对齐版本（画面下半部被屏幕占据时）
        sh = top - y_kick; y_kick += sh; y_title += sh; y_body += sh
    d.rectangle([x - 32, y_kick + 12, x - 32 + 22, y_kick + 15], fill=(*PURPLE, al))
    draw_spaced(d, (x, y_kick + dy), kicker, fk, (*PURPLE, al), 2)
    d.text((x, y_title + dy), title, font=ft, fill=ink)
    if body:
        d.text((x, y_body + dy), body, font=fb, fill=ink2)


def soft_scrim(layer, k, light=True):
    """标题块（左上角）后方的柔和暖白渐隐，保证可读，不遮挡人物与产品"""
    if k <= 0:
        return
    g = Image.new("L", (W // 8, 400 // 8))
    px = g.load()
    for y in range(400 // 8):
        for x in range(W // 8):
            v = (1 - y / (400 / 8 - 1)) ** 1.6 * max(0.0, 1 - x * 8 / 1250) ** 1.3
            px[x, y] = int(150 * v * k)
    g = g.resize((W, 400), Image.BILINEAR)
    sh = Image.new("RGBA", (W, 400), (243, 239, 233, 255)); sh.putalpha(g)
    layer.alpha_composite(sh, (0, 0))


_scrim_cache = {}


def scrim(layer, k):
    key = round(k, 2)
    if key not in _scrim_cache:
        l = Image.new("RGBA", (W, H), (0, 0, 0, 0)); soft_scrim(l, key); _scrim_cache[key] = l
    layer.alpha_composite(_scrim_cache[key])


def clock_text(t):
    a = 14 * 60 + 40; b = 15 * 60 + 25
    k = ramp(t, CUES["timelapseStart"], CUES["timelapseEnd"])
    m = round(a + (b - a) * k)
    return f"{m // 60:02d}:{m % 60:02d}"


# —————————— 游戏段版式 ——————————
GW, GH = 1344, 756  # 游戏画面等比缩放 0.7（不拉伸）
GX, GY = M, (H - GH) // 2
PW, PH = 400, 533  # 人物视角 3:4
PX, PY = W - M - PW, GY
R = 18


def rounded_mask(w, h, r):
    m = Image.new("L", (w, h), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], r, fill=255); return m


MASK_G, MASK_P = rounded_mask(GW, GH, R), rounded_mask(PW, PH, R)


@lru_cache(None)
def shadow(w, h):
    s = Image.new("RGBA", (w + 120, h + 120), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle([60, 70, 60 + w, 70 + h], R + 6, fill=(40, 30, 60, 70))
    return s.filter(ImageFilter.GaussianBlur(24))


@lru_cache(None)
def layout_bg():
    bg = Image.new("RGB", (W, H), PAPER)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([1240, -700, 2520, 580], outline=(150, 122, 240, 70), width=70)  # 海报中的紫色弧形
    glow = glow.filter(ImageFilter.GaussianBlur(60))
    bg = bg.convert("RGBA"); bg.alpha_composite(glow)
    return bg


GAME_TEXT = {
    "g01": ("01 / 04  ·  MOVE TO PLAY", "拾光跑者", "抬头跳 · 低头躲 · 转头收能量", "头部动作"),
    "g02": ("02 / 04  ·  MOVE TO PLAY", "展翼接光", "缓慢展开双臂 · 保持 · 回位收光", "双臂动作"),
    "g03": ("03 / 04  ·  MOVE TO PLAY", "星海冲浪", "躯干重心 · 往阳光一侧轻轻侧倾", "躯干重心"),
    "g05": ("04 / 04  ·  MOVE TO PLAY", "浅蹲跳一跳", "浅蹲蓄力 · 站直起跳", "浅蹲起立"),
}


def game_layout(g, t, f, enter=1.0, text_k=1.0, prev=None, prev_k=0.0):
    canvas = layout_bg().copy()
    gi = game_frame(g, t, (GW, GH))
    if prev is not None and prev_k > 0:
        gi = Image.blend(gi, game_frame(prev, t, (GW, GH)), prev_k)
    canvas.alpha_composite(shadow(GW, GH), (GX - 60, GY - 60))
    canvas.paste(gi, (GX, GY), MASK_G)
    canvas.alpha_composite(shadow(PW, PH), (PX - 60, GY - 60))
    pv = pip(min(max(f, 540), 1199))
    pv = pv.resize((PW, PH), Image.LANCZOS)
    canvas.paste(pv, (PX, PY), MASK_P)
    d = ImageDraw.Draw(canvas)
    # 人物视角上的同步标签
    tag = "同一时间轴 · 演示输入"
    ft = font(18, "m"); tw = text_w(d, tag, ft)
    d.rounded_rectangle([PX + 16, PY + 16, PX + 16 + tw + 28, PY + 16 + 34], 17, fill=(20, 22, 26, 190))
    d.text((PX + 30, PY + 21), tag, font=ft, fill=(240, 240, 236))
    # 右栏文字：与人物视角左边对齐、与游戏画面底边对齐
    kick, title, body, motion = GAME_TEXT[g]
    al = int(255 * text_k); dy = (1 - text_k) * 10
    yb = GY + GH
    draw_spaced(d, (PX, yb - 158 + dy), kick, font(20, "m"), (*PURPLE, al), 2)
    d.text((PX, yb - 122 + dy), title, font=font(46, "b"), fill=(*INK, al))
    d.text((PX, yb - 40 + dy), body, font=font(24), fill=(*INK2, al))
    # 顶部：章节与进度（与左边距、游戏画面顶边对齐）
    idx = ["g01", "g02", "g03", "g05"].index(g)
    draw_spaced(d, (GX, GY - 58), "YUKEE  ·  四款体感游戏", font(22, "m"), (*INK, 255), 2)
    for i in range(4):
        x0 = GX + GW - 4 * 46 + i * 46
        d.rounded_rectangle([x0, GY - 46, x0 + 36, GY - 40], 3, fill=PURPLE if i == idx else (205, 199, 214))
    # 底部：说明（与左边距对齐）
    d.text((GX, yb + 24), "真实游戏录制 · 键盘演示输入（非真人摄像头识别实测） · 人物动作与游戏输入同一时间轴", font=font(19), fill=(*INK2, 255))
    canvas = canvas.convert("RGB")
    if enter < 1:
        # 从全屏（游戏或三维插入镜头）缩放进版式：位置与尺寸线性插值，保持比例
        return canvas, True
    return canvas, False


def zoom_into(full, canvas, k, target=None):
    """匹配转场：全屏画面等比缩放进游戏框（k: 0 全屏 → 1 版式）。框内内容从 full 溶解到 target（游戏画面）。"""
    e = ease(k)
    w = int(round(W + (GW - W) * e)); h = int(round(H + (GH - H) * e))
    x = int(round(GX * e)); y = int(round(GY * e))
    content = full if target is None else Image.blend(full, target, min(1.0, e * 1.25))
    out = canvas.copy()
    out.paste(content.resize((w, h), Image.LANCZOS), (x, y), rounded_mask(w, h, max(1, int(R * e))))
    return out


# —————————— 片尾 ——————————
@lru_cache(None)
def end_panel():
    g = Image.new("L", (W, 1))
    for x in range(W):
        g.putpixel((x, 0), int(235 * (1 - ease((x - 620) / 560))))
    p = Image.new("RGBA", (W, H), (*PAPER, 255)); p.putalpha(g.resize((W, H)))
    return p


def end_title(layer, t):
    a = CUES["endTitle"]
    if t < a - 0.4:
        return
    k0 = ease((t - (a - 0.4)) / 0.6)
    pnl = end_panel().copy(); pnl.putalpha(pnl.getchannel("A").point(lambda v: int(v * k0)))
    layer.alpha_composite(pnl)
    if t < a:
        return
    d = ImageDraw.Draw(layer)
    x = M + 72
    lines = [("Your desk.", INK, a), ("A little", INK, a + 0.25), ("more care.", PURPLE, a + 0.5)]
    y = 250
    for s, col, ta in lines:
        k = ease((t - ta) / 0.5)
        if k > 0:
            d.text((x, y + (1 - k) * 18), s, font=font(104, "b"), fill=(*col, int(255 * k)))
        y += 120
    k = ease((t - (a + 0.95)) / 0.5)
    if k > 0:
        d.text((x, y + 30 + (1 - k) * 12), "Light. Move. Feel better.", font=font(36, "m"), fill=(*INK, int(255 * k)))
        d.text((x, y + 86 + (1 - k) * 12), "照亮桌面，也关心你。", font=font(28), fill=(*INK2, int(255 * k)))
    k = ease((t - (a + 1.3)) / 0.5)
    if k > 0:
        draw_spaced(d, (x, 150), "YUKEE", font(40, "b"), (*INK, int(255 * k)), 6)
        d.rectangle([x, 206, x + 56, 210], fill=(*PURPLE, int(255 * k)))
        draw_spaced(d, (x + 76, 196), "SCREENBAR COMPANION", font(18, "m"), (*INK2, int(255 * k)), 4)


# —————————— 单帧 ——————————
def frame(f):
    t = f / FPS
    layer = None
    if t < 15.4:
        im = main3d(f)
    elif t < GAMES["g01"]["start"]:
        im = select_frame(t)
        if t < 15.7:
            im = blend(main3d(461), im, ramp(t, 15.4, 15.7))
    elif t < 40.0:
        g = next(k for k, v in GAMES.items() if v["start"] <= t < v["end"])
        G = GAMES[g]
        ins = {"g02": 25.1, "g05": 36.3}.get(g)
        # 前一款游戏的画面在换段时溶解 0.3 s
        order = ["g01", "g02", "g03", "g05"]; prev = order[order.index(g) - 1] if g != "g01" else None
        tk = ramp(t, G["start"] + (ins - G["start"] if ins else 0) + 0.15, G["start"] + (ins - G["start"] if ins else 0) + 0.6)
        if ins and t < ins + 0.5:
            full = main3d(min(f, {"g02": 753, "g05": 1089}[g]))  # 缩放转场期间用插入镜头最后一帧
            if t < ins:
                im = full
                if g != "g01" and t < G["start"] + 0.3:  # 版式 → 三维插入镜头
                    lay, _ = game_layout(prev, G["start"] - 0.01, f)
                    im = blend(lay, full, ramp(t, G["start"], G["start"] + 0.3))
            else:
                lay, _ = game_layout(g, t, f, text_k=tk)
                im = zoom_into(full, lay, (t - ins) / 0.5, game_frame(g, t))
        elif g == "g01" and t < G["start"] + 0.55:
            lay, _ = game_layout(g, t, f, text_k=ramp(t, G["start"] + 0.2, G["start"] + 0.6))
            im = zoom_into(game_frame(g, t), lay, (t - G["start"]) / 0.55)
        else:
            pk = 1 - ramp(t, G["start"], G["start"] + 0.3) if (prev and not ins) else 0
            lay, _ = game_layout(g, t, f, text_k=tk if not ins else 1, prev=prev if pk > 0 else None, prev_k=pk)
            im = lay
            if not ins and g != "g01":
                # 文字切换：上一段文字淡出、新文字淡入
                im = lay
    else:
        im = main3d(f)
        if t < 40.35:
            lay, _ = game_layout("g05", 39.99, f)
            im = blend(lay, im, ramp(t, 40.0, 40.35))
    # —— 标题块（只在三维全画面镜头） ——
    rgba = None
    def L():
        nonlocal rgba
        if rgba is None: rgba = im.convert("RGBA")
        return rgba
    if t < 15.6:
        k = min(ramp(t, 0.5, 0.9), 1 - ramp(t, 15.2, 15.6))
        if k > 0: scrim(L(), k)
        caption(L(), t, 0.6, 10.35, "01  FOCUS · 专注办公", clock_text(t), "YUKEE 在屏幕上方，照亮桌面" if t < 6.5 else "连续专注 45 分钟", title_size=56, top=TOPY)
        caption(L(), t, 10.65, 13.95, "02  NOTICE · 感知提示", "先柔和呼吸，再变色提示", "开始活动或继续工作，由你决定", top=TOPY)
        caption(L(), t, 14.05, 15.55, "03  CHOOSE · 自主选择", "开始活动", "起身，选一款体感游戏", top=TOPY)
    if 40.0 <= t < 42.6:
        k = min(ramp(t, 40.3, 40.7), 1 - ramp(t, 42.2, 42.6))
        if k > 0: scrim(L(), k)
        caption(L(), t, 40.4, 42.45, "04  FEEL BETTER · 正向反馈", "完成活动，YUKEE 回应你", "表情与灯光一起给出反馈", top=TOPY)
    if 42.6 <= t < 45.2:
        k = min(ramp(t, 42.6, 43.0), 1 - ramp(t, 44.8, 45.2))
        if k > 0: scrim(L(), k)
        caption(L(), t, 42.75, 45.1, "05  BACK TO WORK · 回到工作", "点「回到专注」，继续工作", "灯光恢复暖白，安静陪伴", top=TOPY)
    if t >= CUES["endTitle"]:
        end_title(L(), t)
    if rgba is not None:
        im = rgba.convert("RGB")
    k = min(ease(t / 0.5), ease((DUR - t) / 0.6))
    if k < 1:
        im = Image.blend(Image.new("RGB", (W, H), (0, 0, 0)), im, k)
    return im


if __name__ == "__main__":
    if sys.argv[1:2] == ["--preview"]:
        fs = [int(x) for x in sys.argv[2].split(",")]
        cols = 3; tw, th = 640, 360
        sheet = Image.new("RGB", (cols * tw, ((len(fs) + cols - 1) // cols) * th))
        for i, f in enumerate(fs):
            fr = frame(f); fr.save(f"/tmp/prev_{f:05d}.jpg", quality=90)
            sheet.paste(fr.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
        sheet.save(f"{OUT}/preview_sheet.jpg", quality=88)
        print("sheet", len(fs)); sys.exit(0)
    mp4 = sys.argv[1] if len(sys.argv) > 1 else f"{ROOT}/dist/YUKEE-final.mp4"
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-i", f"{OUT}/mix2.wav", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-pix_fmt", "yuv420p",
                           "-movflags", "+faststart", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", mp4], stdin=subprocess.PIPE)
    for f in range(NFR):
        ff.stdin.write(frame(f).tobytes())
        if f % 120 == 0: print("frame", f, flush=True)
    ff.stdin.close(); ff.wait(); print("wrote", mp4)
