const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const RoomNight = require("../models/RoomNight");
const IdentityNight = require("../models/IdentityNight");
const { releaseIdentityNights } = require("./identityLedger");
const logger = require("../utils/logger");
const { listNights } = require("../utils/dates");

const { ACTIVE_STATUSES } = Booking;

const isDuplicateKey = (error) =>
  error?.code === 11000 ||
  (Array.isArray(error?.writeErrors) &&
    error.writeErrors.some((item) => (item.code ?? item.err?.code) === 11000));

// Claims every night of a stay for one booking.
//
// The claim is a batch of inserts against the unique (room, night) index, so
// it works on a standalone MongoDB server without transactions: when two
// requests race for the same night, the database lets exactly one insert
// through. If any night is already taken, everything this call inserted is
// removed again and false is returned.
//
// Nights the booking already holds are kept, which lets a reservation be moved
// or extended without ever releasing its current dates first.
const claimNights = async (roomId, bookingId, checkIn, checkOut) => {
  const wanted = listNights(checkIn, checkOut);

  const held = await RoomNight.find({ booking: bookingId, room: roomId })
    .select("night")
    .lean();
  const heldTimes = new Set(held.map((item) => item.night.getTime()));

  const missing = wanted.filter((night) => !heldTimes.has(night.getTime()));
  if (missing.length === 0) return true;

  try {
    // Nights are claimed in date order and the batch stops at the first one
    // that is taken. Because every request claims in the same order, of any
    // set of overlapping requests at least one always completes.
    await RoomNight.insertMany(
      missing.map((night) => ({ room: roomId, night, booking: bookingId })),
      { ordered: true }
    );
    return true;
  } catch (error) {
    await RoomNight.deleteMany({
      booking: bookingId,
      room: roomId,
      night: { $in: missing },
    });

    if (isDuplicateKey(error)) return false;
    throw error;
  }
};

// Drops every night the booking holds outside the given stay (or all of them
// when no stay is given).
// The booking's identity-document nights are released with its room nights.
const releaseNights = async (bookingId, keep) => {
  await releaseIdentityNights(bookingId, keep && { checkIn: keep.checkIn, checkOut: keep.checkOut });

  if (!keep) {
    await RoomNight.deleteMany({ booking: bookingId });
    return;
  }

  await RoomNight.deleteMany({
    booking: bookingId,
    $or: [
      { room: { $ne: keep.roomId } },
      { night: { $lt: keep.checkIn } },
      { night: { $gte: keep.checkOut } },
    ],
  });
};

// Room ids that cannot take a stay over the given dates. Uses the standard
// overlap rule: existing check-in < new check-out AND existing check-out > new
// check-in, so a departure and an arrival may share the same day.
const findUnavailableRoomIds = async (roomIds, checkIn, checkOut, excludeBookingId) => {
  const [nights, bookings] = await Promise.all([
    RoomNight.find({
      room: { $in: roomIds },
      night: { $gte: checkIn, $lt: checkOut },
      ...(excludeBookingId ? { booking: { $ne: excludeBookingId } } : {}),
    })
      .select("room")
      .lean(),
    Booking.find({
      room: { $in: roomIds },
      bookingStatus: { $in: ACTIVE_STATUSES },
      checkInDate: { $lt: checkOut },
      checkOutDate: { $gt: checkIn },
      ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
    })
      .select("room")
      .lean(),
  ]);

  return new Set([...nights, ...bookings].map((item) => String(item.room)));
};

// Brings the night ledger in line with the bookings collection. Safe to run
// at every start-up: it only adds missing nights for active bookings and
// removes nights whose booking no longer holds the room.
const syncRoomNights = async () => {
  await RoomNight.init();

  const active = await Booking.find({ bookingStatus: { $in: ACTIVE_STATUSES } })
    .select("room checkInDate checkOutDate bookingStatus createdAt")
    .sort({ createdAt: 1 })
    .lean();

  const activeIds = active.map((booking) => booking._id);
  const stale = await RoomNight.deleteMany({ booking: { $nin: activeIds } });
  await IdentityNight.deleteMany({ booking: { $nin: activeIds } });

  const conflicts = [];
  for (const booking of active) {
    if (!(booking.checkOutDate > booking.checkInDate)) continue;

    await releaseNights(booking._id, {
      roomId: booking.room,
      checkIn: booking.checkInDate,
      checkOut: booking.checkOutDate,
    });

    const claimed = await claimNights(
      booking.room,
      booking._id,
      booking.checkInDate,
      booking.checkOutDate
    );
    if (!claimed) conflicts.push(String(booking._id));
  }

  if (conflicts.length > 0) {
    // Pre-existing overlaps cannot be resolved automatically; staff must
    // move or cancel one of the reservations.
    logger.warn("Existing reservations overlap and need manual review", {
      bookingIds: conflicts,
    });
  }

  return { active: active.length, removed: stale.deletedCount || 0, conflicts };
};

const newBookingId = () => new mongoose.Types.ObjectId();

module.exports = {
  claimNights,
  releaseNights,
  findUnavailableRoomIds,
  syncRoomNights,
  newBookingId,
};
