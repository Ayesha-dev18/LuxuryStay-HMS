const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    enquiryType: {
      type: String,
      required: true,
      enum: [
        "Room Reservation",
        "Dining",
        "Spa & Wellness",
        "Private Transfer",
        "General Enquiry",
      ],
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500,
    },

    status: {
      type: String,
      enum: ["new", "read", "resolved"],
      default: "new",
    },
  },
  {
    timestamps: true,
  }
);

contactSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "Contact",
  contactSchema
);