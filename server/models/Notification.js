const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Delivered to one account, or to everyone holding one of these roles.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    roles: {
      type: [String],
      default: [],
    },
    type: {
      type: String,
      enum: ["booking", "payment", "housekeeping", "maintenance", "feedback", "contact", "account"],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    // The record this notification is about; the client turns it into a link.
    entity: {
      type: String,
      enum: ["booking", "room", "maintenance", "feedback", "contact", null],
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    readBy: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ roles: 1, createdAt: -1 });
// Notifications are transient: MongoDB removes them after 60 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model("Notification", notificationSchema);
