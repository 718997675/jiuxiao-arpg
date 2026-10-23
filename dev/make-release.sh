#!/usr/bin/env bash
# 用 GitHub API 创建 Release（GitHub 的 Release 条目和 git tag 是两回事，推 tag 不会自动生成）
#
# 用法：
#   GH_TOKEN=<fine-grained PAT，Contents: Read and write> bash dev/make-release.sh v1.1.6
#   GH_TOKEN=... bash dev/make-release.sh v1.1.6 "v1.1.6 · 自定义标题"
#   DRY_RUN=1 bash dev/make-release.sh v1.1.6        # 只打印请求体，不真的发
#
# 正文默认取 docs/releases/<tag>.md。若该文件不存在则报错退出。
set -euo pipefail

REPO="${REPO:-718997675/jiuxiao-arpg}"
TAG="${1:-}"
TITLE="${2:-}"
DRY_RUN="${DRY_RUN:-0}"

if [ -z "$TAG" ]; then
  echo "用法: GH_TOKEN=xxx bash dev/make-release.sh <tag> [标题]" >&2
  exit 2
fi

# 没给标题就从版本说明的一级标题里取（形如 “# v1.1.5 · 古风角色与单条洗炼”）
NOTES="docs/releases/${TAG}.md"
if [ ! -f "$NOTES" ]; then
  echo "找不到版本说明：$NOTES（先写 docs/releases/${TAG}.md）" >&2
  exit 1
fi

if [ -z "$TITLE" ]; then
  FIRST=$(sed -n '1s/^#[[:space:]]*//p' "$NOTES")
  TITLE="${FIRST:-$TAG}"
fi

PAYLOAD=$(jq -n \
  --arg tag "$TAG" \
  --arg name "$TITLE" \
  --rawfile body "$NOTES" \
  '{tag_name:$tag, name:$name, body:$body, draft:false, prerelease:false}')

echo "== 即将发布 =="
echo "$PAYLOAD" | jq -r '"tag:  \(.tag_name)\nname: \(.name)\nbody: \(.body | length) 字符"' 

if [ "$DRY_RUN" = "1" ]; then
  echo "== DRY_RUN，未发送 =="
  exit 0
fi

: "${GH_TOKEN:?需要 GH_TOKEN 环境变量（fine-grained PAT，Contents 设为 Read and write）}"

RESP=$(curl -sS -w '\n__HTTP__%{http_code}' -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/$REPO/releases" \
  -d "$PAYLOAD")

CODE=$(printf '%s' "$RESP" | sed -n 's/.*__HTTP__//p')
BODY_JSON=$(printf '%s' "$RESP" | sed 's/__HTTP__[0-9]*$//')

if [ "$CODE" = "201" ]; then
  echo "$BODY_JSON" | jq -r '"== 创建成功 ==\n  \(.html_url)\n  tag: \(.tag_name)  发布: \(.published_at)"'
else
  echo "== 失败 HTTP $CODE ==" >&2
  echo "$BODY_JSON" | jq -r '"  \(.message)\n  \(.errors // "")"' 2>/dev/null || echo "$BODY_JSON" >&2
  echo "常见原因：token 没给 Contents: Read and write，或 tag 尚未推到远程。" >&2
  exit 1
fi
