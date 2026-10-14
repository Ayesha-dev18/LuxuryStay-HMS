// Small structured logger. Callers pass only safe metadata: never request
// bodies, passwords, tokens or connection strings.

const { env } = require("../config/env");

const write = (level, message, meta) => {
  if (env.isTest && level !== "error") return;

  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(meta || {}),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

const describeError = (error) => ({
  name: error?.name,
  error: error?.message,
  code: error?.code,
  ...(env.isProduction || env.isTest ? {} : { stack: error?.stack }),
});

module.exports = {
  info: (message, meta) => write("info", message, meta),
  warn: (message, meta) => write("warn", message, meta),
  error: (message, error, meta) =>
    write("error", message, { ...describeError(error), ...(meta || {}) }),
};
