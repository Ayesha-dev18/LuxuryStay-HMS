const mongoose = require("mongoose");

const { env, validateEnv } = require("./config/env");
const { createApp } = require("./app");
const { syncRoomNights } = require("./services/availability");
const { missingIndexes, checkRoomNights } = require("./services/dbSafety");
const logger = require("./utils/logger");

const { errors, warnings } = validateEnv();

warnings.forEach((warning) => logger.warn(warning));

if (errors.length > 0) {
  errors.forEach((message) => logger.error("Configuration error", new Error(message)));
  process.exit(1);
}

mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));
mongoose.connection.on("reconnected", () => logger.info("MongoDB reconnected"));
mongoose.connection.on("error", (error) => logger.error("MongoDB connection error", error));

const RETRY_MS = 5000;

const refuse = (message, details) => {
  logger.error(message, new Error(message), details);
  process.exit(1);
};

// Checks made on every start. They only read: starting the server never
// creates collections, builds indexes or rewrites the ledger unless that has
// been asked for explicitly.
const checkDatabase = async () => {
  const name = mongoose.connection.db.databaseName;
  logger.info("MongoDB connected", { database: name });

  if (env.EXPECTED_DB_NAME && name !== env.EXPECTED_DB_NAME) {
    refuse("Unexpected database; the server will not start", { database: name, expected: env.EXPECTED_DB_NAME });
  }

  const missing = await missingIndexes();
  if (missing.length > 0) {
    refuse("Required indexes are missing; the server will not start", {
      database: name,
      missing,
      fix: `Review, then run: npm run db:indexes -- --confirm=${name}`,
    });
  }

  if (env.LEDGER_REPAIR_ON_START) {
    const result = await syncRoomNights();
    logger.info("Room availability ledger repaired", {
      activeBookings: result.active,
      staleNightsRemoved: result.removed,
      overlappingBookings: result.conflicts.length,
    });
    return;
  }

  const ledger = await checkRoomNights();
  if (ledger.missingNights > 0 || ledger.staleNights > 0) {
    logger.warn("Room availability ledger does not match the reservations; nothing was changed", {
      ...ledger,
      fix: `Review, then run: npm run db:repair-ledger -- --confirm=${name}`,
    });
  } else {
    logger.info("Room availability ledger matches the reservations", ledger);
  }
};

// Keeps trying until the first connection succeeds. After that the driver
// reconnects on its own and the events above report it.
const connect = async () => {
  try {
    // Index building and collection creation are switched off; they are
    // done deliberately with "npm run db:indexes".
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      autoIndex: false,
      autoCreate: false,
    });
  } catch (error) {
    logger.error("MongoDB connection failed; retrying", error);
    setTimeout(connect, RETRY_MS);
    return;
  }

  try {
    await checkDatabase();
  } catch (error) {
    refuse("Database start-up checks failed; the server will not start", { reason: error.message });
  }
};

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`LuxuryStay server running on port ${env.PORT}`, { environment: env.NODE_ENV });
});

connect();

const shutdown = (signal) => {
  logger.info(`${signal} received; shutting down`);
  server.close(async () => {
    await mongoose.connection.close().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", reason instanceof Error ? reason : new Error(String(reason)));
});
