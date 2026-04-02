const rateLimit = require("express-rate-limit");
const authService = require("../services/auth-service");
const { connectToDatabase, createDatabaseUnavailableError } = require("../config/db");

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: "Too many login attempts. Please try again in a few minutes.",
  },
});

function requireAuth(req, _res, next) {
  try {
    req.auth = authService.verifySessionFromRequest(req);
    next();
  } catch (error) {
    next(error);
  }
}

async function requireDatabase(_req, _res, next) {
  try {
    await connectToDatabase();
    next();
  } catch (_error) {
    next(createDatabaseUnavailableError());
  }
}

module.exports = {
  loginRateLimiter,
  requireAuth,
  requireDatabase,
};
