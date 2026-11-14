#!/usr/bin/env node
import { fileURLToPath } from 'url';
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
import path from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import BetterThanDemons from "../src/utils/betterThanDemons.js";
import { installSignalHandlers } from "../src/utils/betterThanDemons/process/signals.js";

const entryArg = process.argv[2];

if (entryArg && path.resolve(entryArg) === path.resolve(__filename)) {
  console.error("[btd] refusing to run the watcher inside itself — pass the app entry point explicitly");
  process.exit(1);
}

const runtime = new BetterThanDemons(entryArg ? { entry: entryArg } : {});
installSignalHandlers(runtime);
runtime.start();
