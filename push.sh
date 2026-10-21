#!/usr/bin/env bash
#
# 一键同步到 GitHub
#
#   ./push.sh                    自动生成提交信息
#   ./push.sh "feat: 新增坐骑"    自定义提交信息
#   ./push.sh --dry              只看会提交什么，不真提交
#
# 做的事：语法检查 -> 同步 dist -> 暂存 -> 提交 -> 推送 main
set -uo pipefail
cd "$(dirname "$0")"

DRY=0
MSG=""
for a in "$@"; do
  case "$a" in
    --dry|-n) DRY=1 ;;
    *) MSG="$a" ;;
  esac
done

# ---------- 颜色 ----------
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; N=$'\033[0m'
else
  B=""; DIM=""; G=""; Y=""; R=""; N=""
fi
ok()   { echo "${G}✓${N} $*"; }
warn() { echo "${Y}!${N} $*"; }
die()  { echo "${R}✗${N} $*" >&2; exit 1; }

# ---------- 定位 node ----------
NODE=""
for c in node /Users/niekai/.workbuddy/binaries/node/versions/22.22.2-6/bin/node /usr/local/bin/node /opt/homebrew/bin/node; do
  if command -v "$c" >/dev/null 2>&1; then NODE="$c"; break; fi
done

echo "${B}九霄·山海录 · 同步到 GitHub${N}"
echo "${DIM}$(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)${N}"
echo

# ---------- 1. 语法检查 ----------
if [ -n "$NODE" ]; then
  bad=0
  for f in src/*.js; do
    if ! "$NODE" --check "$f" 2>/tmp/_jscheck; then
      echo "${R}语法错误${N}: $f"
      sed -n '1,6p' /tmp/_jscheck
      bad=1
    fi
  done
  rm -f /tmp/_jscheck
  [ "$bad" -eq 1 ] && die "语法检查未通过，已中止（GitHub 上的代码不会被污染）"
  ok "语法检查通过（src/*.js）"
else
  warn "未找到 node，跳过语法检查"
fi

# ---------- 2. 同步 dist ----------
if [ -d dist ]; then
  cp index.html dist/ 2>/dev/null || true
  [ -f README.md ] && cp README.md dist/ 2>/dev/null || true
  [ -d src ] && cp -R src/. dist/src/ 2>/dev/null || true
  ok "已同步 dist/（发布目录）"
fi

# ---------- 3. 检查变更 ----------
CHANGED=$(git status --porcelain)
if [ -z "$CHANGED" ]; then
  echo
  ok "没有变更，GitHub 已是最新"
  exit 0
fi

echo
echo "${B}将要提交的变更：${N}"
git status --short | sed 's/^/   /'
COUNT=$(printf '%s\n' "$CHANGED" | wc -l | tr -d ' ')
echo "${DIM}   共 $COUNT 项${N}"

if [ "$DRY" -eq 1 ]; then
  echo
  warn "--dry 模式，未提交"
  exit 0
fi

# ---------- 4. 提交 ----------
if [ -z "$MSG" ]; then
  # 按改动文件猜一个提交类型
  if git status --porcelain | grep -qE '^\?\?|^ A|src/'; then
    PREFIX="feat"
  else
    PREFIX="chore"
  fi
  MSG="$PREFIX: 更新 $(date '+%m-%d %H:%M')"
fi

git add -A || die "git add 失败"
git commit -q -m "$MSG" || die "提交失败"
ok "已提交：$MSG"

# ---------- 5. 推送 ----------
echo
echo "${DIM}推送中…${N}"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20"
if git push origin HEAD 2>&1 | sed 's/^/   /'; then
  :
else
  echo
  die "推送失败。常见原因：
   · 私钥读不到 —— WorkBuddy 里要在沙箱外执行（dangerouslyDisableSandbox）
   · 网络 —— github.com:22 可达，443 不可达，remote 必须是 git@ 形式
   · 远程有新提交 —— 先 git pull --rebase origin main"
fi

NEW=$(git rev-parse --short HEAD)
REMOTE=$(git remote get-url origin)
echo
ok "推送完成 ${B}$NEW${N}"
echo "${DIM}   $REMOTE${N}"
exit 0
