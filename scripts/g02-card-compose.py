# G02 卡片预览第 2 步：public/art/g02/moon-night.png 按卡片 6.3:1 取桥面+水面条带，叠加抠出的游戏内帆船图层。
# 用法：python3 scripts/g02-card-compose.py 430 public/game-previews/winglight-card.png
import sys
from PIL import Image, ImageFilter
W,H = 1290,205
top = int(sys.argv[1]) if len(sys.argv)>1 else 280
bg = Image.open('public/art/g02/moon-night.png').convert('RGBA')
s = W/bg.width
bg = bg.resize((W, round(bg.height*s)), Image.LANCZOS)
band = bg.crop((0, top, W, top+H))
boat = Image.open('/tmp/g02-boat.png')
bh = 192; bw = round(boat.width*bh/boat.height)
boat = boat.resize((bw,bh), Image.LANCZOS)
cx = int(W*0.30)
band.alpha_composite(boat, (cx-bw//2, H-bh-2))
band.convert('RGB').save(sys.argv[2] if len(sys.argv)>2 else '/tmp/g02-card.png', optimize=True)
