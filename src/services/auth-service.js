const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const { connectToDatabase } = require("../config/db");

const JWT_ISSUER = "nid-voter-backend";
const JWT_AUDIENCE = "nid-voter-webapp";
const USERS_COLLECTION_NAME = "users";
let ensureIndexesPromise;

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function buildUserProfile(user) {
  return {
    id: String(user._id),
    username: user.username,
    displayName: user.display_name || user.username,
    role: user.role || "admin",
  };
}

function normalizeUsername(value) {
  return String(value || "").trim();
}

function normalizeUsernameKey(value) {
  return normalizeUsername(value).toLowerCase();
}

async function getUsersCollection() {
  let db;

  try {
    db = await connectToDatabase();
  } catch (_error) {
    throw createHttpError(503, "Authentication database is unavailable.");
  }

  if (!ensureIndexesPromise) {
    ensureIndexesPromise = db
      .collection(USERS_COLLECTION_NAME)
      .createIndexes([
        {
          key: { username_normalized: 1 },
          name: "username_normalized_unique",
          unique: true,
        },
        {
          key: { is_active: 1 },
          name: "is_active",
        },
      ])
      .catch((error) => {
        ensureIndexesPromise = null;
        throw error;
      });
  }

  try {
    await ensureIndexesPromise;
  } catch (_error) {
    throw createHttpError(500, "Could not prepare authentication indexes.");
  }

  return db.collection(USERS_COLLECTION_NAME);
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
  const normalizedUsername = normalizeUsername(username);
  const normalizedPassword = String(password || "");

  if (!normalizedUsername || !normalizedPassword) {
    throw createHttpError(400, "Username and password are required.");
  }

  const users = await getUsersCollection();
  const user = await users.findOne({
    username_normalized: normalizeUsernameKey(normalizedUsername),
    is_active: { $ne: false },
  });

  if (!user?.password_hash) {
    throw createHttpError(401, "Invalid username or password.");
  }

  const isValidPassword = await bcrypt.compare(normalizedPassword, user.password_hash);
  if (!isValidPassword) {
    throw createHttpError(401, "Invalid username or password.");
  }

  await users.updateOne(
    { _id: user._id },
    {
      $set: {
        last_login_at: new Date().toISOString(),
      },
    },
  );

  return buildUserProfile(user);
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
