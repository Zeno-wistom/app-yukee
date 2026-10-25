#!/bin/bash
# 最终版：逐帧渲染全部三维镜头（两进程并行，按耗时均分）。镜头见 src/timeline.mjs 的 SHOTS。
cd "$(dirname "$0")"
OUT=/workspace/work/hark-video-demo/video/out/scene
# 进程 A：开场 → 起身（0–15.4 s，前 462 帧）
(node render-scene.mjs $OUT/main 0 462 > /tmp/r2A.log 2>&1 && node render-scene.mjs $OUT/pip 540 760 pip 600 800 >> /tmp/r2A.log 2>&1) &
# 进程 B：G02/G05 插入镜头 + 收尾 + 游戏段人物视角（竖幅 600×800）
(node render-scene.mjs $OUT/main 705 754 > /tmp/r2B1.log 2>&1 && \
 node render-scene.mjs $OUT/main 1035 1090 >> /tmp/r2B1.log 2>&1 && \
 node render-scene.mjs $OUT/main 1200 1440 >> /tmp/r2B1.log 2>&1 && \
 node render-scene.mjs $OUT/pip 760 1200 pip 600 800 > /tmp/r2B2.log 2>&1) &
wait
echo ALLDONE
