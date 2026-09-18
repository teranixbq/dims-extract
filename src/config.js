import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { decryptToken, encryptToken } from "./crypto.js";

/**
 * Resolves standard OS config directory for dims-extract:
 * - Windows: %APPDATA%\dims-extract
 * - Linux/macOS: ~/.config/dims-extract
 */
export function getConfigDir() {
  let baseDir = process.env.XDG_CONFIG_HOME;
  if (!baseDir) {
    if (process.platform === "win32") {
      baseDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    } else {
      baseDir = path.join(os.homedir(), ".config");
    }
  }
  const configDir = path.join(baseDir, "dims-extract");
  fs.mkdirSync(configDir, { recursive: true });
  return configDir;
}

export function getConfigFilePath() {
  return path.join(getConfigDir(), "config.json");
}

/**
 * Returns default MCP folder:
 * - Windows: %USERPROFILE%\dims-extract-mcp
 * - Linux/macOS: ~/dims-extract-mcp
 */
export function getDefaultMcpDir() {
  return path.join(os.homedir(), "dims-extract-mcp");
}

function readConfigFile() {
  const configFile = getConfigFilePath();
  if (fs.existsSync(configFile)) {
    try {
      return JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch {
      return {};
    }
  }
  return {};
}

function writeConfigFile(data) {
  const configFile = getConfigFilePath();
  fs.writeFileSync(configFile, JSON.stringify(data, null, 2), "utf8");
}

export function saveToken(plainToken) {
  if (!plainToken) throw new Error("Token cannot be empty.");
  const encrypted = encryptToken(plainToken.trim());
  const conf = readConfigFile();
  conf.encryptedToken = encrypted;
  conf.updatedAt = new Date().toISOString();
  writeConfigFile(conf);
}

export function getToken() {
  if (process.env.FIGMA_TOKEN) {
    return process.env.FIGMA_TOKEN.trim();
  }
  const conf = readConfigFile();
  if (!conf.encryptedToken) return null;
  return decryptToken(conf.encryptedToken);
}

export function hasToken() {
  return Boolean(process.env.FIGMA_TOKEN || readConfigFile().encryptedToken);
}

export function removeToken() {
  const conf = readConfigFile();
  delete conf.encryptedToken;
  conf.updatedAt = new Date().toISOString();
  writeConfigFile(conf);
}

export function getMcpDir() {
  const conf = readConfigFile();
  const targetDir = conf.defaultMcpDir || getDefaultMcpDir();
  const projectsDir = path.join(targetDir, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });
  return targetDir;
}

export function setMcpDir(customPath) {
  const resolved = path.resolve(customPath);
  const conf = readConfigFile();
  conf.defaultMcpDir = resolved;
  conf.updatedAt = new Date().toISOString();
  writeConfigFile(conf);
  const projectsDir = path.join(resolved, "projects");
  fs.mkdirSync(projectsDir, { recursive: true });
  return resolved;
}
