#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const DIST_INDEX = path.join(ROOT, "dist", "index.html");

const hasStaticBuild = fs.existsSync(DIST_INDEX);

const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || "5000",
};

if (hasStaticBuild && !process.env.SERVE_STATIC_WEB) {
  env.SERVE_STATIC_WEB = "1";
  console.log("[dev] dist/ found — serving pre-built web bundle from Express.");
} else if (!hasStaticBuild) {
  console.log("[dev] dist/ not found — Express will proxy to Expo web dev server.");
}

const tsxBin = path.join(ROOT, "node_modules", ".bin", "tsx");
const serverEntry = path.join(ROOT, "server", "index.ts");

const child = spawn(tsxBin, [serverEntry], {
  cwd: ROOT,
  env,
  stdio: "inherit",
});

const shutdown = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
