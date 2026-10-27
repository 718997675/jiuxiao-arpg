#!/usr/bin/env bash
#
# 任务台账总览：三条线各自做到哪了，不用切分支
#
#   ./dev/status.sh              所有分支的进度摘要（从各自的 docs/status/<slug>.md 读）
#   ./dev/status.sh act          完整显示某条线的台账
#   ./dev/status.sh --check      哪条线的台账已经落后于代码（该补记录了）
#
# 台账一分支一份，所以合并时不会冲突；这个脚本直接从 git 对象里读，
# 不需要 checkout 也能看到别的分支的进度。
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

slug_of() { printf '%s' "$1" | sed -E 's#^(feat|fix|docs|exp|preview|chore)/##' | sed -E 's#[^A-Za-z0-9._-]#-#g'; }
ledger_of() { git show "$1:docs/status/$(slug_of "$1").md" 2>/dev/null; }
CUR=$(git rev-parse --abbrev-ref HEAD)

# ---------- 完整显示某条线 ----------
case "${1:-}" in
  ""|--check) ;;
  -h|--help)
    sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    Q="$1"
    ALL=$(git for-each-ref --format='%(refname:short)' refs/heads | sort)
    T=""
    for b in $ALL; do
      case "$b" in
        *"$Q"*) T="$b"; break ;;
      esac
    done
    [ -n "$T" ] || die "没有名字含「${Q}」的本地分支（./dev/status.sh 看全部）"
    c=$(ledger_of "$T")
    [ -n "$c" ] || die "$T 上还没有台账：docs/status/$(slug_of "$T").md"
    echo "${DIM}—— $T · docs/status/$(slug_of "$T").md ——${N}"
    echo
    printf '%s\n' "$c"
    exit 0
    ;;
esac

# ---------- 汇总 ----------
echo "${B}九霄·山海录 · 任务台账${N}"
echo "  当前 ${C}$CUR${N}   ${DIM}（台账在 docs/status/，一分支一份；换账号后先跑这个）${N}"
echo
echo "  分支                        进度      当前节点"
printf '  %s\n' "────────────────────────────────────────────────────────────────────────────────────────"

LIST=$(git for-each-ref --format='%(refname:short)' refs/heads | sort)
MISSING=0
for b in $LIST; do
  s=$(slug_of "$b")
  c=$(ledger_of "$b")
  mark=" "
  [ "$b" = "$CUR" ] && mark="${G}*${N}"

  if [ -z "$c" ]; then
    printf '  %s %-26s %-9s %s\n' "$mark" "$b" "${DIM}—${N}" "${Y}没有台账${N}（docs/status/$s.md）"
    MISSING=$((MISSING + 1))
    continue
  fi

  total=$(printf '%s\n' "$c" | grep -cE '^\|[^|]+\|[^|]+\| *(✅|🔄|⬜|⏸|❌)' || true)
  done_n=$(printf '%s\n' "$c" | grep -cE '^\|[^|]+\|[^|]+\| *✅' || true)
  cur=$(printf '%s\n' "$c" | grep -m1 '^> 当前：' | sed 's/^> 当前：//' || true)
  [ -z "$cur" ] && cur="（台账缺「> 当前：」行）"

  # 台账落后检查：台账最后一次改动之后，这条分支又提交了几个
  lc=$(git log -1 --format=%H "$b" -- "docs/status/$s.md" 2>/dev/null || true)
  lag=0
  [ -n "$lc" ] && lag=$(git rev-list --count "$lc..$b" 2>/dev/null || echo 0)

  prog="${done_n}/${total}"
  if [ "${lag:-0}" -gt 0 ]; then
    prog="${Y}${prog}${N}"
  fi
  printf '  %s %-26s %-9s %s\n' "$mark" "$b" "$prog" "$cur"
  if [ "${lag:-0}" -gt 0 ]; then
    printf '  %s %-26s %-9s %s\n' " " "" "" "${DIM}└ 台账之后又有 $lag 个提交，可能没记录${N}"
  fi
done

echo
if [ "${1:-}" = "--check" ]; then
  if [ "$MISSING" -eq 0 ]; then
    ok "三条线都有台账"
  else
    warn "$MISSING 条线缺台账"
  fi
fi
echo "  ${DIM}看全文：./dev/status.sh act ｜ 切分支：./dev/branch.sh act${N}"
echo "  ${DIM}规矩：每次任务收尾更新台账（和写日志同等重要），格式见 docs/status/README.md${N}"
