const mongoose = require("mongoose");

const ROOM_TYPES = ["Serene Room", "Signature Suite", "Royal Residence"];

const ROOM_STATUSES = [
  "available",
  "occupied",
  "reserved",
  "cleaning",
  "maintenance",
];

const roomSchema = new mongoose.Schema(
  {
    roomNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ROOM_TYPES,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 600,
    },
    amenities: {
      type: [String],
      default: [],
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    bedType: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ROOM_STATUSES,
      default: "available",
    },
    floor: {
      type: Number,
      required: true,
      min: 1,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Housekeeping trail
    cleaningStartedAt: {
      type: Date,
      default: null,
    },
    cleaningBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastCleanedAt: {
      type: Date,
      default: null,
    },
    lastCleanedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

roomSchema.index({ isActive: 1, status: 1 });

const Room = mongoose.model("Room", roomSchema);

module.exports = Room;
module.exports.ROOM_TYPES = ROOM_TYPES;
module.exports.ROOM_STATUSES = ROOM_STATUSES;
