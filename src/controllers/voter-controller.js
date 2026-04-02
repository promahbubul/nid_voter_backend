const voterService = require("../services/voter-service");

async function getVoters(req, res, next) {
  try {
    const data = await voterService.listVoters(req.query);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getAreas(req, res, next) {
  try {
    const data = await voterService.listAreas(req.query);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

async function getSourceFiles(req, res, next) {
  try {
    const data = await voterService.listSourceFiles(req.query);
    res.json(data);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAreas,
  getSourceFiles,
  getVoters,
};
