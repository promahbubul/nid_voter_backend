const { getDbStatus } = require("../config/db");
const voterService = require("../services/voter-service");

async function getHealth(req, res, next) {
  try {
    const dbStatus = getDbStatus();
    if (!dbStatus.connected) {
      res.status(503).json({
        ok: false,
        message: "Database is unavailable. Check MongoDB connectivity and MONGODB_URI.",
        database: dbStatus,
      });
      return;
    }

    const data = await voterService.getHealth();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const data = await voterService.getStats();
    res.json(data || {});
  } catch (error) {
    next(error);
  }
}

async function getOverview(req, res, next) {
  try {
    const data = await voterService.getOverview();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getHealth,
  getOverview,
  getStats,
};
