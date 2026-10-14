const { rateLimit } = require("express-rate-limit");

const MINUTE = 60 * 1000;

const DEFAULT_LIMITS = {
  api: { windowMs: 15 * MINUTE, limit: 1500 },
  login: { windowMs: 15 * MINUTE, limit: 10 },
  register: { windowMs: 60 * MINUTE, limit: 10 },
  passwordReset: { windowMs: 15 * MINUTE, limit: 5 },
  resetToken: { windowMs: 15 * MINUTE, limit: 15 },
  contact: { windowMs: 60 * MINUTE, limit: 8 },
};

const build = ({ windowMs, limit }, message, extra = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message },
    ...extra,
  });

// Limits are created per app instance so tests can run with their own values.
const createRateLimiters = (overrides = {}) => {
  const limits = { ...DEFAULT_LIMITS, ...overrides };

  return {
    api: build(limits.api, "Too many requests. Please slow down and try again shortly."),
    login: build(
      limits.login,
      "Too many sign-in attempts. Please wait a few minutes and try again.",
      { skipSuccessfulRequests: true }
    ),
    register: build(limits.register, "Too many accounts created. Please try again later."),
    passwordReset: build(
      limits.passwordReset,
      "Too many password reset requests. Please try again later."
    ),
    resetToken: build(limits.resetToken, "Too many attempts. Please try again later."),
    contact: build(limits.contact, "Too many enquiries sent. Please try again later."),
  };
};

module.exports = { createRateLimiters, DEFAULT_LIMITS };
