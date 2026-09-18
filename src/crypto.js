import crypto from "node:crypto";
import os from "node:os";

const ALGORITHM = "aes-256-gcm";
const SALT = "dims-extract-figma-secure-salt-v1";

/**
 * Derives a machine-specific 256-bit encryption key.
 */
function getDerivedKey() {
  const machineIdentity = [
    os.userInfo().username || "default-user",
    os.hostname() || "localhost",
    os.platform() || "linux",
    os.homedir() || "",
  ].join("::");

  return crypto.pbkdf2Sync(machineIdentity, SALT, 100000, 32, "sha256");
}

/**
 * Encrypts a plaintext string (e.g. Figma Personal Access Token) using AES-256-GCM.
 * @param {string} plainText
 * @returns {string} base64 encoded payload format: `iv:authTag:ciphertext`
 */
export function encryptToken(plainText) {
  if (!plainText) return null;
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  const combined = `${iv.toString("hex")}:${authTag}:${encrypted}`;
  return Buffer.from(combined, "utf8").toString("base64");
}

/**
 * Decrypts an encrypted token.
 * @param {string} encryptedBase64
 * @returns {string} decrypted plaintext
 */
export function decryptToken(encryptedBase64) {
  if (!encryptedBase64) return null;
  try {
    const raw = Buffer.from(encryptedBase64, "base64").toString("utf8");
    const [ivHex, authTagHex, encryptedHex] = raw.split(":");
    if (!ivHex || !authTagHex || !encryptedHex) return null;

    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    throw new Error("Failed to decrypt token. The token may have been encrypted on a different machine or user profile.");
  }
}
