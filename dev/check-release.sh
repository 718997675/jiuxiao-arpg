#!/usr/bin/env bash
# 自检：远程 tag 与 GitHub Releases 条目是否一一对齐
#
# 背景：git tag 和 GitHub Release 是两套东西。推了 tag 但没调 API 建 Release，
# Releases 页面就会一直停在上一个版本 —— v1.1.5、v1.1.6 都踩过这个坑。
# 这个脚本只用公开只读 API，不需要 token。
#
# 用法：
#   bash dev/check-release.sh          # 报告缺口，有缺口时退出码 1
#   bash dev/check-release.sh --list   # 额外打印全部 Release 条目
set -uo pipefail

REPO="${REPO:-718997675/jiuxiao-arpg}"
LIST_ALL=0
[ "${1:-}" = "--list" ] && LIST_ALL=1

# 远程 tag（去掉 peeled ^{} 行，只留 vX.Y.Z 形态）
TAGS=$(git ls-remote --tags origin 2>/dev/null \
  | awk '{print $2}' | sed 's#refs/tags/##' | grep -v '\^{}' \
  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V)

if [ -z "$TAGS" ]; then
  echo "取不到远程 tag（检查网络或 remote 配置）" >&2
  exit 2
fi

# Releases（分页取到空为止，最多 3 页足够）
REL=""
for page in 1 2 3; do
  CHUNK=$(curl -sS -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/releases?per_page=100&page=$page" 2>/dev/null \
    | grep -o '"tag_name": *"[^"]*"' | sed 's/.*"\(v[^"]*\)"/\1/')
  [ -z "$CHUNK" ] && break
  REL="$REL$CHUNK
"
done
REL=$(printf '%s' "$REL" | grep -v '^$' | sort -V)

LATEST_TAG=$(printf '%s\n' "$TAGS" | tail -1)
LATEST_REL=$(printf '%s\n' "$REL" | tail -1)

echo "== 远程最新 tag: ${LATEST_TAG:-无}"
echo "== Releases 最新: ${LATEST_REL:-无}"

if [ "$LIST_ALL" = "1" ]; then
  echo "== Releases 全部 =="
  printf '%s\n' "$REL" | sed 's/^/  /'
fi

# 有 tag 没 Release 的
MISSING=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  if ! printf '%s\n' "$REL" | grep -qx "$t"; then
    MISSING="$MISSING$t
"
  fi
done <<< "$TAGS"

if [ -n "$MISSING" ]; then
  echo ""
  echo "== 缺 Release 的 tag =="
  printf '%s' "$MISSING" | sed 's/^/  ✗ /'
  echo ""
  echo "补建："
  printf '%s' "$MISSING" | while IFS= read -r t; do
    [ -n "$t" ] && echo "  bash dev/make-release.sh $t"
  done
  exit 1
fi

echo ""
echo "== 全部对齐：$(( $(printf '%s\n' "$TAGS" | wc -l) )) 个 tag 都有对应 Release =="
