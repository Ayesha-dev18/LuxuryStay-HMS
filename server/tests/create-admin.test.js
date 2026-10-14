const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path");

// The create-admin database guard. Every case here is refused from the name in
// MONGO_URI, before the script connects to any database.

const run = (env, script = "../scripts/createAdmin.js") =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, script)], {
      env: {
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET || "test-secret-test-secret-test-secret-1234",
        ADMIN_EMAIL: "guard-check@example.test",
        ADMIN_PASSWORD: "Guard-check-1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => resolve({ code, output }));
  });

test("create-admin refuses when EXPECTED_DB_NAME is missing", async () => {
  const result = await run({ MONGO_URI: "mongodb://127.0.0.1:27017/luxurystay_guard_missing", EXPECTED_DB_NAME: "" });
  assert.equal(result.code, 1);
  assert.match(result.output, /EXPECTED_DB_NAME is not set/);
  assert.match(result.output, /No account was created or changed/);
});

test("create-admin refuses when EXPECTED_DB_NAME does not match", async () => {
  const result = await run({ MONGO_URI: "mongodb://127.0.0.1:27017/luxurystay_dev", EXPECTED_DB_NAME: "luxurystay_other" });
  assert.equal(result.code, 1);
  assert.match(result.output, /EXPECTED_DB_NAME is "luxurystay_other", not "luxurystay_dev"/);
});

test("create-admin refuses the test and production databases even when they are expected", async () => {
  const testDb = await run({ MONGO_URI: "mongodb://127.0.0.1:27017/luxurystay_test", EXPECTED_DB_NAME: "luxurystay_test" });
  assert.equal(testDb.code, 1);
  assert.match(testDb.output, /test database/);

  const production = await run({ MONGO_URI: "mongodb://127.0.0.1:27017/luxurystay", EXPECTED_DB_NAME: "luxurystay" });
  assert.equal(production.code, 1);
  assert.match(production.output, /production database/);

  // Refused before connecting.
  assert.doesNotMatch(testDb.output + production.output, /Connected database/);
  // No credential appears in what the script prints.
  assert.doesNotMatch(testDb.output + production.output, /Guard-check-1|test-secret/);
});

test("the development room seed refuses the test and production databases and a mismatch", async () => {
  const seed = (env) => run(env, "../scripts/seedDevRooms.js");
  for (const [uri, expected, pattern] of [
    ["mongodb://127.0.0.1:27017/luxurystay", "luxurystay", /production database/],
    ["mongodb://127.0.0.1:27017/luxurystay_test", "luxurystay_test", /test database/],
    ["mongodb://127.0.0.1:27017/luxurystay_dev", "", /EXPECTED_DB_NAME is not set/],
    ["mongodb://127.0.0.1:27017/luxurystay_dev", "luxurystay_other", /not "luxurystay_dev"/],
  ]) {
    const result = await seed({ MONGO_URI: uri, EXPECTED_DB_NAME: expected });
    assert.equal(result.code, 1, uri);
    assert.match(result.output, pattern);
    assert.match(result.output, /Nothing was written/);
    assert.doesNotMatch(result.output, /Connected database/);
  }
});

test("the development demo seed refuses every database except luxurystay_dev", async () => {
  for (const [uri, expected, pattern] of [
    ["mongodb://127.0.0.1:27017/luxurystay", "luxurystay", /not "luxurystay_dev"/],
    ["mongodb://127.0.0.1:27017/luxurystay_test", "luxurystay_test", /not "luxurystay_dev"/],
    ["mongodb://127.0.0.1:27017/luxurystay_staging", "luxurystay_staging", /not "luxurystay_dev"/],
    ["mongodb://127.0.0.1:27017/luxurystay_dev", "", /EXPECTED_DB_NAME is not set/],
    ["mongodb://127.0.0.1:27017/luxurystay_dev", "luxurystay_other", /not "luxurystay_dev"/],
  ]) {
    const result = await run({ MONGO_URI: uri, EXPECTED_DB_NAME: expected }, "../scripts/seedDevDemo.js");
    assert.equal(result.code, 1, uri);
    assert.match(result.output, pattern);
    assert.match(result.output, /Nothing was written/);
    assert.doesNotMatch(result.output, /Connected database/);
  }
});
