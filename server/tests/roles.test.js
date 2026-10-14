const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");
const { permissionsFor } = require("../config/permissions");

// The five primary roles, staff accounts created through the API, and the
// permissions those accounts end up with.

const FIVE_ROLES = ["admin", "manager", "receptionist", "housekeeping", "guest"];
const actors = {};

before(async () => {
  await h.start();
  for (const role of FIVE_ROLES) actors[role] = await h.actor(role);
});

after(() => h.stop());

const signIn = (email) => h.api("POST", "/api/auth/login", { body: { email, password: h.PASSWORD } });

const expectStatus = async (token, method, route, expected, label, body) => {
  const result = await h.api(method, route, { token, body });
  assert.equal(result.status, expected, `${label} ${method} ${route} expected ${expected}, got ${result.status}`);
  return result;
};

test("each of the five roles signs in and is given exactly its own permissions", async () => {
  for (const role of FIVE_ROLES) {
    const me = await expectStatus(actors[role].token, "GET", "/api/auth/me", 200, role);
    assert.equal(me.body.user.role, role);
    assert.deepEqual([...me.body.permissions].sort(), permissionsFor(role).sort(), role);
  }
});

test("only administrators can create staff accounts", async () => {
  const body = { name: "Should Not Exist", email: "not-created@example.test", password: h.PASSWORD, role: "receptionist" };
  for (const role of ["manager", "receptionist", "housekeeping", "guest"]) {
    await expectStatus(actors[role].token, "POST", "/api/users/staff", 403, role, body);
  }
  const { User } = h.models;
  assert.equal(await User.exists({ email: "not-created@example.test" }), null);

  // The legacy combined "staff" role is kept for old accounts but cannot be assigned.
  await expectStatus(actors.admin.token, "POST", "/api/users/staff", 400, "admin", { ...body, email: "legacy@example.test", role: "staff" });
});

test("new staff accounts can sign in and receive only their assigned role's permissions", async () => {
  const hires = {
    manager: "new-manager@example.test",
    receptionist: "new-receptionist@example.test",
    housekeeping: "new-housekeeping@example.test",
  };

  const tokens = {};
  for (const [role, address] of Object.entries(hires)) {
    const created = await expectStatus(actors.admin.token, "POST", "/api/users/staff", 201, "admin", {
      name: `New ${role}`, email: address, password: h.PASSWORD, role,
    });
    assert.equal(created.body.user.role, role);
    assert.equal(created.body.user.password, undefined);
    assert.doesNotMatch(JSON.stringify(created.body), /\$2[aby]\$/);

    const login = await signIn(address);
    assert.equal(login.status, 200, `${role} sign-in`);
    assert.equal(login.body.user.role, role);
    assert.deepEqual([...login.body.permissions].sort(), permissionsFor(role).sort());
    tokens[role] = login.body.token;
  }

  // Manager: operations and reports, not system administration.
  await expectStatus(tokens.manager, "GET", "/api/reports/overview", 200, "manager");
  await expectStatus(tokens.manager, "GET", "/api/bookings", 200, "manager");
  await expectStatus(tokens.manager, "GET", "/api/users/staff", 200, "manager");
  await expectStatus(tokens.manager, "PUT", "/api/settings", 403, "manager", { taxRate: 1 });

  // Receptionist: front desk, not reports or staff.
  await expectStatus(tokens.receptionist, "GET", "/api/bookings", 200, "receptionist");
  await expectStatus(tokens.receptionist, "GET", "/api/reports/front-desk", 200, "receptionist");
  await expectStatus(tokens.receptionist, "GET", "/api/reports/overview", 403, "receptionist");
  await expectStatus(tokens.receptionist, "GET", "/api/users/staff", 403, "receptionist");

  // Housekeeping: rooms and maintenance, no guests, bookings or money.
  await expectStatus(tokens.housekeeping, "GET", "/api/rooms/housekeeping", 200, "housekeeping");
  await expectStatus(tokens.housekeeping, "GET", "/api/maintenance", 200, "housekeeping");
  await expectStatus(tokens.housekeeping, "GET", "/api/bookings", 403, "housekeeping");
  await expectStatus(tokens.housekeeping, "GET", "/api/users/guests", 403, "housekeeping");
  await expectStatus(tokens.housekeeping, "GET", "/api/reports/finance", 403, "housekeeping");
});

test("administrators filter staff by role and status, and deactivated staff cannot sign in", async () => {
  const created = await expectStatus(actors.admin.token, "POST", "/api/users/staff", 201, "admin", {
    name: "Leaving Housekeeper", email: "leaving@example.test", password: h.PASSWORD, role: "housekeeping",
  });

  const housekeeping = await expectStatus(actors.admin.token, "GET", "/api/users/staff?role=housekeeping&limit=100", 200, "admin");
  assert.ok(housekeeping.body.users.length >= 2);
  assert.ok(housekeeping.body.users.every((user) => user.role === "housekeeping"));
  assert.ok(housekeeping.body.users.every((user) => user.password === undefined));

  await expectStatus(actors.admin.token, "PATCH", `/api/users/${created.body.user.id}`, 200, "admin", { isActive: false });

  const inactive = await expectStatus(actors.admin.token, "GET", "/api/users/staff?status=inactive&limit=100", 200, "admin");
  assert.deepEqual(inactive.body.users.map((user) => user.email), ["leaving@example.test"]);

  const login = await signIn("leaving@example.test");
  assert.notEqual(login.status, 200);
  assert.equal(login.body.token, undefined);
});
