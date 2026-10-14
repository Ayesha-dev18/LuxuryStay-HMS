const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");

// Account names (registration, profile, staff) need at least 3 characters.
// Names written on reservations and enquiries keep their own rule.

before(() => h.start());
after(() => h.stop());

let counter = 0;
const register = (name, extra = {}) => {
  counter += 1;
  return h.api("POST", "/api/auth/register", {
    body: { name, email: `reg-${counter}@example.test`, password: h.PASSWORD, ...extra },
  });
};

const nameError = (result) => JSON.stringify(result.body.fields || result.body.errors || result.body.message || "");

test("registration rejects names of 1 or 2 characters with a clear message", async () => {
  for (const name of ["A", "Ab", "  Ab  "]) {
    const result = await register(name);
    assert.equal(result.status, 400, JSON.stringify(name));
    assert.match(nameError(result), /at least 3 characters/, JSON.stringify(name));
  }
});

test("registration rejects empty, whitespace-only and invalid names", async () => {
  for (const name of ["", "   ", "3rd Guest", "Ali!", "<b>Bob</b>", "A".repeat(81)]) {
    const result = await register(name);
    assert.equal(result.status, 400, JSON.stringify(name));
  }
  const missing = await h.api("POST", "/api/auth/register", { body: { email: "no-name@example.test", password: h.PASSWORD } });
  assert.equal(missing.status, 400);
});

test("registration accepts names of 3 characters and longer, trimmed", async () => {
  for (const name of ["Ali", "Zoë", "Sara Ahmed", "  Omar  ", "Mary-Jane O'Neil", "A".repeat(80)]) {
    const result = await register(name);
    assert.equal(result.status, 201, JSON.stringify(name));
    assert.equal(result.body.user.name, name.trim());
    assert.equal(result.body.user.role, "guest");
  }
});

test("a duplicate email is refused whatever the name", async () => {
  const first = await h.api("POST", "/api/auth/register", { body: { name: "First Guest", email: "same@example.test", password: h.PASSWORD } });
  assert.equal(first.status, 201);
  const second = await h.api("POST", "/api/auth/register", { body: { name: "Second Guest", email: "SAME@example.test", password: h.PASSWORD } });
  assert.equal(second.status, 409);
});

test("profile and staff accounts use the same 3-character minimum", async () => {
  const guest = await h.actor("guest");
  const admin = await h.actor("admin");

  const shortProfile = await h.api("PUT", "/api/auth/me", { token: guest.token, body: { name: "Al", email: guest.user.email } });
  assert.equal(shortProfile.status, 400);
  const okProfile = await h.api("PUT", "/api/auth/me", { token: guest.token, body: { name: "Ali", email: guest.user.email } });
  assert.equal(okProfile.status, 200);

  const shortStaff = await h.api("POST", "/api/users/staff", { token: admin.token, body: { name: "Bo", email: "bo@example.test", password: h.PASSWORD, role: "receptionist" } });
  assert.equal(shortStaff.status, 400);
  assert.match(nameError(shortStaff), /at least 3 characters/);
  const okStaff = await h.api("POST", "/api/users/staff", { token: admin.token, body: { name: "Bob", email: "bob@example.test", password: h.PASSWORD, role: "receptionist" } });
  assert.equal(okStaff.status, 201);

  const renameShort = await h.api("PATCH", `/api/users/${okStaff.body.user.id}`, { token: admin.token, body: { name: "Bo" } });
  assert.equal(renameShort.status, 400);
});
