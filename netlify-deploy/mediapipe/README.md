# 本地 MediaPipe 资产

WASM / JS 来自 `@mediapipe/tasks-vision` **0.10.32** 的 `wasm/` 目录。升级包时必须同步替换这些文件，不可混用版本。

模型：Google Face Landmarker float16，下载于 2026-09-05。

来源：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task

官方说明：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js

运行时只通过 localhost 获取本目录资产，无外部 CDN 请求。
