const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const h = require("./helpers");

before(() => h.start());
after(() => h.stop());

test("registration creates a guest and ignores any role the client sends", async () => {
  const injected = await h.api("POST", "/api/auth/register", {
    body: { name: "Mallory", email: "mallory@example.test", password: h.PASSWORD, role: "admin" },
  });
  assert.equal(injected.status, 400);

  const created = await h.api("POST", "/api/auth/register", {
    body: { name: "Mallory Admin 12345", email: "mallory@example.test", password: h.PASSWORD },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, "guest");
  assert.equal(created.body.user.password, undefined);

  const stored = await h.models.User.findOne({ email: "mallory@example.test" }).select("+password");
  assert.equal(stored.role, "guest");
  assert.notEqual(stored.password, h.PASSWORD);
  assert.match(stored.password, /^\$2[aby]\$/);
});

test("registration validates email, password policy and duplicates", async () => {
  const cases = [
    { name: "A", email: "a@example.test", password: h.PASSWORD },
    { name: "Valid Name", email: "not-an-email", password: h.PASSWORD },
    { name: "Valid Name", email: "v@example.test", password: "short1" },
    { name: "Valid Name", email: "v@example.test", password: "allletters" },
    { name: "Valid Name", email: "v@example.test" },
  ];

  for (const body of cases) {
    const result = await h.api("POST", "/api/auth/register", { body });
    assert.equal(result.status, 400, JSON.stringify(body));
  }

  const duplicate = await h.api("POST", "/api/auth/register", {
    body: { name: "Mallory Again", email: "MALLORY@example.test", password: h.PASSWORD },
  });
  assert.equal(duplicate.status, 409);
});

test("login returns a token and the same error for unknown users and wrong passwords", async () => {
  const user = await h.createUser("guest");

  const ok = await h.api("POST", "/api/auth/login", {
    body: { email: user.email, password: h.PASSWORD },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.user.role, "guest");
  assert.ok(Array.isArray(ok.body.permissions));

  const wrong = await h.api("POST", "/api/auth/login", {
    body: { email: user.email, password: "Wrong-password1" },
  });
  const unknown = await h.api("POST", "/api/auth/login", {
    body: { email: "nobody@example.test", password: "Wrong-password1" },
  });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test("login rejects NoSQL operator payloads", async () => {
  const result = await h.api("POST", "/api/auth/login", {
    body: { email: { $ne: null }, password: { $ne: null } },
  });
  assert.equal(result.status, 400);
});

test("protected routes reject missing, malformed, forged and expired tokens", async () => {
  const user = await h.createUser("guest");
  const { env } = require("../config/env");

  const expired = jwt.sign({ userId: String(user._id), tv: 0 }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: -10,
  });
  const forged = jwt.sign({ userId: String(user._id), tv: 0, role: "admin" }, "another-secret-another-secret-1234");
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from(
    JSON.stringify({ userId: String(user._id), tv: 0 })
  ).toString("base64url")}.`;

  for (const token of [undefined, "garbage", expired, forged, unsigned]) {
    const result = await h.api("GET", "/api/auth/me", { token });
    assert.equal(result.status, 401);
  }
});

test("a role claim inside a token is ignored; the stored role decides", async () => {
  const guest = await h.createUser("guest");
  const { env } = require("../config/env");

  const token = jwt.sign({ userId: String(guest._id), tv: 0, role: "admin" }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "5m",
  });

  const me = await h.api("GET", "/api/auth/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, "guest");

  const admin = await h.api("GET", "/api/users/staff", { token });
  assert.equal(admin.status, 403);
});

test("profile update cannot change role or status", async () => {
  const { token, user } = await h.actor("receptionist");

  for (const extra of [{ role: "admin" }, { isActive: true }, { tokenVersion: 0 }, { password: "Another1pass" }]) {
    const result = await h.api("PUT", "/api/auth/me", {
      token,
      body: { name: "New Name", email: user.email, ...extra },
    });
    assert.equal(result.status, 400);
  }

  const ok = await h.api("PUT", "/api/auth/me", {
    token,
    body: { name: "Renamed Person", email: user.email, phone: "0300 1234567" },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, "receptionist");
  assert.equal(ok.body.user.phone, "03001234567");

  const stored = await h.models.User.findById(user._id);
  assert.equal(stored.role, "receptionist");
});

test("a name that looks like a privilege grants nothing", async () => {
  const created = await h.api("POST", "/api/auth/register", {
    body: { name: "admin 1", email: "sneaky@example.test", password: h.PASSWORD, phone: "03001112223" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.role, "guest");

  const signedIn = await h.api("POST", "/api/auth/login", {
    body: { email: "sneaky@example.test", password: h.PASSWORD },
  });
  const result = await h.api("GET", "/api/reports/overview", { token: signedIn.body.token });
  assert.equal(result.status, 403);
});

test("logout revokes the token", async () => {
  const { token } = await h.actor("guest");

  assert.equal((await h.api("GET", "/api/auth/me", { token })).status, 200);
  assert.equal((await h.api("POST", "/api/auth/logout", { token })).status, 200);
  assert.equal((await h.api("GET", "/api/auth/me", { token })).status, 401);
});

test("changing password requires the current password and ends other sessions", async () => {
  const { token, user } = await h.actor("guest");
  const otherSession = await h.login(user);

  const wrong = await h.api("PUT", "/api/auth/change-password", {
    token,
    body: { currentPassword: "Nope12345", newPassword: "Brand-new-pass1", confirmPassword: "Brand-new-pass1" },
  });
  assert.equal(wrong.status, 400);

  const mismatch = await h.api("PUT", "/api/auth/change-password", {
    token,
    body: { currentPassword: h.PASSWORD, newPassword: "Brand-new-pass1", confirmPassword: "Different-pass1" },
  });
  assert.equal(mismatch.status, 400);

  const ok = await h.api("PUT", "/api/auth/change-password", {
    token,
    body: { currentPassword: h.PASSWORD, newPassword: "Brand-new-pass1", confirmPassword: "Brand-new-pass1" },
  });
  assert.equal(ok.status, 200);

  assert.equal((await h.api("GET", "/api/auth/me", { token: otherSession })).status, 401);
  assert.equal((await h.api("GET", "/api/auth/me", { token: ok.body.token })).status, 200);
  await h.login(user, "Brand-new-pass1");
});

test("a deactivated account cannot sign in and its tokens stop working", async () => {
  const admin = await h.actor("admin");
  const target = await h.actor("receptionist");

  const off = await h.api("PATCH", `/api/users/${target.id}`, {
    token: admin.token,
    body: { isActive: false },
  });
  assert.equal(off.status, 200);

  assert.equal((await h.api("GET", "/api/auth/me", { token: target.token })).status, 401);

  const signIn = await h.api("POST", "/api/auth/login", {
    body: { email: target.user.email, password: h.PASSWORD },
  });
  assert.equal(signIn.status, 403);
});

test("repeated failed logins lock the account", async () => {
  const user = await h.createUser("guest");

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await h.api("POST", "/api/auth/login", {
      body: { email: user.email, password: "Wrong-password1" },
    });
    assert.equal(result.status, 401);
  }

  const locked = await h.api("POST", "/api/auth/login", {
    body: { email: user.email, password: h.PASSWORD },
  });
  assert.equal(locked.status, 429);
});

test("the login endpoint is rate limited per client", async () => {
  const extra = await h.startExtraApp({
    rateLimits: { login: { windowMs: 60 * 1000, limit: 3 } },
  });

  try {
    const statuses = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await h.api("POST", "/api/auth/login", {
        baseUrl: extra.baseUrl,
        body: { email: "nobody@example.test", password: "Wrong-password1" },
      });
      statuses.push(result.status);
    }
    assert.deepEqual(statuses, [401, 401, 401, 429, 429]);
  } finally {
    await extra.close();
  }
});

test("responses carry security headers and never expose stack traces", async () => {
  const result = await h.api("GET", "/api/auth/me");
  assert.equal(result.headers.get("x-powered-by"), null);
  assert.equal(result.headers.get("x-content-type-options"), "nosniff");

  const broken = await h.api("POST", "/api/auth/login", { body: "{not json" });
  assert.equal(broken.status, 400);
  assert.ok(!/at .*\.js/.test(broken.text));

  const missing = await h.api("GET", "/api/does-not-exist");
  assert.equal(missing.status, 404);
});

test("cross-origin requests from unknown origins are refused", async () => {
  const bad = await h.api("GET", "/api/auth/me", { headers: { Origin: "https://evil.example" } });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get("access-control-allow-origin"), null);

  const good = await h.api("GET", "/api/auth/me", {
    headers: { Origin: "https://hotel.example.test" },
  });
  assert.equal(good.headers.get("access-control-allow-origin"), "https://hotel.example.test");
});

test("oversized JSON bodies are rejected", async () => {
  const result = await h.api("POST", "/api/auth/login", {
    body: { email: "a@example.test", password: "x".repeat(200 * 1024) },
  });
  assert.equal(result.status, 413);
});
