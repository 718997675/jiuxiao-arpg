# guofeng-boss —— 生成产物说明

由 game-music-toolkit v1.0.0 生成。生成参数见 `guofeng-boss.spec.json`，完整指标见 `guofeng-boss.report.json`。

## 这是什么音乐

- 风格 / 情绪：boss / epic
- 调性：E phrygian（压迫、异域）
- 速度 / 拍号：108 BPM，4/4
- 结构：24 小节，约 53.3 秒，可无缝循环
- 和声进行：Em → C → G → D → Em → C → G → D → Em → C → G → D → Em → C → G → D → Em → C → G → D → Em → C → G → D
- 编制：brass_fm、harp_pluck、organ、triangle_bass、string_tremolo

## 技术指标

- 采样率 / 声道：44100 Hz / 立体声 16bit
- 时长：53.333 秒
- 峰值 / RMS：-1.0 dBFS / -16.161 dBFS
- 波峰因数：15.16 dB
- 削波样本：0
- 静音比例：0.40%
- 循环点：帧 0 → 2352000（已写入 smpl 块）

## 文件

| 文件 | 大小 |
|---|---|
| `guofeng-boss.mid` | 8.1 KB |
| `guofeng-boss.preview.png` | 27.0 KB |
| `guofeng-boss.spec.json` | 0.4 KB |
| `guofeng-boss.wav` | 9187.6 KB |
| `guofeng-boss.report.json` | 本报告（含全部指标与校验结论） |
| `README.md` | 本说明 |

## 自检结论

- 结果：通过
- 结论项：通过

## 复现

```bash
python musicgen.py --spec guofeng-boss.spec.json --out ./rerun
```

同 seed 同 spec 重新生成，音频逐字节一致。

## 引擎接入

各引擎目录下的 IMPORT.md 写了导入步骤与参数建议（BGM 用流式/压缩播放，音效用 Decompress On Load 并预加载）。
