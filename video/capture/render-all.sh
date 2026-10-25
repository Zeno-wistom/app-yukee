#!/bin/bash
# 逐帧渲染全部三维镜头（两个进程并行）。帧号见 src/timeline.mjs 的 SHOTS。
cd "$(dirname "$0")"
OUT=/workspace/work/hark-video-demo/video/out/scene
(node render-scene.mjs $OUT/main 0 348 > /tmp/rA.log 2>&1) &
(node render-scene.mjs $OUT/main 519 609 > /tmp/rB1.log 2>&1 && node render-scene.mjs $OUT/main 711 930 > /tmp/rB2.log 2>&1 && node render-scene.mjs $OUT/pip 609 711 pip 960 540 > /tmp/rB3.log 2>&1) &
wait
echo ALLDONE
