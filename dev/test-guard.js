#!/usr/bin/env node
/* ============================================================
 * [U7] 浏览器收尸护栏 · 契约（不需要真的起浏览器）
 *
 *   node dev/test-guard.js
 *
 * 用户反馈的三件事：**吃内存、风扇响、杀不掉**。前两件靠 `_pptr.launch`
 * 的资源上限与 QoS 降级（要真有 Chromium 才量得出来）；第三件是纯逻辑，
 * 在这里就能验完 —— 而且**必须在装浏览器之前验完**，否则等于把一个
 * 「杀不掉」的东西先装进机器。
 *
 * 用一个假进程冒充浏览器（命令行里带 `jxprobe-` 标记），验四件事：
 *   1  `pkillTag` 只杀带标记的，**不碰**同样在跑的无关进程
 *   2  `release()` 之后标记进程真的没了、profile 目录真的删了
 *   3  `SIGINT` / `SIGTERM` 会触发收尸（默认行为是**不跑** exit 回调的）
 *   4  `watch()` 到点强制收尸并 exit 124
 * ============================================================ */
'use strict';
const { spawn, spawnSync, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const guard = require('./_guard');

let pass = 0, fail = 0;
const ok = (c, m, d) => {
  if (c) { pass++; return; }
  fail++;
  console.log('  ✗ ' + m + (d === undefined ? '' : '  →  ' + JSON.stringify(d)));
};

const alive = pid => {
  try { process.kill(pid, 0); return true; } catch (e) { return false; }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

/* 假「浏览器」：命令行里带 jxprobe 标记、能活 120 秒的进程。
 * 两个坑都踩过：
 *   · `spawn('sleep', ['120', '--jxprobe-x'])` —— sleep 不认多余参数，当场 exit 1；
 *   · `spawn('sh', ['-c', 'sleep 120', 'jxprobe-x'])` —— sh 会把单条命令 exec 掉，
 *     命令行变成 `sleep 120`，标记消失，pkill 一条都匹配不上。
 * 用 node 起一个空转循环最稳：`node -e ... jxprobe-x` 的标记一定在命令行里。 */
const fakeBrowser = tag => spawn(process.execPath,
  ['-e', 'setInterval(()=>{},1000)', 'jxprobe-' + tag], { stdio: 'ignore' });

(async () => {
  console.log('【1】只杀带标记的，不误伤无关进程');
  let victim, bystander;
  {
    const { tag, profile } = guard.newProfile('jxprobe');
    victim = fakeBrowser(tag.slice('jxprobe-'.length));
    bystander = spawn('sleep', ['120'], { stdio: 'ignore' });
    await wait(200);
    ok(alive(victim.pid), '假浏览器起来了', victim.pid);
    ok(alive(bystander.pid), '无关进程也起来了', bystander.pid);

    guard.pkillTag(tag);
    await wait(250);
    ok(!alive(victim.pid), '带标记的被杀了', victim.pid);
    ok(alive(bystander.pid), '无关进程**没被**误杀', bystander.pid);
    try { bystander.kill('SIGKILL'); } catch (e) { }
    guard.release({ tag, profile, done: false });
  }

  console.log('\n【2】release() 收进程 + 删 profile 目录');
  {
    const { tag, profile } = guard.newProfile('jxprobe');
    ok(fs.existsSync(profile), 'profile 目录建出来了', profile);
    const p = fakeBrowser(tag.slice('jxprobe-'.length));
    await wait(200);
    const rec = guard.register({ tag, profile, killer: () => { try { p.kill('SIGKILL'); } catch (e) { } } });
    guard.release(rec);
    await wait(250);
    ok(!alive(p.pid), 'killer 把进程杀了', p.pid);
    ok(!fs.existsSync(profile), 'profile 目录删干净了', profile);
  }

  console.log('\n【3】SIGINT / SIGTERM 也会收尸（默认行为不会）');
  for (const sig of ['SIGINT', 'SIGTERM']) {
    const { tag, profile } = guard.newProfile('jxprobe');
    const p = fakeBrowser(tag.slice('jxprobe-'.length));
    await wait(200);
    /* 起一个子 node：它 register 完就挂着，等信号 */
    const child = spawn(process.execPath, ['-e', `
      const g = require(${JSON.stringify(path.join(__dirname, '_guard.js'))});
      const { execFileSync } = require('child_process');
      g.register({ tag: ${JSON.stringify(tag)}, profile: ${JSON.stringify(profile)}, killer: () => {} });
      console.log('ready');
      setInterval(() => {}, 1000);
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    await new Promise(r => child.stdout.once('data', r));
    child.kill(sig);
    await wait(600);
    ok(!alive(p.pid), sig + ' 触发收尸（标记进程被清）', p.pid);
    ok(!fs.existsSync(profile), sig + ' 触发收尸（profile 被删）', profile);
    try { child.kill('SIGKILL'); } catch (e) { }
  }

  console.log('\n【4】watch() 硬超时 → 收尸 + exit 124');
  {
    const { tag, profile } = guard.newProfile('jxprobe');
    const p = fakeBrowser(tag.slice('jxprobe-'.length));
    await wait(200);
    const r = spawnSync(process.execPath, ['-e', `
      const g = require(${JSON.stringify(path.join(__dirname, '_guard.js'))});
      g.register({ tag: ${JSON.stringify(tag)}, profile: ${JSON.stringify(profile)}, killer: () => {} });
      g.watch(300, '契约自测');
      setInterval(() => {}, 1000);
    `], { encoding: 'utf8', timeout: 8000 });
    /* 杀完要等一下再判存活：被 SIGKILL 的子进程在父进程 reap 之前是僵尸，
     * 僵尸的 pid 还在进程表里，`kill(pid, 0)` 照样返回成功 —— 不等就会
     * 把「已经杀了」误判成「没杀掉」。 */
    await wait(400);
    ok(r.status === 124, '超时退出码 124', r.status);
    ok(/探针超时/.test(r.stderr || ''), '打印了超时原因', (r.stderr || '').slice(0, 60));
    ok(!alive(p.pid), '超时也把标记进程收了', p.pid);
    ok(!fs.existsSync(profile), '超时也把 profile 删了', profile);
  }

  console.log('\n【5】没有残留');
  {
    const out = spawnSync('pgrep', ['-f', 'jxprobe-'], { encoding: 'utf8' });
    const left = (out.stdout || '').trim();
    ok(!left, '机器上已经没有 jxprobe- 残留进程', left);
    const tmp = os.tmpdir();
    const dirs = fs.readdirSync(tmp).filter(d => d.startsWith('jxprobe-'));
    ok(dirs.length === 0, '临时目录没有残留 profile', dirs);
  }

  console.log('\n' + (fail ? '❌ ' + fail + ' 项失败' : '✅ 全部通过') + '（' + pass + ' 项）');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
