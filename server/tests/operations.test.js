const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const h = require("./helpers");
const { applyTotals, paymentStatusFor, round2 } = require("../utils/billing");
const { parseDateOnly, listNights, nightsBetween } = require("../utils/dates");

let admin;
let manager;
let desk;
let keeper;
let guest;

before(async () => {
  await h.start();
  admin = await h.actor("admin");
  manager = await h.actor("manager");
  desk = await h.actor("receptionist");
  keeper = await h.actor("housekeeping");
  guest = await h.actor("guest");
});

after(() => h.stop());

const call = (actor, method, route, body) => h.api(method, route, { token: actor.token, body });

// A confirmed reservation starting today, ready for check-in.
const confirmedStay = async (roomOverrides = {}, nights = 2) => {
  const room = await h.createRoom(roomOverrides);
  const created = await h.book(guest.token, {
    roomId: room._id,
    checkIn: h.day(0),
    checkOut: h.day(nights),
  });
  assert.equal(created.status, 201);

  const confirmed = await call(desk, "PATCH", `/api/bookings/${created.body.booking._id}/confirm`, {});
  assert.equal(confirmed.status, 200);

  return { room, id: created.body.booking._id, booking: confirmed.body.booking };
};

test("date and billing helpers calculate correctly", () => {
  assert.equal(parseDateOnly("2027-02-29"), null);
  assert.equal(parseDateOnly("2028-02-29").toISOString(), "2028-02-29T00:00:00.000Z");
  assert.equal(parseDateOnly("2027-13-01"), null);
  assert.equal(parseDateOnly(20270101), null);

  const start = parseDateOnly("2027-03-30");
  const end = parseDateOnly("2027-04-02");
  assert.equal(nightsBetween(start, end), 3);
  assert.deepEqual(
    listNights(start, end).map((night) => night.toISOString().slice(0, 10)),
    ["2027-03-30", "2027-03-31", "2027-04-01"]
  );

  const folio = applyTotals({
    pricePerNight: 12500,
    totalNights: 3,
    charges: [
      { amount: 1500, quantity: 2 },
      { amount: 999.99, quantity: 1 },
    ],
    discountAmount: 2000,
    taxRate: 16,
  });
  // 37,500 room + 3,999.99 extras = 41,499.99; less 2,000 = 39,499.99; tax 16% = 6,320.00
  assert.equal(folio.roomCharges, 37500);
  assert.equal(folio.taxAmount, 6320);
  assert.equal(folio.totalAmount, 45819.99);

  assert.equal(applyTotals({ pricePerNight: 100, totalNights: 1, discountAmount: 500, taxRate: 10 }).totalAmount, 0);
  assert.equal(round2(0.1 + 0.2), 0.3);

  assert.equal(paymentStatusFor(0, 100), "unpaid");
  assert.equal(paymentStatusFor(40, 100), "partial");
  assert.equal(paymentStatusFor(100, 100), "paid");
});

test("settings are restricted to administrators, validated, saved and applied to new bookings", async () => {
  assert.equal((await call(manager, "PUT", "/api/settings", { taxRate: 10 })).status, 403);
  assert.equal((await call(admin, "PUT", "/api/settings", { taxRate: 80 })).status, 400);
  assert.equal((await call(admin, "PUT", "/api/settings", { taxRate: -1 })).status, 400);
  assert.equal((await call(admin, "PUT", "/api/settings", { checkInTime: "25:00" })).status, 400);

  const saved = await call(admin, "PUT", "/api/settings", { taxRate: 10, hotelName: "LuxuryStay Test" });
  assert.equal(saved.status, 200);

  const read = await call(guest, "GET", "/api/settings");
  assert.equal(read.body.settings.taxRate, 10);
  assert.equal(read.body.settings.hotelName, "LuxuryStay Test");

  const room = await h.createRoom({ pricePerNight: 10000 });
  const booked = await h.book(guest.token, { roomId: room._id, checkIn: h.day(5), checkOut: h.day(7) });
  assert.equal(booked.body.booking.folio.roomCharges, 20000);
  assert.equal(booked.body.booking.folio.taxAmount, 2000);
  assert.equal(booked.body.booking.totalAmount, 22000);

  // Changing the rate later does not rewrite an existing folio.
  await call(admin, "PUT", "/api/settings", { taxRate: 0 });
  const later = await call(guest, "GET", `/api/bookings/${booked.body.booking._id}`);
  assert.equal(later.body.booking.totalAmount, 22000);

  const maxStay = await call(admin, "PUT", "/api/settings", { maxStayNights: 3 });
  assert.equal(maxStay.status, 200);
  const tooLong = await h.book(guest.token, { roomId: room._id, checkIn: h.day(20), checkOut: h.day(25) });
  assert.equal(tooLong.status, 400);
  await call(admin, "PUT", "/api/settings", { maxStayNights: 30 });
});

test("check-in validates status, dates and room state, and cannot be repeated", async () => {
  // A future reservation cannot be checked in early.
  const futureRoom = await h.createRoom();
  const future = await h.book(guest.token, { roomId: futureRoom._id, checkIn: h.day(3), checkOut: h.day(5) });
  const futureId = future.body.booking._id;

  assert.equal((await call(desk, "PATCH", `/api/bookings/${futureId}/check-in`)).status, 409, "pending");
  await call(desk, "PATCH", `/api/bookings/${futureId}/confirm`, {});
  assert.equal((await call(desk, "PATCH", `/api/bookings/${futureId}/check-in`)).status, 409, "too early");

  // A room that is still being cleaned cannot receive a guest.
  const dirty = await confirmedStay({ status: "cleaning" });
  assert.equal((await call(desk, "PATCH", `/api/bookings/${dirty.id}/check-in`)).status, 409, "cleaning");

  const stay = await confirmedStay();

  const done = await call(desk, "PATCH", `/api/bookings/${stay.id}/check-in`);
  assert.equal(done.status, 200);
  assert.equal(done.body.booking.bookingStatus, "checked-in");
  assert.equal(done.body.booking.room.status, "occupied");
  assert.ok(done.body.booking.checkedInAt);

  assert.equal((await call(desk, "PATCH", `/api/bookings/${stay.id}/check-in`)).status, 409, "duplicate");

  // Once in house, the reservation cannot be cancelled or rejected.
  assert.equal((await call(desk, "PATCH", `/api/bookings/${stay.id}/cancel`, {})).status, 409);
  assert.equal((await call(desk, "PATCH", `/api/bookings/${stay.id}/reject`, { note: "Too late" })).status, 409);

  // The occupied room cannot be released by hand or sent to maintenance.
  assert.equal(
    (await call(desk, "PATCH", `/api/rooms/${stay.room._id}/status`, { status: "available" })).status,
    409
  );
  assert.equal(
    (
      await call(keeper, "POST", "/api/maintenance", {
        roomId: String(stay.room._id),
        issueTitle: "Leaking tap",
        description: "The bathroom tap is leaking.",
      })
    ).status,
    409
  );
});

test("simultaneous check-ins of the same booking succeed exactly once", async () => {
  const stay = await confirmedStay();

  const results = await Promise.all(
    Array.from({ length: 5 }, () => call(desk, "PATCH", `/api/bookings/${stay.id}/check-in`))
  );

  assert.equal(results.filter((result) => result.status === 200).length, 1);
  assert.ok(results.every((result) => [200, 409].includes(result.status)));
});

test("payments are validated, cannot be duplicated and drive the payment status", async () => {
  const stay = await confirmedStay({ pricePerNight: 10000 }, 2);
  const route = `/api/bookings/${stay.id}/payments`;

  const invalid = [
    { amount: 0, paymentMethod: "cash" },
    { amount: -500, paymentMethod: "cash" },
    { amount: "abc", paymentMethod: "cash" },
    { amount: 100, paymentMethod: "crypto" },
    { amount: 100, paymentMethod: "card" },
    { amount: 100.123, paymentMethod: "cash" },
    { amount: 100, paymentMethod: "cash", paymentStatus: "paid" },
    { amount: 25000, paymentMethod: "cash" },
  ];
  for (const body of invalid) {
    assert.equal((await call(desk, "POST", route, body)).status, 400, JSON.stringify(body));
  }

  const partial = await call(desk, "POST", route, {
    amount: 5000,
    paymentMethod: "card",
    transactionReference: "TXN-1001",
  });
  assert.equal(partial.status, 200);
  assert.equal(partial.body.booking.paymentStatus, "partial");
  assert.equal(partial.body.booking.balance, 15000);

  // The same card transaction cannot be recorded twice.
  const duplicate = await call(desk, "POST", route, {
    amount: 5000,
    paymentMethod: "card",
    transactionReference: "txn-1001",
  });
  assert.equal(duplicate.status, 409);

  // A double-clicked cash payment: several identical requests at once.
  const burst = await Promise.all(
    Array.from({ length: 6 }, () => call(desk, "POST", route, { amount: 5000, paymentMethod: "cash" }))
  );
  const accepted = burst.filter((result) => result.status === 200).length;
  assert.ok(accepted >= 1 && accepted <= 3, `accepted ${accepted}`);

  const stored = await h.models.Booking.findById(stay.id);
  assert.equal(stored.amountPaid, 5000 + accepted * 5000);
  assert.equal(stored.payments.length, 1 + accepted);
  assert.ok(stored.amountPaid <= stored.totalAmount, "never overpaid");
  assert.equal(
    stored.payments.reduce((total, payment) => total + payment.amount, 0),
    stored.amountPaid
  );

  // With a request id, a repeated submission is applied exactly once however
  // many copies arrive.
  if (stored.totalAmount - stored.amountPaid >= 1000) {
    const requestId = "pay-form-0001";
    const repeats = await Promise.all(
      Array.from({ length: 6 }, () =>
        call(desk, "POST", route, { amount: 1000, paymentMethod: "cash", requestId })
      )
    );
    assert.ok(repeats.every((result) => [200, 409].includes(result.status)));
    await call(desk, "POST", route, { amount: 1000, paymentMethod: "cash", requestId });

    const afterRepeats = await h.models.Booking.findById(stay.id);
    assert.equal(afterRepeats.payments.filter((payment) => payment.requestId === requestId).length, 1);
    assert.equal(afterRepeats.amountPaid, stored.amountPaid + 1000);
    stored.amountPaid = afterRepeats.amountPaid;
  }

  const rest = stored.totalAmount - stored.amountPaid;
  if (rest > 0) {
    const final = await call(desk, "POST", route, { amount: rest, paymentMethod: "cash" });
    assert.equal(final.status, 200);
    assert.equal(final.body.booking.paymentStatus, "paid");
  }

  assert.equal((await call(desk, "POST", route, { amount: 1, paymentMethod: "cash" })).status, 409);
});

test("the paid status can only come from recorded payments", async () => {
  const stay = await confirmedStay();

  // No endpoint accepts a payment status from the client.
  for (const [method, route, body] of [
    ["PATCH", `/api/bookings/${stay.id}`, { paymentStatus: "paid" }],
    ["PATCH", `/api/bookings/${stay.id}`, { amountPaid: 999999 }],
    ["PATCH", `/api/bookings/${stay.id}/confirm`, { paymentStatus: "paid" }],
    ["PATCH", `/api/bookings/${stay.id}/discount`, { amount: 0, paymentStatus: "paid" }],
  ]) {
    const result = await call(admin, method, route, body);
    assert.equal(result.status, 400, `${method} ${route}`);
  }

  const stored = await h.models.Booking.findById(stay.id);
  assert.equal(stored.paymentStatus, "unpaid");
  assert.equal(stored.amountPaid, 0);
});

test("charges, discounts and tax produce a correct folio and invoice", async () => {
  await call(admin, "PUT", "/api/settings", { taxRate: 16 });
  const stay = await confirmedStay({ pricePerNight: 12500 }, 3);
  await call(admin, "PUT", "/api/settings", { taxRate: 0 });

  const base = `/api/bookings/${stay.id}`;

  assert.equal((await call(desk, "POST", `${base}/charges`, { description: "Spa", amount: -5 })).status, 400);
  assert.equal((await call(keeper, "POST", `${base}/charges`, { description: "Spa", amount: 5 })).status, 403);

  const spa = await call(desk, "POST", `${base}/charges`, {
    description: "Airport transfer",
    amount: 1500,
    quantity: 2,
  });
  assert.equal(spa.status, 201);
  const dinner = await call(desk, "POST", `${base}/charges`, { description: "Dinner", amount: 999.99 });
  assert.equal(dinner.status, 201);

  assert.equal((await call(desk, "PATCH", `${base}/discount`, { amount: 2000 })).status, 403);
  assert.equal((await call(manager, "PATCH", `${base}/discount`, { amount: 99999999 })).status, 400);

  const discounted = await call(manager, "PATCH", `${base}/discount`, {
    amount: 2000,
    reason: "Returning guest",
  });
  assert.equal(discounted.status, 200);

  const folio = discounted.body.booking.folio;
  assert.equal(folio.roomCharges, 37500);
  assert.equal(folio.extraCharges, 3999.99);
  assert.equal(folio.subtotal, 41499.99);
  assert.equal(folio.discountAmount, 2000);
  assert.equal(folio.taxAmount, 6320);
  assert.equal(folio.totalAmount, 45819.99);

  await call(desk, "POST", `${base}/payments`, { amount: 20000, paymentMethod: "cash" });

  const invoice = await call(guest, "GET", `${base}/invoice`);
  assert.equal(invoice.status, 200);
  assert.equal(invoice.body.invoice.lines.length, 3);
  assert.equal(invoice.body.invoice.folio.totalAmount, 45819.99);
  assert.equal(invoice.body.invoice.folio.balance, 25819.99);
  assert.equal(invoice.body.invoice.payments.length, 1);

  // Asking again, even many times at once, never issues a second number.
  const repeats = await Promise.all(Array.from({ length: 5 }, () => call(desk, "GET", `${base}/invoice`)));
  const numbers = new Set(repeats.map((result) => result.body.invoice.invoiceNumber));
  assert.equal(numbers.size, 1);
  assert.ok(numbers.has(invoice.body.invoice.invoiceNumber));

  // Removing a charge recalculates the folio.
  const chargeId = spa.body.booking.charges[0]._id;
  const removed = await call(desk, "DELETE", `${base}/charges/${chargeId}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.booking.folio.extraCharges, 999.99);
});

test("check-out requires a settled folio, releases the room and hands it to housekeeping", async () => {
  const stay = await confirmedStay({ pricePerNight: 8000 }, 2);
  const base = `/api/bookings/${stay.id}`;

  assert.equal((await call(desk, "PATCH", `${base}/check-out`)).status, 409, "not checked in");

  await call(desk, "PATCH", `${base}/check-in`);

  const unpaid = await call(desk, "PATCH", `${base}/check-out`);
  assert.equal(unpaid.status, 409);
  assert.match(unpaid.body.message, /balance/i);

  await call(desk, "POST", `${base}/payments`, { amount: 16000, paymentMethod: "cash" });

  const out = await call(desk, "PATCH", `${base}/check-out`);
  assert.equal(out.status, 200);
  assert.equal(out.body.booking.bookingStatus, "checked-out");
  assert.equal(out.body.booking.paymentStatus, "paid");
  assert.equal(out.body.booking.room.status, "cleaning");
  assert.ok(out.body.booking.checkedOutAt);

  assert.equal((await call(desk, "PATCH", `${base}/check-out`)).status, 409, "duplicate");
  assert.equal(await h.models.RoomNight.countDocuments({ booking: stay.id }), 0);

  // The folio is closed after departure.
  assert.equal((await call(desk, "POST", `${base}/charges`, { description: "Late", amount: 10 })).status, 409);

  // Housekeeping is told, and only housekeeping can release the room.
  const inbox = await call(keeper, "GET", "/api/notifications");
  assert.ok(inbox.body.notifications.some((item) => item.type === "housekeeping"));

  const guestInbox = await call(guest, "GET", "/api/notifications");
  assert.ok(!guestInbox.body.notifications.some((item) => item.type === "housekeeping"));

  const queue = await call(keeper, "GET", "/api/rooms/housekeeping");
  assert.ok(queue.body.rooms.some((room) => room._id === String(stay.room._id)));

  assert.equal((await call(keeper, "PATCH", `/api/rooms/housekeeping/${stay.room._id}/start`)).status, 200);
  assert.equal((await call(keeper, "PATCH", `/api/rooms/housekeeping/${stay.room._id}/start`)).status, 409);

  const cleaned = await call(keeper, "PATCH", `/api/rooms/housekeeping/${stay.room._id}/complete`);
  assert.equal(cleaned.status, 200);
  assert.equal(cleaned.body.room.status, "available");
  assert.ok(cleaned.body.room.lastCleanedAt);

  assert.equal(
    (await call(keeper, "PATCH", `/api/rooms/housekeeping/${stay.room._id}/complete`)).status,
    409
  );

  // Feedback: only after check-out, only once, only by the guest who stayed.
  const review = { bookingId: stay.id, rating: 5, message: "A wonderful stay, thank you." };
  assert.equal((await call(guest, "POST", "/api/feedback", { ...review, rating: 9 })).status, 400);
  assert.equal((await call(guest, "POST", "/api/feedback", review)).status, 201);
  assert.equal((await call(guest, "POST", "/api/feedback", review)).status, 409);
  assert.equal((await call(desk, "POST", "/api/feedback", review)).status, 403);

  const list = await call(manager, "GET", "/api/feedback");
  assert.equal(list.body.summary.totalFeedback, 1);
  assert.equal(list.body.summary.averageRating, 5);
});

test("a stay that runs past its departure date is billed for the extra nights", async () => {
  const room = await h.createRoom({ pricePerNight: 10000 });

  // A guest who arrived three days ago on a one-night booking and never left.
  const booking = await h.models.Booking.create({
    guest: guest.user._id,
    room: room._id,
    checkInDate: parseDateOnly(h.day(-3)),
    checkOutDate: parseDateOnly(h.day(-2)),
    numberOfGuests: 1,
    guestDetails: { ...h.guestDetails(), documentFront: "", documentBack: "" },
    totalNights: 1,
    pricePerNight: 10000,
    totalAmount: 10000,
    amountPaid: 10000,
    paymentStatus: "paid",
    bookingStatus: "checked-in",
    verificationStatus: "verified",
  });
  await h.models.Room.updateOne({ _id: room._id }, { $set: { status: "occupied" } });

  const blocked = await call(desk, "PATCH", `/api/bookings/${booking._id}/check-out`);
  assert.equal(blocked.status, 409);

  const updated = await h.models.Booking.findById(booking._id);
  assert.equal(updated.totalNights, 3);
  assert.equal(updated.totalAmount, 30000);
  assert.equal(updated.paymentStatus, "partial");

  await call(desk, "POST", `/api/bookings/${booking._id}/payments`, { amount: 20000, paymentMethod: "cash" });
  assert.equal((await call(desk, "PATCH", `/api/bookings/${booking._id}/check-out`)).status, 200);
});

test("room management validates input and protects rooms with history", async () => {
  const valid = {
    roomNumber: "901",
    name: "Skyline Suite",
    type: "Signature Suite",
    pricePerNight: 45000,
    capacity: 3,
    bedType: "King bed",
    floor: 9,
    amenities: ["Balcony", "Butler service"],
  };

  for (const patch of [
    { pricePerNight: -1 },
    { pricePerNight: "free" },
    { capacity: 0 },
    { capacity: 2.5 },
    { type: "Penthouse" },
    { roomNumber: "9 0 1 <script>" },
    { floor: 0 },
    { status: "occupied" },
    { name: "" },
  ]) {
    const result = await call(manager, "POST", "/api/rooms", { ...valid, ...patch });
    assert.equal(result.status, 400, JSON.stringify(patch));
  }

  const created = await call(manager, "POST", "/api/rooms", valid);
  assert.equal(created.status, 201);
  assert.equal(created.body.room.status, "available");
  assert.equal((await call(manager, "POST", "/api/rooms", valid)).status, 409);

  const id = created.body.room._id;

  const edited = await call(manager, "PUT", `/api/rooms/${id}`, { pricePerNight: 50000 });
  assert.equal(edited.body.room.pricePerNight, 50000);

  // Status transitions are checked.
  assert.equal((await call(desk, "PATCH", `/api/rooms/${id}/status`, { status: "occupied" })).status, 409);
  assert.equal((await call(desk, "PATCH", `/api/rooms/${id}/status`, { status: "maintenance" })).status, 409);
  assert.equal((await call(desk, "PATCH", `/api/rooms/${id}/status`, { status: "spotless" })).status, 400);
  assert.equal((await call(desk, "PATCH", `/api/rooms/${id}/status`, { status: "reserved" })).status, 200);
  assert.equal((await call(desk, "PATCH", `/api/rooms/${id}/status`, { status: "reserved" })).status, 400);

  // An unused room can be deleted; one with history cannot.
  assert.equal((await call(manager, "DELETE", `/api/rooms/${id}`)).status, 200);

  const used = await confirmedStay();
  assert.equal((await call(manager, "DELETE", `/api/rooms/${used.room._id}`)).status, 409);
  assert.ok(await h.models.Room.exists({ _id: used.room._id }));

  // Guests only see active rooms and public fields.
  const hidden = await h.createRoom({ isActive: false });
  const guestRooms = await call(guest, "GET", "/api/rooms");
  assert.ok(!guestRooms.body.rooms.some((room) => room._id === String(hidden._id)));
  assert.ok(guestRooms.body.rooms.every((room) => room.lastCleanedBy === undefined));
});

test("maintenance requests take a room out of service and return it when completed", async () => {
  const room = await h.createRoom();
  const body = {
    roomId: String(room._id),
    issueTitle: "Air conditioner not cooling",
    description: "The unit runs but does not cool the room.",
    priority: "high",
  };

  assert.equal((await call(guest, "POST", "/api/maintenance", body)).status, 403);
  assert.equal((await call(keeper, "POST", "/api/maintenance", { ...body, priority: "extreme" })).status, 400);

  const reported = await call(keeper, "POST", "/api/maintenance", body);
  assert.equal(reported.status, 201);
  assert.equal(reported.body.task.room.status, "maintenance");

  assert.equal((await call(keeper, "POST", "/api/maintenance", body)).status, 409, "one open task per room");

  // While in maintenance the room cannot be booked or released by hand.
  assert.equal(
    (await h.book(guest.token, { roomId: room._id, checkIn: h.day(2), checkOut: h.day(3) })).status,
    409
  );
  assert.equal(
    (await call(desk, "PATCH", `/api/rooms/${room._id}/status`, { status: "available" })).status,
    409
  );

  const taskId = reported.body.task._id;
  assert.equal((await call(desk, "PATCH", `/api/maintenance/${taskId}/start`)).status, 403);

  const started = await call(keeper, "PATCH", `/api/maintenance/${taskId}/start`);
  assert.equal(started.body.task.status, "in-progress");
  assert.ok(started.body.task.startedAt);
  assert.equal((await call(keeper, "PATCH", `/api/maintenance/${taskId}/start`)).status, 409);

  const completed = await call(keeper, "PATCH", `/api/maintenance/${taskId}/complete`, {
    resolutionNote: "Refilled refrigerant.",
  });
  assert.equal(completed.body.task.status, "completed");
  assert.ok(completed.body.task.completedAt);
  assert.equal(completed.body.task.room.status, "available");
  assert.equal((await call(keeper, "PATCH", `/api/maintenance/${taskId}/complete`, {})).status, 409);

  assert.equal(
    (await h.book(guest.token, { roomId: room._id, checkIn: h.day(2), checkOut: h.day(3) })).status,
    201
  );
});

test("reports are calculated from stored data and validate their date range", async () => {
  assert.equal((await call(manager, "GET", "/api/reports/overview?from=2027-13-40")).status, 400);
  assert.equal(
    (await call(manager, "GET", `/api/reports/overview?from=${h.day(5)}&to=${h.day(1)}`)).status,
    400
  );
  assert.equal(
    (await call(manager, "GET", "/api/reports/overview?from=2020-01-01&to=2026-01-01")).status,
    400
  );

  const report = await call(manager, "GET", `/api/reports/overview?from=${h.day(-6)}&to=${h.day(0)}`);
  assert.equal(report.status, 200);

  const { summary, timeline, range } = report.body;
  assert.equal(range.days, 7);
  assert.equal(timeline.length, 7);

  // Revenue in the report equals the payments actually recorded today.
  const bookings = await h.models.Booking.find({ "payments.0": { $exists: true } });
  const recorded = round2(
    bookings.reduce(
      (total, booking) => total + booking.payments.reduce((sum, payment) => sum + payment.amount, 0),
      0
    )
  );
  assert.equal(summary.totalRevenue, recorded);
  assert.equal(round2(timeline.reduce((total, point) => total + point.revenue, 0)), recorded);

  const rooms = await h.models.Room.find({ isActive: true });
  assert.equal(summary.totalRooms, rooms.length);
  assert.equal(summary.occupiedRooms, rooms.filter((room) => room.status === "occupied").length);
  assert.equal(summary.nightsOnOffer, rooms.length * 7);

  const frontDesk = await call(desk, "GET", "/api/reports/front-desk");
  assert.equal(frontDesk.status, 200);
  assert.equal(
    frontDesk.body.summary.inHouse,
    await h.models.Booking.countDocuments({ bookingStatus: "checked-in" })
  );

  const finance = await call(desk, "GET", "/api/reports/finance");
  assert.equal(finance.status, 200);
  assert.ok(finance.body.summary.totalRevenue >= 0);

  const filtered = await call(desk, "GET", "/api/bookings?view=inhouse&limit=5&page=1");
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.bookings.every((booking) => booking.bookingStatus === "checked-in"));
  assert.ok(filtered.body.bookings.length <= 5);
  assert.equal((await call(desk, "GET", "/api/bookings?limit=5000")).status, 400);
});

test("website enquiries are validated, stored and visible only to authorised staff", async () => {
  const body = {
    name: "Sara Ahmed",
    email: "sara@example.test",
    phone: "+92 300 1234567",
    enquiryType: "Dining",
    message: "Do you have a table for six on Friday evening?",
  };

  assert.equal((await h.api("POST", "/api/contact", { body: { ...body, email: "bad" } })).status, 400);
  assert.equal((await h.api("POST", "/api/contact", { body: { ...body, enquiryType: "Other" } })).status, 400);
  assert.equal((await h.api("POST", "/api/contact", { body: { ...body, status: "resolved" } })).status, 400);
  assert.equal((await h.api("POST", "/api/contact", { body: { ...body, message: "x".repeat(2000) } })).status, 400);

  const sent = await h.api("POST", "/api/contact", { body });
  assert.equal(sent.status, 201);
  assert.equal(sent.body.enquiry, undefined);

  assert.equal((await call(keeper, "GET", "/api/contact")).status, 403);

  const inbox = await call(desk, "GET", "/api/contact");
  assert.equal(inbox.body.enquiries.length, 1);
  assert.equal(inbox.body.unread, 1);

  const id = inbox.body.enquiries[0]._id;
  assert.equal((await call(desk, "PATCH", `/api/contact/${id}/status`, { status: "done" })).status, 400);
  const resolved = await call(desk, "PATCH", `/api/contact/${id}/status`, { status: "resolved" });
  assert.equal(resolved.body.enquiry.status, "resolved");
});

test("notifications reach the right audience and can be marked read", async () => {
  const before = await call(desk, "GET", "/api/notifications");
  assert.ok(before.body.unread > 0);

  const first = before.body.notifications[0];
  await call(desk, "PATCH", `/api/notifications/${first.id}/read`);
  const afterOne = await call(desk, "GET", "/api/notifications");
  assert.equal(afterOne.body.unread, before.body.unread - 1);

  // Another user cannot mark a notification that is not addressed to them.
  const guestOnly = (await call(guest, "GET", "/api/notifications")).body.notifications[0];
  await call(keeper, "PATCH", `/api/notifications/${guestOnly.id}/read`);
  const stored = await h.models.Notification.findById(guestOnly.id);
  assert.ok(!stored.readBy.some((id) => String(id) === keeper.id));

  await call(desk, "PATCH", "/api/notifications/read-all");
  assert.equal((await call(desk, "GET", "/api/notifications")).body.unread, 0);
});
