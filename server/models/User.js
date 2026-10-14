const mongoose = require("mongoose");

const { ROLES } = require("../config/permissions");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    phone: {
      type: String,
      trim: true,
      default: "",
      maxlength: 20,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    role: {
      type: String,
      enum: ROLES,
      default: "guest",
    },

    // Deactivated accounts keep their history but can no longer sign in.
    isActive: {
      type: Boolean,
      default: true,
    },

    // Incremented on sign-out, password change and deactivation. Tokens
    // carrying an older version are rejected.
    tokenVersion: {
      type: Number,
      default: 0,
    },

    passwordChangedAt: {
      type: Date,
      default: null,
    },

    failedLoginCount: {
      type: Number,
      default: 0,
      select: false,
    },

    lockUntil: {
      type: Date,
      default: null,
      select: false,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    // Only the SHA-256 hash of a reset token is ever stored.
    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    resetTokenExpires: {
      type: Date,
      default: null,
      select: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ resetTokenHash: 1 }, { sparse: true });

// The only shape of a user that is ever sent to a client.
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    phone: this.phone || "",
    role: this.role,
    isActive: this.isActive !== false,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

const User = mongoose.model("User", userSchema);

module.exports = User;
