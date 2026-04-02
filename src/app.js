const compression = require("compression");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const express = require("express");
const helmet = require("helmet");
const env = require("./config/env");
const apiRoutes = require("./routes/api-routes");

const app = express();
const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.clientOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
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
  let statusCode = error.statusCode || error.status || 500;

  if (error.type === "entity.parse.failed") {
    statusCode = 400;
  } else if (typeof error.message === "string" && error.message.startsWith("CORS blocked for origin:")) {
    statusCode = 403;
  }

  const message =
    statusCode >= 500 && statusCode !== 503
      ? "Internal server error"
      : error.message || "Internal server error";

  res.status(statusCode).json({ message });
});

module.exports = app;
