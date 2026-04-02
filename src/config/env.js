const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const validSameSiteValues = new Set(["lax", "strict", "none"]);

function normalizeEnvString(value, fallback = "") {
  const normalized = String(value ?? fallback).trim();

  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    return normalized.slice(1, -1).trim();
  }

  return normalized;
}

function toBoolean(value, fallback = false) {
  if (value == null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeSameSite(value, fallback = "lax") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (validSameSiteValues.has(normalized)) {
    return normalized;
  }

  return fallback;
}

function normalizeEnvList(value, fallback = "") {
  return String(value ?? fallback)
    .split(",")
    .map((item) => normalizeEnvString(item))
    .filter(Boolean);
}

module.exports = {
  port: Number.parseInt(process.env.PORT || "4000", 10),
  mongoUri: normalizeEnvString(process.env.MONGODB_URI, "mongodb://localhost:27017/nid_voter"),
  mongoServerSelectionTimeoutMs: Number.parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || "5000", 10),
  clientOrigins: normalizeEnvList(process.env.CLIENT_ORIGIN, "http://localhost:3001,http://localhost:5173"),
  isProduction: process.env.NODE_ENV === "production",
  authCookieName: normalizeEnvString(process.env.AUTH_COOKIE_NAME, "nid_session"),
  jwtSecret: normalizeEnvString(process.env.JWT_SECRET, "change-this-jwt-secret-for-production"),
  jwtExpiresIn: normalizeEnvString(process.env.JWT_EXPIRES_IN, "12h"),
  cookieSecure: toBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  cookieSameSite: normalizeSameSite(process.env.COOKIE_SAME_SITE, process.env.NODE_ENV === "production" ? "none" : "lax"),
  cookieDomain: normalizeEnvString(process.env.COOKIE_DOMAIN, "") || undefined,
};
