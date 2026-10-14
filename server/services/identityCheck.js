const Booking = require("../models/Booking");
const ocr = require("./ocr");
const logger = require("../utils/logger");

/*
  Project-level CNIC check.

  What it does: reads the number printed on the uploaded CNIC image and
  compares it with the number the guest typed.

  What it does not do: it does not contact NADRA or any government record, and
  it cannot tell whether a card is genuine, current, or belongs to the person
  presenting it. A match means "the typed number appears on the uploaded
  image" and nothing more. That is why the outcome is called "number-matched"
  and never "authenticated", and why the front desk still inspects the
  original document at check-in.
*/

const { ACTIVE_STATUSES } = Booking;

const STATUSES = [
  "not-applicable", // no automatic check exists for this document (passport, desk booking)
  "number-matched", // the typed number was read from the image
  "number-mismatch", // a CNIC number was read, but a different one
  "unreadable", // no CNIC number could be read from the image
  "error", // the check could not be run
];

// Outcomes that a member of staff must look at before the request can proceed.
const NEEDS_REVIEW = ["number-mismatch", "unreadable", "error"];

const DISCLAIMER =
  "Project-level check only. The number is compared with the uploaded image; it is not verified against NADRA or any official record.";

const digitsOf = (value) => String(value || "").replace(/\D/g, "");

const formatCnic = (digits) =>
  digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : digits;

// Every 13-digit CNIC number in a block of text, written 12345-1234567-1 or
// with spaces, dots or no separators. Longer digit runs are not CNIC numbers.
const extractCnicNumbers = (text) => {
  const found = new Set();
  const pattern = /(?<!\d)(\d{5})[\s.\-–—]{0,2}(\d{7})[\s.\-–—]{0,2}(\d)(?!\d)/g;

  for (const match of String(text || "").matchAll(pattern)) {
    found.add(match[1] + match[2] + match[3]);
  }

  return [...found];
};

// Compares the typed CNIC number with what can be read from the uploaded
// images. Never throws: a failure to run is itself an outcome.
const checkCnic = async ({ documentNumber, files }) => {
  const typed = digitsOf(documentNumber);
  const readable = files.filter((file) => file && ocr.canRead(file.path));

  if (readable.length === 0) {
    return {
      status: "unreadable",
      extractedNumber: "",
      detail: "The uploaded document is not an image the system can read.",
    };
  }

  const others = [];
  let failures = 0;

  for (const file of readable) {
    let text;
    try {
      text = await ocr.recognize(file.path);
    } catch (error) {
      failures += 1;
      logger.error("CNIC image could not be read", error, { reason: error.code || "OCR_FAILED" });
      continue;
    }

    const numbers = extractCnicNumbers(text);

    if (numbers.includes(typed)) {
      return {
        status: "number-matched",
        extractedNumber: formatCnic(typed),
        detail: "The CNIC number entered was read from the uploaded image.",
      };
    }

    others.push(...numbers);
  }

  if (others.length > 0) {
    return {
      status: "number-mismatch",
      extractedNumber: formatCnic(others[0]),
      detail: "A different CNIC number was read from the uploaded image.",
    };
  }

  if (failures === readable.length) {
    return {
      status: "error",
      extractedNumber: "",
      detail: "The automatic check could not be run.",
    };
  }

  return {
    status: "unreadable",
    extractedNumber: "",
    detail: "No CNIC number could be read from the uploaded image.",
  };
};

// The ways one identity document may be stored: reservations made before
// numbers were normalised keep whatever format was typed.
const documentVariants = (documentType, documentNumber) => {
  const raw = String(documentNumber || "").trim().toUpperCase();
  if (documentType !== "cnic") return [raw];

  const digits = digitsOf(raw);
  return [...new Set([raw, digits, formatCnic(digits)])];
};

// Other reservations that hold a room and were made with the same document.
const findActiveWithDocument = (documentType, documentNumber, excludeBookingId) =>
  Booking.find({
    "guestDetails.documentType": documentType,
    "guestDetails.documentNumber": { $in: documentVariants(documentType, documentNumber) },
    bookingStatus: { $in: ACTIVE_STATUSES },
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
  })
    .select("guest checkInDate checkOutDate bookingStatus createdAt")
    .lean();

module.exports = {
  STATUSES,
  NEEDS_REVIEW,
  DISCLAIMER,
  checkCnic,
  extractCnicNumbers,
  formatCnic,
  findActiveWithDocument,
};
