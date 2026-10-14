const express = require("express");

const Notification = require("../models/Notification");
const { protect } = require("../middleware/authMiddleware");
const { validate } = require("../middleware/validate");
const { idParams } = require("../utils/schemas");

const router = express.Router();

router.use(protect);

// A user sees notifications addressed to them or to their role, and nothing
// created before their account existed.
const audienceOf = (user) => ({
  $or: [{ user: user._id }, { user: null, roles: user.role }],
  createdAt: { $gte: user.createdAt || new Date(0) },
});

router.get("/", async (req, res) => {
  const audience = audienceOf(req.user);

  const [items, unread] = await Promise.all([
    Notification.find(audience).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ ...audience, readBy: { $ne: req.user._id } }),
  ]);

  res.json({
    success: true,
    unread,
    notifications: items.map((item) => ({
      id: item._id,
      type: item.type,
      title: item.title,
      message: item.message,
      entity: item.entity,
      entityId: item.entityId,
      createdAt: item.createdAt,
      read: (item.readBy || []).some((id) => String(id) === String(req.user._id)),
    })),
  });
});

router.patch("/read-all", async (req, res) => {
  await Notification.updateMany(
    { ...audienceOf(req.user), readBy: { $ne: req.user._id } },
    { $addToSet: { readBy: req.user._id } }
  );

  res.json({ success: true, message: "All notifications marked as read." });
});

router.patch("/:id/read", validate({ params: idParams }), async (req, res) => {
  // Scoped to the caller's audience, so another user's notification id
  // matches nothing.
  await Notification.updateOne(
    { _id: req.valid.params.id, ...audienceOf(req.user) },
    { $addToSet: { readBy: req.user._id } }
  );

  res.json({ success: true });
});

module.exports = router;
