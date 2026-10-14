const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const RoomNight = require("../models/RoomNight");
const { listNights } = require("../utils/dates");

// Read-only checks run when the server starts. Nothing here creates a
// collection, builds an index or changes a document: changing the database
// is done deliberately, with the commands named in the messages below.

// Indexes the models declare that the database does not have yet. A missing
// unique index (for example on room nights) would silently switch off a
// safety rule, so the server refuses to start until they are built.
const missingIndexes = async () => {
  const missing = [];

  for (const model of Object.values(mongoose.models)) {
    const declared = model.schema.indexes();
    if (declared.length === 0) continue;

    let existing = [];
    try {
      existing = await model.collection.indexes();
    } catch (error) {
      if (error?.codeName !== "NamespaceNotFound" && error?.code !== 26) throw error;
    }

    const have = new Set(existing.map((index) => JSON.stringify(index.key)));
    for (const [fields] of declared) {
      if (!have.has(JSON.stringify(fields))) {
        missing.push(`${model.collection.collectionName}(${Object.keys(fields).join(", ")})`);
      }
    }
  }

  return missing;
};

// Compares the room-night ledger with the reservations without changing
// either. The repair itself is a separate, deliberate command.
const checkRoomNights = async () => {
  const active = await Booking.find({ bookingStatus: { $in: Booking.ACTIVE_STATUSES } })
    .select("checkInDate checkOutDate")
    .lean();

  let missingNights = 0;
  for (const booking of active) {
    if (!(booking.checkOutDate > booking.checkInDate)) continue;
    const expected = listNights(booking.checkInDate, booking.checkOutDate).length;
    const held = await RoomNight.countDocuments({
      booking: booking._id,
      night: { $gte: booking.checkInDate, $lt: booking.checkOutDate },
    });
    missingNights += Math.max(expected - held, 0);
  }

  const staleNights = await RoomNight.countDocuments({ booking: { $nin: active.map((booking) => booking._id) } });

  return { activeBookings: active.length, missingNights, staleNights };
};

module.exports = { missingIndexes, checkRoomNights };
