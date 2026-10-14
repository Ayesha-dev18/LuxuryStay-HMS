const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");

const actors = {};
let room;
let bookingA;

before(async () => {
  await h.start();

  for (const role of ["admin", "manager", "receptionist", "housekeeping", "staff"]) {
    actors[role] = await h.actor(role);
  }
  actors.guestA = await h.actor("guest");
  actors.guestB = await h.actor("guest");

  room = await h.createRoom();

  const created = await h.book(actors.guestA.token, {
    roomId: room._id,
    checkIn: h.day(3),
    checkOut: h.day(5),
  });
  assert.equal(created.status, 201);
  bookingA = created.body.booking;
});

after(() => h.stop());

const expectStatus = async (role, method, route, expected, body) => {
  const result = await h.api(method, route, { token: actors[role].token, body });
  assert.equal(
    result.status,
    expected,
    `${role} ${method} ${route} expected ${expected}, got ${result.status}`
  );
  return result;
};

test("every protected endpoint refuses anonymous requests", async () => {
  const routes = [
    ["GET", "/api/users/staff"],
    ["GET", "/api/users/guests"],
    ["GET", "/api/rooms"],
    ["POST", "/api/rooms"],
    ["GET", "/api/bookings"],
    ["GET", "/api/bookings/my-bookings"],
    ["GET", `/api/bookings/${bookingA._id}`],
    ["GET", `/api/bookings/${bookingA._id}/invoice`],
    ["GET", `/api/bookings/${bookingA._id}/documents/front`],
    ["GET", "/api/maintenance"],
    ["GET", "/api/reports/overview"],
    ["GET", "/api/reports/front-desk"],
    ["GET", "/api/reports/finance"],
    ["GET", "/api/feedback"],
    ["GET", "/api/contact"],
    ["GET", "/api/settings"],
    ["PUT", "/api/settings"],
    ["GET", "/api/notifications"],
  ];

  for (const [method, route] of routes) {
    const result = await h.api(method, route, method === "GET" ? {} : { body: {} });
    assert.equal(result.status, 401, `${method} ${route}`);
  }
});

test("guests cannot reach staff or administrative endpoints", async () => {
  await expectStatus("guestA", "GET", "/api/users/staff", 403);
  await expectStatus("guestA", "GET", "/api/users/guests", 403);
  await expectStatus("guestA", "GET", "/api/bookings", 403);
  await expectStatus("guestA", "GET", "/api/reports/overview", 403);
  await expectStatus("guestA", "GET", "/api/reports/front-desk", 403);
  await expectStatus("guestA", "GET", "/api/reports/finance", 403);
  await expectStatus("guestA", "GET", "/api/feedback", 403);
  await expectStatus("guestA", "GET", "/api/contact", 403);
  await expectStatus("guestA", "GET", "/api/maintenance", 403);
  await expectStatus("guestA", "GET", "/api/rooms/housekeeping", 403);
  await expectStatus("guestA", "PUT", "/api/settings", 403, { taxRate: 0 });
  await expectStatus("guestA", "PATCH", `/api/rooms/${room._id}/status`, 403, { status: "cleaning" });
  await expectStatus("guestA", "PATCH", `/api/bookings/${bookingA._id}/confirm`, 403, {});
  await expectStatus("guestA", "PATCH", `/api/bookings/${bookingA._id}/check-in`, 403);
  await expectStatus("guestA", "POST", `/api/bookings/${bookingA._id}/payments`, 403, {
    amount: 100,
    paymentMethod: "cash",
  });
  await expectStatus("guestA", "POST", "/api/users/staff", 403, {
    name: "New Admin",
    email: "new-admin@example.test",
    password: h.PASSWORD,
    role: "admin",
  });
});

test("a guest cannot read or change another guest's records (IDOR)", async () => {
  const id = bookingA._id;

  await expectStatus("guestB", "GET", `/api/bookings/${id}`, 404);
  await expectStatus("guestB", "GET", `/api/bookings/${id}/invoice`, 404);
  await expectStatus("guestB", "GET", `/api/bookings/${id}/documents/front`, 404);
  await expectStatus("guestB", "PATCH", `/api/bookings/${id}/cancel`, 404, {});
  await expectStatus("guestB", "PATCH", `/api/bookings/${id}`, 404, { numberOfGuests: 2 });
  await expectStatus("guestB", "POST", "/api/feedback", 404, {
    bookingId: id,
    rating: 1,
    message: "This is not my booking.",
  });

  const mine = await expectStatus("guestB", "GET", "/api/bookings/my-bookings", 200);
  assert.equal(mine.body.bookings.length, 0);

  const owner = await expectStatus("guestA", "GET", `/api/bookings/${id}`, 200);
  assert.equal(owner.body.booking._id, id);
  assert.equal(owner.body.booking.guestDetails.documentFront, undefined);
  assert.equal(owner.body.booking.documents.front, true);

  const document = await h.api("GET", `/api/bookings/${id}/documents/front`, {
    token: actors.guestA.token,
  });
  assert.equal(document.status, 200);
  assert.equal(document.headers.get("content-type"), "image/png");

  const stillPending = await h.models.Booking.findById(id);
  assert.equal(stillPending.bookingStatus, "pending");
});

test("housekeeping can work on rooms but cannot see guests, bookings or money", async () => {
  await expectStatus("housekeeping", "GET", "/api/rooms", 200);
  await expectStatus("housekeeping", "GET", "/api/rooms/housekeeping", 200);
  await expectStatus("housekeeping", "GET", "/api/maintenance", 200);

  await expectStatus("housekeeping", "GET", "/api/bookings", 403);
  await expectStatus("housekeeping", "GET", `/api/bookings/${bookingA._id}`, 404);
  await expectStatus("housekeeping", "GET", `/api/bookings/${bookingA._id}/documents/front`, 404);
  await expectStatus("housekeeping", "GET", "/api/users/guests", 403);
  await expectStatus("housekeeping", "GET", "/api/reports/finance", 403);
  await expectStatus("housekeeping", "GET", "/api/reports/front-desk", 403);
  await expectStatus("housekeeping", "PATCH", `/api/bookings/${bookingA._id}/confirm`, 403, {});
  await expectStatus("housekeeping", "POST", `/api/bookings/${bookingA._id}/payments`, 403, {
    amount: 100,
    paymentMethod: "cash",
  });
  await expectStatus("housekeeping", "PATCH", `/api/rooms/${room._id}/status`, 403, { status: "cleaning" });
  await expectStatus("housekeeping", "POST", "/api/rooms", 403, {});
});

test("receptionists run the front desk but not administration", async () => {
  await expectStatus("receptionist", "GET", "/api/bookings", 200);
  await expectStatus("receptionist", "GET", "/api/users/guests", 200);
  await expectStatus("receptionist", "GET", "/api/reports/front-desk", 200);
  await expectStatus("receptionist", "GET", "/api/reports/finance", 200);
  await expectStatus("receptionist", "GET", "/api/contact", 200);

  await expectStatus("receptionist", "GET", "/api/users/staff", 403);
  await expectStatus("receptionist", "GET", "/api/reports/overview", 403);
  await expectStatus("receptionist", "GET", "/api/feedback", 403);
  await expectStatus("receptionist", "PUT", "/api/settings", 403, { taxRate: 5 });
  await expectStatus("receptionist", "POST", "/api/rooms", 403, {});
  await expectStatus("receptionist", "DELETE", `/api/rooms/${room._id}`, 403);
  await expectStatus("receptionist", "PATCH", `/api/bookings/${bookingA._id}/discount`, 403, {
    amount: 500,
  });
  await expectStatus("receptionist", "GET", "/api/rooms/housekeeping", 403);
});

test("managers get reporting and room management but not account or system control", async () => {
  await expectStatus("manager", "GET", "/api/reports/overview", 200);
  await expectStatus("manager", "GET", "/api/users/staff", 200);
  await expectStatus("manager", "GET", "/api/feedback", 200);

  await expectStatus("manager", "POST", "/api/users/staff", 403, {
    name: "Another Manager",
    email: "another-manager@example.test",
    password: h.PASSWORD,
    role: "manager",
  });
  await expectStatus("manager", "PATCH", `/api/users/${actors.receptionist.id}`, 403, {
    role: "admin",
  });
  await expectStatus("manager", "PUT", "/api/settings", 403, { taxRate: 5 });
});

test("no staff member can promote themselves", async () => {
  for (const role of ["manager", "receptionist", "housekeeping", "staff"]) {
    await expectStatus(role, "PATCH", `/api/users/${actors[role].id}`, 403, { role: "admin" });
    const me = await h.api("PUT", "/api/auth/me", {
      token: actors[role].token,
      body: { name: "Same Person", email: actors[role].user.email, role: "admin" },
    });
    assert.equal(me.status, 400);

    const stored = await h.models.User.findById(actors[role].id);
    assert.equal(stored.role, role);
  }
});

test("administrators manage staff, with guard rails", async () => {
  const created = await expectStatus("admin", "POST", "/api/users/staff", 201, {
    name: "Front Desk Hire",
    email: "hire@example.test",
    password: h.PASSWORD,
    role: "receptionist",
  });
  assert.equal(created.body.user.role, "receptionist");

  await expectStatus("admin", "POST", "/api/users/staff", 400, {
    name: "Bad Role",
    email: "bad-role@example.test",
    password: h.PASSWORD,
    role: "superuser",
  });

  await expectStatus("admin", "POST", "/api/users/staff", 400, {
    name: "Guest Role",
    email: "guest-role@example.test",
    password: h.PASSWORD,
    role: "guest",
  });

  await expectStatus("admin", "POST", "/api/users/staff", 409, {
    name: "Duplicate",
    email: "hire@example.test",
    password: h.PASSWORD,
    role: "manager",
  });

  // An administrator cannot change their own role or deactivate themselves.
  await expectStatus("admin", "PATCH", `/api/users/${actors.admin.id}`, 403, { role: "manager" });
  await expectStatus("admin", "PATCH", `/api/users/${actors.admin.id}`, 403, { isActive: false });

  // Guest accounts cannot be turned into staff through the update endpoint.
  await expectStatus("admin", "PATCH", `/api/users/${actors.guestB.id}`, 400, { role: "admin" });

  const promoted = await expectStatus("admin", "PATCH", `/api/users/${created.body.user.id}`, 200, {
    role: "manager",
  });
  assert.equal(promoted.body.user.role, "manager");
});

test("the last active administrator cannot be demoted or deactivated", async () => {
  const second = await h.actor("admin");

  // Two admins exist: the second may demote the first.
  const demoted = await h.api("PATCH", `/api/users/${actors.admin.id}`, {
    token: second.token,
    body: { role: "manager" },
  });
  assert.equal(demoted.status, 200);

  // Now only one admin remains. Bring in a third to attempt removing the last one.
  const others = await h.models.User.find({ role: "admin", _id: { $ne: second.user._id } });
  assert.equal(others.length, 0);

  const third = await h.actor("admin");
  await h.api("PATCH", `/api/users/${third.id}`, { token: second.token, body: { isActive: false } });

  const blocked = await h.api("PATCH", `/api/users/${second.id}`, {
    token: second.token,
    body: { isActive: false },
  });
  assert.equal(blocked.status, 403);

  const active = await h.models.User.countDocuments({ role: "admin", isActive: { $ne: false } });
  assert.equal(active, 1);
});

test("accounts cannot be deleted through the API", async () => {
  const admin = await h.actor("admin");
  const result = await h.api("DELETE", `/api/users/${actors.guestB.id}`, { token: admin.token });
  assert.equal(result.status, 404);
  assert.ok(await h.models.User.exists({ _id: actors.guestB.id }));
});

test("user lists never include password hashes or reset tokens", async () => {
  const admin = await h.actor("admin");
  const staff = await h.api("GET", "/api/users/staff", { token: admin.token });
  const guests = await h.api("GET", "/api/users/guests", { token: admin.token });

  const text = staff.text + guests.text;
  assert.ok(!text.includes("password"));
  assert.ok(!text.includes("resetToken"));
  assert.ok(!text.includes("$2b$") && !text.includes("$2a$"));
});

test("malformed ids and unknown fields are rejected", async () => {
  const admin = await h.actor("admin");

  assert.equal((await h.api("GET", "/api/bookings/not-an-id", { token: admin.token })).status, 400);
  assert.equal(
    (await h.api("PATCH", "/api/users/123", { token: admin.token, body: { isActive: false } })).status,
    400
  );
  assert.equal(
    (
      await h.api("PUT", "/api/settings", {
        token: admin.token,
        body: { taxRate: 5, somethingElse: true },
      })
    ).status,
    400
  );
  assert.equal(
    (await h.api("GET", "/api/bookings?status[$ne]=cancelled", { token: admin.token })).status,
    400
  );
});
