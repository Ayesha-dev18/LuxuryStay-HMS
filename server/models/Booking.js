const mongoose = require("mongoose");

const BOOKING_STATUSES = [
  "pending",
  "confirmed",
  "rejected",
  "checked-in",
  "checked-out",
  "cancelled",
];

// Statuses that hold the room for the stay dates.
const ACTIVE_STATUSES = ["pending", "confirmed", "checked-in"];

// Statuses that carry a folio.
const BILLABLE_STATUSES = ["confirmed", "checked-in", "checked-out"];

const PAYMENT_METHODS = ["cash", "card", "bank-transfer"];

// Outcome of the automatic comparison between the CNIC number a guest typed
// and the number read from their uploaded image. "number-matched" means only
// that: it is not an official authentication of anyone's identity.
const IDENTITY_CHECK_STATUSES = [
  "not-applicable",
  "number-matched",
  "number-mismatch",
  "unreadable",
  "error",
];

// How a reservation came to be marked as verified.
const VERIFICATION_METHODS = ["number-match", "staff-review", "staff-in-person"];

const chargeSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    reference: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
    // Set by the client once per payment form, so a repeated submission of
    // the same form is recognised and applied only once.
    requestId: {
      type: String,
      default: "",
    },
  },
  { _id: true }
);

const bookingSchema = new mongoose.Schema(
  {
    guest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },

    checkInDate: {
      type: Date,
      required: true,
    },

    checkOutDate: {
      type: Date,
      required: true,
    },

    numberOfGuests: {
      type: Number,
      required: true,
      min: 1,
    },

    guestDetails: {
      fullName: {
        type: String,
        required: true,
        trim: true,
      },

      phone: {
        type: String,
        required: true,
        trim: true,
      },

      email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
      },

      address: {
        type: String,
        required: true,
        trim: true,
      },

      nationality: {
        type: String,
        required: true,
        trim: true,
      },

      documentType: {
        type: String,
        enum: ["cnic", "passport"],
        required: true,
      },

      documentNumber: {
        type: String,
        required: true,
        trim: true,
      },

      documentFront: {
        type: String,
        default: "",
      },

      documentBack: {
        type: String,
        default: "",
      },

      emergencyContact: {
        type: String,
        required: true,
        trim: true,
      },

      vehicleNumber: {
        type: String,
        default: "",
        trim: true,
      },
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },

    verificationMethod: {
      type: String,
      enum: [...VERIFICATION_METHODS, null],
      default: null,
    },

    identityCheck: {
      status: {
        type: String,
        enum: IDENTITY_CHECK_STATUSES,
        default: "not-applicable",
      },
      // The CNIC number read from the image, when one was found.
      extractedNumber: {
        type: String,
        default: "",
      },
      detail: {
        type: String,
        default: "",
        maxlength: 200,
      },
      checkedAt: {
        type: Date,
        default: null,
      },
    },

    bookingStatus: {
      type: String,
      enum: BOOKING_STATUSES,
      default: "pending",
    },

    totalNights: {
      type: Number,
      required: true,
      min: 1,
    },

    pricePerNight: {
      type: Number,
      required: true,
      min: 0,
    },

    // Folio. totalAmount is always the grand total after extras, discount and
    // tax; see utils/billing.js.
    roomCharges: {
      type: Number,
      default: 0,
      min: 0,
    },

    charges: {
      type: [chargeSchema],
      default: [],
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    discountReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },

    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 50,
    },

    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    invoiceNumber: {
      type: String,
      default: null,
    },

    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    payments: {
      type: [paymentSchema],
      default: [],
    },

    // Details of the most recent payment, kept for older screens and exports.
    paymentMethod: {
      type: String,
      enum: [...PAYMENT_METHODS, null],
      default: null,
    },

    paymentDate: {
      type: Date,
      default: null,
    },

    transactionReference: {
      type: String,
      default: "",
      trim: true,
    },

    specialRequests: {
      type: String,
      default: "",
      trim: true,
      maxlength: 600,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // When the staff decision (approval or rejection) was made.
    verifiedAt: {
      type: Date,
      default: null,
    },

    // Set when the front desk deliberately gave a guest a second stay over the
    // same dates with one identity document (for example a second room).
    sameDocumentOverlapApprovedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    decisionNote: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },

    checkedInAt: {
      type: Date,
      default: null,
    },

    checkedInBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    checkedOutAt: {
      type: Date,
      default: null,
    },

    checkedOutBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
  },
  {
    timestamps: true,
    // Every save checks the document version, so two people changing the
    // same booking at once cannot silently overwrite each other.
    optimisticConcurrency: true,
  }
);

bookingSchema.index({ guest: 1, createdAt: -1 });
bookingSchema.index({ room: 1, bookingStatus: 1, checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ bookingStatus: 1, checkInDate: 1 });
bookingSchema.index({ createdAt: -1 });
bookingSchema.index({ "guestDetails.documentNumber": 1, bookingStatus: 1 });
bookingSchema.index(
  { invoiceNumber: 1 },
  { unique: true, partialFilterExpression: { invoiceNumber: { $type: "string" } } }
);

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
module.exports.ACTIVE_STATUSES = ACTIVE_STATUSES;
module.exports.BILLABLE_STATUSES = BILLABLE_STATUSES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
