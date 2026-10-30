/* 跨平台浏览器路径探测（puppeteer-core 需要显式 executablePath）
 * 用法：const EXE = require('./_chrome');
 * 顺序：Windows Edge → Windows Chrome → **用户目录安装的 Chrome / Edge** → macOS → Linux
 *
 * 用户目录那两条是补的：Chrome 默认装在 `%LOCALAPPDATA%\Google\Chrome\Application`，
 * 没管理员权限的机器上 Program Files 里一个都没有 —— 只按 Program Files 探测会
 * 误判成「本机没有浏览器」，探针就白写了。
 */
const fs = require('fs');
const LA = process.env.LOCALAPPDATA || '';

const CANDIDATES = [
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
