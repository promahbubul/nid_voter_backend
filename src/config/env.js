const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const DEFAULT_PASSWORD_HASH = "$2b$12$C5dIVi40f91RtgrdVn1YZ.r846TbYqz5vtHgzzB3Yssxp/DgcqkHu";
const clientOrigins = String(process.env.CLIENT_ORIGIN || "http://localhost:3001,http://localhost:5173")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const validSameSiteValues = new Set(["lax", "strict", "none"]);

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

module.exports = {
  port: Number.parseInt(process.env.PORT || "4000", 10),
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/nid_voter",
  clientOrigins,
  allowAllCors: toBoolean(process.env.ALLOW_ALL_CORS, false),
  isProduction: process.env.NODE_ENV === "production",
  authUsername: process.env.AUTH_USERNAME || "admin",
  authPasswordHash: process.env.AUTH_PASSWORD_HASH || DEFAULT_PASSWORD_HASH,
  authCookieName: process.env.AUTH_COOKIE_NAME || "nid_session",
  jwtSecret: process.env.JWT_SECRET || "change-this-jwt-secret-for-production",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  cookieSecure: toBoolean(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  cookieSameSite: normalizeSameSite(process.env.COOKIE_SAME_SITE, process.env.NODE_ENV === "production" ? "none" : "lax"),
  cookieDomain: String(process.env.COOKIE_DOMAIN || "").trim() || undefined,
};
