#!/usr/bin/env node
/**
 * 零依赖开发服务器 + 实时刷新
 * 用法: node dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// Track connected clients for SSE
const clients = new Set();

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:' + PORT);

  // SSE endpoint for live reload
  if (url.pathname === '/__reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('data: connected\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  // Serve files
  let filePath = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  filePath = path.normalize(filePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('403');
  }

  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        return res.end('404 Not Found');
      }
      res.writeHead(500);
      return res.end('500 Error');
    }

    // Inject live-reload script for HTML
    if (ext === '.html') {
      const reloadScript = `
<script>
(function(){
  if (window.__lr) return; window.__lr = true;
  var es = new EventSource('/__reload');
  es.onmessage = function(e) { if (e.data === 'reload') location.reload(); };
  es.onerror = function() { setTimeout(function() { location.reload(); }, 3000); };
})();
</script>`;
      const injected = data.toString().replace('</body>', reloadScript + '\n</body>');
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(injected);
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// --- Broadcast reload ---
function reload() {
  clients.forEach(client => {
    try { client.write('data: reload\n\n'); } catch(e) { clients.delete(client); }
  });
}

// --- Watch index.html ---
const watchFile = path.join(ROOT, 'index.html');
let lastMtime = fs.statSync(watchFile).mtimeMs;

fs.watch(watchFile, (eventType) => {
  if (eventType === 'change') {
    // debounce — some editors fire multiple change events
    setTimeout(() => {
      try {
        const mtime = fs.statSync(watchFile).mtimeMs;
        if (mtime !== lastMtime) {
          lastMtime = mtime;
          console.log('  🔄 index.html changed → reloading browsers...');
          reload();
        }
      } catch(e) {}
    }, 100);
  }
});

// Also watch assets folder recursively
const assetsDir = path.join(ROOT, 'assets');
if (fs.existsSync(assetsDir)) {
  watchDir(assetsDir);
}

function watchDir(dir) {
  try {
    fs.watch(dir, { recursive: true }, (eventType, filename) => {
      if (eventType === 'change' && filename) {
        console.log('  🔄 ' + filename + ' changed → reloading browsers...');
        reload();
      }
    });
  } catch(e) {
    // recursive watch not supported on all platforms — fallback to polling assets
  }
}

server.listen(PORT, () => {
  console.log('');
  console.log('  🧵  针线之间 — Dev Server');
  console.log('  ════════════════════════════');
  console.log('  🌐  http://localhost:' + PORT);
  console.log('  🔄  auto-reload: ON  (save index.html to trigger)');
  console.log('  📁  ' + ROOT);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
