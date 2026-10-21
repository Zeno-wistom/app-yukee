# 本地 MediaPipe 资产

WASM / JS 来自 `@mediapipe/tasks-vision` **0.10.32** 的 `wasm/` 目录。升级包时必须同步替换这些文件，不可混用版本。

模型：
- Google Face Landmarker float16（G01 头部识别 + Yukee 视线），下载于 2026-09-05。
- Google Pose Landmarker Lite float16（G02 肩/肘/腕关键点），下载于 2026-10-20，
  来源 `pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`。

来源：https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task

官方说明：https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
姿态模型说明：https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js

运行时只通过 localhost 获取本目录资产，无外部 CDN 请求。
