#!/usr/bin/env node
/* 九霄·山海录 —— 本地开发服务器
 *
 * 为什么不用 `python3 -m http.server`：
 *   它不发送 Cache-Control，浏览器会对 .js 做启发式缓存（按 Last-Modified 推算）。
 *   频繁改动源码时，浏览器会拿旧文件覆盖新文件，出现「明明改了却报旧错误」
 *   或者「函数未定义」的假故障。本服务器对所有响应加 no-store，
 *   并关闭 Last-Modified / ETag 协商，保证刷新即最新。
 *
 * 用法：
 *   node dev/serve.mjs            # 默认 8124
 *   node dev/serve.mjs 8090       # 指定端口
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8124);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

function send(res, code, body, type) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname);
  } catch {
    return send(res, 400, '400 Bad Request');
  }
  if (pathname === '/') pathname = '/index.html';

  const target = path.join(ROOT, path.normalize(pathname));
  /* 防目录穿越：解析后必须仍在项目根目录内 */
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    return send(res, 403, '403 Forbidden');
  }

  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      return send(res, 404, `404 Not Found: ${pathname}`, 'text/plain; charset=utf-8');
    }
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      'Access-Control-Allow-Origin': '*',
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(target);
    stream.on('error', () => res.end());
    stream.pipe(res);
  });
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用。换一个：node dev/serve.mjs ${PORT + 1}`);
  } else {
    console.error(e.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`九霄·山海录 dev server`);
  console.log(`  根目录: ${ROOT}`);
  console.log(`  地址:   http://${HOST}:${PORT}/index.html`);
  console.log(`  缓存:   已禁用（no-store）`);
});
