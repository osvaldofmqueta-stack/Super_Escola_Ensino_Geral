#!/usr/bin/env node
const fs = require('fs');
const port = parseInt(process.argv[2], 10);
if (!port) process.exit(0);

const hex = port.toString(16).toUpperCase().padStart(4, '0');

function readTcp(file) {
  try { return fs.readFileSync(file, 'utf8').split('\n').slice(1); } catch { return []; }
}

const lines = [...readTcp('/proc/net/tcp'), ...readTcp('/proc/net/tcp6')];
const inodes = new Set();

for (const line of lines) {
  const parts = line.trim().split(/\s+/);
  if (!parts[1]) continue;
  const localAddr = parts[1];
  const portHex = localAddr.split(':')[1];
  if (portHex && portHex.toUpperCase() === hex) {
    inodes.add(parts[9]);
  }
}

if (inodes.size === 0) process.exit(0);

const pids = new Set();
try {
  const fds = fs.readdirSync('/proc');
  for (const pid of fds) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const fdDir = `/proc/${pid}/fd`;
      const links = fs.readdirSync(fdDir);
      for (const fd of links) {
        try {
          const link = fs.readlinkSync(`${fdDir}/${fd}`);
          const m = link.match(/socket:\[(\d+)\]/);
          if (m && inodes.has(m[1])) pids.add(parseInt(pid, 10));
        } catch {}
      }
    } catch {}
  }
} catch {}

for (const pid of pids) {
  if (pid === process.pid) continue;
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Killed PID ${pid} on port ${port}`);
  } catch {}
}

setTimeout(() => process.exit(0), 1000);
