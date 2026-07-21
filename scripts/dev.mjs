#!/usr/bin/env node

import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "dev:web"], { stdio: "inherit", shell: false }),
  spawn("npm", ["run", "dev:api"], { stdio: "inherit", shell: false }),
];

let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (!stopping && code !== 0) {
      stop("SIGTERM");
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
