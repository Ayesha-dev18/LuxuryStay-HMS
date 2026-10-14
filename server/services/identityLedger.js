const IdentityDocument = require("../models/IdentityDocument");
const IdentityNight = require("../models/IdentityNight");
const { listNights } = require("../utils/dates");

// Concurrency-safe identity rules, enforced by unique indexes rather than by
// "look, then write":
//   - an identity document is bound to one guest account (identitydocuments);
//   - an online reservation holds its identity document for each night of the
//     stay (identitynights), so two online stays with one document cannot
//     overlap.
// Neither depends on transactions, so a standalone MongoDB server is enough.

const isDuplicateKey = (error) =>
  error?.code === 11000 ||
  (Array.isArray(error?.writeErrors) &&
    error.writeErrors.some((item) => (item.code ?? item.err?.code) === 11000));

// The same document always produces the same key, however it was typed.
const documentKey = (documentType, documentNumber) => {
  const raw = String(documentNumber || "").toUpperCase();
  return documentType === "cnic"
    ? `cnic:${raw.replace(/\D/g, "")}`
    : `passport:${raw.replace(/[^A-Z0-9]/g, "")}`;
};

// Binds the document to the guest if nobody holds it yet. Returns false when
// it already belongs to a different account.
const bindDocument = async (key, guestId) => {
  try {
    await IdentityDocument.create({ _id: key, guest: guestId });
    return true;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  const owner = await IdentityDocument.findById(key).select("guest").lean();
  return Boolean(owner) && String(owner.guest) === String(guestId);
};

// Claims every night of a stay for one booking. Nights the booking already
// holds are kept, so a stay can be moved without first giving up its dates.
// On a collision everything this call inserted is removed and false returned.
const claimIdentityNights = async (key, bookingId, checkIn, checkOut) => {
  const held = await IdentityNight.find({ booking: bookingId, key }).select("night").lean();
  const heldTimes = new Set(held.map((item) => item.night.getTime()));
  const missing = listNights(checkIn, checkOut).filter((night) => !heldTimes.has(night.getTime()));

  if (missing.length === 0) return true;

  try {
    await IdentityNight.insertMany(
      missing.map((night) => ({ key, night, booking: bookingId })),
      { ordered: true }
    );
    return true;
  } catch (error) {
    await IdentityNight.deleteMany({ booking: bookingId, key, night: { $in: missing } });
    if (isDuplicateKey(error)) return false;
    throw error;
  }
};

// Drops the nights a booking holds outside the given stay, or all of them.
const releaseIdentityNights = async (bookingId, keep) => {
  if (!keep) {
    await IdentityNight.deleteMany({ booking: bookingId });
    return;
  }

  await IdentityNight.deleteMany({
    booking: bookingId,
    $or: [{ night: { $lt: keep.checkIn } }, { night: { $gte: keep.checkOut } }],
  });
};

module.exports = {
  documentKey,
  bindDocument,
  claimIdentityNights,
  releaseIdentityNights,
};
