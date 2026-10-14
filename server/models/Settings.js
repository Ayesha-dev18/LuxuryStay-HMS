const mongoose = require("mongoose");

// Single document (key "global") holding hotel-wide configuration.
const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "global",
      unique: true,
    },
    hotelName: {
      type: String,
      trim: true,
      default: "LuxuryStay Hotel & Resort",
      maxlength: 80,
    },
    address: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    currencySymbol: {
      type: String,
      trim: true,
      default: "Rs.",
      maxlength: 6,
    },
    // Percentage applied to new reservations. Existing folios keep the rate
    // they were created with.
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 50,
    },
    checkInTime: {
      type: String,
      default: "14:00",
    },
    checkOutTime: {
      type: String,
      default: "12:00",
    },
    maxStayNights: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },
    // When false, a guest with an outstanding balance cannot be checked out.
    allowCheckoutWithBalance: {
      type: Boolean,
      default: false,
    },
    // Public profiles linked from the website. Empty means "not shown".
    instagramUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    facebookUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    linkedinUrl: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Settings", settingsSchema);
