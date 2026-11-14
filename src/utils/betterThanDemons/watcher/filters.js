import path from "path";
import { DEFAULT_IGNORED } from "../config/loader.js";

function normalizeRelative(relPath) {
  return String(relPath || "")
    .split(path.sep).join("/")
    .replace(/^(\.\/)+/, "")
    .replace(/\/+$/, "");
}

function globToRegExp(glob) {
  // Minimal glob: ** (any depth including zero), * (within a segment), ? (single char)
  let out = "";
  let i = 0;
  const pattern = normalizeRelative(glob);
  // A leading "**/" also matches zero directories ("**/secret" matches "secret").
  if (pattern.startsWith("**/")) {
    out += "(?:.*/)?";
    i = 3;
  }
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
        continue;
      }
      out += "[^/]*";
      i += 1;
      continue;
    }
    if (char === "?") { out += "[^/]"; i += 1; continue; }
    out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    i += 1;
  }
  return new RegExp("^" + out + "$", "i");
}

function classifyPattern(pattern) {
  const normalized = normalizeRelative(pattern).toLowerCase();
  if (normalized.startsWith("**/") || normalized.startsWith("*.") || normalized.includes("/") || normalized.includes("*") || normalized.includes("?")) {
    if (normalized.startsWith("**/*.")) {
      return { kind: "suffix", value: normalized.slice(3) }; // "**/*.db" -> ".db"
    }
    if (normalized.startsWith("*.")) {
      return { kind: "suffix", value: normalized.slice(1) }; // "*.db" -> ".db"
    }
    return { kind: "glob", value: globToRegExp(normalized) };
  }
  return { kind: "segment", value: normalized };
}

/**
 * Builds the ignore/watch predicate used by the file watcher.
 *
 * Pattern kinds:
 *   "node_modules"   -> exact path segment match (case-insensitive)
 *   "*.db"/"**\/*.db" -> path suffix match
 *   anything with / * ? -> glob against the normalized relative path
 * Matching is segment-aware: "data" ignores "data/x.js" but not "data-utils.js".
 */
function createFilter(watchConfig) {
  const segments = watchConfig.ignoreDefaults ? DEFAULT_IGNORED.segments.slice() : [];
  const suffixes = watchConfig.ignoreDefaults ? DEFAULT_IGNORED.suffixes.slice() : [];
  const names = watchConfig.ignoreDefaults ? DEFAULT_IGNORED.names.slice() : [];
  const globs = [];

  for (const raw of watchConfig.ignored) {
    const pattern = String(raw).trim();
    if (!pattern) continue;
    const classified = classifyPattern(pattern);
    if (classified.kind === "segment") segments.push(classified.value);
    else if (classified.kind === "suffix") suffixes.push(classified.value);
    else globs.push(classified.value);
  }

  const extensionSet = new Set(watchConfig.extensions.map(ext => ext.toLowerCase()));

  function isIgnored(relPath) {
    const rel = normalizeRelative(relPath).toLowerCase();
    if (!rel) return false;
    const parts = rel.split("/");
    for (const part of parts) {
      if (segments.includes(part)) return true;
    }
    for (const suffix of suffixes) {
      if (rel.endsWith(suffix)) return true;
    }
    const base = parts[parts.length - 1];
    if (names.includes(base)) return true;
    for (const glob of globs) {
      if (glob.test(rel)) return true;
    }
    return false;
  }

  function isWatchableFile(relPath) {
    if (isIgnored(relPath)) return false;
    const base = path.posix.basename(normalizeRelative(relPath)).toLowerCase();
    if (base === ".env" || base.startsWith(".env.")) return true;
    return extensionSet.has(path.posix.extname(base));
  }

  return { isIgnored, isWatchableFile, normalizeRelative };
}

export { createFilter, normalizeRelative, globToRegExp, classifyPattern };

export default { createFilter, normalizeRelative, globToRegExp, classifyPattern };
