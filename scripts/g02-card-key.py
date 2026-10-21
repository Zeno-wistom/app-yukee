# G02 卡片预览第 1 步：把真实 G02 游戏画面（背景替换为品红）截图中的帆船/机器人图层抠出为透明 PNG。
# 输入 /tmp/g02-layer.png（Playwright 在 G02 键盘演示、按住空格展帆时截取 .moon-world）。仅开发用。
from PIL import Image
import numpy as np
im = np.asarray(Image.open('/tmp/g02-layer.png').convert('RGB')).astype(float)
H,W,_ = im.shape
im = im[6:H-6, 6:W-6]
r,g,b = im[...,0],im[...,1],im[...,2]
spill = np.clip((np.minimum(r,b)-g)/255.0,0,1)
a = 1-spill
a[a<0.05]=0
M = np.array([255,0,255.])
f = np.zeros_like(im)
nz = a>0
f[nz] = (im[nz] - (1-a[nz])[:,None]*M)/a[nz][:,None]
f = np.clip(f,0,255)
out = np.dstack([f, a*255]).astype(np.uint8)
img = Image.fromarray(out,'RGBA')
bbox = img.getbbox(); print(bbox)
img = img.crop(bbox)
img.save('/tmp/g02-boat.png'); print(img.size)
