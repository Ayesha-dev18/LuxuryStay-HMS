// Shared database guard for scripts that write: the database must be named in
// EXPECTED_DB_NAME exactly, and the production and test databases are always
// refused.

const { env } = require("../config/env");

const PROTECTED = {
  luxurystay: "is the production database",
  luxurystay_test: "is the test database and is wiped by the tests",
};

const databaseInUri = (uri) => {
  const match = /^mongodb(?:\+srv)?:\/\/[^/]*\/([^?]*)/.exec(uri || "");
  return match?.[1] || "";
};

// Returns the reason the database may not be written to, or "".
const refusalFor = (name) => {
  if (!name) return "The database name could not be determined.";
  if (Object.hasOwn(PROTECTED, name)) return `"${name}" ${PROTECTED[name]}.`;
  if (!env.EXPECTED_DB_NAME) return "EXPECTED_DB_NAME is not set.";
  if (env.EXPECTED_DB_NAME !== name) {
    return `EXPECTED_DB_NAME is "${env.EXPECTED_DB_NAME}", not "${name}".`;
  }
  return "";
};

module.exports = { databaseInUri, refusalFor };
