# YUKEE 音频素材授权清单

核对日期：2026-10-23（UTC）。逐条打开原始发布页确认授权字段，下载链接即发布页上的直链。
全部新增素材均为 **CC0 1.0（公共领域贡献）**：可商用、可修改、可随网站再分发，**不要求署名**（下方仍保留署名以示感谢）。
文件的 SHA-256、时长、处理参数见 `docs/audio/audio-manifest.json`；`scripts/audio/build_audio.py` 可从原始链接重新生成全部文件。

## 背景音乐

| 游戏 | 文件 | 曲名 / 作者 | 来源页 | 授权 |
|---|---|---|---|---|
| G01 拾光跑者 | `public/audio/yukee-run-bgm.mp3` | 用户提供的原曲（《洛克王国》相关） | — | **版权待确认**：未取得公开发布或商业授权，公开展示 / 发布前需替换或取得授权。未复制给其他游戏。 |
| G02 展翼接光 | `public/audio/bgm/g02-happy-lullaby.mp3` | Happy Lullaby (song17) — cynicmusic | https://opengameart.org/content/happy-lullaby-song17 | CC0 1.0 |
| G03 躯干重心冲浪 | `public/audio/bgm/g03-8bit-summer-memory.mp3` | 8 bit summer memory — Tarush Singhal | https://opengameart.org/content/8-bit-summer-memory | CC0 1.0 |
| G05 浅蹲跳一跳 | `public/audio/bgm/g05-flowerbed-fields.mp3` | Flowerbed Fields [Loop] — Zane Little Music | https://opengameart.org/content/flowerbed-fields-loop | CC0 1.0 |

下载直链：
- G02 https://opengameart.org/sites/default/files/song17.mp3
- G03 https://opengameart.org/sites/default/files/8_bit_memory_indie_proj_2_ma_0.mp3
- G05 https://opengameart.org/sites/default/files/flowerbed_fields.ogg

CC0 允许的轻量编辑（不改变授权）：
- G02：按 16 小节切出循环点（38.54 s），把结尾混响尾巴叠回开头，首尾无缝；
- G03：按节拍网格把循环点定在 121.01 s，尾部叠回开头；
- G05：原作者标注为循环素材，长度不变；5 kHz 以上轻压 3 dB 降低长时间听感疲劳；
- 三首统一响度到约 -16 LUFS，真峰值 ≤ -1.5 dBTP，编码为 MP3 128 kbps / 44.1 kHz。

## 音效

| 用途 | 文件（`public/audio/sfx/`） | 原素材 | 来源 | 授权 |
|---|---|---|---|---|
| 主要按钮点击 | ui-click.wav | select_002.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 左右切换游戏 | ui-move.wav | pluck_001.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 确认进入游戏 | ui-confirm.wav | confirmation_002.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 暂停 | ui-pause.wav | minimize_009.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 继续 | ui-resume.wav | maximize_009.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 退出 / 返回 | ui-back.wav | back_002.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 重新开始 | ui-restart.wav | toggle_001.ogg | Kenney · Interface Sounds | CC0 1.0 |
| 错误反馈 | ui-error.wav | error_008.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G02 展翼 | g02-wing-open.wav | maximize_008.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G02 收翼 | g02-wing-close.wav | minimize_008.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G02 星光吸收 | g02-star.wav | glass_002.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G02 汇光（连续吸收奖励） | g02-gather.wav | glass_001.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G02 完成 | g02-complete.wav | jingles_PIZZI02.ogg | Kenney · Music Jingles | CC0 1.0 |
| G03 侧倾到位 | g03-lean.wav | pluck_002.ogg | Kenney · Interface Sounds | CC0 1.0 |
| G03 接住 | g03-catch.wav | jingles_STEEL09.ogg | Kenney · Music Jingles | CC0 1.0 |
| G03 连续接住 | g03-streak.wav | jingles_STEEL10.ogg | Kenney · Music Jingles | CC0 1.0 |
| G03 结算 | g03-complete.wav | jingles_STEEL02.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 得分 | g05-score.wav | jingles_NES09.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 完美落点 | g05-perfect.wav | jingles_NES14.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 连击奖励 | g05-streak.wav | jingles_NES08.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 跳跃失败 | g05-fail.wav | jingles_NES10.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 五连跳完成 | g05-complete.wav | jingles_NES12.ogg | Kenney · Music Jingles | CC0 1.0 |
| G05 重新开始 | g05-restart.wav | jingles_NES16.ogg | Kenney · Music Jingles | CC0 1.0 |

Kenney 来源页与素材包（包内 License.txt 原文："License: (Creative Commons Zero, CC0) … free to use in personal, educational and commercial projects"）：
- Interface Sounds：https://kenney.nl/assets/interface-sounds · https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip
- Music Jingles：https://kenney.nl/assets/music-jingles · https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip

处理：去掉开头静音、10 ms 尾部淡出，转为单声道 32 kHz 16-bit WAV（无编码器填充，触发延迟最低）。

## 原创合成音效（无第三方素材）

由 `src/audio/engine.ts` 用 Web Audio 实时合成，项目原创：
- G01 原有：起跳、碰撞、收集、通关小扇奏（未改动）；
- G05：蓄力持续音（音高随蓄力值）、蓄力 25/50/75/100% 刻度音、进入落点区提示、站起释放、起跳、落地、奖励台；
- G03：重心回正的浪花气流声。

## 致谢（CC0 不要求，仅表感谢）

Music: "Happy Lullaby (song17)" by cynicmusic, "8 bit summer memory" by Tarush Singhal, "Flowerbed Fields [Loop]" by Zane Little Music (OpenGameArt.org, CC0). Sound effects: Kenney (www.kenney.nl, CC0).

## 放弃的候选

- "Feel Good Summer Tune"（OpenGameArt，CC0 标注）：作者说明是"把一首常规歌曲器乐演奏"，可能是对他人作品的翻奏，底层作品版权不明，未采用。
- Pixabay Music：许可允许网页游戏使用，但下载需要登录账号，且其许可是自有条款而非 CC0；OpenGameArt 已有足够 CC0 曲目，未采用。
