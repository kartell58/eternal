import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const KEY_PATH = path.join(DATA_DIR, "token-keys.json");
const PREFIX = "enc:v1:";

let keypair = null;

function normalizePem(value) {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

function loadOrCreateKeypair() {
  if (keypair) return keypair;

  try {
    const envPublic = normalizePem(process.env.TOKEN_ENCRYPTION_PUBLIC_KEY);
    const envPrivate = normalizePem(process.env.TOKEN_ENCRYPTION_PRIVATE_KEY);
    if (envPublic && envPrivate) {
      keypair = { publicKey: envPublic, privateKey: envPrivate, source: "env" };
      return keypair;
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(KEY_PATH)) {
      const raw = fs.readFileSync(KEY_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.publicKey && parsed.privateKey) {
        keypair = {
          publicKey: String(parsed.publicKey),
          privateKey: String(parsed.privateKey),
          source: "file"
        };
        return keypair;
      }
    }

    const generated = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });

    const payload = {
      algorithm: "rsa-oaep-sha256",
      modulusLength: 4096,
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(KEY_PATH, JSON.stringify(payload, null, 2), { mode: 0o600 });
    try {
      fs.chmodSync(KEY_PATH, 0o600);
    } catch {
      // best effort on filesystems that do not support POSIX modes
    }

    keypair = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
      source: "generated"
    };
    return keypair;
  } catch (err) {
    logger.error("[TOKEN_CRYPTO] Failed to initialize encryption keys:", err?.message || err);
    keypair = null;
    return null;
  }
}

function isEncryptedToken(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

function encryptToken(plaintext) {
  if (plaintext == null) return null;
  const text = String(plaintext);
  if (isEncryptedToken(text)) return text;

  const keys = loadOrCreateKeypair();
  if (!keys) {
    throw new Error("Token encryption keys unavailable");
  }

  const encrypted = crypto.publicEncrypt(
    {
      key: keys.publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(text, "utf8")
  );

  return `${PREFIX}${encrypted.toString("base64")}`;
}

function decryptToken(stored) {
  if (stored == null) return null;
  const value = String(stored);
  if (!isEncryptedToken(value)) return value;

  const keys = loadOrCreateKeypair();
  if (!keys) {
    throw new Error("Token encryption keys unavailable");
  }

  const payload = value.slice(PREFIX.length);
  const decrypted = crypto.privateDecrypt(
    {
      key: keys.privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(payload, "base64")
  );

  return decrypted.toString("utf8");
}

export { encryptToken, decryptToken, isEncryptedToken, loadOrCreateKeypair, KEY_PATH, PREFIX };

export default { encryptToken, decryptToken, isEncryptedToken, loadOrCreateKeypair, KEY_PATH, PREFIX };
