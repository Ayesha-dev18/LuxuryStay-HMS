const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const h = require("./helpers");

before(() => h.start());
after(() => h.stop());

beforeEach(() => {
  h.state.mails.length = 0;
  h.state.failMail = false;
});

const requestReset = (email, headers) =>
  h.api("POST", "/api/auth/forgot-password", { body: { email }, headers });

const tokenFromLastMail = () => {
  const mail = h.state.mails.at(-1);
  const match = /reset-password\?token=([a-f0-9]{64})/.exec(mail.text);
  assert.ok(match, "the email contains a reset link");
  return match[1];
};

const storedReset = (userId) =>
  h.models.User.findById(userId).select("+resetTokenHash +resetTokenExpires +password");

test("the response is identical for registered and unregistered addresses", async () => {
  const user = await h.createUser("guest");

  const known = await requestReset(user.email);
  const unknown = await requestReset("nobody@example.test");

  assert.equal(known.status, 200);
  assert.equal(unknown.status, 200);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(h.state.mails.length, 1);
  assert.equal(h.state.mails[0].to, user.email);
});

test("only a hash of the token is stored, and the link uses the configured client URL", async () => {
  const user = await h.createUser("guest");

  await requestReset(user.email, { Host: "evil.example", "X-Forwarded-Host": "evil.example" });

  const token = tokenFromLastMail();
  const stored = await storedReset(user._id);

  assert.notEqual(stored.resetTokenHash, token);
  assert.equal(stored.resetTokenHash, crypto.createHash("sha256").update(token).digest("hex"));
  assert.ok(stored.resetTokenExpires > new Date());

  const mail = h.state.mails.at(-1);
  assert.ok(mail.text.includes("https://hotel.example.test/reset-password?token="));
  assert.ok(!mail.text.includes("evil.example"));
  assert.ok(!mail.html.includes("evil.example"));
});

test("a valid token resets the password once, signs out old sessions, and cannot be reused", async () => {
  const user = await h.createUser("guest");
  const oldSession = await h.login(user);

  await requestReset(user.email);
  const token = tokenFromLastMail();

  assert.equal(
    (await h.api("POST", "/api/auth/reset-password/validate", { body: { token } })).status,
    200
  );

  const weak = await h.api("POST", "/api/auth/reset-password", {
    body: { token, newPassword: "short", confirmPassword: "short" },
  });
  assert.equal(weak.status, 400);

  const mismatch = await h.api("POST", "/api/auth/reset-password", {
    body: { token, newPassword: "New-password-99", confirmPassword: "Other-password-99" },
  });
  assert.equal(mismatch.status, 400);

  const done = await h.api("POST", "/api/auth/reset-password", {
    body: { token, newPassword: "New-password-99", confirmPassword: "New-password-99" },
  });
  assert.equal(done.status, 200);

  const stored = await storedReset(user._id);
  assert.equal(stored.resetTokenHash, null);
  assert.equal(stored.resetTokenExpires, null);
  assert.notEqual(stored.password, "New-password-99");

  // Old password and old session no longer work; the new password does.
  const oldLogin = await h.api("POST", "/api/auth/login", {
    body: { email: user.email, password: h.PASSWORD },
  });
  assert.equal(oldLogin.status, 401);
  assert.equal((await h.api("GET", "/api/auth/me", { token: oldSession })).status, 401);
  await h.login(user, "New-password-99");

  // The link is single use.
  const reused = await h.api("POST", "/api/auth/reset-password", {
    body: { token, newPassword: "Another-password-77", confirmPassword: "Another-password-77" },
  });
  assert.equal(reused.status, 400);
  assert.equal(
    (await h.api("POST", "/api/auth/reset-password/validate", { body: { token } })).status,
    400
  );
  await h.login(user, "New-password-99");
});

test("two simultaneous uses of one token cannot both succeed", async () => {
  const user = await h.createUser("guest");
  await requestReset(user.email);
  const token = tokenFromLastMail();

  const results = await Promise.all(
    ["First-password-11", "Second-password-22"].map((value) =>
      h.api("POST", "/api/auth/reset-password", {
        body: { token, newPassword: value, confirmPassword: value },
      })
    )
  );

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 400]);
});

test("expired, malformed and unknown tokens are rejected", async () => {
  const user = await h.createUser("guest");
  await requestReset(user.email);
  const token = tokenFromLastMail();

  await h.models.User.updateOne(
    { _id: user._id },
    { $set: { resetTokenExpires: new Date(Date.now() - 1000) } }
  );

  const expired = await h.api("POST", "/api/auth/reset-password", {
    body: { token, newPassword: "New-password-99", confirmPassword: "New-password-99" },
  });
  assert.equal(expired.status, 400);

  for (const bad of ["", "abc", "z".repeat(64), crypto.randomBytes(32).toString("hex"), { $ne: null }]) {
    const result = await h.api("POST", "/api/auth/reset-password", {
      body: { token: bad, newPassword: "New-password-99", confirmPassword: "New-password-99" },
    });
    assert.equal(result.status, 400);
  }

  // The password was never changed.
  await h.login(user);
});

test("a second request shortly after the first does not send another email", async () => {
  const user = await h.createUser("guest");

  await requestReset(user.email);
  const first = tokenFromLastMail();
  const again = await requestReset(user.email);

  assert.equal(again.status, 200);
  assert.equal(h.state.mails.length, 1);

  const stillValid = await h.api("POST", "/api/auth/reset-password/validate", {
    body: { token: first },
  });
  assert.equal(stillValid.status, 200);
});

test("a delivery failure is reported and leaves no usable token behind", async () => {
  const user = await h.createUser("guest");
  h.state.failMail = true;

  const result = await requestReset(user.email);
  assert.equal(result.status, 503);
  assert.equal(result.body.success, false);

  const stored = await storedReset(user._id);
  assert.equal(stored.resetTokenHash, null);
  assert.equal(stored.resetTokenExpires, null);
});

test("deactivated accounts receive no reset email", async () => {
  const user = await h.createUser("guest", { isActive: false });

  const result = await requestReset(user.email);
  assert.equal(result.status, 200);
  assert.equal(h.state.mails.length, 0);
});

test("password reset requests are rate limited", async () => {
  const extra = await h.startExtraApp({
    rateLimits: { passwordReset: { windowMs: 60 * 1000, limit: 2 } },
  });

  try {
    const statuses = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const result = await h.api("POST", "/api/auth/forgot-password", {
        baseUrl: extra.baseUrl,
        body: { email: "nobody@example.test" },
      });
      statuses.push(result.status);
    }
    assert.deepEqual(statuses, [200, 200, 429, 429]);
  } finally {
    await extra.close();
  }
});

test("reset tokens never appear in API responses", async () => {
  const user = await h.createUser("guest");
  const result = await requestReset(user.email);
  const token = tokenFromLastMail();

  assert.ok(!result.text.includes(token));
});
