const express = require("express");

const Feedback = require("../models/Feedback");
const Booking = require("../models/Booking");
const { protect, requirePermission } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { notify, MANAGEMENT_ROLES } = require("../services/notify");
const { conflict, notFound } = require("../utils/httpError");
const {
  z,
  objectId,
  idParams,
  text,
  optionalText,
  wholeNumber,
  pagination,
  search,
  escapeRegex,
} = require("../utils/schemas");

const router = express.Router();

router.use(protect);

const ALREADY_SUBMITTED = "Feedback has already been submitted for this stay.";

const optionalRating = (label) =>
  z
    .union([z.literal(""), z.null(), wholeNumber(label, 1, 5)])
    .optional()
    .transform((value) => (value === "" || value === undefined ? null : value));

const createSchema = z.strictObject({
  bookingId: objectId,
  rating: wholeNumber("Rating", 1, 5),
  title: optionalText("Title", 100),
  message: text("Feedback message", 5, 1000),
  cleanlinessRating: optionalRating("Cleanliness rating"),
  serviceRating: optionalRating("Service rating"),
  roomRating: optionalRating("Room rating"),
});

const listSchema = z.strictObject({
  ...pagination,
  search,
  status: z.enum(["all", "new", "reviewed"]).optional().default("all"),
  rating: z
    .union([z.literal("all"), wholeNumber("Rating", 1, 5)])
    .optional()
    .default("all"),
});

const populateFeedback = (query) =>
  query
    .populate("guest", "name email")
    .populate("room", "roomNumber name type")
    .populate("booking", "checkInDate checkOutDate totalAmount bookingStatus");

router.post(
  "/",
  requirePermission("feedback:own"),
  validate({ body: createSchema }),
  async (req, res) => {
    const { bookingId, ...fields } = req.valid.body;

    // Scoped to the signed-in guest: another guest's booking id is simply
    // not found.
    const booking = await Booking.findOne({ _id: bookingId, guest: req.user._id });
    if (!booking) throw notFound("Booking not found.");

    if (booking.bookingStatus !== "checked-out") {
      throw conflict("Feedback can only be submitted after check-out.");
    }

    if (await Feedback.exists({ booking: booking._id })) {
      throw conflict(ALREADY_SUBMITTED);
    }

    let feedback;
    try {
      feedback = await Feedback.create({
        ...fields,
        guest: req.user._id,
        booking: booking._id,
        room: booking.room,
      });
    } catch (error) {
      // The unique index on booking catches a double submission.
      if (error?.code === 11000) throw conflict(ALREADY_SUBMITTED);
      throw error;
    }

    await notify({
      roles: MANAGEMENT_ROLES,
      type: "feedback",
      title: `New ${fields.rating}-star guest review`,
      message: fields.title || fields.message.slice(0, 120),
      entity: "feedback",
      entityId: feedback._id,
    });

    res.status(201).json({
      success: true,
      message: "Thank you. Your feedback has been submitted.",
      feedback: await populateFeedback(Feedback.findById(feedback._id)),
    });
  }
);

router.get("/my", requirePermission("feedback:own"), async (req, res) => {
  const feedback = await Feedback.find({ guest: req.user._id })
    .populate("room", "roomNumber name type")
    .populate("booking", "checkInDate checkOutDate totalAmount bookingStatus")
    .sort({ createdAt: -1 });

  res.json({ success: true, feedback });
});

router.get(
  "/",
  requirePermission("feedback:manage"),
  validate({ query: listSchema }),
  async (req, res) => {
    const { page, limit, search: term, status, rating } = req.valid.query;
    const filter = {};

    if (status !== "all") filter.status = status;
    if (rating !== "all") filter.rating = rating;

    if (term) {
      const pattern = new RegExp(escapeRegex(term), "i");
      filter.$or = [{ title: pattern }, { message: pattern }];
    }

    const [feedback, total, breakdown] = await Promise.all([
      populateFeedback(
        Feedback.find(filter)
          .sort({ createdAt: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
      ),
      Feedback.countDocuments(filter),
      Feedback.aggregate([
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
            reviewed: { $sum: { $cond: [{ $eq: ["$status", "reviewed"] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const counts = new Map(breakdown.map((item) => [item._id, item]));
    const totalFeedback = breakdown.reduce((sum, item) => sum + item.count, 0);
    const reviewed = breakdown.reduce((sum, item) => sum + item.reviewed, 0);
    const ratingSum = breakdown.reduce((sum, item) => sum + item._id * item.count, 0);

    res.json({
      success: true,
      total,
      page,
      limit,
      summary: {
        totalFeedback,
        averageRating: totalFeedback > 0 ? Number((ratingSum / totalFeedback).toFixed(1)) : 0,
        reviewed,
        newFeedback: totalFeedback - reviewed,
        fiveStar: counts.get(5)?.count || 0,
      },
      ratingBreakdown: [5, 4, 3, 2, 1].map((value) => ({
        rating: value,
        count: counts.get(value)?.count || 0,
      })),
      feedback,
    });
  }
);

router.patch(
  "/:id/review",
  requirePermission("feedback:manage"),
  validate({ params: idParams }),
  async (req, res) => {
    const feedback = await Feedback.findOneAndUpdate(
      { _id: req.valid.params.id },
      { $set: { status: "reviewed", reviewedBy: req.user._id, reviewedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!feedback) throw notFound("Feedback not found.");

    res.json({ success: true, message: "Feedback marked as reviewed.", feedback });
  }
);

module.exports = router;
