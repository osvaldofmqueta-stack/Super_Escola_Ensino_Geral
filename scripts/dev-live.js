#!/usr/bin/env node
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const tsxBin = path.join(ROOT, "node_modules", ".bin", "tsx");
const expoBin = path.join(ROOT, "node_modules", ".bin", "expo");
const EXPO_WEB_PORT = 3001;

const baseEnv = { ...process.env, NODE_ENV: "development" };

const serverEnv = {
  ...baseEnv,
  PORT: "5000",
  EXPO_WEB_PORT: String(EXPO_WEB_PORT),
};

const expoEnv = {
  ...baseEnv,
  CI: "1",
  EXPO_PUBLIC_DOMAIN: process.env.REPLIT_DEV_DOMAIN ? `${process.env.REPLIT_DEV_DOMAIN}` : undefined,
};

console.log("[dev-live] Starting Expo web dev server on port", EXPO_WEB_PORT);
const expoChild = spawn(expoBin, ["start", "--web", "--port", String(EXPO_WEB_PORT)], {
  cwd: ROOT,
  env: expoEnv,
  stdio: ["ignore", "pipe", "pipe"],
});

expoChild.stdout.on("data", (d) => process.stdout.write("[expo] " + d));
expoChild.stderr.on("data", (d) => process.stderr.write("[expo] " + d));

console.log("[dev-live] Starting Express server on port 5000 (proxying to Expo on", EXPO_WEB_PORT + ")");
const serverChild = spawn(tsxBin, [path.join(ROOT, "server", "index.ts")], {
  cwd: ROOT,
  env: serverEnv,
  stdio: "inherit",
});

function shutdown(signal) {
  if (!expoChild.killed) expoChild.kill(signal);
  if (!serverChild.killed) serverChild.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

serverChild.on("exit", (code, signal) => {
  if (!expoChild.killed) expoChild.kill("SIGTERM");
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

expoChild.on("exit", (code) => {
  if (code && code !== 0) {
    console.error("[expo] Expo web server exited with code", code);
  }
});
