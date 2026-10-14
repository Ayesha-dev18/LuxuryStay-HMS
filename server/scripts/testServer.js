// Starts the API for browser testing against the isolated test database.
//
//   npm run start:test
//
// The database is "<name from .env>_test". The server refuses to start on any
// other database, uploads go to a temporary folder, and email is switched off
// so no real message can be sent.

const fs = require("fs");
const os = require("os");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "../.env"), quiet: true });

const match = /^(mongodb(?:\+srv)?:\/\/[^/]+)\/([^?]*)(\?.*)?$/.exec(process.env.MONGO_URI || "");
const base = (match?.[2] || "luxurystay").replace(/_(dev|test)$/, "");
const testName = `${base}_test`;

if (!/^[A-Za-z0-9-]+_test$/.test(testName)) {
  console.error("Refusing to start: could not work out a test database name.");
  process.exit(1);
}

process.env.MONGO_URI = match
  ? `${match[1]}/${testName}${match[3] || ""}`
  : `mongodb://127.0.0.1:27017/${testName}`;
process.env.EXPECTED_DB_NAME = testName;
process.env.PORT = process.env.TEST_PORT || "5055";
process.env.CLIENT_URL = process.env.TEST_CLIENT_URL || "http://localhost:5199";
process.env.CORS_ORIGINS = process.env.CLIENT_URL;
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "luxurystay-browser-test-uploads-"));
process.env.DOCUMENT_KEY = process.env.TEST_DOCUMENT_KEY || "browser-test-document-key-not-for-real-data";
process.env.EMAIL_USER = "";
process.env.EMAIL_APP_PASSWORD = "";
// The test database may be rebuilt freely, so its ledger is repaired on start.
process.env.LEDGER_REPAIR_ON_START = "true";

console.log(`Test server: database ${testName}, port ${process.env.PORT}, uploads in a temporary folder, email off.`);
require("../server");
