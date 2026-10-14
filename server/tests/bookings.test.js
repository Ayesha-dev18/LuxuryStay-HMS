const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");
const { syncRoomNights } = require("../services/availability");
const { parseDateOnly } = require("../utils/dates");

let guest;
let other;
let desk;

before(async () => {
  await h.start();
  guest = await h.actor("guest");
  other = await h.actor("guest");
  desk = await h.actor("receptionist");
});

after(() => h.stop());

const nightsHeld = (bookingId) => h.models.RoomNight.countDocuments({ booking: bookingId });

test("stay dates are validated on the server", async () => {
  const room = await h.createRoom();

  const cases = [
    { checkIn: "2027-02-30", checkOut: "2027-03-02", why: "impossible date" },
    { checkIn: "tomorrow", checkOut: h.day(3), why: "not a date" },
    { checkIn: "2027/03/01", checkOut: "2027/03/03", why: "wrong format" },
    { checkIn: `${h.day(2)}T00:00:00Z`, checkOut: h.day(3), why: "timestamp instead of a day" },
    { checkIn: h.day(3), checkOut: h.day(3), why: "zero nights" },
    { checkIn: h.day(4), checkOut: h.day(3), why: "check-out before check-in" },
    { checkIn: h.day(-1), checkOut: h.day(2), why: "check-in in the past" },
    { checkIn: h.day(1), checkOut: h.day(200), why: "stay too long" },
    { checkIn: h.day(500), checkOut: h.day(502), why: "too far ahead" },
  ];

  for (const { checkIn, checkOut, why } of cases) {
    const result = await h.book(guest.token, { roomId: room._id, checkIn, checkOut });
    assert.equal(result.status, 400, why);
  }

  assert.equal(await h.models.Booking.countDocuments({ room: room._id }), 0);
  assert.equal(await h.models.RoomNight.countDocuments({ room: room._id }), 0);
});

test("booking input is validated and prices cannot be supplied by the client", async () => {
  const room = await h.createRoom({ capacity: 2, pricePerNight: 12000 });
  const base = { roomId: room._id, checkIn: h.day(10), checkOut: h.day(12) };

  const tampered = await h.book(guest.token, {
    ...base,
    extra: { totalAmount: "1", pricePerNight: "1" },
  });
  assert.equal(tampered.status, 400);

  const tooMany = await h.book(guest.token, { ...base, guests: 3 });
  assert.equal(tooMany.status, 400);

  const noDocument = await h.book(guest.token, { ...base, files: false });
  assert.equal(noDocument.status, 400);

  const badPhone = await h.book(guest.token, { ...base, details: h.guestDetails({ phone: "abc" }) });
  assert.equal(badPhone.status, 400);

  const badEmail = await h.book(guest.token, { ...base, details: h.guestDetails({ email: "nope" }) });
  assert.equal(badEmail.status, 400);

  const badCnic = await h.book(guest.token, {
    ...base,
    details: h.guestDetails({ documentType: "cnic", documentNumber: "123" }),
  });
  assert.equal(badCnic.status, 400);

  const injected = await h.book(guest.token, {
    ...base,
    details: { ...h.guestDetails(), verificationStatus: "verified" },
  });
  assert.equal(injected.status, 400);

  const fakeImage = h.bookingForm({ ...base, files: false });
  fakeImage.append("documentFront", new Blob(["<script>alert(1)</script>"], { type: "image/png" }), "x.png");
  assert.equal((await h.api("POST", "/api/bookings", { token: guest.token, form: fakeImage })).status, 400);

  const executable = h.bookingForm({ ...base, files: false });
  executable.append("documentFront", new Blob(["MZ"], { type: "application/x-msdownload" }), "x.exe");
  assert.equal((await h.api("POST", "/api/bookings", { token: guest.token, form: executable })).status, 400);

  assert.equal(await h.models.RoomNight.countDocuments({ room: room._id }), 0);

  const ok = await h.book(guest.token, base);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.booking.pricePerNight, 12000);
  assert.equal(ok.body.booking.totalNights, 2);
  assert.equal(ok.body.booking.totalAmount, 24000);
  assert.equal(ok.body.booking.bookingStatus, "pending");
  assert.equal(String(ok.body.booking.guest._id), guest.id);
});

test("an overlapping reservation for the same room is rejected", async () => {
  const room = await h.createRoom();

  const first = await h.book(guest.token, { roomId: room._id, checkIn: h.day(10), checkOut: h.day(14) });
  assert.equal(first.status, 201);
  assert.equal(await nightsHeld(first.body.booking._id), 4);

  const overlaps = [
    [h.day(10), h.day(14), "identical"],
    [h.day(9), h.day(11), "overlaps the start"],
    [h.day(13), h.day(16), "overlaps the end"],
    [h.day(11), h.day(12), "inside"],
    [h.day(8), h.day(20), "surrounds"],
  ];

  for (const [checkIn, checkOut, why] of overlaps) {
    const result = await h.book(other.token, { roomId: room._id, checkIn, checkOut });
    assert.equal(result.status, 409, why);
  }

  // The stored reservation persists and is what the owner reads back.
  const mine = await h.api("GET", "/api/bookings/my-bookings", { token: guest.token });
  assert.ok(mine.body.bookings.some((booking) => booking._id === first.body.booking._id));

  // Availability search agrees with the booking endpoint.
  const search = await h.api(
    "GET",
    `/api/bookings/availability?checkInDate=${h.day(12)}&checkOutDate=${h.day(13)}&guests=1`,
    { token: other.token }
  );
  assert.equal(search.status, 200);
  assert.ok(!search.body.rooms.some((item) => item._id === String(room._id)));
});

test("a guest may arrive on the day another guest departs", async () => {
  const room = await h.createRoom();

  const first = await h.book(guest.token, { roomId: room._id, checkIn: h.day(10), checkOut: h.day(12) });
  const after = await h.book(other.token, { roomId: room._id, checkIn: h.day(12), checkOut: h.day(14) });
  const beforeStay = await h.book(other.token, { roomId: room._id, checkIn: h.day(8), checkOut: h.day(10) });

  assert.equal(first.status, 201);
  assert.equal(after.status, 201, "arrival on the departure day");
  assert.equal(beforeStay.status, 201, "departure on the arrival day");
});

test("simultaneous requests for the same room and dates produce exactly one booking", async () => {
  const room = await h.createRoom();
  const guests = await Promise.all(Array.from({ length: 12 }, () => h.actor("guest")));

  const results = await Promise.all(
    guests.map((actor) =>
      h.book(actor.token, { roomId: room._id, checkIn: h.day(20), checkOut: h.day(23) })
    )
  );

  const statuses = results.map((result) => result.status);
  assert.equal(statuses.filter((status) => status === 201).length, 1, statuses.join(","));
  assert.equal(statuses.filter((status) => status === 409).length, 11, statuses.join(","));

  const stored = await h.models.Booking.find({ room: room._id });
  assert.equal(stored.length, 1);
  assert.equal(await h.models.RoomNight.countDocuments({ room: room._id }), 3);
  assert.equal(await nightsHeld(stored[0]._id), 3);
});

test("simultaneous partially overlapping requests never share a night", async () => {
  const room = await h.createRoom();
  const guests = await Promise.all(Array.from({ length: 8 }, () => h.actor("guest")));

  // Stays of three nights starting on consecutive days: every pair of
  // neighbours overlaps.
  const results = await Promise.all(
    guests.map((actor, index) =>
      h.book(actor.token, {
        roomId: room._id,
        checkIn: h.day(30 + index),
        checkOut: h.day(33 + index),
      })
    )
  );

  assert.ok(results.every((result) => [201, 409].includes(result.status)));

  const stored = await h.models.Booking.find({ room: room._id }).sort({ checkInDate: 1 });
  assert.ok(stored.length >= 1);

  for (let index = 1; index < stored.length; index += 1) {
    assert.ok(
      stored[index].checkInDate >= stored[index - 1].checkOutDate,
      "accepted stays must not overlap"
    );
  }

  const nights = await h.models.RoomNight.find({ room: room._id });
  const expected = stored.reduce((total, booking) => total + booking.totalNights, 0);
  assert.equal(nights.length, expected);
  assert.equal(new Set(nights.map((night) => night.night.getTime())).size, nights.length);
});

test("cancelling or rejecting a reservation frees its dates", async () => {
  const room = await h.createRoom();
  const stay = { roomId: room._id, checkIn: h.day(40), checkOut: h.day(43) };

  const first = await h.book(guest.token, stay);
  assert.equal((await h.book(other.token, stay)).status, 409);

  const cancelled = await h.api("PATCH", `/api/bookings/${first.body.booking._id}/cancel`, {
    token: guest.token,
    body: { reason: "Change of plans" },
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.booking.bookingStatus, "cancelled");
  assert.equal(await nightsHeld(first.body.booking._id), 0);

  // Cancelling twice is refused and changes nothing.
  const again = await h.api("PATCH", `/api/bookings/${first.body.booking._id}/cancel`, {
    token: guest.token,
    body: {},
  });
  assert.equal(again.status, 409);

  const second = await h.book(other.token, stay);
  assert.equal(second.status, 201);

  const rejected = await h.api("PATCH", `/api/bookings/${second.body.booking._id}/reject`, {
    token: desk.token,
    body: { note: "Document unreadable" },
  });
  assert.equal(rejected.status, 200);
  assert.equal(await nightsHeld(second.body.booking._id), 0);

  assert.equal((await h.book(guest.token, stay)).status, 201);
});

test("changing dates re-checks availability and keeps the original stay when it fails", async () => {
  const room = await h.createRoom({ pricePerNight: 10000 });

  const mine = await h.book(guest.token, { roomId: room._id, checkIn: h.day(50), checkOut: h.day(52) });
  const theirs = await h.book(other.token, { roomId: room._id, checkIn: h.day(54), checkOut: h.day(56) });
  const id = mine.body.booking._id;

  const clash = await h.api("PATCH", `/api/bookings/${id}`, {
    token: guest.token,
    body: { checkOutDate: h.day(55) },
  });
  assert.equal(clash.status, 409);

  const unchanged = await h.models.Booking.findById(id);
  assert.equal(unchanged.totalNights, 2);
  assert.equal(await nightsHeld(id), 2);
  assert.equal(await nightsHeld(theirs.body.booking._id), 2);

  // Extending up to the other guest's arrival day is allowed.
  const extended = await h.api("PATCH", `/api/bookings/${id}`, {
    token: guest.token,
    body: { checkOutDate: h.day(54) },
  });
  assert.equal(extended.status, 200);
  assert.equal(extended.body.booking.totalNights, 4);
  assert.equal(extended.body.booking.totalAmount, 40000);
  assert.equal(await nightsHeld(id), 4);

  // Moving the stay releases the old dates for someone else.
  const moved = await h.api("PATCH", `/api/bookings/${id}`, {
    token: guest.token,
    body: { checkInDate: h.day(60), checkOutDate: h.day(61) },
  });
  assert.equal(moved.status, 200);
  assert.equal(await nightsHeld(id), 1);

  const reuse = await h.book(other.token, { roomId: room._id, checkIn: h.day(50), checkOut: h.day(54) });
  assert.equal(reuse.status, 201);

  const invalid = await h.api("PATCH", `/api/bookings/${id}`, {
    token: guest.token,
    body: { checkInDate: h.day(62), checkOutDate: h.day(61) },
  });
  assert.equal(invalid.status, 400);
});

test("changing the room re-checks availability and reprices the stay", async () => {
  const roomA = await h.createRoom({ pricePerNight: 10000 });
  const roomB = await h.createRoom({ pricePerNight: 15000 });
  const stay = { checkIn: h.day(70), checkOut: h.day(72) };

  const mine = await h.book(guest.token, { roomId: roomA._id, ...stay });
  await h.book(other.token, { roomId: roomB._id, ...stay });
  const id = mine.body.booking._id;

  const blocked = await h.api("PATCH", `/api/bookings/${id}`, {
    token: desk.token,
    body: { roomId: String(roomB._id) },
  });
  assert.equal(blocked.status, 409);
  assert.equal(await h.models.RoomNight.countDocuments({ booking: id, room: roomA._id }), 2);

  const roomC = await h.createRoom({ pricePerNight: 20000 });
  const moved = await h.api("PATCH", `/api/bookings/${id}`, {
    token: desk.token,
    body: { roomId: String(roomC._id) },
  });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.booking.pricePerNight, 20000);
  assert.equal(moved.body.booking.totalAmount, 40000);
  assert.equal(await h.models.RoomNight.countDocuments({ booking: id, room: roomA._id }), 0);
  assert.equal(await h.models.RoomNight.countDocuments({ booking: id, room: roomC._id }), 2);

  // Room A is free again for those dates.
  assert.equal((await h.book(other.token, { roomId: roomA._id, ...stay })).status, 201);
});

test("two simultaneous edits into the same free dates cannot both succeed", async () => {
  const room = await h.createRoom();

  const a = await h.book(guest.token, { roomId: room._id, checkIn: h.day(80), checkOut: h.day(81) });
  const b = await h.book(other.token, { roomId: room._id, checkIn: h.day(90), checkOut: h.day(91) });

  const target = { checkInDate: h.day(85), checkOutDate: h.day(87) };
  const results = await Promise.all([
    h.api("PATCH", `/api/bookings/${a.body.booking._id}`, { token: guest.token, body: target }),
    h.api("PATCH", `/api/bookings/${b.body.booking._id}`, { token: other.token, body: target }),
  ]);

  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);

  // Each booking holds exactly its own nights; nothing was lost or duplicated.
  const stored = await h.models.Booking.find({ room: room._id });
  for (const booking of stored) {
    assert.equal(await nightsHeld(booking._id), booking.totalNights);
  }
  assert.equal(await h.models.RoomNight.countDocuments({ room: room._id }), 3);
});

test("rooms under maintenance or inactive cannot be booked", async () => {
  const maintenance = await h.createRoom({ status: "maintenance" });
  const inactive = await h.createRoom({ isActive: false });
  const stay = { checkIn: h.day(10), checkOut: h.day(11) };

  assert.equal((await h.book(guest.token, { roomId: maintenance._id, ...stay })).status, 409);
  assert.equal((await h.book(guest.token, { roomId: inactive._id, ...stay })).status, 404);
  assert.equal(
    (await h.book(guest.token, { roomId: "64b7f0f0f0f0f0f0f0f0f0f0", ...stay })).status,
    404
  );

  const search = await h.api(
    "GET",
    `/api/bookings/availability?checkInDate=${stay.checkIn}&checkOutDate=${stay.checkOut}&guests=1`,
    { token: guest.token }
  );
  const ids = search.body.rooms.map((room) => room._id);
  assert.ok(!ids.includes(String(maintenance._id)));
  assert.ok(!ids.includes(String(inactive._id)));

  // A room with reservations cannot be deactivated from under them.
  const manager = await h.actor("manager");
  const busy = await h.createRoom();
  await h.book(guest.token, { roomId: busy._id, ...stay });
  const off = await h.api("PUT", `/api/rooms/${busy._id}`, {
    token: manager.token,
    body: { isActive: false },
  });
  assert.equal(off.status, 409);
});

test("confirmation, staff bookings and the availability ledger stay consistent", async () => {
  const room = await h.createRoom();
  const stay = { roomId: room._id, checkIn: h.day(100), checkOut: h.day(102) };

  const pending = await h.book(guest.token, stay);
  const confirmed = await h.api("PATCH", `/api/bookings/${pending.body.booking._id}/confirm`, {
    token: desk.token,
    body: {},
  });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.booking.bookingStatus, "confirmed");
  assert.match(confirmed.body.booking.invoiceNumber, /^INV-\d{4}-\d{5}$/);

  const twice = await h.api("PATCH", `/api/bookings/${pending.body.booking._id}/confirm`, {
    token: desk.token,
    body: {},
  });
  assert.equal(twice.status, 409);

  // Front desk booking for a walk-in: confirmed at once, guest account created.
  const walkIn = await h.book(desk.token, {
    roomId: room._id,
    checkIn: h.day(102),
    checkOut: h.day(103),
    files: false,
    details: h.guestDetails({ email: "walkin@example.test", fullName: "Walk In Guest" }),
  });
  assert.equal(walkIn.status, 201);
  assert.equal(walkIn.body.booking.bookingStatus, "confirmed");

  const account = await h.models.User.findOne({ email: "walkin@example.test" });
  assert.equal(account.role, "guest");

  // The front desk is bound by the same availability rule.
  const clash = await h.book(desk.token, { ...stay, files: false });
  assert.equal(clash.status, 409);
});

test("the ledger sync repairs missing nights and flags pre-existing overlaps", async () => {
  const room = await h.createRoom();
  const base = {
    guest: guest.user._id,
    room: room._id,
    numberOfGuests: 1,
    guestDetails: { ...h.guestDetails(), documentFront: "", documentBack: "" },
    totalNights: 2,
    pricePerNight: 10000,
    totalAmount: 20000,
    bookingStatus: "confirmed",
  };

  // Inserted directly, as reservations created before the ledger existed.
  const legacy = await h.models.Booking.create({
    ...base,
    checkInDate: parseDateOnly(h.day(110)),
    checkOutDate: parseDateOnly(h.day(112)),
  });
  const overlapping = await h.models.Booking.create({
    ...base,
    checkInDate: parseDateOnly(h.day(111)),
    checkOutDate: parseDateOnly(h.day(113)),
  });

  // Even before the sync, the overlap query protects the legacy reservation.
  const early = await h.book(other.token, { roomId: room._id, checkIn: h.day(110), checkOut: h.day(111) });
  assert.equal(early.status, 409);

  const result = await syncRoomNights();
  assert.equal(await nightsHeld(legacy._id), 2);
  assert.deepEqual(result.conflicts, [String(overlapping._id)]);

  // Stale nights for finished bookings are removed.
  await h.models.Booking.updateOne({ _id: legacy._id }, { $set: { bookingStatus: "cancelled" } });
  await h.models.Booking.updateOne({ _id: overlapping._id }, { $set: { bookingStatus: "cancelled" } });
  await syncRoomNights();
  assert.equal(await h.models.RoomNight.countDocuments({ room: room._id }), 0);
});
