const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");

const Booking = require("../models/Booking");
const Room = require("../models/Room");
const User = require("../models/User");
const { env } = require("../config/env");
const { can } = require("../config/permissions");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const {
  upload,
  uploadedFiles,
  removeUploads,
  hasValidSignature,
  resolveDocumentPath,
  protectFile,
  readDocument,
  contentTypeOf,
  unsupported,
} = require("../middleware/uploadMiddleware");
const {
  checkCnic,
  findActiveWithDocument,
  DISCLAIMER,
  NEEDS_REVIEW,
} = require("../services/identityCheck");
const logger = require("../utils/logger");
const {
  documentKey,
  bindDocument,
  claimIdentityNights,
} = require("../services/identityLedger");
const {
  claimNights,
  releaseNights,
  findUnavailableRoomIds,
  newBookingId,
} = require("../services/availability");
const { getSettings, toPublicSettings } = require("../services/settings");
const { ensureInvoiceNumber } = require("../services/invoices");
const { notify, FRONT_DESK_ROLES, OPERATIONS_ROLES } = require("../services/notify");
const { applyTotals, paymentStatusFor, balanceOf, folioOf, round2 } = require("../utils/billing");
const { hotelToday, addDays, nightsBetween, toDateOnly } = require("../utils/dates");
const { HttpError, badRequest, conflict, forbidden, notFound } = require("../utils/httpError");
const {
  z,
  objectId,
  idParams,
  text,
  optionalText,
  personName,
  email,
  phone,
  dateOnly,
  optionalDateOnly,
  money,
  wholeNumber,
  pagination,
  search,
  escapeRegex,
} = require("../utils/schemas");

const { BOOKING_STATUSES, ACTIVE_STATUSES, BILLABLE_STATUSES, PAYMENT_METHODS } = Booking;

const router = express.Router();

router.use(protect);

const ROOM_FIELDS = "roomNumber name type pricePerNight capacity bedType floor status isActive";

const populateBooking = (query) =>
  query
    .populate("guest", "name email phone isActive")
    .populate("room", ROOM_FIELDS)
    .populate("verifiedBy checkedInBy checkedOutBy cancelledBy", "name role")
    .populate("payments.receivedBy charges.addedBy", "name");

// The shape sent to clients. Stored document paths never leave the server;
// the client only learns whether a document exists.
const serialize = (booking) => {
  const data = typeof booking.toObject === "function" ? booking.toObject() : { ...booking };
  const details = { ...(data.guestDetails || {}) };

  data.documents = {
    front: Boolean(details.documentFront),
    back: Boolean(details.documentBack),
  };
  delete details.documentFront;
  delete details.documentBack;
  data.guestDetails = details;

  // Always sent with its limits spelled out, so no client can present a
  // number match as an official verification.
  data.identityCheck = {
    status: "not-applicable",
    extractedNumber: "",
    detail: "",
    checkedAt: null,
    ...(data.identityCheck || {}),
    disclaimer: DISCLAIMER,
  };

  data.folio = folioOf(data);
  data.balance = data.folio.balance;
  delete data.__v;

  return data;
};

const loadBooking = async (id) => {
  const booking = await Booking.findById(id);
  if (!booking) throw notFound("Booking not found.");
  return booking;
};

const respondWith = async (res, booking, message, status = 200) => {
  const fresh = await populateBooking(Booking.findById(booking._id));
  res.status(status).json({ success: true, message, booking: serialize(fresh) });
};

const isOwner = (booking, user) => String(booking.guest?._id || booking.guest) === String(user._id);

// A guest who asks for someone else's booking gets the same answer as for a
// booking that does not exist.
const assertCanView = (booking, user) => {
  if (can(user.role, "bookings:view")) return;
  if (can(user.role, "bookings:own") && isOwner(booking, user)) return;
  throw notFound("Booking not found.");
};

const formatMoney = (settings, amount) =>
  `${settings.currencySymbol} ${round2(amount).toLocaleString("en-US")}`;

/* ---------- Schemas ---------- */

const guestDetailsSchema = z
  .strictObject({
    fullName: personName,
    phone,
    email,
    address: text("Address", 5, 200),
    nationality: text("Nationality", 2, 60),
    documentType: z.enum(["cnic", "passport"], { error: "Invalid identity document type." }),
    documentNumber: z
      .string({ error: "Document number is required." })
      .trim()
      .toUpperCase()
      .min(5, "Document number is too short.")
      .max(20, "Document number is too long."),
    emergencyContact: phone,
    vehicleNumber: optionalText("Vehicle number", 20),
  })
  .superRefine((details, context) => {
    const valid =
      details.documentType === "cnic"
        ? /^\d{5}-?\d{7}-?\d$/.test(details.documentNumber)
        : /^[A-Z0-9]{6,12}$/.test(details.documentNumber);

    if (!valid) {
      context.addIssue({
        code: "custom",
        path: ["documentNumber"],
        message:
          details.documentType === "cnic"
            ? "CNIC must be 13 digits, for example 42101-1234567-1."
            : "Passport number must be 6 to 12 letters and digits.",
      });
    }
  });

const createSchema = z.strictObject({
  roomId: objectId,
  checkInDate: dateOnly("Check-in date"),
  checkOutDate: dateOnly("Check-out date"),
  numberOfGuests: wholeNumber("Number of guests", 1, 12),
  specialRequests: optionalText("Special requests", 600),
  guestDetails: guestDetailsSchema,
  // Front desk only: an explicit, recorded decision to give the same guest a
  // second stay over the same dates with one document.
  allowSameDocumentOverlap: z.enum(["true", "false"]).optional(),
});

const editSchema = z
  .strictObject({
    roomId: objectId.optional(),
    checkInDate: dateOnly("Check-in date").optional(),
    checkOutDate: dateOnly("Check-out date").optional(),
    numberOfGuests: wholeNumber("Number of guests", 1, 12).optional(),
    specialRequests: z.string().trim().max(600, "Special requests are too long.").optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No changes were provided." });

const availabilitySchema = z.strictObject({
  checkInDate: dateOnly("Check-in date"),
  checkOutDate: dateOnly("Check-out date"),
  guests: wholeNumber("Number of guests", 1, 12),
  excludeBookingId: objectId.optional(),
});

const statusList = z
  .string()
  .trim()
  .optional()
  .default("")
  .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
  .refine((items) => items.every((item) => BOOKING_STATUSES.includes(item)), {
    message: "Invalid booking status filter.",
  });

const listSchema = z.strictObject({
  ...pagination,
  search,
  status: statusList,
  payment: z.enum(["all", "unpaid", "partial", "paid"]).optional().default("all"),
  view: z.enum(["all", "arrivals", "departures", "inhouse", "billable"]).optional().default("all"),
  from: optionalDateOnly("From date"),
  to: optionalDateOnly("To date"),
  sort: z.enum(["newest", "checkin", "checkout"]).optional().default("newest"),
});

const noteSchema = z.strictObject({ note: optionalText("Note", 300) });
const reasonSchema = z.strictObject({ reason: optionalText("Reason", 300) });

const paymentSchema = z
  .strictObject({
    amount: money("Payment amount", { min: 0.01 }),
    paymentMethod: z.enum(PAYMENT_METHODS, { error: "Please select a valid payment method." }),
    transactionReference: optionalText("Transaction reference", 80),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9-]{8,64}$/, "Invalid request id.")
      .optional()
      .default(""),
  })
  .refine((data) => data.paymentMethod === "cash" || data.transactionReference.length > 0, {
    message: "Transaction reference is required for card and bank transfer payments.",
    path: ["transactionReference"],
  });

const chargeSchema = z.strictObject({
  description: text("Description", 2, 120),
  amount: money("Amount", { min: 0.01, max: 10000000 }),
  quantity: wholeNumber("Quantity", 1, 100).optional().default(1),
});

const discountSchema = z.strictObject({
  amount: money("Discount", { min: 0, max: 100000000 }),
  reason: optionalText("Reason", 160),
});

const chargeParams = z.strictObject({ id: objectId, chargeId: objectId });
const documentParams = z.strictObject({ id: objectId, side: z.enum(["front", "back"]) });

/* ---------- Stay rules ---------- */

const assertValidStay = (checkIn, checkOut, settings, { allowPastCheckIn = false } = {}) => {
  if (checkOut <= checkIn) {
    throw badRequest("Check-out date must be after check-in date.");
  }

  const today = hotelToday();

  if (!allowPastCheckIn && checkIn < today) {
    throw badRequest("Check-in date cannot be in the past.");
  }

  if (checkIn > addDays(today, env.MAX_ADVANCE_DAYS)) {
    throw badRequest(`Reservations can be made up to ${env.MAX_ADVANCE_DAYS} days in advance.`);
  }

  const nights = nightsBetween(checkIn, checkOut);
  if (nights > settings.maxStayNights) {
    throw badRequest(`A single stay can be at most ${settings.maxStayNights} nights.`);
  }

  return nights;
};

const assertRoomBookable = (room, guests) => {
  if (!room || !room.isActive) {
    throw notFound("The selected room is not available.");
  }

  if (room.status === "maintenance") {
    throw conflict("This room is under maintenance and cannot be booked.");
  }

  if (guests > room.capacity) {
    throw badRequest(`This room allows a maximum of ${room.capacity} guests.`);
  }
};

const ROOM_TAKEN = "This room is already booked for the selected dates.";

/* ---------- Availability ---------- */

router.get(
  "/availability",
  requirePermission("bookings:own", "bookings:create", "bookings:edit"),
  validate({ query: availabilitySchema }),
  async (req, res) => {
    const { checkInDate, checkOutDate, guests, excludeBookingId } = req.valid.query;
    const settings = await getSettings();

    assertValidStay(checkInDate, checkOutDate, settings, {
      allowPastCheckIn: Boolean(excludeBookingId),
    });

    const rooms = await Room.find({
      isActive: true,
      capacity: { $gte: guests },
      status: { $ne: "maintenance" },
    })
      .select("roomNumber name type description amenities pricePerNight capacity bedType floor status")
      .sort({ pricePerNight: 1, roomNumber: 1 });

    const unavailable = await findUnavailableRoomIds(
      rooms.map((room) => room._id),
      checkInDate,
      checkOutDate,
      excludeBookingId
    );

    const available = rooms.filter((room) => !unavailable.has(String(room._id)));
    const nights = nightsBetween(checkInDate, checkOutDate);

    res.json({
      success: true,
      count: available.length,
      rooms: available,
      search: {
        checkInDate: toDateOnly(checkInDate),
        checkOutDate: toDateOnly(checkOutDate),
        guests,
        nights,
      },
      taxRate: settings.taxRate,
    });
  }
);

/* ---------- Create ---------- */

const parseCreateBody = (body) => {
  const raw = { ...body };

  if (typeof raw.guestDetails === "string") {
    try {
      raw.guestDetails = JSON.parse(raw.guestDetails);
    } catch {
      throw badRequest("Guest details could not be read.");
    }
  }

  const result = createSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || undefined,
      message:
        issue.code === "unrecognized_keys"
          ? `Unexpected field: ${issue.keys.join(", ")}.`
          : issue.message,
    }));
    throw badRequest(issues[0].message, issues);
  }

  return result.data;
};

// Finds the guest account a member of staff is booking for, creating one when
// the guest has never registered. The new account gets an unusable random
// password; the guest sets their own through "Forgot password".
const resolveGuestAccount = async (details, staff) => {
  const existing = await User.findOne({ email: details.email });

  if (existing) {
    if (existing.role !== "guest") {
      throw conflict("This email belongs to a staff account and cannot hold a reservation.");
    }
    if (existing.isActive === false) {
      throw conflict("This guest account has been deactivated.");
    }
    return existing;
  }

  return User.create({
    name: details.fullName,
    email: details.email,
    phone: details.phone,
    password: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12),
    role: "guest",
    createdBy: staff._id,
  });
};

const DOCUMENT_IN_USE =
  "This identity document is already used on another account's reservation. Please contact the front desk.";
const DUPLICATE_STAY =
  "A reservation made with this identity document already covers these dates.";
const DUPLICATE_STAY_DESK =
  "A reservation made with this identity document already covers these dates. If the guest is taking another room, confirm that explicitly.";
const UPLOADS_UNAVAILABLE =
  "Identity documents cannot be accepted right now because document encryption is not configured. Please contact the hotel.";

// One document, one guest account; and one document cannot hold two stays
// over the same dates unless the front desk explicitly approves it. These
// queries also cover reservations made before the identity ledger existed.
const documentClash = (others, guest, stay, overlapApproved) => {
  for (const other of others) {
    if (String(other.guest) !== String(guest._id)) return DOCUMENT_IN_USE;
    if (!overlapApproved && other.checkInDate < stay.checkOut && other.checkOutDate > stay.checkIn) {
      return DUPLICATE_STAY;
    }
  }
  return "";
};

router.post(
  "/",
  requirePermission("bookings:own", "bookings:create"),
  upload.fields([
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
  ]),
  async (req, res) => {
    const bookingId = newBookingId();
    let claimed = false;

    try {
      // New documents are never stored unencrypted.
      if (uploadedFiles(req).length > 0 && !env.DOCUMENT_KEY) {
        throw new HttpError(503, UPLOADS_UNAVAILABLE);
      }

      const data = parseCreateBody(req.body);
      const byStaff = can(req.user.role, "bookings:create");
      const allowOverlap = data.allowSameDocumentOverlap === "true";

      if (allowOverlap && !byStaff) {
        throw forbidden("Only the front desk can approve a second stay with the same document.");
      }

      const front = req.files?.documentFront?.[0];
      const back = req.files?.documentBack?.[0];

      // Guests booking online must attach their identity document. At the
      // front desk the document is inspected in person, so uploads are optional.
      if (!byStaff) {
        if (!front) {
          throw badRequest(
            data.guestDetails.documentType === "cnic"
              ? "Please upload the front of your CNIC."
              : "Please upload a copy of your passport."
          );
        }
        if (data.guestDetails.documentType === "cnic" && !back) {
          throw badRequest("Please upload the back of your CNIC.");
        }
      }

      for (const file of uploadedFiles(req)) {
        if (!(await hasValidSignature(file))) throw unsupported();
      }

      const settings = await getSettings();
      const nights = assertValidStay(data.checkInDate, data.checkOutDate, settings);

      const room = await Room.findById(data.roomId);
      assertRoomBookable(room, data.numberOfGuests);

      const guest = byStaff ? await resolveGuestAccount(data.guestDetails, req.user) : req.user;

      const { documentType, documentNumber } = data.guestDetails;
      const stay = { checkIn: data.checkInDate, checkOut: data.checkOutDate };

      const inUse = documentClash(
        await findActiveWithDocument(documentType, documentNumber),
        guest,
        stay,
        allowOverlap
      );
      if (inUse) throw conflict(inUse === DUPLICATE_STAY && byStaff ? DUPLICATE_STAY_DESK : inUse);

      // The automatic check compares the typed CNIC number with the number
      // read from the image. It runs for CNICs uploaded by guests; a passport
      // or a document shown at the desk is reviewed by a person instead.
      let identity;
      if (byStaff) {
        identity = { status: "not-applicable", extractedNumber: "", detail: "Document inspected in person at the front desk." };
      } else if (documentType !== "cnic") {
        identity = { status: "not-applicable", extractedNumber: "", detail: "Passports are reviewed by staff; there is no automatic check." };
      } else {
        identity = await checkCnic({ documentNumber, files: [front, back] });
      }
      const matched = identity.status === "number-matched";
      const key = documentKey(documentType, documentNumber);

      // Read first, then sealed: the files are encrypted where they lie.
      for (const file of uploadedFiles(req)) await protectFile(file);

      // The unique night index decides who gets the room. Everything before
      // this line is advisory; this is the step that cannot be raced.
      claimed = await claimNights(room._id, bookingId, data.checkInDate, data.checkOutDate);
      if (!claimed) throw conflict(ROOM_TAKEN);

      // Reservations made before the night ledger existed are covered by the
      // classic overlap query as well.
      const legacy = await findUnavailableRoomIds(
        [room._id],
        data.checkInDate,
        data.checkOutDate,
        bookingId
      );
      if (legacy.size > 0) throw conflict(ROOM_TAKEN);

      // Index-backed identity rules, decided by MongoDB rather than by the
      // query above: the document belongs to one account, and (unless the
      // front desk approved a second stay) holds each night once.
      if (!(await bindDocument(key, guest._id))) throw conflict(DOCUMENT_IN_USE);

      if (!allowOverlap && !(await claimIdentityNights(key, bookingId, data.checkInDate, data.checkOutDate))) {
        throw conflict(byStaff ? DUPLICATE_STAY_DESK : DUPLICATE_STAY);
      }

      // The room may have been taken out of service while we were working.
      assertRoomBookable(await Room.findById(room._id), data.numberOfGuests);

      const booking = new Booking({
        _id: bookingId,
        guest: guest._id,
        room: room._id,
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        numberOfGuests: data.numberOfGuests,
        guestDetails: {
          ...data.guestDetails,
          documentFront: front ? front.filename : "",
          documentBack: back ? back.filename : "",
        },
        totalNights: nights,
        // The server's own rate and tax are used; prices sent by a client are
        // not part of the schema.
        pricePerNight: room.pricePerNight,
        taxRate: settings.taxRate,
        totalAmount: 0,
        specialRequests: data.specialRequests,
        createdBy: req.user._id,
        identityCheck: { ...identity, checkedAt: new Date() },
        sameDocumentOverlapApprovedBy: allowOverlap ? req.user._id : null,
        // A reservation made at the desk is confirmed by the member of staff
        // who saw the document. An online request always waits for staff,
        // whatever the automatic number check found.
        ...(byStaff
          ? {
              bookingStatus: "confirmed",
              verificationStatus: "verified",
              verificationMethod: "staff-in-person",
              verifiedBy: req.user._id,
              verifiedAt: new Date(),
            }
          : {}),
      });

      applyTotals(booking);
      await booking.save();

      if (byStaff) await ensureInvoiceNumber(booking);

      const needsReview = NEEDS_REVIEW.includes(identity.status);

      if (byStaff) {
        await notify({
          user: guest._id,
          type: "booking",
          title: "Reservation confirmed",
          message: `Room ${room.roomNumber} is reserved for you from ${toDateOnly(data.checkInDate)} to ${toDateOnly(data.checkOutDate)}.`,
          entity: "booking",
          entityId: booking._id,
        });
      }

      if (!byStaff) {
        await notify({
          roles: FRONT_DESK_ROLES,
          type: "booking",
          title: needsReview ? "Reservation request needs identity review" : "New reservation request",
          message: `${data.guestDetails.fullName} requested room ${room.roomNumber} for ${nights} night${nights === 1 ? "" : "s"}. ${identity.detail}`,
          entity: "booking",
          entityId: booking._id,
        });
      }

      let message = "Booking request submitted successfully. Verification is pending.";
      if (byStaff) message = "Reservation created and confirmed.";
      else if (matched) {
        message =
          "Booking request submitted. The CNIC number you entered matched your uploaded image; a member of staff will review your document and confirm the reservation.";
      } else if (needsReview) {
        message =
          "Booking request submitted. The CNIC number could not be matched to your image automatically, so a member of staff will review your document.";
      }

      await respondWith(res, booking, message, 201);
    } catch (error) {
      if (claimed) await releaseNights(bookingId);
      await removeUploads(req);
      throw error;
    }
  }
);

/* ---------- Lists ---------- */

router.get("/my-bookings", requirePermission("bookings:own"), async (req, res) => {
  const bookings = await Booking.find({ guest: req.user._id })
    .populate("room", ROOM_FIELDS)
    .sort({ createdAt: -1 })
    .limit(200);

  res.json({
    success: true,
    count: bookings.length,
    bookings: bookings.map(serialize),
  });
});

router.get(
  "/",
  requirePermission("bookings:view"),
  validate({ query: listSchema }),
  async (req, res) => {
    const { page, limit, search: term, status, payment, view, from, to, sort } = req.valid.query;
    const today = hotelToday();
    const filter = {};

    if (status.length > 0) filter.bookingStatus = { $in: status };
    if (payment !== "all") filter.paymentStatus = payment;

    if (view === "arrivals") {
      filter.bookingStatus = "confirmed";
      filter.checkInDate = { $lte: today };
      filter.checkOutDate = { $gt: today };
    } else if (view === "departures") {
      filter.bookingStatus = "checked-in";
      filter.checkOutDate = { $lte: today };
    } else if (view === "inhouse") {
      filter.bookingStatus = "checked-in";
    } else if (view === "billable") {
      filter.$and = [
        {
          $or: [
            { bookingStatus: { $in: BILLABLE_STATUSES } },
            { bookingStatus: "cancelled", amountPaid: { $gt: 0 } },
          ],
        },
      ];
    }

    if (from || to) {
      if (from && to && to < from) {
        throw badRequest("The end date must be on or after the start date.");
      }
      filter.checkInDate = {
        ...(filter.checkInDate || {}),
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    if (term) {
      const pattern = new RegExp(escapeRegex(term), "i");
      const rooms = await Room.find({ $or: [{ roomNumber: pattern }, { name: pattern }] })
        .select("_id")
        .lean();

      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { "guestDetails.fullName": pattern },
            { "guestDetails.email": pattern },
            { "guestDetails.phone": pattern },
            { "guestDetails.documentNumber": pattern },
            { invoiceNumber: pattern },
            { room: { $in: rooms.map((room) => room._id) } },
          ],
        },
      ];
    }

    const order =
      sort === "checkin"
        ? { checkInDate: 1, createdAt: -1 }
        : sort === "checkout"
          ? { checkOutDate: 1, createdAt: -1 }
          : { createdAt: -1 };

    const [bookings, total] = await Promise.all([
      populateBooking(
        Booking.find(filter)
          .sort(order)
          .skip((page - 1) * limit)
          .limit(limit)
      ),
      Booking.countDocuments(filter),
    ]);

    res.json({
      success: true,
      total,
      page,
      limit,
      today: toDateOnly(today),
      bookings: bookings.map(serialize),
    });
  }
);

router.get("/:id", validate({ params: idParams }), async (req, res) => {
  const booking = await populateBooking(Booking.findById(req.valid.params.id));

  if (!booking) throw notFound("Booking not found.");
  assertCanView(booking, req.user);

  res.json({ success: true, booking: serialize(booking) });
});

/* ---------- Edit ---------- */

router.patch(
  "/:id",
  requirePermission("bookings:own", "bookings:edit"),
  validate({ params: idParams, body: editSchema }),
  async (req, res) => {
    const changes = req.valid.body;
    const booking = await loadBooking(req.valid.params.id);
    const byStaff = can(req.user.role, "bookings:edit");

    if (!byStaff) {
      if (!isOwner(booking, req.user)) throw notFound("Booking not found.");
      if (booking.bookingStatus !== "pending") {
        throw conflict(
          "Only reservations awaiting confirmation can be changed online. Please contact the front desk."
        );
      }
    }

    if (!ACTIVE_STATUSES.includes(booking.bookingStatus)) {
      throw conflict(`A ${booking.bookingStatus} reservation can no longer be changed.`);
    }

    const inHouse = booking.bookingStatus === "checked-in";

    if (inHouse && (changes.roomId || changes.checkInDate)) {
      throw conflict("Only the check-out date can be changed after check-in.");
    }

    const previous = {
      roomId: booking.room,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate,
    };

    const next = {
      roomId: changes.roomId || String(booking.room),
      checkIn: changes.checkInDate || booking.checkInDate,
      checkOut: changes.checkOutDate || booking.checkOutDate,
    };

    const roomChanged = String(next.roomId) !== String(previous.roomId);
    const stayChanged =
      roomChanged ||
      next.checkIn.getTime() !== previous.checkIn.getTime() ||
      next.checkOut.getTime() !== previous.checkOut.getTime();

    const guests = changes.numberOfGuests ?? booking.numberOfGuests;
    const settings = await getSettings();
    const room = await Room.findById(next.roomId);

    if (roomChanged) {
      assertRoomBookable(room, guests);
    } else if (!room) {
      throw notFound("The room for this reservation no longer exists.");
    } else if (guests > room.capacity) {
      throw badRequest(`This room allows a maximum of ${room.capacity} guests.`);
    }

    let claimed = false;

    if (stayChanged) {
      const nights = assertValidStay(next.checkIn, next.checkOut, settings, {
        // A stay that has already started keeps its original arrival date.
        allowPastCheckIn: next.checkIn.getTime() === previous.checkIn.getTime(),
      });

      if (inHouse && next.checkOut < hotelToday()) {
        throw badRequest("The new check-out date cannot be in the past.");
      }

      // Availability is re-checked on the server for every change of room or
      // dates. The booking keeps its current nights until the new ones are
      // secured, so a failed change loses nothing.
      claimed = await claimNights(room._id, booking._id, next.checkIn, next.checkOut);
      if (!claimed) throw conflict(ROOM_TAKEN);

      const legacy = await findUnavailableRoomIds(
        [room._id],
        next.checkIn,
        next.checkOut,
        booking._id
      );
      if (legacy.size > 0) {
        await releaseNights(booking._id, previous);
        throw conflict(ROOM_TAKEN);
      }

      // New dates must not overlap another stay made with the same identity
      // document, unless the front desk approved that overlap when booking.
      if (!booking.sameDocumentOverlapApprovedBy) {
        const { documentType, documentNumber } = booking.guestDetails;
        const overlapping = (await findActiveWithDocument(documentType, documentNumber, booking._id)).some(
          (other) => other.checkInDate < next.checkOut && other.checkOutDate > next.checkIn
        );
        const held =
          !overlapping &&
          (await claimIdentityNights(documentKey(documentType, documentNumber), booking._id, next.checkIn, next.checkOut));

        if (!held) {
          await releaseNights(booking._id, previous);
          throw conflict(DUPLICATE_STAY);
        }
      }

      booking.room = room._id;
      booking.checkInDate = next.checkIn;
      booking.checkOutDate = next.checkOut;
      booking.totalNights = nights;
      if (roomChanged) booking.pricePerNight = room.pricePerNight;
    }

    if (changes.numberOfGuests !== undefined) booking.numberOfGuests = guests;
    if (changes.specialRequests !== undefined) booking.specialRequests = changes.specialRequests;

    applyTotals(booking);
    booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);

    try {
      await booking.save();
    } catch (error) {
      if (claimed) await releaseNights(booking._id, previous);
      throw error;
    }

    if (stayChanged) await releaseNights(booking._id, next);

    await respondWith(res, booking, "Reservation updated successfully.");
  }
);

/* ---------- Review ---------- */

router.patch(
  "/:id/confirm",
  requirePermission("bookings:review"),
  validate({ params: idParams, body: noteSchema }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);

    if (booking.bookingStatus !== "pending") {
      throw conflict("Only pending bookings can be confirmed.");
    }

    // Approving a request when the image shows a different number is a
    // deliberate decision, and the reason is kept with the record.
    if (booking.identityCheck?.status === "number-mismatch" && !req.valid.body.note) {
      throw badRequest(
        "A different CNIC number was read from the uploaded image. Add a note explaining why this request is approved."
      );
    }

    const room = await Room.findById(booking.room);
    if (!room || !room.isActive) {
      throw conflict("The room for this reservation is no longer available.");
    }

    // Idempotent for reservations that already hold their nights; fails only
    // if another reservation owns one of them.
    const claimed = await claimNights(
      booking.room,
      booking._id,
      booking.checkInDate,
      booking.checkOutDate
    );
    if (!claimed) {
      throw conflict("This room already has another reservation for these dates.");
    }

    booking.bookingStatus = "confirmed";
    booking.verificationStatus = "verified";
    booking.verificationMethod = "staff-review";
    booking.verifiedBy = req.user._id;
    booking.verifiedAt = new Date();
    booking.decisionNote = req.valid.body.note;
    await booking.save();

    await ensureInvoiceNumber(booking);

    await notify({
      user: booking.guest,
      type: "booking",
      title: "Reservation confirmed",
      message: `Your stay in room ${room.roomNumber} from ${toDateOnly(booking.checkInDate)} is confirmed.`,
      entity: "booking",
      entityId: booking._id,
    });

    await respondWith(res, booking, "Booking confirmed successfully.");
  }
);

router.patch(
  "/:id/reject",
  requirePermission("bookings:review"),
  validate({ params: idParams, body: noteSchema }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);

    if (booking.bookingStatus !== "pending") {
      throw conflict("Only pending bookings can be rejected.");
    }

    // The guest is told why; a rejection without a reason is not accepted.
    if (!req.valid.body.note) {
      throw badRequest("Give a reason for rejecting this request. The guest will see it.");
    }

    booking.bookingStatus = "rejected";
    booking.verificationStatus = "rejected";
    booking.verifiedBy = req.user._id;
    booking.verifiedAt = new Date();
    booking.decisionNote = req.valid.body.note;
    await booking.save();

    await releaseNights(booking._id);

    await notify({
      user: booking.guest,
      type: "booking",
      title: "Reservation not approved",
      message: req.valid.body.note || "Your reservation request could not be approved.",
      entity: "booking",
      entityId: booking._id,
    });

    await respondWith(res, booking, "Booking rejected.");
  }
);

router.patch(
  "/:id/cancel",
  requirePermission("bookings:own", "bookings:cancel"),
  validate({ params: idParams, body: reasonSchema }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);
    const byStaff = can(req.user.role, "bookings:cancel");

    if (!byStaff && !isOwner(booking, req.user)) throw notFound("Booking not found.");

    if (!["pending", "confirmed"].includes(booking.bookingStatus)) {
      throw conflict(
        booking.bookingStatus === "checked-in"
          ? "A guest who has checked in must be checked out instead."
          : `This reservation is already ${booking.bookingStatus}.`
      );
    }

    if (!byStaff && Number(booking.amountPaid || 0) > 0) {
      throw conflict(
        "A payment has been recorded for this reservation. Please contact the front desk to cancel it."
      );
    }

    booking.bookingStatus = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancelledBy = req.user._id;
    booking.cancellationReason = req.valid.body.reason;
    await booking.save();

    // The nights are released only after the cancellation is stored.
    await releaseNights(booking._id);

    const room = await Room.findById(booking.room).select("roomNumber");

    await notify(
      byStaff
        ? {
            user: booking.guest,
            type: "booking",
            title: "Reservation cancelled",
            message: `Your reservation for room ${room?.roomNumber || ""} was cancelled by the hotel.`,
            entity: "booking",
            entityId: booking._id,
          }
        : {
            roles: FRONT_DESK_ROLES,
            type: "booking",
            title: "Reservation cancelled by guest",
            message: `${booking.guestDetails.fullName} cancelled room ${room?.roomNumber || ""}.`,
            entity: "booking",
            entityId: booking._id,
          }
    );

    const refund = Number(booking.amountPaid || 0);
    const settings = await getSettings();

    await respondWith(
      res,
      booking,
      refund > 0
        ? `Reservation cancelled. A refund of ${formatMoney(settings, refund)} is due to the guest.`
        : "Reservation cancelled. The room is available for these dates again."
    );
  }
);

/* ---------- Check-in and check-out ---------- */

router.patch(
  "/:id/check-in",
  requirePermission("bookings:checkin"),
  validate({ params: idParams }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);

    if (booking.bookingStatus === "checked-in") {
      throw conflict("This guest has already been checked in.");
    }

    if (booking.bookingStatus !== "confirmed") {
      throw conflict("Only confirmed bookings can be checked in.");
    }

    if (booking.verificationStatus !== "verified") {
      throw conflict("Guest verification must be completed before check-in.");
    }

    const today = hotelToday();

    if (today < booking.checkInDate) {
      throw conflict(`Check-in for this reservation opens on ${toDateOnly(booking.checkInDate)}.`);
    }

    if (today >= booking.checkOutDate) {
      throw conflict(
        "The stay dates for this reservation have passed. Change the dates or cancel it."
      );
    }

    const room = await Room.findById(booking.room);

    if (!room) throw notFound("The room assigned to this booking was not found.");
    if (!room.isActive) throw conflict("This room is currently inactive.");

    const blocked = {
      occupied: "This room is still occupied. Check out the current guest first.",
      cleaning: "This room is still being cleaned. Housekeeping must release it first.",
      maintenance: "This room is under maintenance.",
    }[room.status];

    if (blocked) throw conflict(blocked);

    // Taking the room is atomic: of two simultaneous check-ins into the same
    // room, only one finds it free.
    const previousStatus = room.status;
    const taken = await Room.findOneAndUpdate(
      { _id: room._id, isActive: true, status: { $in: ["available", "reserved"] } },
      { $set: { status: "occupied" } }
    );

    if (!taken) throw conflict("This room was just taken. Please refresh and try again.");

    booking.bookingStatus = "checked-in";
    booking.checkedInAt = new Date();
    booking.checkedInBy = req.user._id;

    try {
      await booking.save();
    } catch (error) {
      await Room.updateOne({ _id: room._id, status: "occupied" }, { $set: { status: previousStatus } });
      throw error;
    }

    await respondWith(res, booking, "Guest checked in successfully.");
  }
);

router.patch(
  "/:id/check-out",
  requirePermission("bookings:checkout"),
  validate({ params: idParams }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);

    if (booking.bookingStatus !== "checked-in") {
      throw conflict(
        booking.bookingStatus === "checked-out"
          ? "This guest has already been checked out."
          : "Only checked-in guests can be checked out."
      );
    }

    const settings = await getSettings();
    const today = hotelToday();

    // A guest who stayed past the booked departure is billed for the extra
    // nights before the folio is settled.
    if (today > booking.checkOutDate) {
      booking.checkOutDate = today;
      booking.totalNights = nightsBetween(booking.checkInDate, today);
      applyTotals(booking);
      booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);
      await booking.save();
    }

    const balance = balanceOf(booking);

    if (balance > 0 && !settings.allowCheckoutWithBalance) {
      throw conflict(
        `An outstanding balance of ${formatMoney(settings, balance)} must be settled before check-out.`
      );
    }

    booking.bookingStatus = "checked-out";
    booking.checkedOutAt = new Date();
    booking.checkedOutBy = req.user._id;
    await booking.save();

    await releaseNights(booking._id);

    const room = await Room.findOneAndUpdate(
      { _id: booking.room },
      { $set: { status: "cleaning", cleaningStartedAt: null, cleaningBy: null } },
      { returnDocument: "after" }
    );

    await ensureInvoiceNumber(booking);

    if (room) {
      await notify({
        roles: OPERATIONS_ROLES,
        type: "housekeeping",
        title: `Room ${room.roomNumber} needs cleaning`,
        message: "The guest has checked out. The room is waiting for housekeeping.",
        entity: "room",
        entityId: room._id,
      });
    }

    await respondWith(res, booking, "Guest checked out successfully. The room is now with housekeeping.");
  }
);

/* ---------- Billing ---------- */

const assertOpenFolio = (booking) => {
  if (!["confirmed", "checked-in"].includes(booking.bookingStatus)) {
    throw conflict("The folio for this reservation is closed.");
  }
};

router.post(
  "/:id/payments",
  requirePermission("billing:payment"),
  validate({ params: idParams, body: paymentSchema }),
  async (req, res) => {
    const { amount, paymentMethod, transactionReference, requestId } = req.valid.body;
    const booking = await loadBooking(req.valid.params.id);

    // A repeat of a submission that was already applied (double click, retry
    // after a timeout) is answered with the current folio and changes nothing.
    if (requestId && booking.payments.some((payment) => payment.requestId === requestId)) {
      return respondWith(res, booking, "This payment has already been recorded.");
    }

    if (!BILLABLE_STATUSES.includes(booking.bookingStatus)) {
      throw conflict("Payment cannot be recorded for this booking.");
    }

    const settings = await getSettings();
    const balance = balanceOf(booking);

    if (balance <= 0) throw conflict("This folio is already paid in full.");

    if (amount > balance) {
      throw badRequest(
        `Payment cannot exceed the remaining balance of ${formatMoney(settings, balance)}.`
      );
    }

    if (
      transactionReference &&
      booking.payments.some(
        (payment) =>
          payment.reference &&
          payment.reference.toLowerCase() === transactionReference.toLowerCase()
      )
    ) {
      throw conflict("A payment with this transaction reference has already been recorded.");
    }

    const now = new Date();

    booking.payments.push({
      amount,
      method: paymentMethod,
      reference: transactionReference,
      receivedBy: req.user._id,
      receivedAt: now,
      requestId,
    });
    booking.amountPaid = round2(Number(booking.amountPaid || 0) + amount);
    booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);
    booking.paymentMethod = paymentMethod;
    booking.paymentDate = now;
    booking.transactionReference = transactionReference;

    // The booking schema uses optimistic concurrency. If the same payment is
    // submitted twice at once, the second save sees a newer version and is
    // rejected with a conflict, so it cannot be applied twice.
    await booking.save();
    await ensureInvoiceNumber(booking);

    return respondWith(
      res,
      booking,
      booking.paymentStatus === "paid"
        ? "Payment recorded. The folio is settled in full."
        : "Partial payment recorded."
    );
  }
);

router.post(
  "/:id/charges",
  requirePermission("billing:charges"),
  validate({ params: idParams, body: chargeSchema }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);
    assertOpenFolio(booking);

    if (booking.charges.length >= 100) {
      throw conflict("This folio has reached the maximum number of charges.");
    }

    booking.charges.push({ ...req.valid.body, addedBy: req.user._id });
    applyTotals(booking);
    booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);
    await booking.save();

    await respondWith(res, booking, "Charge added to the folio.", 201);
  }
);

router.delete(
  "/:id/charges/:chargeId",
  requirePermission("billing:charges"),
  validate({ params: chargeParams }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);
    assertOpenFolio(booking);

    const charge = booking.charges.id(req.valid.params.chargeId);
    if (!charge) throw notFound("Charge not found.");

    charge.deleteOne();
    applyTotals(booking);

    if (round2(booking.amountPaid || 0) > booking.totalAmount) {
      throw conflict("Removing this charge would leave the folio overpaid.");
    }

    booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);
    await booking.save();

    await respondWith(res, booking, "Charge removed from the folio.");
  }
);

router.patch(
  "/:id/discount",
  requirePermission("billing:discount"),
  validate({ params: idParams, body: discountSchema }),
  async (req, res) => {
    const booking = await loadBooking(req.valid.params.id);
    assertOpenFolio(booking);

    const { subtotal } = folioOf(booking);

    if (req.valid.body.amount > subtotal) {
      throw badRequest("The discount cannot be larger than the folio subtotal.");
    }

    booking.discountAmount = req.valid.body.amount;
    booking.discountReason = req.valid.body.amount > 0 ? req.valid.body.reason : "";
    applyTotals(booking);

    if (round2(booking.amountPaid || 0) > booking.totalAmount) {
      throw conflict("This discount would leave the folio overpaid.");
    }

    booking.paymentStatus = paymentStatusFor(booking.amountPaid, booking.totalAmount);
    await booking.save();

    await respondWith(res, booking, "Discount updated.");
  }
);

router.get("/:id/invoice", validate({ params: idParams }), async (req, res) => {
  const booking = await populateBooking(Booking.findById(req.valid.params.id));

  if (!booking) throw notFound("Booking not found.");

  if (!can(req.user.role, "billing:view")) {
    if (!can(req.user.role, "bookings:own") || !isOwner(booking, req.user)) {
      throw notFound("Booking not found.");
    }
  }

  const refundable = booking.bookingStatus === "cancelled" && Number(booking.amountPaid || 0) > 0;

  if (!BILLABLE_STATUSES.includes(booking.bookingStatus) && !refundable) {
    throw conflict("An invoice is available once the reservation is confirmed.");
  }

  await ensureInvoiceNumber(booking);

  const data = serialize(booking);
  const settings = await getSettings();

  const lines = [
    {
      description: `${data.room?.name || "Room"} (Room ${data.room?.roomNumber || "N/A"})`,
      quantity: data.totalNights,
      unit: "night",
      unitPrice: data.pricePerNight,
      amount: data.folio.roomCharges,
    },
    ...(data.charges || []).map((charge) => ({
      description: charge.description,
      quantity: charge.quantity,
      unit: "item",
      unitPrice: charge.amount,
      amount: round2(charge.amount * charge.quantity),
    })),
  ];

  // Payments recorded before the ledger existed appear as a single entry.
  const payments =
    data.payments?.length > 0
      ? data.payments.map((payment) => ({
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          receivedAt: payment.receivedAt,
        }))
      : data.folio.amountPaid > 0
        ? [
            {
              amount: data.folio.amountPaid,
              method: data.paymentMethod,
              reference: data.transactionReference,
              receivedAt: data.paymentDate,
            },
          ]
        : [];

  res.json({
    success: true,
    invoice: {
      invoiceNumber: booking.invoiceNumber,
      issuedAt: new Date(),
      bookingId: data._id,
      bookingStatus: data.bookingStatus,
      paymentStatus: data.paymentStatus,
      hotel: toPublicSettings(settings),
      guest: {
        name: data.guestDetails.fullName,
        email: data.guestDetails.email,
        phone: data.guestDetails.phone,
        address: data.guestDetails.address,
      },
      stay: {
        checkInDate: data.checkInDate,
        checkOutDate: data.checkOutDate,
        nights: data.totalNights,
        guests: data.numberOfGuests,
      },
      lines,
      discountReason: data.discountReason,
      folio: data.folio,
      payments,
    },
  });
});

/* ---------- Identity documents ---------- */

// Documents are streamed only to staff who review bookings and to the guest
// who uploaded them. They are never served from a public folder.
router.get("/:id/documents/:side", validate({ params: documentParams }), async (req, res) => {
  const booking = await loadBooking(req.valid.params.id);
  assertCanView(booking, req.user);

  const stored =
    req.valid.params.side === "front"
      ? booking.guestDetails.documentFront
      : booking.guestDetails.documentBack;

  const filePath = resolveDocumentPath(stored);
  if (!filePath) throw notFound("This document is not available.");

  if (!can(req.user.role, "bookings:view") && !isOwner(booking, req.user)) {
    throw forbidden();
  }

  let content;
  try {
    content = await readDocument(filePath);
  } catch (error) {
    logger.error("Identity document could not be opened", error, { reason: error.code || "READ_FAILED" });
    throw new HttpError(503, "This document cannot be opened right now.");
  }

  // Who looked at whose document, and when. No document content is logged.
  logger.info("Identity document viewed", {
    bookingId: String(booking._id),
    side: req.valid.params.side,
    viewer: String(req.user._id),
    role: req.user.role,
  });

  res.set({
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Type": contentTypeOf(filePath),
    "Content-Disposition": `inline; filename="identity-${req.valid.params.side}${path.extname(filePath)}"`,
  });
  res.send(content);
});

module.exports = router;
