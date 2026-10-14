const mongoose = require("mongoose");

// Atomic sequences, used for invoice numbers.
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
  },
  value: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model("Counter", counterSchema);
