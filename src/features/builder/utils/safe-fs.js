const fs = require('fs');
const path = require('path');

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function readJsonSafe(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return { ok: true, data: fallback, recovered: false };
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return { ok: true, data: fallback, recovered: false };
    try {
      return { ok: true, data: JSON.parse(raw), recovered: false };
    } catch (e) {
      const backup = `${filePath}.corrupt.${Date.now()}.bak`;
      try { fs.copyFileSync(filePath, backup); } catch {}
      return { ok: false, data: fallback, recovered: true, error: e.message, backup };
    }
  } catch (e) {
    return { ok: false, data: fallback, recovered: false, error: e.message };
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(tmp, json, 'utf8');
  fs.renameSync(tmp, filePath);
}

function withFileLock(lockPath, fn, opts = {}) {
  const timeout = opts.timeoutMs ?? 5000;
  const start = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      try { fs.writeFileSync(fd, String(process.pid)); } catch {}
      fs.closeSync(fd);
      try { return fn(); } finally { try { fs.unlinkSync(lockPath); } catch {} }
    } catch (e) {
      if (e && e.code === 'EEXIST') {
        // stale lock check
        try {
          const st = fs.statSync(lockPath);
          if (Date.now() - st.mtimeMs > 10000) { try { fs.unlinkSync(lockPath); } catch {} continue; }
        } catch {}
        if (Date.now() - start > timeout) throw new Error('Timed out waiting for persistence lock.');
        sleep(25);
        continue;
      }
      throw e;
    }
  }
}

module.exports = { readJsonSafe, writeJsonAtomic, withFileLock };
