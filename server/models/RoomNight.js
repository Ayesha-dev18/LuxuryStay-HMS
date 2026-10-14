const mongoose = require("mongoose");

// One document per room per night. The unique index is what makes double
// booking impossible: two reservations can never both hold the same night of
// the same room, however closely their requests arrive.
const roomNightSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    night: {
      type: Date,
      required: true,
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

roomNightSchema.index({ room: 1, night: 1 }, { unique: true });
roomNightSchema.index({ booking: 1 });

module.exports = mongoose.model("RoomNight", roomNightSchema);
