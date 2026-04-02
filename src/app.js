const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const express = require("express");
const helmet = require("helmet");
const env = require("./config/env");
const apiRoutes = require("./routes/api-routes");

const app = express();
const corsOptions = {
  origin: true,
  credentials: true,
};

app.disable("x-powered-by");
app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "nid-voter-backend",
    status: "ok",
    api: "/api/v1",
  });
});

app.use("/api/v1", apiRoutes);

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || "Internal server error",
  });
});

module.exports = app;
