const mongoose = require("mongoose");

// One document per identity document per night held by an online
// reservation. The unique index means one document can never hold two online
// stays over the same night, the same way roomnights protects rooms.
const identityNightSchema = new mongoose.Schema(
  {
    key: {
      type: String,
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

identityNightSchema.index({ key: 1, night: 1 }, { unique: true });
identityNightSchema.index({ booking: 1 });

module.exports = mongoose.model("IdentityNight", identityNightSchema);
