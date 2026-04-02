const express = require("express");
const authController = require("../controllers/auth-controller");
const metaController = require("../controllers/meta-controller");
const voterController = require("../controllers/voter-controller");
const { loginRateLimiter, requireAuth, requireDatabase } = require("../middleware/auth-middleware");

const router = express.Router();

router.get("/health", metaController.getHealth);
router.post("/auth/login", loginRateLimiter, authController.login);
router.post("/auth/logout", authController.logout);
router.get("/auth/me", requireAuth, authController.getCurrentUser);

router.use(requireAuth);
router.use(requireDatabase);

router.get("/stats", metaController.getStats);
router.get("/dashboard/overview", metaController.getOverview);
router.get("/areas", voterController.getAreas);
router.get("/source-files", voterController.getSourceFiles);
router.get("/voters", voterController.getVoters);

module.exports = router;
