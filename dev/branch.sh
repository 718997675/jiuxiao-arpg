#!/usr/bin/env bash
#
# 多分支并行干活时的「一键看全貌 / 一键切换」
#
#   ./dev/branch.sh                 看所有分支：落后 main 多少、最后提交、有没有预览站
#   ./dev/branch.sh act             切到名字里含 "act" 的分支（模糊匹配，唯一命中才切）
#   ./dev/branch.sh main            切回正式线
#   ./dev/branch.sh --sync          把 main 合并进当前分支（分支放久了不吃灰）
#   ./dev/branch.sh --new fix/xx    从当前分支拉一条新分支并推到远程
#
# 为什么要这个脚本：
#   1. 分支一多，「我在哪条线上、落后 main 多少、这条线有没有预览站」光看 git 输出很难一眼看清
#   2. 切分支前必须确认工作区干净，否则未提交的改动会被带到另一条线上
#   3. 分支放久了会缺 main 上新加的工具（比如 dev/publish-preview.sh），--sync 一把补齐
#
set -uo pipefail
cd "$(dirname "$0")/.."

if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; N=$'\033[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; C=""; N=""
fi
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}!${N} $*"; }
die()  { echo "${R}✗${N} $*" >&2; exit 1; }

# ---------- 站点地址 ----------
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
PARSED=$(printf '%s' "$REMOTE" | sed -E 's#.*github\.com[:/]([^/]+)/([^/.]+)(\.git)?$#\1 \2#')
OWNER=$(printf '%s' "$PARSED" | cut -d' ' -f1); [ -n "$OWNER" ] || OWNER="718997675"
REPO=$(printf '%s' "$PARSED" | cut -d' ' -f2);  [ -n "$REPO" ]  || REPO="jiuxiao-arpg"
SITE="https://${OWNER}.github.io/${REPO}"

slug_of() { printf '%s' "$1" | sed -E 's#^(feat|fix|docs|exp|preview|chore)/##' | sed -E 's#[^A-Za-z0-9._-]#-#g'; }

# 某分支对应的预览站是否已发布（查 main 的树，不看工作区 —— 别的分支上预览目录本来就不存在）
has_preview() { git cat-file -e "main:preview/$(slug_of "$1")" 2>/dev/null; }

# 工作区是否干净（preview/ 是发布产物，不算脏）
dirty() { git status --porcelain -- . ':(exclude)preview' ':(exclude)preview/**' 2>/dev/null; }

# 分支相对 main 的「落后 / 领先」
# 用 -/+ 而不是中文：终端里中文占 2 列但 printf 按 1 字符算，会把后面几列顶歪
ahead_behind() {
  if [ "$1" = main ]; then echo "0"; return; fi
  local n a b2
  n=$(git rev-list --left-right --count "main...$1" 2>/dev/null || echo "")
  if [ -z "$n" ]; then echo "?"; return; fi
  a=$(echo "$n" | cut -f1); b2=$(echo "$n" | cut -f2)
  if [ "$a" = 0 ] && [ "$b2" = 0 ]; then echo "0"; return; fi
  if [ "$a" = 0 ]; then printf '+%s' "$b2"; return; fi
  if [ "$b2" = 0 ]; then printf -- '-%s' "$a"; return; fi
  printf -- '-%s / +%s' "$a" "$b2"
}

CUR=$(git rev-parse --abbrev-ref HEAD)

# ---------- 状态总览 ----------
show_status() {
  echo "${B}九霄·山海录 · 分支总览${N}"
  if [ -n "$(dirty)" ]; then
    echo "  当前 ${C}$CUR${N}  工作区 ${Y}有未提交改动${N}"
  else
    echo "  当前 ${C}$CUR${N}  工作区 ${G}干净${N}"
  fi
  echo
  echo "  分支                          vs main     站点                         最后提交"
  printf '  %s\n' "──────────────────────────────────────────────────────────────────────────────────────────────"

  local list
  list=$(git for-each-ref --format='%(refname:short)' refs/heads | sort)
  for b in $list; do
    local ab log slug pv mark=" "
    ab=$(ahead_behind "$b")
    # 这一列必须是纯 ASCII 且不带颜色码，否则 printf 的宽度计算会把后面的列顶歪
    if [ "$b" = main ]; then
      pv="ROOT"
      mark="${G}*${N}"
    else
      slug=$(slug_of "$b")
      if has_preview "$b"; then pv="preview/$slug/"
      else pv="(未发布)"; fi
    fi
    # 提交信息放最后一列：中文占 2 列宽，放前面会把所有列顶歪
    log=$(git log -1 --format='%h %s' "$b")
    printf '  %s %-28s %-11s %-28s %s\n' "$mark" "$b" "$ab" "$pv" "$log"
  done
  echo "  ${DIM}（vs main：-N 落后 N 个提交，+N 领先；ROOT = 正式站 $SITE/）${N}"

  # 只在远程、本地还没有的分支（别的机器 / 别的账号推的）
  local remote_only extra=""
  remote_only=$(git for-each-ref --format='%(refname:short)' refs/remotes/origin \
    | sed 's#^origin/##' | grep -v '^HEAD$' | grep -v '^origin$' | sort || true)
  for b in $remote_only; do
    git rev-parse --verify --quiet "refs/heads/$b" >/dev/null || extra="$extra $b"
  done
  if [ -n "$extra" ]; then
    echo
    echo "  ${B}只在远程${N} ${DIM}（切过去会自动建本地分支并跟踪）${N}"
    for b in $extra; do
      local ab log
      ab=$(ahead_behind "origin/$b")
      log=$(git log -1 --format='%h %s' "origin/$b")
      printf '    %-28s %-11s %s\n' "$b" "$ab" "$log"
    done
  fi

  echo
  echo "  ${DIM}切分支：./dev/branch.sh <名字片段>    同步 main：./dev/branch.sh --sync${N}"
  echo "  ${DIM}发布预览：./dev/publish-preview.sh <分支>${N}"
}

# ---------- 参数 ----------
case "${1:-}" in
  ""|status|-s)
    show_status
    exit 0
    ;;
  --sync)
    [ "$CUR" = main ] && { ok "当前就在 main，无需同步"; exit 0; }
    if [ -n "$(dirty)" ]; then
      dirty | sed 's/^/   /'
      die "工作区有未提交改动，先 ./push.sh 或 git stash"
    fi
    git fetch origin --quiet 2>/dev/null || warn "fetch 失败，用本地 main 同步"
    if git merge main --no-edit >/dev/null 2>&1; then
      ok "$CUR 已合并 main（$(ahead_behind "$CUR")）"
      if git push origin "$CUR" 2>&1 | tail -1; then
        ok "已推送 $CUR"
      else
        warn "推送失败，稍后手动 git push origin $CUR"
      fi
    else
      die "合并有冲突，手工解决后再提交（git status 看冲突文件）"
    fi
    exit 0
    ;;
  --new)
    NEW="${2:-}"
    [ -n "$NEW" ] || die "--new 后面要跟分支名，例如：./dev/branch.sh --new fix/save-bug"
    git rev-parse --verify --quiet "refs/heads/$NEW" >/dev/null && die "本地已有 $NEW"
    [ -n "$(dirty)" ] && die "工作区有未提交改动，先提交再拉新分支（新分支会带着这些改动）"
    git checkout -b "$NEW" >/dev/null 2>&1 || die "建分支失败"
    ok "已从 $CUR 拉出 $NEW"
    echo "${DIM}  推送并跟踪远程：git push -u origin $NEW${N}"
    exit 0
    ;;
  -h|--help)
    sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

# ---------- 切换 ----------
Q="$1"
MATCHES=$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin \
  | sed 's#^origin/##' | grep -v '^HEAD$' | sort -u | grep -iF -- "$Q" || true)

if [ -z "$MATCHES" ]; then
  die "没有名字含「$Q」的分支。./dev/branch.sh 看全部"
fi
COUNT=$(printf '%s\n' "$MATCHES" | wc -l | tr -d ' ')
if [ "$COUNT" -gt 1 ]; then
  # 完全同名优先
  if printf '%s\n' "$MATCHES" | grep -qxF -- "$Q"; then
    MATCHES="$Q"
  else
    warn "「$Q」匹配到 $COUNT 个分支，说具体点："
    printf '%s\n' "$MATCHES" | sed 's/^/   /'
    exit 1
  fi
fi
TARGET=$(printf '%s\n' "$MATCHES" | head -1)

if [ "$TARGET" = "$CUR" ]; then
  ok "已经在 $TARGET"
  show_status
  exit 0
fi

if [ -n "$(dirty)" ]; then
  dirty | sed 's/^/   /'
  die "工作区有未提交改动。先 ./push.sh 提交，或 git stash 暂存 —— 否则这些改动会被带到 $TARGET 上"
fi

git fetch origin --quiet 2>/dev/null || warn "fetch 失败，用本地分支"

if git rev-parse --verify --quiet "refs/heads/$TARGET" >/dev/null; then
  git checkout "$TARGET" >/dev/null 2>&1 || die "切到 $TARGET 失败"
  ok "已切到 ${B}$TARGET${N}"
else
  git checkout -b "$TARGET" "origin/$TARGET" >/dev/null 2>&1 || die "从远程建 $TARGET 失败"
  ok "已从 origin/$TARGET 建本地分支并切过去"
fi

# 落后 main 就提醒（缺 main 上新加的工具是最常见的坑）
if [ "$TARGET" != main ]; then
  BEHIND=$(git rev-list --count "$TARGET..main" 2>/dev/null || echo 0)
  if [ "${BEHIND:-0}" -gt 0 ]; then
    warn "这条线落后 main $BEHIND 个提交（可能缺新工具/新修复）"
    if git cat-file -e "$TARGET:dev/branch.sh" 2>/dev/null; then
      echo "${DIM}  补齐：./dev/branch.sh --sync${N}"
    else
      # 这条线老到连本脚本都还没有，只能手工合并
      echo "${DIM}  补齐：git merge main --no-edit && git push origin $TARGET${N}"
    fi
  fi
  SLUG=$(slug_of "$TARGET")
  echo
  if has_preview "$TARGET"; then
    echo "  预览站 ${C}$SITE/preview/$SLUG/${N}"
    echo "${DIM}  发布/更新：./dev/publish-preview.sh $TARGET${N}"
  else
    echo "${DIM}  这条线还没发布预览：./dev/publish-preview.sh $TARGET${N}"
  fi
else
  echo "  正式站 ${C}$SITE/${N}"
  echo "${DIM}  发布：./push.sh \"提交信息\"${N}"
fi
