const authService = require("../services/auth-service");

async function login(req, res, next) {
  try {
    const user = await authService.verifyCredentials(req.body?.username, req.body?.password);
    authService.issueSession(res, user);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

function logout(req, res) {
  authService.clearSession(res);
  res.json({ success: true });
}

function getCurrentUser(req, res) {
  res.json({ user: req.auth });
}

module.exports = {
  getCurrentUser,
  login,
  logout,
};
