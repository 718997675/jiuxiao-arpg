/* 跨平台浏览器路径探测（puppeteer-core 需要显式 executablePath）
 * 用法：const EXE = require('./_chrome');
 * 顺序：**puppeteer 自己下载的 Chrome** → Windows Edge → Windows Chrome →
 *       用户目录安装的 Chrome / Edge → macOS → Linux
 *
 * 用户目录那两条是补的：Chrome 默认装在 `%LOCALAPPDATA%\Google\Chrome\Application`，
 * 没管理员权限的机器上 Program Files 里一个都没有 —— 只按 Program Files 探测会
 * 误判成「本机没有浏览器」，探针就白写了。
 *
 * **puppeteer 缓存这条是 2026-11-14 补的**：机器上没装系统 Chrome 时
 * （macOS 上很常见 —— 只用 Safari），`npx @puppeteer/browsers install chrome`
 * 下到 `~/.cache/puppeteer` 里的那份是唯一个能用的。少了这条，
 * 全部真机探针都会报 `Browser was not found at the configured executablePath`，
 * 而错误信息只提 `chrome` 三个字，完全看不出「其实有一份在缓存里」。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const LA = process.env.LOCALAPPDATA || '';

/* 扫 puppeteer 缓存：<cache>/chrome/<平台>-<版本>/chrome-<平台>/Google Chrome for Testing.app/...
 * 版本号每天都在变，所以按目录扫而不是写死版本。 */
function puppeteerCacheChromes() {
  const out = [];
  const roots = [
    path.join(os.homedir(), '.cache', 'puppeteer'),
    path.join(os.homedir(), 'Library', 'Caches', 'puppeteer'),
    process.env.PUPPETEER_CACHE_DIR || ''
  ].filter(Boolean);
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(root, 'chrome')); } catch (e) { continue; }
    /* 新的排前面 —— 多份共存时优先用最近装的那份 */
    dirs.sort().reverse();
    for (const d of dirs) {
      const base = path.join(root, 'chrome', d, 'chrome-mac-arm64');
      const baseX = path.join(root, 'chrome', d, 'chrome-mac-x64');
      const baseLinux = path.join(root, 'chrome', d, 'chrome-linux64');
      out.push(
        path.join(base, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(baseX, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(baseLinux, 'chrome'),
        /* Windows 布局 */
        path.join(root, 'chrome', d, 'chrome-win64', 'chrome.exe'),
        path.join(root, 'chrome', d, 'chrome-win32', 'chrome.exe')
      );
    }
  }
  return out;
}

const CANDIDATES = [
  ...puppeteerCacheChromes(),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  LA && (LA.replace(/\\/g, '/') + '/Google/Chrome/Application/chrome.exe'),
  LA && (LA.replace(/\\/g, '/') + '/Microsoft/Edge/Application/msedge.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
].filter(Boolean);

module.exports = CANDIDATES.find(f => { try { return fs.existsSync(f); } catch (e) { return false; } }) || 'chrome';

