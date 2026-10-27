/* 跨平台浏览器路径探测（puppeteer-core 需要显式 executablePath）
 * 用法：const EXE = require('./_chrome');
 * 顺序：Windows Edge → Windows Chrome → macOS Chrome → Linux Chrome/Chromium
 */
const fs = require('fs');

const CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser'
];

module.exports = CANDIDATES.find(f => { try { return fs.existsSync(f); } catch (e) { return false; } }) || 'chrome';
