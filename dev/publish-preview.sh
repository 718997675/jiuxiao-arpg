#!/usr/bin/env bash
#
# 把某个分支发布成「子路径预览站」，正式站（main 根目录）一点不动
#
#   ./dev/publish-preview.sh                         用当前分支，slug = 分支名去掉 feat/ 前缀
#   ./dev/publish-preview.sh feat/act-expansion      指定分支
#   ./dev/publish-preview.sh feat/act-expansion v2   指定 slug（自定义子路径）
#   ./dev/publish-preview.sh --list                  列出已有预览
#   ./dev/publish-preview.sh --rm v2                 删除某个预览
#
# 为什么是这个做法：
#   GitHub Pages 的**项目站点只有一个发布源**（本仓库是 main 分支根目录），
#   没有任何设置能让「分支 X 发布到 /jiuxiao-arpg/preview/x/」。
#   所以子路径预览只能靠「把该分支的站点副本放进 main 的 preview/<slug>/」实现。
#
#   代价几乎为零：副本文件和根目录的文件内容完全相同，git 按 blob 内容去重，
#   仓库不会真的多出 8MB —— 只多几个 tree 对象。分支改了才会多一份新 blob。
#
# 隔离：副本的 index.html 会被 dev/preview-inject.js 注入「存档前缀」，
#   否则预览站和正式站同源（都是 718997675.github.io），
#   在预览站玩一局会把正式站存档覆盖掉。
#
set -uo pipefail
cd "$(dirname "$0")/.."

# ---------- 颜色 ----------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; N=""
fi
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}!${N} $*"; }
die()  { echo "${R}✗${N} $*" >&2; exit 1; }

# ---------- 站点地址（从 remote 推，别写死） ----------
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
PARSED=$(printf '%s' "$REMOTE" | sed -E 's#.*github\.com[:/]([^/]+)/([^/.]+)(\.git)?$#\1 \2#')
OWNER=$(printf '%s' "$PARSED" | cut -d' ' -f1)
REPO=$(printf '%s' "$PARSED" | cut -d' ' -f2)
[ -n "$OWNER" ] && [ -n "$REPO" ] || { OWNER="718997675"; REPO="jiuxiao-arpg"; }
SITE="https://${OWNER}.github.io/${REPO}"

usage() {
  sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//'
}

# ---------- 参数 ----------
MODE=publish
BRANCH=""
SLUG=""
DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --list)   MODE=list ;;
    --rm)     MODE=rm; shift; SLUG="${1:-}" ;;
    --dry|-n) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) if [ -z "$BRANCH" ]; then BRANCH="$1"; elif [ -z "$SLUG" ]; then SLUG="$1"; fi ;;
  esac
  shift
done

CUR=$(git rev-parse --abbrev-ref HEAD)

# ---------- --list ----------
if [ "$MODE" = list ]; then
  echo "${B}已有预览${N}"
  if [ ! -d preview ] || [ -z "$(ls -A preview 2>/dev/null)" ]; then
    echo "  ${DIM}（还没有）${N}"
  else
    for d in preview/*/; do
      s=$(basename "$d")
      meta="$d/_preview.txt"
      if [ -f "$meta" ]; then
        info=$(grep -E '^(分支|提交):' "$meta" | tr '\n' ' ')
      else
        info=""
      fi
      echo "  ${G}$s${N}  ${DIM}$info${N}"
      echo "     $SITE/preview/$s/"
    done
  fi
  exit 0
fi

# ---------- --rm ----------
if [ "$MODE" = rm ]; then
  [ -n "$SLUG" ] || die "--rm 后面要跟 slug，例如：./dev/publish-preview.sh --rm v2"
  [ -d "preview/$SLUG" ] || die "没有 preview/$SLUG"
  [ "$CUR" = main ] || git checkout main >/dev/null 2>&1 || die "切不到 main"
  git rm -r -q "preview/$SLUG" || die "git rm 失败"
  git commit -q -m "chore(preview): 下线 $SLUG" || die "提交失败"
  git push origin main || die "推送失败"
  ok "已下线 $SITE/preview/$SLUG/"
  [ "$CUR" != main ] && git checkout "$CUR" >/dev/null 2>&1
  exit 0
fi

# ---------- publish ----------
[ -z "$BRANCH" ] && BRANCH="$CUR"
# feat/act-expansion -> act-expansion；其余非法字符换成 -
[ -z "$SLUG" ] && SLUG=$(printf '%s' "$BRANCH" | sed -E 's#^(feat|fix|docs|exp|preview|chore)/##' | sed -E 's#[^A-Za-z0-9._-]#-#g')

if git rev-parse --verify --quiet "refs/heads/$BRANCH" >/dev/null; then
  REF="$BRANCH"
elif git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH" >/dev/null; then
  REF="origin/$BRANCH"
else
  die "找不到分支 $BRANCH（本地和 origin 都没有）"
fi
SHA=$(git rev-parse --short "$REF")

echo "${B}发布预览 · $SLUG${N}"
echo "${DIM}来源 $BRANCH @ $SHA${N}"
echo

# 1. 工作区必须干净：下面要切 main 提交，带脏文件过去容易出事
#    preview/ 是脚本自己管的产物，不算脏
DIRTY=$(git status --porcelain -- . ':(exclude)preview' ':(exclude)preview/**' 2>/dev/null || git status --porcelain)
if [ -n "$DIRTY" ] && [ "$DRY" != 1 ]; then
  echo "$DIRTY" | sed 's/^/   /'
  die "工作区有未提交的改动，先 ./push.sh 提交（或 git stash），再发布预览"
fi

# 2. 切 main（提交必须落在 main，Pages 才认）；--dry 只在本地生成副本，不切
if [ "$DRY" != 1 ] && [ "$CUR" != main ]; then
  git checkout main >/dev/null 2>&1 || die "切不到 main"
  ok "已切到 main"
fi

# 3. 尽量跟上远程，跟不上就算了（只是提示）
if [ "$DRY" != 1 ] && git fetch origin main --quiet 2>/dev/null; then
  git merge --ff-only origin/main >/dev/null 2>&1 || warn "本地 main 与 origin/main 分叉，跳过快进"
fi

# 4. 导出站点文件（只要跑游戏必需的四样 + 入口，dev/shots/docs 不带）
OUT="preview/$SLUG"
rm -rf "$OUT"
mkdir -p "$OUT"
if ! git archive "$REF" index.html src lib assets audio | tar -x -C "$OUT"; then
  git checkout "$CUR" >/dev/null 2>&1
  die "git archive 导出失败"
fi
for f in index.html src/game.js lib/three.min.js; do
  [ -f "$OUT/$f" ] || { git checkout "$CUR" >/dev/null 2>&1; die "导出不完整：缺 $f"; }
done
ok "已导出 ${OUT}（$(du -sh "$OUT" 2>/dev/null | cut -f1)）"

# 5. 注入：标题前缀 + 存档隔离
NODE=$(command -v node || true)
if [ -n "$NODE" ]; then
  "$NODE" dev/preview-inject.js "$OUT/index.html" "$BRANCH" "$SHA" || warn "注入失败，预览站会与正式站共用存档"
else
  warn "没找到 node，跳过注入（预览站会与正式站共用存档）"
fi

# 6. 元信息，方便以后查「这个预览是哪一版」
{
  echo "分支: $BRANCH"
  echo "提交: $(git rev-parse "$REF")"
  echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
} > "$OUT/_preview.txt"

# 7. 提交推送
if [ "$DRY" = 1 ]; then
  echo
  warn "--dry：已导出到 $OUT，未提交、未推送"
  echo "${DIM}  本地验证：python -m http.server 8765 --bind 127.0.0.1${N}"
  echo "${DIM}            然后打开 http://127.0.0.1:8765/$OUT/${N}"
  exit 0
fi

git add -A "$OUT"
if git diff --cached --quiet; then
  ok "预览内容与上次一致，无需提交"
else
  git commit -q -m "chore(preview): $SLUG <- $BRANCH@$SHA" || die "提交失败"
  git push origin main || die "推送失败（远程 main 有新提交？先 git pull --rebase origin main）"
  ok "已提交并推送 main"
fi

# 8. 切回来
[ "$CUR" != main ] && git checkout "$CUR" >/dev/null 2>&1

echo
echo "${B}预览地址${N}"
echo "  ${G}$SITE/preview/$SLUG/${N}"
echo "${DIM}  正式站 $SITE/ 不受影响；Pages 有 CDN 缓存，30~60 秒生效，看不到就强刷${N}"
echo "${DIM}  预览站存档已隔离（localStorage 加 __pv: 前缀），不会覆盖正式站进度${N}"
