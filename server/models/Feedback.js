const mongoose = require("mongoose");

const feedbackSchema = new mongoose.Schema(
  {
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },

    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    title: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    cleanlinessRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    serviceRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    roomRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },

    status: {
      type: String,
      enum: ["new", "reviewed"],
      default: "new",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

feedbackSchema.index({ guest: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "Feedback",
  feedbackSchema
);