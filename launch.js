/**
 * launch.js — starts the server and opens the browser automatically.
 * Run via: npm start
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = parseInt(process.env.PORT || '5000', 10);
const URL = `http://127.0.0.1:${PORT}`;

// Start the server as a child process so signals are forwarded cleanly
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  stdio: 'inherit',
  env: process.env
});

server.on('error', (err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

server.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`Server exited with code ${code}`);
  }
  process.exit(code || 0);
});

// Poll until the server is ready, then open the browser
function waitAndOpen(retries = 30) {
  if (retries <= 0) {
    console.error(`\n❌  Server did not start in time. Visit ${URL} manually.\n`);
    return;
  }

  const req = http.get(URL, (res) => {
    res.resume();
    openBrowser();
  });

  req.on('error', () => {
    setTimeout(() => waitAndOpen(retries - 1), 500);
  });

  req.setTimeout(500, () => {
    req.destroy();
    setTimeout(() => waitAndOpen(retries - 1), 200);
  });
}

function openBrowser() {
  const url = URL;
  const platform = process.platform;
  let cmd, args;

  if (platform === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }

  const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
  child.unref();
  console.log(`\n🌐  Browser opened at ${url}\n`);
}

// Give the server half a second head-start before polling
setTimeout(() => waitAndOpen(), 500);

// Forward Ctrl+C to the server process
process.on('SIGINT', () => {
  server.kill('SIGINT');
});
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
