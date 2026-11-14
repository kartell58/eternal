#!/usr/bin/env node
/**
 * scripts/betterThanDemons.js — internal dev-runner for Eternal (nodemon replacement).
 *
 * Thin CLI wrapper around src/utils/betterThanDemons. Spawns the app in its
 * own process group, restarts it on file changes with debouncing, and gives
 * it time to clean up on Ctrl+C (SIGTERM first, SIGKILL after a timeout).
 *
 * Usage:
 *   node scripts/betterThanDemons.js          # runs `node .` (package.json "main")
 *   node scripts/betterThanDemons.js index.js
 *
 * Configuration: see src/utils/betterThanDemons/index.js (eternal.btd.json /
 * BTD_* env vars / constructor options).
 */
const path = require("path");
const BetterThanDemons = require("../src/utils/betterThanDemons");
const { installSignalHandlers } = require("../src/utils/betterThanDemons/process/signals");

const entryArg = process.argv[2];

if (entryArg && path.resolve(entryArg) === path.resolve(__filename)) {
  console.error("[btd] refusing to run the watcher inside itself — pass the app entry point explicitly");
  process.exit(1);
}

const runtime = new BetterThanDemons(entryArg ? { entry: entryArg } : {});
installSignalHandlers(runtime);
runtime.start();
