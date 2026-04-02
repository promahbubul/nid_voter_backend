const rateLimit = require("express-rate-limit");
const authService = require("../services/auth-service");

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

module.exports = {
  loginRateLimiter,
  requireAuth,
};
