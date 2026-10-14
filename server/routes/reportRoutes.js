const express = require("express");

const Booking = require("../models/Booking");
const Room = require("../models/Room");
const Maintenance = require("../models/Maintenance");
const Feedback = require("../models/Feedback");
const { env } = require("../config/env");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { round2 } = require("../utils/billing");
const { DAY_MS, hotelToday, addDays, toDateOnly, nightsBetween } = require("../utils/dates");
const { badRequest } = require("../utils/httpError");
const { z, optionalDateOnly } = require("../utils/schemas");

const { BILLABLE_STATUSES } = Booking;

const router = express.Router();

router.use(protect);

const MAX_RANGE_DAYS = 731;

const rangeSchema = z.strictObject({
  from: optionalDateOnly("From date"),
  to: optionalDateOnly("To date"),
});

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: env.HOTEL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The hotel-local calendar day a timestamp falls on.
const hotelDayOf = (date) => dayFormatter.format(new Date(date));

const resolveRange = ({ from, to }) => {
  const today = hotelToday();
  const end = to || today;
  const start = from || addDays(end, -29);

  if (end < start) throw badRequest("The end date must be on or after the start date.");

  const days = nightsBetween(start, end) + 1;
  if (days > MAX_RANGE_DAYS) throw badRequest("Please choose a range of two years or less.");

  return { start, end, days };
};

const roomSummary = (rooms) => {
  const active = rooms.filter((room) => room.isActive);
  const count = (status) => active.filter((room) => room.status === status).length;

  const occupied = count("occupied");

  return {
    totalRooms: active.length,
    inactiveRooms: rooms.length - active.length,
    occupiedRooms: occupied,
    availableRooms: count("available"),
    reservedRooms: count("reserved"),
    cleaningRooms: count("cleaning"),
    maintenanceRooms: count("maintenance"),
    occupancyRate: active.length > 0 ? Math.round((occupied / active.length) * 100) : 0,
  };
};

// Payments received on or between two hotel days. Folios paid before the
// payment ledger existed count once, on their recorded payment date.
const collectPayments = async (start, end) => {
  // A generous UTC window; exact membership is decided per hotel day below.
  const windowStart = new Date(start.getTime() - DAY_MS);
  const windowEnd = new Date(end.getTime() + 2 * DAY_MS);
  const startKey = toDateOnly(start);
  const endKey = toDateOnly(end);

  const bookings = await Booking.find({
    amountPaid: { $gt: 0 },
    $or: [
      { "payments.receivedAt": { $gte: windowStart, $lt: windowEnd } },
      { "payments.0": { $exists: false }, paymentDate: { $gte: windowStart, $lt: windowEnd } },
      { "payments.0": { $exists: false }, paymentDate: null, updatedAt: { $gte: windowStart, $lt: windowEnd } },
    ],
  })
    .select("payments amountPaid paymentMethod paymentDate updatedAt room")
    .lean();

  const entries = [];

  for (const booking of bookings) {
    const ledger =
      booking.payments?.length > 0
        ? booking.payments.map((payment) => ({
            amount: payment.amount,
            method: payment.method,
            at: payment.receivedAt,
          }))
        : [
            {
              amount: booking.amountPaid,
              method: booking.paymentMethod || "cash",
              at: booking.paymentDate || booking.updatedAt,
            },
          ];

    for (const entry of ledger) {
      const day = hotelDayOf(entry.at);
      if (day >= startKey && day <= endKey) {
        entries.push({ ...entry, day, room: String(booking.room) });
      }
    }
  }

  return entries;
};

router.get(
  "/overview",
  requirePermission("reports:view"),
  validate({ query: rangeSchema }),
  async (req, res) => {
    const { start, end, days } = resolveRange(req.valid.query);
    const endExclusive = addDays(end, 1);

    const [rooms, created, staying, payments, outstanding, recent, feedback] = await Promise.all([
      Room.find().select("roomNumber name type status isActive").lean(),

      // Reservations made in the period.
      Booking.find({ createdAt: { $gte: new Date(start.getTime() - DAY_MS), $lt: new Date(endExclusive.getTime() + DAY_MS) } })
        .select("bookingStatus paymentStatus totalAmount amountPaid createdAt")
        .lean(),

      // Stays that overlap the period: the standard overlap rule.
      Booking.find({
        bookingStatus: { $in: BILLABLE_STATUSES },
        checkInDate: { $lt: endExclusive },
        checkOutDate: { $gt: start },
      })
        .select("room checkInDate checkOutDate pricePerNight")
        .lean(),

      collectPayments(start, end),

      Booking.aggregate([
        { $match: { bookingStatus: { $in: BILLABLE_STATUSES } } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $max: [
                  { $subtract: ["$totalAmount", { $ifNull: ["$amountPaid", 0] }] },
                  0,
                ],
              },
            },
          },
        },
      ]),

      Booking.find()
        .sort({ createdAt: -1 })
        .limit(8)
        .populate("room", "roomNumber")
        .select("guestDetails.fullName room bookingStatus paymentStatus totalAmount amountPaid createdAt")
        .lean(),

      Feedback.aggregate([
        { $group: { _id: null, count: { $sum: 1 }, average: { $avg: "$rating" } } },
      ]),
    ]);

    const startKey = toDateOnly(start);
    const endKey = toDateOnly(end);

    const inPeriod = created.filter((booking) => {
      const day = hotelDayOf(booking.createdAt);
      return day >= startKey && day <= endKey;
    });

    const billable = inPeriod.filter((booking) => BILLABLE_STATUSES.includes(booking.bookingStatus));

    const countBy = (list, field, value) => list.filter((item) => item[field] === value).length;

    /* Occupancy across the period: nights sold over nights on offer. */
    const summary = roomSummary(rooms);
    const roomStats = new Map();
    let nightsSold = 0;
    let roomRevenue = 0;

    for (const stay of staying) {
      const from = Math.max(stay.checkInDate.getTime(), start.getTime());
      const to = Math.min(stay.checkOutDate.getTime(), endExclusive.getTime());
      const nights = Math.max(Math.round((to - from) / DAY_MS), 0);
      if (nights === 0) continue;

      const value = nights * Number(stay.pricePerNight || 0);
      nightsSold += nights;
      roomRevenue += value;

      const key = String(stay.room);
      const record = roomStats.get(key) || { stays: 0, nights: 0, value: 0, collected: 0 };
      record.stays += 1;
      record.nights += nights;
      record.value += value;
      roomStats.set(key, record);
    }

    const nightsOnOffer = summary.totalRooms * days;

    /* Revenue timeline: daily for short ranges, monthly for long ones. */
    const monthly = days > 62;
    const buckets = new Map();

    if (monthly) {
      for (
        let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
        cursor <= end;
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))
      ) {
        buckets.set(toDateOnly(cursor).slice(0, 7), { revenue: 0, bookings: 0 });
      }
    } else {
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        buckets.set(toDateOnly(cursor), { revenue: 0, bookings: 0 });
      }
    }

    const bucketOf = (day) => (monthly ? day.slice(0, 7) : day);
    const methods = { cash: 0, card: 0, "bank-transfer": 0 };
    let collected = 0;

    for (const payment of payments) {
      collected += payment.amount;
      methods[payment.method] = (methods[payment.method] || 0) + payment.amount;

      const bucket = buckets.get(bucketOf(payment.day));
      if (bucket) bucket.revenue += payment.amount;

      const record = roomStats.get(payment.room);
      if (record) record.collected += payment.amount;
    }

    for (const booking of inPeriod) {
      const bucket = buckets.get(bucketOf(hotelDayOf(booking.createdAt)));
      if (bucket) bucket.bookings += 1;
    }

    const roomsById = new Map(rooms.map((room) => [String(room._id), room]));

    res.json({
      success: true,
      generatedAt: new Date(),
      range: { from: startKey, to: endKey, days, granularity: monthly ? "month" : "day" },
      summary: {
        ...summary,
        totalBookings: inPeriod.length,
        billableBookings: billable.length,
        totalBilled: round2(billable.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0)),
        totalRevenue: round2(collected),
        totalOutstanding: round2(outstanding[0]?.total || 0),
        nightsSold,
        nightsOnOffer,
        periodOccupancyRate: nightsOnOffer > 0 ? Math.round((nightsSold / nightsOnOffer) * 100) : 0,
        averageNightlyRate: nightsSold > 0 ? round2(roomRevenue / nightsSold) : 0,
        feedbackCount: feedback[0]?.count || 0,
        averageRating: feedback[0]?.average ? Number(feedback[0].average.toFixed(1)) : 0,
      },
      statusBreakdown: {
        pending: countBy(inPeriod, "bookingStatus", "pending"),
        confirmed: countBy(inPeriod, "bookingStatus", "confirmed"),
        checkedIn: countBy(inPeriod, "bookingStatus", "checked-in"),
        checkedOut: countBy(inPeriod, "bookingStatus", "checked-out"),
        rejected: countBy(inPeriod, "bookingStatus", "rejected"),
        cancelled: countBy(inPeriod, "bookingStatus", "cancelled"),
      },
      paymentBreakdown: {
        paid: countBy(billable, "paymentStatus", "paid"),
        partial: countBy(billable, "paymentStatus", "partial"),
        unpaid: billable.length - countBy(billable, "paymentStatus", "paid") - countBy(billable, "paymentStatus", "partial"),
      },
      paymentMethods: Object.entries(methods).map(([method, amount]) => ({
        method,
        amount: round2(amount),
      })),
      timeline: Array.from(buckets, ([key, value]) => ({
        key,
        revenue: round2(value.revenue),
        bookings: value.bookings,
      })),
      roomPerformance: Array.from(roomStats, ([roomId, record]) => {
        const room = roomsById.get(roomId);
        return {
          roomId,
          roomNumber: room?.roomNumber || "N/A",
          roomName: room?.name || "Removed room",
          roomType: room?.type || "",
          stays: record.stays,
          nights: record.nights,
          occupancyRate: days > 0 ? Math.round((record.nights / days) * 100) : 0,
          roomRevenue: round2(record.value),
          collected: round2(record.collected),
        };
      }).sort((a, b) => b.roomRevenue - a.roomRevenue),
      recentActivity: recent.map((booking) => ({
        id: booking._id,
        guestName: booking.guestDetails?.fullName || "Guest",
        roomNumber: booking.room?.roomNumber || "N/A",
        bookingStatus: booking.bookingStatus,
        paymentStatus: booking.paymentStatus || "unpaid",
        totalAmount: booking.totalAmount || 0,
        amountPaid: booking.amountPaid || 0,
        createdAt: booking.createdAt,
      })),
    });
  }
);

// Live operational picture for the front desk.
router.get("/front-desk", requirePermission("frontdesk:view"), async (req, res) => {
  const today = hotelToday();

  const arrivalsFilter = {
    bookingStatus: "confirmed",
    checkInDate: { $lte: today },
    checkOutDate: { $gt: today },
  };
  const departuresFilter = { bookingStatus: "checked-in", checkOutDate: { $lte: today } };

  const [rooms, arrivalsDue, departuresDue, inHouse, pending, upcoming, openTasks, balances] =
    await Promise.all([
      Room.find().select("status isActive").lean(),
      Booking.countDocuments(arrivalsFilter),
      Booking.countDocuments(departuresFilter),
      Booking.countDocuments({ bookingStatus: "checked-in" }),
      Booking.countDocuments({ bookingStatus: "pending" }),
      Booking.find({
        bookingStatus: "confirmed",
        checkOutDate: { $gt: today },
        checkInDate: { $lte: addDays(today, 7) },
      })
        .sort({ checkInDate: 1 })
        .limit(8)
        .populate("room", "roomNumber name type status")
        .select("guestDetails.fullName guestDetails.phone room checkInDate checkOutDate numberOfGuests totalNights paymentStatus")
        .lean(),
      Maintenance.countDocuments({ status: { $in: ["pending", "in-progress"] } }),
      Booking.aggregate([
        { $match: { bookingStatus: "checked-in" } },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $max: [
                  { $subtract: ["$totalAmount", { $ifNull: ["$amountPaid", 0] }] },
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

  res.json({
    success: true,
    today: toDateOnly(today),
    summary: {
      ...roomSummary(rooms),
      arrivalsDue,
      departuresDue,
      inHouse,
      pendingRequests: pending,
      openMaintenance: openTasks,
      inHouseBalance: round2(balances[0]?.total || 0),
    },
    upcomingArrivals: upcoming,
  });
});

// Folio totals for the billing screen.
router.get("/finance", requirePermission("billing:view"), async (req, res) => {
  const [totals, refunds] = await Promise.all([
    Booking.aggregate([
      { $match: { bookingStatus: { $in: BILLABLE_STATUSES } } },
      {
        $group: {
          _id: { $ifNull: ["$paymentStatus", "unpaid"] },
          count: { $sum: 1 },
          billed: { $sum: "$totalAmount" },
          paid: { $sum: { $ifNull: ["$amountPaid", 0] } },
          outstanding: {
            $sum: {
              $max: [{ $subtract: ["$totalAmount", { $ifNull: ["$amountPaid", 0] }] }, 0],
            },
          },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { bookingStatus: "cancelled", amountPaid: { $gt: 0 } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$amountPaid" } } },
    ]),
  ]);

  const by = (status) => totals.find((item) => item._id === status) || { count: 0 };
  const sum = (field) => round2(totals.reduce((total, item) => total + (item[field] || 0), 0));

  res.json({
    success: true,
    summary: {
      totalBilled: sum("billed"),
      totalRevenue: sum("paid"),
      totalOutstanding: sum("outstanding"),
      paidBookings: by("paid").count,
      partialBookings: by("partial").count,
      unpaidBookings: by("unpaid").count,
      refundsDue: round2(refunds[0]?.total || 0),
      refundCount: refunds[0]?.count || 0,
    },
  });
});

module.exports = router;
