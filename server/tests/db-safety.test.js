const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("child_process");
const path = require("path");

const h = require("./helpers");
const { missingIndexes, checkRoomNights } = require("../services/dbSafety");

// Guards against touching the wrong database. Everything here runs on the
// isolated test database.

let admin;
let guest;

before(async () => {
  await h.start();
  admin = await h.actor("admin");
  guest = await h.actor("guest");
});

after(() => h.stop());

test("tests only ever clean up a database whose name ends in _test", () => {
  assert.match(h.toTestUri("mongodb://127.0.0.1:27017/luxurystay"), /\/luxurystay_test$/);
  assert.match(h.toTestUri("mongodb://127.0.0.1:27017/luxurystay_test"), /\/luxurystay_test$/);
  assert.match(h.toTestUri("mongodb://127.0.0.1:27017/luxurystay_dev"), /\/luxurystay_test$/);
  assert.match(h.toTestUri("mongodb://127.0.0.1:27017/luxurystay?retryWrites=true"), /\/luxurystay_test\?retryWrites=true$/);
  assert.match(h.toTestUri("not a uri"), /\/luxurystay_test$/);

  assert.equal(h.isPermittedTestDatabase("luxurystay_test"), true);
  for (const name of ["luxurystay", "luxurystay_test_backup", "admin", "", "luxury stay_test", "_test"]) {
    assert.equal(h.isPermittedTestDatabase(name), false, name);
  }
});

test("reading settings never writes; only an administrator's change does", async () => {
  const { Settings } = h.models;
  await Settings.deleteMany({});

  assert.equal((await h.api("GET", "/api/settings", { token: guest.token })).status, 200);
  assert.equal((await h.api("GET", "/api/public/hotel")).status, 200);
  assert.equal(await Settings.countDocuments(), 0);

  assert.equal((await h.api("PUT", "/api/settings", { token: admin.token, body: { taxRate: 5 } })).status, 200);
  const saved = await Settings.findOne();
  assert.equal(saved.taxRate, 5);
  assert.equal(String(saved.updatedBy), admin.id);

  await new Promise((resolve) => setTimeout(resolve, 20));
  await h.api("GET", "/api/settings", { token: guest.token });
  const reread = await Settings.findOne();
  assert.equal(reread.updatedAt.getTime(), saved.updatedAt.getTime());

  await h.api("PUT", "/api/settings", { token: admin.token, body: { taxRate: 0 } });
});

test("a missing index is reported, not silently created", async () => {
  assert.deepEqual(await missingIndexes(), []);

  const { RoomNight } = h.models;
  await RoomNight.collection.dropIndex("room_1_night_1");
  assert.deepEqual(await missingIndexes(), ["roomnights(room, night)"]);
  assert.equal((await RoomNight.collection.indexes()).some((index) => index.name === "room_1_night_1"), false);

  await RoomNight.createIndexes();
  assert.deepEqual(await missingIndexes(), []);
});

test("the ledger check reports a gap without changing anything", async () => {
  const room = await h.createRoom();
  const created = await h.book(guest.token, { roomId: room._id, checkIn: h.day(2), checkOut: h.day(5) });
  assert.equal(created.status, 201);

  const { RoomNight } = h.models;
  await RoomNight.deleteOne({ booking: created.body.booking._id });

  const report = await checkRoomNights();
  assert.ok(report.missingNights >= 1);
  assert.equal(await RoomNight.countDocuments({ booking: created.body.booking._id }), 2);
});

const startServer = (env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(__dirname, "../server.js")], {
      env: { ...process.env, PORT: "5099", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ code: "timeout", output });
    }, 20000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });

test("the server refuses to start on a database it was not told to expect", async () => {
  const result = await startServer({ EXPECTED_DB_NAME: "some_other_database_test" });
  assert.equal(result.code, 1);
  assert.match(result.output, /Unexpected database/);
  assert.ok(result.output.includes(`"database":"${require("mongoose").connection.db.databaseName}"`));
});
