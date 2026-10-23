#!/usr/bin/env bash
# 用 GitHub API 创建 Release
#
# GitHub 的 Release 条目和 git tag 是两套东西：推 tag 只会在 /tags 页面出现，
# Releases 页面必须显式调 POST /repos/{owner}/{repo}/releases 才会多一条。
#
# 用法：
#   bash dev/make-release.sh v1.1.6                  # 标题自动取版本说明的一级标题
#   bash dev/make-release.sh v1.1.6 "v1.1.6 · 标题"
#   DRY_RUN=1 bash dev/make-release.sh v1.1.6        # 只打印请求体，不真的发
#
# 凭据按以下顺序查找（找到第一个就用）：
#   1. 环境变量 GH_TOKEN
#   2. 环境变量 GITHUB_TOKEN
#   3. 文件 ~/.config/jiuxiao-arpg/gh_token（推荐：存一次，以后全自动）
#   4. gh auth token（若装了 GitHub CLI）
#
# 正文默认取 docs/releases/<tag>.md。
set -euo pipefail

REPO="${REPO:-718997675/jiuxiao-arpg}"
TAG="${1:-}"
TITLE="${2:-}"
DRY_RUN="${DRY_RUN:-0}"
TOKEN_FILE="${GH_TOKEN_FILE:-$HOME/.config/jiuxiao-arpg/gh_token}"

if [ -z "$TAG" ]; then
  echo "用法: bash dev/make-release.sh <tag> [标题]" >&2
  exit 2
fi

# ---- 解析 token ----
TOKEN_SRC=""
if [ -n "${GH_TOKEN:-}" ]; then
  TOKEN_SRC="环境变量 GH_TOKEN"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  GH_TOKEN="$GITHUB_TOKEN"; TOKEN_SRC="环境变量 GITHUB_TOKEN"
elif [ -f "$TOKEN_FILE" ]; then
  GH_TOKEN=$(tr -d '[:space:]' < "$TOKEN_FILE"); TOKEN_SRC="文件 $TOKEN_FILE"
elif command -v gh >/dev/null 2>&1 && [ -n "$(gh auth token 2>/dev/null || true)" ]; then
  GH_TOKEN=$(gh auth token); TOKEN_SRC="gh auth token"
fi

# ---- 前置校验：tag 必须在远程，否则 Release 会挂到不存在的 tag 上 ----
if ! git ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null | grep -q .; then
  echo "远程没有 tag ${TAG}，先 git push origin ${TAG}" >&2
  exit 1
fi

# ---- 前置校验：已存在就不重复建（避免 422） ----
EXIST=$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/releases/tags/$TAG" || echo 000)
if [ "$EXIST" = "200" ]; then
  echo "Release $TAG 已存在，无需重建：https://github.com/$REPO/releases/tag/$TAG"
  exit 0
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

if [ -z "${GH_TOKEN:-}" ]; then
  cat >&2 <<'ERR'
== 缺少 GitHub 凭据 ==
任选一种方式提供（fine-grained PAT 需要 Contents: Read and write）：

  A) 存到文件，之后每次发版全自动（推荐）
     mkdir -p ~/.config/jiuxiao-arpg
     printf '%s' 'github_pat_xxx' > ~/.config/jiuxiao-arpg/gh_token
     chmod 600 ~/.config/jiuxiao-arpg/gh_token

  B) 本次临时用
     GH_TOKEN='github_pat_xxx' bash dev/make-release.sh vX.Y.Z
ERR
  exit 1
fi

echo "凭据来源：$TOKEN_SRC"

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
