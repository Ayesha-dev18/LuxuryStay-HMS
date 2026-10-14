const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

const read = (name, fallback = "") => {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value.trim();
};

const readNumber = (name, fallback) => {
  const value = Number(read(name, ""));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const NODE_ENV = read("NODE_ENV", "development");
const CLIENT_URL = read("CLIENT_URL", "http://localhost:5173").replace(/\/+$/, "");

const env = {
  NODE_ENV,
  isProduction: NODE_ENV === "production",
  isTest: NODE_ENV === "test",

  PORT: readNumber("PORT", 5000),
  MONGO_URI: read("MONGO_URI"),
  // When set, the server refuses to run against any other database.
  EXPECTED_DB_NAME: read("EXPECTED_DB_NAME"),
  // Off by default: the ledger is only checked on start, and repaired with
  // "npm run db:repair-ledger" or by setting this to true.
  LEDGER_REPAIR_ON_START: read("LEDGER_REPAIR_ON_START", "false") === "true",

  JWT_SECRET: read("JWT_SECRET"),
  JWT_EXPIRES_IN: read("JWT_EXPIRES_IN", "12h"),

  // Trusted frontend origin. Password-reset links are built from this value
  // only, never from request headers.
  CLIENT_URL,
  CORS_ORIGINS: read("CORS_ORIGINS", CLIENT_URL)
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean),

  // All stay dates are hotel-local calendar days in this timezone.
  HOTEL_TIMEZONE: read("HOTEL_TIMEZONE", "Asia/Karachi"),
  MAX_STAY_NIGHTS: readNumber("MAX_STAY_NIGHTS", 30),
  MAX_ADVANCE_DAYS: readNumber("MAX_ADVANCE_DAYS", 365),

  // Email. Either a generic SMTP host or the existing Gmail app-password setup.
  SMTP_HOST: read("SMTP_HOST"),
  SMTP_PORT: readNumber("SMTP_PORT", 587),
  SMTP_SECURE: read("SMTP_SECURE", "false") === "true",
  EMAIL_USER: read("EMAIL_USER"),
  EMAIL_APP_PASSWORD: read("EMAIL_APP_PASSWORD"),
  EMAIL_FROM: read("EMAIL_FROM"),

  RESET_TOKEN_MINUTES: readNumber("RESET_TOKEN_MINUTES", 30),

  // Identity documents: where they are kept, the key that encrypts them at
  // rest, and how long the automatic CNIC number check may take.
  UPLOAD_DIR: read("UPLOAD_DIR"),
  DOCUMENT_KEY: read("DOCUMENT_KEY"),
  OCR_TIMEOUT_MS: readNumber("OCR_TIMEOUT_MS", 20000),
  TRUST_PROXY: read("TRUST_PROXY"),
};

// Reports missing or weak configuration by variable name only. Values are
// never printed.
const validateEnv = () => {
  const errors = [];
  const warnings = [];

  if (!env.MONGO_URI) errors.push("MONGO_URI is required.");
  if (!env.JWT_SECRET) errors.push("JWT_SECRET is required.");
  else if (env.JWT_SECRET.length < 32) {
    errors.push("JWT_SECRET must be at least 32 characters long.");
  }

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: env.HOTEL_TIMEZONE });
  } catch {
    errors.push("HOTEL_TIMEZONE is not a valid IANA timezone.");
  }

  if (!env.EMAIL_USER || !env.EMAIL_APP_PASSWORD) {
    warnings.push(
      "EMAIL_USER / EMAIL_APP_PASSWORD are not set. Password-reset emails cannot be sent."
    );
  }

  if (!env.DOCUMENT_KEY) {
    warnings.push("DOCUMENT_KEY is not set. Uploaded identity documents are stored unencrypted.");
  } else if (env.DOCUMENT_KEY.length < 32) {
    errors.push("DOCUMENT_KEY must be at least 32 characters long.");
  }

  if (env.isProduction && /localhost|127\.0\.0\.1/.test(env.CLIENT_URL)) {
    warnings.push("CLIENT_URL points to localhost in production.");
  }

  return { errors, warnings };
};

module.exports = { env, validateEnv };
