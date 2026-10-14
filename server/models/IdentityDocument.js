const mongoose = require("mongoose");

// Which guest account an identity document belongs to. The normalised
// document key is the _id, so MongoDB itself refuses a second owner, however
// close together two requests arrive.
const identityDocumentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model("IdentityDocument", identityDocumentSchema);
