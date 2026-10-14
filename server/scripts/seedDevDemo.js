// Populates the DEVELOPMENT database with fictional demonstration data.
//
//   SEED_DEMO_PASSWORD='…' npm run seed:dev-demo
//
// Safety:
// - Runs only against a database named exactly "luxurystay_dev", which must
//   also match EXPECTED_DB_NAME. The name is checked in MONGO_URI before
//   connecting and again on the live connection before any write.
// - Only adds records. Nothing is deleted, and no record that existed before
//   (accounts, rooms, bookings, settings) is changed. Every demo record has a
//   fixed identifier, so running the script again adds nothing.
// - Bookings go through the project's own night ledger, identity ledger and
//   invoice numbering, exactly like reservations made at the front desk.
//
// Demo accounts use addresses at demo.luxurystay.test and the password given
// in SEED_DEMO_PASSWORD (needed only when an account still has to be created;
// it is never printed). All people, document numbers and phone numbers are
// fictional; CNIC numbers start with 00000, which no real CNIC does.

const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { env, validateEnv } = require("../config/env");
const User = require("../models/User");
const Room = require("../models/Room");
const Booking = require("../models/Booking");
const Maintenance = require("../models/Maintenance");
const Feedback = require("../models/Feedback");
const Contact = require("../models/Contact");
const { claimNights, releaseNights } = require("../services/availability");
const { documentKey, bindDocument, claimIdentityNights } = require("../services/identityLedger");
const { ensureInvoiceNumber } = require("../services/invoices");
const { getSettings } = require("../services/settings");
const { applyTotals, paymentStatusFor } = require("../utils/billing");
const { hotelToday, addDays, nightsBetween } = require("../utils/dates");
const { password: passwordRule } = require("../utils/schemas");
const { databaseInUri, refusalFor } = require("./writeGuard");

const DEV_DB = "luxurystay_dev";
const DOMAIN = "demo.luxurystay.test";
const HOUR = 60 * 60 * 1000;

// Stable identifier for each demo record, the same on every run.
const idFor = (key) =>
  new mongoose.Types.ObjectId(
    crypto.createHash("sha1").update(`luxurystay-demo:${key}`).digest("hex").slice(0, 24)
  );

// ---------------------------------------------------------------- people --

const STAFF = [
  { key: "manager", name: "Hamza Siddiqui", role: "manager", phone: "+923000001001" },
  { key: "desk1", name: "Sana Malik", role: "receptionist", phone: "+923000001002" },
  { key: "desk2", name: "Usman Tariq", role: "receptionist", phone: "+923000001003" },
  { key: "hk1", name: "Imran Qureshi", role: "housekeeping", phone: "+923000001004" },
  { key: "hk2", name: "Nadia Bibi", role: "housekeeping", phone: "+923000001005" },
];

const GUESTS = [
  { key: "amina", name: "Amina Khan", nationality: "Pakistan", doc: ["cnic", "00000-0000001-1"], address: "House 14, Street 7, F-8/3, Islamabad" },
  { key: "omar", name: "Omar Farooq", nationality: "Pakistan", doc: ["cnic", "00000-0000002-2"], address: "22 Main Boulevard, Gulberg III, Lahore" },
  { key: "hina", name: "Hina Aslam", nationality: "Pakistan", doc: ["cnic", "00000-0000003-3"], address: "Flat 5, Clifton Block 4, Karachi" },
  { key: "tariq", name: "Tariq Jameel", nationality: "Pakistan", doc: ["cnic", "00000-0000004-4"], address: "9 Canal View, Faisalabad" },
  { key: "zara", name: "Zara Sheikh", nationality: "Pakistan", doc: ["cnic", "00000-0000005-5"], address: "31 Cantt Road, Peshawar" },
  { key: "bilal", name: "Bilal Ahmed", nationality: "Pakistan", doc: ["cnic", "00000-0000006-6"], address: "House 3, Satellite Town, Rawalpindi" },
  { key: "mahnoor", name: "Mahnoor Riaz", nationality: "Pakistan", doc: ["cnic", "00000-0000007-7"], address: "12 Garden Town, Multan" },
  { key: "fatima", name: "Fatima Noor", nationality: "Pakistan", doc: ["cnic", "00000-0000008-8"], address: "45 Jinnah Avenue, Quetta" },
  { key: "ali", name: "Ali Raza", nationality: "Pakistan", doc: ["cnic", "00000-0000009-9"], address: "7 University Road, Hyderabad" },
  { key: "daniel", name: "Daniel Brooks", nationality: "United Kingdom", doc: ["passport", "DEMO100001"], address: "18 Elm Street, Manchester, United Kingdom" },
  { key: "sofia", name: "Sofia Rossi", nationality: "Italy", doc: ["passport", "DEMO100002"], address: "Via Roma 21, Milan, Italy" },
  { key: "kenji", name: "Kenji Sato", nationality: "Japan", doc: ["passport", "DEMO100003"], address: "2-4-1 Shibuya, Tokyo, Japan" },
].map((guest, index) => ({ ...guest, phone: `+92300000${String(2001 + index)}` }));

const emailOf = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${DOMAIN}`;

// ----------------------------------------------------------------- rooms --

// Rooms that already exist in the development database are used only for
// past and future stays, so their status never needs to change. New demo
// rooms carry the status that matches their stays.
const EXISTING_ROOMS = ["101", "102", "205", "206", "307"];

const NEW_ROOMS = [
  { roomNumber: "103", name: "Serene Poolside Room", type: "Serene Room", pricePerNight: 26500, capacity: 2, bedType: "Queen bed", floor: 1, status: "occupied",
    description: "A bright room a few steps from the pool, with a shaded seating area.", amenities: ["Wi-Fi", "Pool access", "Rain shower", "Tea and coffee"] },
  { roomNumber: "104", name: "Serene Family Room", type: "Serene Room", pricePerNight: 29500, capacity: 3, bedType: "King bed and sofa bed", floor: 1, status: "cleaning", cleaning: "started",
    description: "A larger Serene room with a sofa bed for a child or a third guest.", amenities: ["Wi-Fi", "Sofa bed", "Bathtub", "Tea and coffee"] },
  { roomNumber: "201", name: "Serene Skyline Room", type: "Serene Room", pricePerNight: 28000, capacity: 2, bedType: "King bed", floor: 2, status: "available", cleaned: 1,
    description: "A quiet second-floor room looking out over the city skyline.", amenities: ["Wi-Fi", "City view", "Rain shower", "Writing desk"] },
  { roomNumber: "207", name: "Signature Garden Suite", type: "Signature Suite", pricePerNight: 42000, capacity: 3, bedType: "King bed", floor: 2, status: "occupied",
    description: "A suite with a sitting room opening onto the hotel gardens.", amenities: ["Wi-Fi", "Living room", "Garden view", "Soaking tub"] },
  { roomNumber: "301", name: "Signature Panorama Suite", type: "Signature Suite", pricePerNight: 47500, capacity: 4, bedType: "King bed and two singles", floor: 3, status: "cleaning",
    description: "A corner suite with windows on two sides and room for a family of four.", amenities: ["Wi-Fi", "Living room", "Panoramic view", "Soaking tub", "Minibar"] },
  { roomNumber: "308", name: "Royal Heritage Residence", type: "Royal Residence", pricePerNight: 72000, capacity: 5, bedType: "2 King beds", floor: 3, status: "maintenance",
    description: "A residence furnished with local craftsmanship, with a dining room and two bedrooms.", amenities: ["Wi-Fi", "Dining room", "Two bedrooms", "Butler service"] },
  { roomNumber: "401", name: "Royal Penthouse Residence", type: "Royal Residence", pricePerNight: 95000, capacity: 6, bedType: "3 King beds", floor: 4, status: "occupied",
    description: "The top-floor residence: three bedrooms, a private terrace and a butler on call.", amenities: ["Wi-Fi", "Private terrace", "Three bedrooms", "Butler service", "Kitchenette"] },
  { roomNumber: "402", name: "Signature Executive Suite", type: "Signature Suite", pricePerNight: 45000, capacity: 3, bedType: "King bed", floor: 4, status: "available", cleaned: 2,
    description: "A suite with a separate study, suited to longer business stays.", amenities: ["Wi-Fi", "Study", "Espresso machine", "City view"] },
];

// -------------------------------------------------------------- bookings --
// Days are relative to the hotel's today when the record is first created.
// pay: list of [share of total (0-1) or amount, method].

const BOOKINGS = [
  { key: "B01", guest: "amina", room: "205", from: -40, to: -37, guests: 2, status: "checked-out", pay: [[1, "card"]] },
  { key: "B02", guest: "omar", room: "307", from: -35, to: -31, guests: 4, status: "checked-out", pay: [[1, "bank-transfer"]], charges: [["Airport transfer", 6500, 1]] },
  { key: "B03", guest: "daniel", room: "101", from: -28, to: -24, guests: 1, status: "checked-out", pay: [[1, "card"]], charges: [["Laundry service", 2500, 2]] },
  { key: "B04", guest: "hina", room: "206", from: -21, to: -18, guests: 2, status: "checked-out", pay: [[1, "cash"]] },
  { key: "B05", guest: "kenji", room: "308", from: -16, to: -12, guests: 3, status: "checked-out", pay: [[1, "card"]], charges: [["Spa treatment", 12000, 1]] },
  { key: "B06", guest: "fatima", room: "102", from: -10, to: -8, guests: 2, status: "checked-out", pay: [[1, "cash"]] },
  { key: "B07", guest: "bilal", room: "402", from: -7, to: -4, guests: 2, status: "checked-out", pay: [[1, "card"]], charges: [["Room service dinner", 8500, 1]] },
  { key: "B08", guest: "zara", room: "104", from: -3, to: 0, guests: 3, status: "checked-out", pay: [[0.5, "card"], [1, "cash"]] },
  { key: "B09", guest: "ali", room: "301", from: -2, to: 0, guests: 4, status: "checked-out", pay: [[1, "bank-transfer"]] },
  { key: "B10", guest: "mahnoor", room: "103", from: -2, to: 2, guests: 2, status: "checked-in", pay: [[30000, "card"]] },
  { key: "B11", guest: "sofia", room: "207", from: -1, to: 3, guests: 2, status: "checked-in", pay: [[50000, "card"]], charges: [["City tour", 9000, 2]] },
  { key: "B12", guest: "tariq", room: "401", from: -3, to: 1, guests: 5, status: "checked-in", pay: [[1, "bank-transfer"]], charges: [["Room service breakfast", 4500, 3]] },
  { key: "B13", guest: "omar", room: "205", from: 0, to: 2, guests: 2, status: "confirmed", pay: [] },
  { key: "B14", guest: "amina", room: "201", from: 1, to: 4, guests: 2, status: "confirmed", pay: [[25000, "bank-transfer"]] },
  { key: "B15", guest: "hina", room: "307", from: 5, to: 8, guests: 3, status: "confirmed", pay: [[60000, "card"]] },
  { key: "B16", guest: "daniel", room: "402", from: 7, to: 10, guests: 1, status: "confirmed", pay: [] },
  { key: "B17", guest: "kenji", room: "101", from: 14, to: 17, guests: 2, status: "pending", pay: [] },
  { key: "B18", guest: "daniel", room: "104", from: 20, to: 23, guests: 2, status: "pending", pay: [] },
  { key: "B19", guest: "ali", room: "205", from: 9, to: 11, guests: 2, status: "cancelled", pay: [] },
];

const FEEDBACK = [
  { key: "F01", booking: "B01", rating: 5, title: "A wonderful anniversary stay", message: "The suite was spotless and the staff remembered our anniversary with flowers in the room.", sub: [5, 5, 5], reviewed: true },
  { key: "F02", booking: "B02", rating: 4, title: "Comfortable family trip", message: "Plenty of space for the four of us. Breakfast was excellent; the airport pick-up was a little late.", sub: [5, 4, 4], reviewed: true },
  { key: "F03", booking: "B04", rating: 5, title: "Quiet and relaxing", message: "Exactly what I needed after a busy month. The terrace was lovely in the evening.", sub: [5, 5, 5], reviewed: false },
  { key: "F04", booking: "B07", rating: 3, title: "Good room, slow service", message: "The suite was very comfortable, but room service took almost an hour one evening.", sub: [4, 2, 4], reviewed: false },
];

const MAINTENANCE = [
  { key: "M01", room: "308", issueTitle: "Air conditioning not cooling", description: "The bedroom unit runs but blows warm air. Reported after the last guest checked out.", priority: "high", status: "pending", reportedBy: "hk1", day: -1 },
  { key: "M02", room: "206", issueTitle: "Bathroom tap dripping", description: "The basin tap drips steadily even when fully closed.", priority: "low", status: "completed", reportedBy: "hk2", day: -19, completedBy: "hk2", resolutionNote: "Replaced the cartridge and tested; no further drip." },
  { key: "M03", room: "402", issueTitle: "Television not responding to remote", description: "The living-room television ignores the remote control.", priority: "medium", status: "completed", reportedBy: "desk1", day: -5, completedBy: "hk1", resolutionNote: "Replaced the remote's batteries and re-paired it with the television." },
];

const CONTACTS = [
  { key: "C01", name: "Sara Ahmed", enquiryType: "Dining", message: "Do you have a table for six at the rooftop restaurant on Friday evening?", status: "new", day: 0 },
  { key: "C02", name: "Kamran Javed", enquiryType: "Room Reservation", message: "We are planning a family wedding in December and need eight rooms for three nights. Could you share group rates?", status: "read", day: -2 },
  { key: "C03", name: "Laila Hassan", enquiryType: "Spa & Wellness", message: "Is the spa open to visitors who are not staying at the hotel?", status: "resolved", day: -6 },
  { key: "C04", name: "James Carter", enquiryType: "Private Transfer", message: "I arrive at the airport at 02:30 next Tuesday. Can you arrange a car to the hotel?", status: "new", day: -1 },
];

// ------------------------------------------------------------------ run --

const added = {};
const count = (collection) => (added[collection] = (added[collection] || 0) + 1);
const skipped = [];

const refuse = (reason) => {
  console.error(`Refused: ${reason} Nothing was written.`);
  process.exitCode = 1;
};

const guard = (name) => (name !== DEV_DB ? `The database is "${name}", not "${DEV_DB}".` : refusalFor(name));

const atHour = (day, hour, now) => new Date(Math.min(day.getTime() + hour * HOUR, now.getTime() - HOUR));

const seed = async () => {
  const { errors } = validateEnv();
  if (errors.length > 0) {
    errors.forEach((message) => console.error(message));
    process.exitCode = 1;
    return;
  }

  // First check, before connecting: a refused run never touches the database.
  const configured = databaseInUri(env.MONGO_URI);
  const early = guard(configured);
  if (early) {
    console.log(`Configured database: ${configured || "(unknown)"}`);
    refuse(early);
    return;
  }

  try {
    await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });

    // Second check, on the live connection, immediately before any write.
    const connected = mongoose.connection.db.databaseName;
    console.log(`Connected database: ${connected}`);
    const reason = guard(connected);
    if (reason) {
      refuse(reason);
      return;
    }

    const now = new Date();
    const today = hotelToday(now);
    const settings = await getSettings();

    // --- accounts
    const wanted = [
      ...STAFF.map((person) => ({ ...person, email: emailOf(person.name) })),
      ...GUESTS.map((person) => ({ ...person, role: "guest", email: emailOf(person.name) })),
    ];
    const existing = new Map(
      (await User.find({ email: { $in: wanted.map((person) => person.email) } }).select("email role").lean())
        .map((user) => [user.email, user])
    );

    const missing = wanted.filter((person) => !existing.has(person.email));
    let hash = null;
    if (missing.length > 0) {
      const parsed = passwordRule.safeParse(process.env.SEED_DEMO_PASSWORD || "");
      if (!parsed.success) {
        refuse("SEED_DEMO_PASSWORD must be set (at least 8 characters, with a letter and a number) to create the demo accounts.");
        return;
      }
      hash = await bcrypt.hash(parsed.data, 12);
    }

    const people = {};
    for (const person of wanted) {
      let user = existing.get(person.email);
      if (!user) {
        user = await User.create({
          _id: idFor(`user:${person.key}`),
          name: person.name,
          email: person.email,
          phone: person.phone,
          password: hash,
          role: person.role,
          createdAt: addDays(today, person.role === "guest" ? -60 : -90),
        });
        count("users");
      } else if (user.role !== person.role) {
        skipped.push(`account ${person.email} exists with role ${user.role}; its bookings are skipped`);
        continue;
      }
      people[person.key] = { ...person, _id: user._id };
    }

    // --- rooms
    const rooms = {};
    for (const room of await Room.find({ roomNumber: { $in: EXISTING_ROOMS } }).lean()) {
      rooms[room.roomNumber] = room;
    }

    for (const spec of NEW_ROOMS) {
      const id = idFor(`room:${spec.roomNumber}`);
      const current = await Room.findOne({ roomNumber: spec.roomNumber }).lean();
      if (current && !current._id.equals(id)) {
        skipped.push(`room ${spec.roomNumber} already exists and is not a demo room; its stays are skipped`);
        continue;
      }
      if (!current) {
        const { cleaning, cleaned, ...fields } = spec;
        await Room.create({
          _id: id,
          ...fields,
          cleaningStartedAt: cleaning === "started" ? atHour(today, 7, now) : null,
          cleaningBy: cleaning === "started" ? people.hk1?._id || null : null,
          lastCleanedAt: cleaned ? atHour(addDays(today, -cleaned), 9, now) : null,
          lastCleanedBy: cleaned ? people.hk2?._id || null : null,
        });
        count("rooms");
      }
      rooms[spec.roomNumber] = await Room.findById(id).lean();
    }

    // --- bookings, in date order so invoice numbers follow the calendar
    const bookingIds = {};
    for (const spec of BOOKINGS) {
      const id = idFor(`booking:${spec.key}`);
      bookingIds[spec.key] = id;
      if (await Booking.exists({ _id: id })) continue;

      const guest = people[spec.guest];
      const room = rooms[spec.room];
      const desk = people.desk1 || people.desk2;
      if (!guest || !room || !desk) {
        skipped.push(`booking ${spec.key}: its guest, room or receptionist is unavailable`);
        continue;
      }
      if (spec.guests > room.capacity) {
        skipped.push(`booking ${spec.key}: too many guests for room ${spec.room}`);
        continue;
      }

      const checkIn = addDays(today, spec.from);
      const checkOut = addDays(today, spec.to);
      const [documentType, documentNumber] = guest.doc;
      const online = spec.status === "pending";
      const active = ["pending", "confirmed", "checked-in"].includes(spec.status);
      const createdAt = new Date(Math.min(addDays(checkIn, -6).getTime(), now.getTime() - (spec.to - spec.from) * HOUR));

      // The same ledgers a real reservation goes through.
      const key = documentKey(documentType, documentNumber);
      if (!(await bindDocument(key, guest._id))) {
        skipped.push(`booking ${spec.key}: document ${documentType} belongs to another account`);
        continue;
      }
      if (active) {
        if (!(await claimNights(room._id, id, checkIn, checkOut))) {
          skipped.push(`booking ${spec.key}: room ${spec.room} is already taken on those nights`);
          continue;
        }
        if (!(await claimIdentityNights(key, id, checkIn, checkOut))) {
          await releaseNights(id);
          skipped.push(`booking ${spec.key}: the guest already has a stay on those nights`);
          continue;
        }
      }

      const booking = new Booking({
        _id: id,
        guest: guest._id,
        room: room._id,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        numberOfGuests: spec.guests,
        guestDetails: {
          fullName: guest.name,
          phone: guest.phone,
          email: guest.email,
          address: guest.address,
          nationality: guest.nationality,
          documentType,
          documentNumber,
          emergencyContact: `+92300000${String(3000 + Number(spec.key.slice(1)))}`,
        },
        totalNights: nightsBetween(checkIn, checkOut),
        pricePerNight: room.pricePerNight,
        taxRate: settings.taxRate,
        totalAmount: 0,
        createdBy: online ? guest._id : desk._id,
        identityCheck: online
          ? { status: "not-applicable", detail: "Passports are reviewed by staff; there is no automatic check.", checkedAt: createdAt }
          : { status: "not-applicable", detail: "Document inspected in person at the front desk.", checkedAt: createdAt },
        bookingStatus: spec.status,
        createdAt,
      });

      if (!online) {
        booking.verificationStatus = "verified";
        booking.verificationMethod = "staff-in-person";
        booking.verifiedBy = desk._id;
        booking.verifiedAt = createdAt;
      }

      for (const [description, amount, quantity] of spec.charges || []) {
        booking.charges.push({ description, amount, quantity, addedBy: desk._id, addedAt: atHour(addDays(checkIn, 1), 12, now) });
      }
      applyTotals(booking);

      if (spec.status === "checked-in" || spec.status === "checked-out") {
        booking.checkedInAt = atHour(checkIn, 10, now);
        booking.checkedInBy = desk._id;
      }
      if (spec.status === "checked-out") {
        booking.checkedOutAt = atHour(checkOut, 6, now);
        booking.checkedOutBy = people.desk2?._id || desk._id;
      }
      if (spec.status === "cancelled") {
        booking.cancelledAt = addDays(createdAt, 1);
        booking.cancelledBy = guest._id;
        booking.cancellationReason = "Travel plans changed.";
      }

      // Payments: a share of the total (<= 1) or a fixed amount, paid in order.
      let paid = 0;
      spec.pay.forEach(([share, method], index) => {
        const target = share <= 1 ? Math.round(booking.totalAmount * share) : share;
        const amount = Math.min(target, booking.totalAmount) - paid;
        if (amount <= 0) return;
        const receivedAt =
          spec.status === "confirmed"
            ? atHour(addDays(createdAt, 0), 2, now)
            : index === spec.pay.length - 1 && spec.status === "checked-out"
              ? atHour(checkOut, 5, now)
              : atHour(checkIn, 10, now);
        booking.payments.push({
          amount,
          method,
          reference: method === "cash" ? "" : `${method === "card" ? "POS" : "IBFT"}-DEMO-${spec.key}-${index + 1}`,
          receivedBy: desk._id,
          receivedAt,
        });
        paid += amount;
        booking.paymentMethod = method;
        booking.paymentDate = receivedAt;
        booking.transactionReference = booking.payments.at(-1).reference;
      });
      booking.amountPaid = paid;
      booking.paymentStatus = paymentStatusFor(paid, booking.totalAmount);

      try {
        await booking.save();
      } catch (error) {
        if (active) await releaseNights(id);
        throw error;
      }
      count("bookings");

      if (["confirmed", "checked-in", "checked-out"].includes(spec.status)) await ensureInvoiceNumber(booking);
    }

    // --- reviews
    for (const spec of FEEDBACK) {
      const id = idFor(`feedback:${spec.key}`);
      const booking = await Booking.findById(bookingIds[spec.booking]).select("guest room bookingStatus checkOutDate").lean();
      if (!booking || booking.bookingStatus !== "checked-out") continue;
      if (await Feedback.exists({ $or: [{ _id: id }, { booking: booking._id }] })) continue;
      const createdAt = atHour(addDays(booking.checkOutDate, 1), 8, now);
      await Feedback.create({
        _id: id,
        guest: booking.guest,
        booking: booking._id,
        room: booking.room,
        rating: spec.rating,
        title: spec.title,
        message: spec.message,
        cleanlinessRating: spec.sub[0],
        serviceRating: spec.sub[1],
        roomRating: spec.sub[2],
        status: spec.reviewed ? "reviewed" : "new",
        reviewedBy: spec.reviewed ? people.manager?._id || null : null,
        reviewedAt: spec.reviewed ? addDays(createdAt, 1) : null,
        createdAt,
      });
      count("feedbacks");
    }

    // --- maintenance
    for (const spec of MAINTENANCE) {
      const id = idFor(`maintenance:${spec.key}`);
      const room = rooms[spec.room];
      const reporter = people[spec.reportedBy];
      if (!room || !reporter || (await Maintenance.exists({ _id: id }))) continue;
      const createdAt = atHour(addDays(today, spec.day), 9, now);
      const done = spec.status === "completed";
      await Maintenance.create({
        _id: id,
        room: room._id,
        issueTitle: spec.issueTitle,
        description: spec.description,
        priority: spec.priority,
        status: spec.status,
        reportedBy: reporter._id,
        startedAt: done ? addDays(createdAt, 0.1) : null,
        startedBy: done ? people[spec.completedBy]?._id || null : null,
        completedAt: done ? addDays(createdAt, 0.25) : null,
        completedBy: done ? people[spec.completedBy]?._id || null : null,
        resolutionNote: spec.resolutionNote || "",
        createdAt,
      });
      count("maintenances");
    }

    // --- enquiries
    for (const spec of CONTACTS) {
      const id = idFor(`contact:${spec.key}`);
      if (await Contact.exists({ _id: id })) continue;
      await Contact.create({
        _id: id,
        name: spec.name,
        email: emailOf(spec.name),
        enquiryType: spec.enquiryType,
        message: spec.message,
        status: spec.status,
        createdAt: atHour(addDays(today, spec.day), 6, now),
      });
      count("contacts");
    }

    const summary = Object.entries(added).map(([name, value]) => `${name} +${value}`).join(", ");
    console.log(`Demo records added: ${summary || "none (everything was already present)"}.`);
    skipped.forEach((line) => console.log(`Skipped: ${line}`));
  } catch (error) {
    console.error("Seeding failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
};

seed();
