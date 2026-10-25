# sfx-shield —— 生成产物说明

由 game-music-toolkit v1.0.0 生成。生成参数见 `sfx-shield.spec.json`，完整指标见 `sfx-shield.report.json`。

## 这是什么音乐

- 音效预设：shield
- 说明：护盾展开：金属上行 + 混响
- 时长：0.60 秒

## 技术指标

- 采样率 / 声道：44100 Hz / 立体声 16bit
- 时长：0.600 秒
- 峰值 / RMS：-1.0 dBFS / -12.416 dBFS
- 波峰因数：11.42 dB
- 削波样本：0
- 静音比例：0.34%

## 文件

| 文件 | 大小 |
|---|---|
| `sfx-shield.preview.png` | 5.6 KB |
| `sfx-shield.spec.json` | 0.4 KB |
| `sfx-shield.wav` | 103.4 KB |
| `sfx-shield.report.json` | 本报告（含全部指标与校验结论） |
| `README.md` | 本说明 |

## 自检结论

- 结果：通过
- 结论项：通过

## 复现

```bash
python musicgen.py --spec sfx-shield.spec.json --out ./rerun
```

同 seed 同 spec 重新生成，音频逐字节一致。

## 引擎接入

各引擎目录下的 IMPORT.md 写了导入步骤与参数建议（BGM 用流式/压缩播放，音效用 Decompress On Load 并预加载）。
