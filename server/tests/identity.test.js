const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const h = require("./helpers");
const { env } = require("../config/env");
const { extractCnicNumbers, DISCLAIMER } = require("../services/identityCheck");

// Every identity here is invented for the test. The numbers follow the CNIC
// layout but belong to nobody, and "OCR" is a stand-in that returns whatever
// text the test sets. Nothing in this file contacts NADRA or any real record.

let desk;
let keeper;
let manager;
let serial = 0;

before(async () => {
  await h.start();
  desk = await h.actor("receptionist");
  keeper = await h.actor("housekeeping");
  manager = await h.actor("manager");
});

after(() => h.stop());

beforeEach(() => {
  h.state.ocrText = "";
  h.state.ocrFails = false;
});

const call = (actor, method, route, body) => h.api(method, route, { token: actor.token, body });

// A fictional CNIC number, different on every call.
const fictionalCnic = () => {
  serial += 1;
  return `42101-${String(9000000 + serial)}-${serial % 10}`;
};

const cardText = (number) => `PAKISTAN National Identity Card\nName SPECIMEN\nIdentity Number\n${number}\nDate of Birth 01.01.1990`;

const cnicForm = (guest, { number, room, from = 2, to = 4, front = true, back = true, extra }) => {
  const form = h.bookingForm({
    roomId: room._id,
    checkIn: h.day(from),
    checkOut: h.day(to),
    files: front,
    extra,
    details: h.guestDetails({ documentType: "cnic", documentNumber: number, email: guest.user.email }),
  });
  if (back) form.append("documentBack", new Blob([h.PNG], { type: "image/png" }), "back.png");
  return form;
};

const bookWithCnic = (guest, options) =>
  h.api("POST", "/api/bookings", { token: guest.token, form: cnicForm(guest, options) });

const deskBooking = (details, room, from, to, extra) =>
  h.api("POST", "/api/bookings", {
    token: desk.token,
    form: h.bookingForm({ roomId: room._id, checkIn: h.day(from), checkOut: h.day(to), files: false, details, extra }),
  });

const storedFiles = () => fs.readdirSync(process.env.UPLOAD_DIR).length;

test("CNIC numbers are found in OCR text in every common layout, and nothing else is", () => {
  assert.deepEqual(extractCnicNumbers("ID 42101-1234567-1 issued"), ["4210112345671"]);
  assert.deepEqual(extractCnicNumbers("4210112345671"), ["4210112345671"]);
  assert.deepEqual(extractCnicNumbers("42101 1234567 1"), ["4210112345671"]);
  assert.deepEqual(extractCnicNumbers("42101-1234567-1 and 42101-1234567-1"), ["4210112345671"]);
  assert.deepEqual(extractCnicNumbers("phone +92 300 1234567, ref 12345678901234"), []);
  assert.deepEqual(extractCnicNumbers(""), []);
});

test("online requests need both sides of the CNIC and a correctly formed number", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();
  const before = storedFiles();

  const noFront = await bookWithCnic(guest, { number: fictionalCnic(), room, front: false });
  assert.equal(noFront.status, 400);
  assert.match(noFront.body.message, /front of your CNIC/);

  const noBack = await bookWithCnic(guest, { number: fictionalCnic(), room, back: false });
  assert.equal(noBack.status, 400);
  assert.match(noBack.body.message, /back of your CNIC/);

  const badNumber = await bookWithCnic(guest, { number: "42101-12345", room });
  assert.equal(badNumber.status, 400);
  assert.match(badNumber.body.message, /CNIC must be 13 digits/);

  // Refused uploads are not kept.
  assert.equal(storedFiles(), before);
  assert.equal(await h.models.Booking.countDocuments({ guest: guest.user._id }), 0);
});

test("a matching number is recorded, but the request still waits for staff", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);

  const created = await bookWithCnic(guest, { number, room, from: 0, to: 2 });
  assert.equal(created.status, 201);

  const { booking } = created.body;
  assert.equal(booking.identityCheck.status, "number-matched");
  assert.equal(booking.identityCheck.extractedNumber, number);
  assert.equal(booking.identityCheck.disclaimer, DISCLAIMER);
  assert.match(booking.identityCheck.disclaimer, /not verified against NADRA/);
  assert.equal(booking.bookingStatus, "pending");
  assert.equal(booking.verificationStatus, "pending");
  assert.equal(booking.verificationMethod, null);
  assert.match(created.body.message, /member of staff will review/);
  assert.doesNotMatch(JSON.stringify(created.body), /authenticat|officially verified|NADRA verified/i);

  const id = booking._id;

  // Not reviewed, so not confirmed and not checked in.
  assert.equal((await call(desk, "PATCH", `/api/bookings/${id}/check-in`)).status, 409);

  // Only front-desk roles may decide.
  assert.equal((await call(guest, "PATCH", `/api/bookings/${id}/confirm`, {})).status, 403);
  assert.equal((await call(keeper, "PATCH", `/api/bookings/${id}/confirm`, {})).status, 403);
  assert.equal((await call(keeper, "PATCH", `/api/bookings/${id}/reject`, { note: "No" })).status, 403);

  const approved = await call(desk, "PATCH", `/api/bookings/${id}/confirm`, {});
  assert.equal(approved.status, 200);
  assert.equal(approved.body.booking.bookingStatus, "confirmed");
  assert.equal(approved.body.booking.verificationMethod, "staff-review");
  assert.equal(approved.body.booking.verifiedBy.name, desk.user.name);
  assert.ok(approved.body.booking.verifiedAt);
  // The automatic result is kept as it was.
  assert.equal(approved.body.booking.identityCheck.status, "number-matched");

  assert.equal((await call(desk, "PATCH", `/api/bookings/${id}/check-in`)).status, 200);
});

test("a different number on the image needs a written reason to approve", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();
  const typed = fictionalCnic();
  const onCard = fictionalCnic();
  h.state.ocrText = cardText(onCard);

  const created = await bookWithCnic(guest, { number: typed, room });
  assert.equal(created.status, 201);
  assert.equal(created.body.booking.identityCheck.status, "number-mismatch");
  assert.equal(created.body.booking.identityCheck.extractedNumber, onCard);
  assert.equal(created.body.booking.bookingStatus, "pending");

  const id = created.body.booking._id;

  // A guest cannot mark themselves verified.
  assert.equal((await call(guest, "PATCH", `/api/bookings/${id}`, { verificationStatus: "verified" })).status, 400);

  assert.equal((await call(desk, "PATCH", `/api/bookings/${id}/confirm`, {})).status, 400);

  const approved = await call(manager, "PATCH", `/api/bookings/${id}/confirm`, {
    note: "Original card compared by video call; OCR misread one digit.",
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.booking.verificationMethod, "staff-review");
  assert.equal(approved.body.booking.decisionNote, "Original card compared by video call; OCR misread one digit.");
  assert.equal(approved.body.booking.identityCheck.status, "number-mismatch");
});

test("a rejection always carries a reason, which the guest sees", async () => {
  const guest = await h.actor("guest");
  h.state.ocrText = cardText(fictionalCnic());
  const created = await bookWithCnic(guest, { number: fictionalCnic(), room: await h.createRoom() });
  const id = created.body.booking._id;

  const silent = await call(desk, "PATCH", `/api/bookings/${id}/reject`, {});
  assert.equal(silent.status, 400);
  assert.match(silent.body.message, /reason/);

  const rejected = await call(desk, "PATCH", `/api/bookings/${id}/reject`, { note: "The card image does not match the number given." });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.booking.verificationStatus, "rejected");
  assert.ok(rejected.body.booking.verifiedAt);

  const seen = await call(guest, "GET", `/api/bookings/${id}`);
  assert.equal(seen.body.booking.decisionNote, "The card image does not match the number given.");
});

test("an unreadable image, or an OCR failure, is inconclusive and never a pass", async () => {
  const room = await h.createRoom();

  const first = await h.actor("guest");
  h.state.ocrText = "~~ blurred ~~";
  const unreadable = await bookWithCnic(first, { number: fictionalCnic(), room, from: 2, to: 3 });
  assert.equal(unreadable.status, 201);
  assert.equal(unreadable.body.booking.identityCheck.status, "unreadable");
  assert.equal(unreadable.body.booking.bookingStatus, "pending");

  const second = await h.actor("guest");
  h.state.ocrFails = true;
  const failed = await bookWithCnic(second, { number: fictionalCnic(), room, from: 5, to: 6 });
  assert.equal(failed.status, 201);
  assert.equal(failed.body.booking.identityCheck.status, "error");
  assert.equal(failed.body.booking.verificationStatus, "pending");
});

test("passports and front-desk reservations have no automatic check", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();

  h.state.ocrText = cardText(fictionalCnic());
  const passport = await h.book(guest.token, { roomId: room._id, checkIn: h.day(2), checkOut: h.day(3) });
  assert.equal(passport.status, 201);
  assert.equal(passport.body.booking.identityCheck.status, "not-applicable");
  assert.equal(passport.body.booking.bookingStatus, "pending");

  h.state.ocrFails = true;
  const walkIn = await deskBooking(
    h.guestDetails({ documentType: "cnic", documentNumber: fictionalCnic(), email: "walkin@example.test" }),
    room,
    6,
    7
  );
  assert.equal(walkIn.status, 201);
  assert.equal(walkIn.body.booking.identityCheck.status, "not-applicable");
  assert.equal(walkIn.body.booking.verificationMethod, "staff-in-person");
  assert.equal(walkIn.body.booking.bookingStatus, "confirmed");
  assert.ok(walkIn.body.booking.verifiedAt);
});

test("one identity document belongs to one account, permanently", async () => {
  const owner = await h.actor("guest");
  const other = await h.actor("guest");
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);

  const first = await bookWithCnic(owner, { number, room: await h.createRoom(), from: 2, to: 4 });
  assert.equal(first.status, 201);

  // Different room, different dates, and written without dashes: refused.
  const second = await bookWithCnic(other, { number: number.replace(/-/g, ""), room: await h.createRoom(), from: 10, to: 12 });
  assert.equal(second.status, 409);
  assert.match(second.body.message, /already used on another account/);

  // Still refused once the first reservation is cancelled: the document stays
  // with the account that first used it.
  await call(owner, "PATCH", `/api/bookings/${first.body.booking._id}/cancel`, {});
  assert.equal((await bookWithCnic(other, { number, room: await h.createRoom(), from: 10, to: 12 })).status, 409);

  // The front desk cannot attach it to another account either.
  const desked = await deskBooking(
    h.guestDetails({ documentType: "cnic", documentNumber: number, email: "someone-else@example.test" }),
    await h.createRoom(),
    20,
    21
  );
  assert.equal(desked.status, 409);

  assert.equal(await h.models.Booking.countDocuments({ guest: other.user._id }), 0);
  const binding = await h.models.IdentityDocument.findById(`cnic:${number.replace(/-/g, "")}`);
  assert.equal(String(binding.guest), owner.id);
});

test("one document cannot hold two stays over the same dates without explicit desk approval", async () => {
  const guest = await h.actor("guest");
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);
  const details = h.guestDetails({ documentType: "cnic", documentNumber: number, email: guest.user.email });

  assert.equal((await bookWithCnic(guest, { number, room: await h.createRoom(), from: 2, to: 5 })).status, 201);

  const overlapping = await bookWithCnic(guest, { number, room: await h.createRoom(), from: 4, to: 6 });
  assert.equal(overlapping.status, 409);
  assert.match(overlapping.body.message, /already covers these dates/);

  // A guest cannot grant themselves the exception.
  const sneaky = await bookWithCnic(guest, {
    number,
    room: await h.createRoom(),
    from: 4,
    to: 6,
    extra: { allowSameDocumentOverlap: "true" },
  });
  assert.equal(sneaky.status, 403);

  // A later stay with the same document is fine.
  assert.equal((await bookWithCnic(guest, { number, room: await h.createRoom(), from: 5, to: 7 })).status, 201);

  // The front desk must say explicitly that the guest is taking another room,
  // and the decision is recorded against them.
  const implicit = await deskBooking(details, await h.createRoom(), 2, 5);
  assert.equal(implicit.status, 409);
  assert.match(implicit.body.message, /confirm that explicitly/);

  const explicit = await deskBooking(details, await h.createRoom(), 2, 5, { allowSameDocumentOverlap: "true" });
  assert.equal(explicit.status, 201);
  const stored = await h.models.Booking.findById(explicit.body.booking._id);
  assert.equal(String(stored.sameDocumentOverlapApprovedBy), desk.id);
});

test("changing dates applies the same rule, and a refused change keeps the original stay", async () => {
  const guest = await h.actor("guest");
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);

  const first = await bookWithCnic(guest, { number, room: await h.createRoom(), from: 2, to: 4 });
  const second = await bookWithCnic(guest, { number, room: await h.createRoom(), from: 6, to: 8 });
  assert.equal(second.status, 201);

  const moved = await call(guest, "PATCH", `/api/bookings/${second.body.booking._id}`, {
    checkInDate: h.day(3),
    checkOutDate: h.day(5),
  });
  assert.equal(moved.status, 409);
  assert.match(moved.body.message, /already covers these dates/);

  const kept = await call(guest, "GET", `/api/bookings/${second.body.booking._id}`);
  assert.equal(kept.body.booking.checkInDate.slice(0, 10), h.day(6));
  assert.equal(await h.models.IdentityNight.countDocuments({ booking: second.body.booking._id }), 2);

  // Moving next to the first stay, not over it, is allowed.
  const adjacent = await call(guest, "PATCH", `/api/bookings/${second.body.booking._id}`, {
    checkInDate: h.day(4),
    checkOutDate: h.day(6),
  });
  assert.equal(adjacent.status, 200);
  assert.equal(await h.models.IdentityNight.countDocuments({ booking: first.body.booking._id }), 2);
});

test("simultaneous requests with one document for the same dates produce exactly one reservation", async () => {
  for (let round = 0; round < 3; round += 1) {
    const guest = await h.actor("guest");
    const number = fictionalCnic();
    h.state.ocrText = cardText(number);

    const rooms = await Promise.all([h.createRoom(), h.createRoom(), h.createRoom(), h.createRoom()]);
    const results = await Promise.all(rooms.map((room) => bookWithCnic(guest, { number, room, from: 2, to: 4 })));

    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409, 409]);
    assert.equal(await h.models.Booking.countDocuments({ guest: guest.user._id }), 1);
    // Refused requests left no room nights or identity nights behind.
    assert.equal(await h.models.RoomNight.countDocuments({ room: { $in: rooms.map((room) => room._id) } }), 2);
    assert.equal(await h.models.IdentityNight.countDocuments({ key: `cnic:${number.replace(/-/g, "")}` }), 2);
  }
});

test("simultaneous requests from two accounts with one document bind it to exactly one", async () => {
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);
  const guests = await Promise.all([h.actor("guest"), h.actor("guest"), h.actor("guest")]);

  const results = await Promise.all(
    guests.map(async (guest, index) => bookWithCnic(guest, { number, room: await h.createRoom(), from: 30 + index * 3, to: 31 + index * 3 }))
  );

  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409, 409]);
  assert.equal(await h.models.IdentityDocument.countDocuments({ _id: `cnic:${number.replace(/-/g, "")}` }), 1);
});

test("without an encryption key no new document is accepted, and nothing is stored", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();
  const before = storedFiles();
  const saved = env.DOCUMENT_KEY;

  env.DOCUMENT_KEY = "";
  try {
    const refused = await bookWithCnic(guest, { number: fictionalCnic(), room });
    assert.equal(refused.status, 503);
    assert.match(refused.body.message, /encryption is not configured/);
    assert.equal(storedFiles(), before);

    // A front-desk reservation without uploads is unaffected.
    const walkIn = await deskBooking(
      h.guestDetails({ documentType: "cnic", documentNumber: fictionalCnic(), email: "nokey@example.test" }),
      room,
      9,
      10
    );
    assert.equal(walkIn.status, 201);
  } finally {
    env.DOCUMENT_KEY = saved;
  }

  // A retry once the key is back succeeds.
  h.state.ocrText = "";
  assert.equal((await bookWithCnic(guest, { number: fictionalCnic(), room })).status, 201);
});

test("uploaded documents are encrypted on disk and shown only to the owner and the front desk", async () => {
  const owner = await h.actor("guest");
  const stranger = await h.actor("guest");
  const number = fictionalCnic();
  h.state.ocrText = cardText(number);

  const created = await bookWithCnic(owner, { number, room: await h.createRoom() });
  const id = created.body.booking._id;

  // The API never reveals where a document is stored.
  assert.equal(created.body.booking.guestDetails.documentFront, undefined);
  assert.deepEqual(created.body.booking.documents, { front: true, back: true });

  const stored = await h.models.Booking.findById(id);
  const onDisk = fs.readFileSync(path.join(process.env.UPLOAD_DIR, stored.guestDetails.documentFront));
  assert.equal(onDisk.subarray(0, 6).toString("latin1"), "LSENC1");
  assert.equal(onDisk.includes(h.PNG.subarray(0, 8)), false);

  const fetchDocument = async (token) => {
    const response = await fetch(`${h.state.baseUrl}/api/bookings/${id}/documents/front`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return { status: response.status, type: response.headers.get("content-type"), cache: response.headers.get("cache-control"), bytes: Buffer.from(await response.arrayBuffer()) };
  };

  const mine = await fetchDocument(owner.token);
  assert.equal(mine.status, 200);
  assert.equal(mine.type, "image/png");
  assert.equal(mine.cache, "private, no-store");
  assert.ok(mine.bytes.equals(h.PNG));

  assert.equal((await fetchDocument(desk.token)).status, 200);
  assert.equal((await fetchDocument(null)).status, 401);
  assert.equal((await fetchDocument(stranger.token)).status, 404);
  assert.equal((await fetchDocument(keeper.token)).status, 404);

  // Uploads are never reachable as static files.
  assert.equal((await fetch(`${h.state.baseUrl}/uploads/identity/${stored.guestDetails.documentFront}`)).status, 404);
});

test("the client cannot supply a verification result", async () => {
  const guest = await h.actor("guest");
  const room = await h.createRoom();

  for (const extra of [{ verificationStatus: "verified" }, { identityCheck: "number-matched" }, { bookingStatus: "confirmed" }, { verificationMethod: "staff-review" }]) {
    const result = await h.api("POST", "/api/bookings", {
      token: guest.token,
      form: h.bookingForm({ roomId: room._id, checkIn: h.day(2), checkOut: h.day(3), extra }),
    });
    assert.equal(result.status, 400);
  }
});
