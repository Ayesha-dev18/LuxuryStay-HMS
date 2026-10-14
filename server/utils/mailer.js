const nodemailer = require("nodemailer");

const { env } = require("../config/env");
const logger = require("./logger");

let transport = null;
let verifiedAt = 0;

const VERIFY_TTL_MS = 60 * 1000;

const isConfigured = () => Boolean(env.EMAIL_USER && env.EMAIL_APP_PASSWORD);

const buildTransport = () => {
  const auth = {
    user: env.EMAIL_USER,
    pass: env.EMAIL_APP_PASSWORD,
  };

  if (env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth,
    });
  }

  return nodemailer.createTransport({ service: "gmail", auth });
};

const getTransport = () => {
  if (!transport) transport = buildTransport();
  return transport;
};

// Tests swap in a fake transport; nothing else should call this.
const setTransport = (replacement) => {
  transport = replacement;
  verifiedAt = 0;
};

// Confirms the provider accepts our credentials before any account lookup, so
// a delivery outage is reported the same way whether or not an account exists.
const assertReady = async () => {
  if (!transport && !isConfigured()) {
    const error = new Error("Email service is not configured.");
    error.code = "EMAIL_NOT_CONFIGURED";
    throw error;
  }

  if (Date.now() - verifiedAt < VERIFY_TTL_MS) return;

  await getTransport().verify();
  verifiedAt = Date.now();
};

const sendMail = async ({ to, subject, text, html }) => {
  try {
    return await getTransport().sendMail({
      from: env.EMAIL_FROM || `LuxuryStay <${env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    verifiedAt = 0;
    // Provider diagnostics only: no recipient, no message body.
    logger.error("Email delivery failed", error, {
      responseCode: error.responseCode,
      command: error.command,
    });
    throw error;
  }
};

module.exports = {
  isConfigured,
  assertReady,
  sendMail,
  setTransport,
};
