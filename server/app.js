const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");

const { env } = require("./config/env");
const { createRateLimiters } = require("./middleware/rateLimiters");
const { rejectUnsafeKeys } = require("./middleware/validate");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const { createAuthRouter } = require("./routes/authRoutes");
const { createContactRouter } = require("./routes/contactRoutes");
const userRoutes = require("./routes/userRoutes");
const roomRoutes = require("./routes/roomRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const maintenanceRoutes = require("./routes/maintenanceRoutes");
const reportRoutes = require("./routes/reportRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const publicRoutes = require("./routes/publicRoutes");

// Builds the Express app without opening a port or a database connection, so
// the same app runs in production and under test.
const createApp = ({ rateLimits } = {}) => {
  const app = express();
  const limiters = createRateLimiters(rateLimits);

  app.disable("x-powered-by");

  // Needed for correct client addresses (and rate limiting) behind a proxy.
  if (env.TRUST_PROXY) {
    app.set("trust proxy", /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);
  }

  app.use(helmet());

  app.use(
    cors({
      origin(origin, callback) {
        // Requests without an Origin header (curl, server-to-server, health
        // checks) are not cross-origin browser requests.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        return callback(new Error("CORS_NOT_ALLOWED"));
      },
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    })
  );

  app.use(express.json({ limit: "100kb" }));
  app.use(rejectUnsafeKeys);

  app.get("/", (req, res) => {
    res.json({ success: true, message: "LuxuryStay API is running." });
  });

  app.get("/api/health", (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      success: connected,
      database: connected ? "connected" : "unavailable",
      // Outside production, name the database so a developer can confirm the target.
      ...(connected && !env.isProduction ? { databaseName: mongoose.connection.db.databaseName } : {}),
    });
  });

  app.use("/api", limiters.api);

  // Fail fast with a clear answer while the database is unreachable, instead
  // of letting every request hang until it times out.
  app.use("/api", (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "The service is temporarily unavailable. Please try again in a moment.",
      });
    }
    return next();
  });

  // The hotel website reads these without signing in.
  app.use("/api/public", publicRoutes);

  app.use("/api/auth", createAuthRouter(limiters));
  app.use("/api/contact", createContactRouter(limiters));
  app.use("/api/users", userRoutes);
  app.use("/api/rooms", roomRoutes);
  app.use("/api/bookings", bookingRoutes);
  app.use("/api/maintenance", maintenanceRoutes);
  app.use("/api/reports", reportRoutes);
  app.use("/api/feedback", feedbackRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/notifications", notificationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

module.exports = { createApp };
