#!/bin/sh
# ============================================================
# dev/kill-browsers.sh —— 一键清掉本项目探针留下的浏览器进程
#
#   ./dev/kill-browsers.sh          # 清本项目起的
#   ./dev/kill-browsers.sh --all    # 连 safaridriver 一起清（仍然不碰用户自己的 Chrome）
#
# 只认 `jxprobe-` 前缀（探针唯一 profile 目录名）和 `safaridriver --port`，
# **绝不** `pkill chrome` / `killall Safari` —— 那会把用户自己正在用的
# 浏览器一起关掉，比留几个僵尸进程糟糕得多。
#
# 什么时候用：探针被强杀（`kill -9`）、机器睡眠后唤醒、或者
# `dev/_guard.js` 的自动收尸没跑到（例如整台 Node 被 SIGKILL）。
# ============================================================
set -u
TMP="${TMPDIR:-/tmp}"
TMP="${TMP%/}"

say() { printf '%s\n' "$*"; }

n=0

# 1) Chrome for Testing / Chromium：只认唯一 profile 目录名
if pgrep -f 'jxprobe-' >/dev/null 2>&1; then
  cnt=$(pgrep -f 'jxprobe-' | wc -l | tr -d ' ')
  say "清理探针 Chrome 进程：${cnt} 个"
  pkill -9 -f 'jxprobe-' 2>/dev/null || true
  n=$((n + cnt))
else
  say "没有残留的探针 Chrome 进程"
fi

# 2) 残留的 profile 目录（占几十 MB 到几百 MB）
dirs=$(find "$TMP" -maxdepth 1 -name 'jxprobe-*' -type d 2>/dev/null | wc -l | tr -d ' ')
if [ "$dirs" -gt 0 ]; then
  say "删除残留 profile 目录：${dirs} 个"
  rm -rf "$TMP"/jxprobe-* 2>/dev/null || true
fi

# 3) Safari WebDriver（只有显式 --all 才动）
if [ "${1:-}" = "--all" ]; then
  if pgrep -f 'safaridriver --port' >/dev/null 2>&1; then
    cnt=$(pgrep -f 'safaridriver --port' | wc -l | tr -d ' ')
    say "清理 safaridriver：${cnt} 个（Safari 窗口可能还留着，手动关一下）"
    pkill -9 -f 'safaridriver --port' 2>/dev/null || true
    n=$((n + cnt))
  else
    say "没有残留的 safaridriver"
  fi
else
  say "（safaridriver 没动；要一起清就加 --all）"
fi

say "—— 共清理 ${n} 个进程"
