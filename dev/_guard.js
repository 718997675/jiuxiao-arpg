#!/usr/bin/env node
/* ============================================================
 * dev/_guard.js —— 探针浏览器的「收尸」护栏
 *
 *   const guard = require('./_guard');
 *   guard.watch(60 * 1000);              // 可选：整支探针的硬超时
 *   const rec = guard.register({ tag, profile, killer });
 *   ... 用完 ...
 *   guard.release(rec);                  // 或什么都不做，进程退出时自动收
 *
 * 为什么要有这一层：puppeteer 的 `browser.close()` 在 SwiftShader 下经常
 * 卡住不返回；Ctrl-C 掉探针时 Node 不会跑 `process.on('exit')`；
 * Chrome 的 zygote / renderer 是**子进程树**，只杀父进程会留下一堆孤儿
 * —— 表现就是「内存不降、风扇一直响、ps 里杀不掉」。
 *
 * 三条对策：
 *   1. **认得出自己**：每次启动用唯一 `--user-data-dir=<tmp>/jxprobe-<pid>-<ts>`，
 *      杀的时候按这个 tag 匹配命令行 —— 只杀本项目起的，绝不碰用户自己的
 *      Chrome / Safari（那才是最危险的事）。
 *   2. **所有退出路径都收**：SIGINT / SIGTERM / SIGHUP / 未捕获异常 /
 *      未处理 Promise / 正常 exit，六条路都走同一个 `releaseAll()`。
 *   3. **硬超时**：`watch(ms)` 到点直接收尸并以 124 退出 —— 卡死的探针
 *      不会一直占着 CPU。
 *
 * 手动兜底：`./dev/kill-browsers.sh`
 * ============================================================ */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const live = new Set();
let hooked = false;
let watchdog = null;

/* 只按 tag 杀：`pkill -f` 匹配整条命令行，tag 是唯一的
 * `jxprobe-<pid>-<时间戳>`，不会误伤用户自己的浏览器进程。 */
function pkillTag(tag) {
  if (!tag) return;
  try { execFileSync('pkill', ['-9', '-f', tag], { stdio: 'ignore' }); } catch (e) { /* 没匹配到就是好事 */ }
}

function rmProfile(dir) {
  if (!dir) return;
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 2 }); } catch (e) { }
}

/* macOS 上把进程降成后台 QoS：风扇响的根因是 SwiftShader 抢满性能核，
 * 降优先级之后至少不会把整机拖到卡。失败就算了（Linux / Windows 没这条）。 */
function demote(pid) {
  if (process.platform !== 'darwin' || !pid) return;
  try { execFileSync('taskpolicy', ['-b', '-p', String(pid)], { stdio: 'ignore' }); } catch (e) { }
}

function release(rec) {
  if (!rec || rec.done) return;
  rec.done = true;
  try { if (rec.killer) rec.killer(); } catch (e) { }
  pkillTag(rec.tag);
  rmProfile(rec.profile);
  live.delete(rec);
}

function releaseAll() {
  for (const r of Array.from(live)) release(r);
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
}

function hook() {
  if (hooked) return;
  hooked = true;
  /* 信号默认行为**不会**跑 `exit` 回调 —— 这是「Ctrl-C 之后进程还在」的根因。
   * 这里接管掉，先收尸再退出，退出码沿用 shell 惯例。 */
  const bye = code => () => { releaseAll(); process.exit(code); };
  process.on('SIGINT', bye(130));
  process.on('SIGTERM', bye(143));
  process.on('SIGHUP', bye(129));
  process.on('exit', () => releaseAll());
  process.on('uncaughtException', e => {
    releaseAll();
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  });
  process.on('unhandledRejection', e => {
    releaseAll();
    console.error('unhandledRejection:', e && e.stack ? e.stack : e);
    process.exit(1);
  });
}

function register(rec) {
  hook();
  live.add(rec);
  if (rec.pid) demote(rec.pid);
  return rec;
}

/* 整支探针的硬超时：卡死的浏览器不会一直占 CPU。
 * `unref()` 让这个定时器不拖住事件循环（探针正常结束时会自己 exit）。 */
function watch(ms, label) {
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    console.error('\n⏱  探针超时（' + Math.round(ms / 1000) + 's）'
      + (label ? '：' + label : '') + ' —— 强制收尸');
    releaseAll();
    process.exit(124);
  }, ms);
  watchdog.unref();
  return watchdog;
}

function clearWatch() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null; }
}

/* 新建一个唯一 profile 目录 */
function newProfile(prefix) {
  const tag = (prefix || 'jxprobe') + '-' + process.pid + '-' + Date.now();
  const dir = path.join(require('os').tmpdir(), tag);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { }
  return { tag, profile: dir };
}

module.exports = { register, release, releaseAll, watch, clearWatch, newProfile, pkillTag, demote };
