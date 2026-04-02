const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");

const JWT_ISSUER = "nid-voter-backend";
const JWT_AUDIENCE = "nid-voter-webapp";

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildUserProfile() {
  return {
    id: "local-admin",
    username: env.authUsername,
    displayName: "System Administrator",
    role: "admin",
  };
}

function getCookieOptions() {
  const sameSite = env.cookieSameSite;
  const secure = sameSite === "none" ? true : env.cookieSecure;

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
    ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
  };
}

function signSessionToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
}

async function verifyCredentials(username, password) {
  const normalizedUsername = String(username || "").trim();
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) {
    throw createHttpError(400, "Username and password are required.");
  }

  if (normalizedUsername !== env.authUsername) {
    throw createHttpError(401, "Invalid username or password.");
  }

  const isValidPassword = await bcrypt.compare(normalizedPassword, env.authPasswordHash);
  if (!isValidPassword) {
    throw createHttpError(401, "Invalid username or password.");
  }

  return buildUserProfile();
}

function resolveTokenFromRequest(req) {
  const cookieToken = req.cookies?.[env.authCookieName];
  if (cookieToken) return cookieToken;

  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  return null;
}

function verifySessionFromRequest(req) {
  const token = resolveTokenFromRequest(req);
  if (!token) {
    throw createHttpError(401, "Authentication required.");
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    return {
      id: payload.sub,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
    };
  } catch (_error) {
    throw createHttpError(401, "Session expired or invalid.");
  }
}

function issueSession(res, user) {
  const token = signSessionToken(user);
  res.cookie(env.authCookieName, token, getCookieOptions());
}

function clearSession(res) {
  res.clearCookie(env.authCookieName, {
    ...getCookieOptions(),
    maxAge: undefined,
  });
}

module.exports = {
  buildUserProfile,
  clearSession,
  issueSession,
  verifyCredentials,
  verifySessionFromRequest,
};
