const mongoose = require("mongoose");

const maintenanceSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },
    issueTitle: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["pending", "in-progress", "completed"],
      default: "pending",
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    completedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolutionNote: {
      type: String,
      trim: true,
      default: "",
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

maintenanceSchema.index({ room: 1, status: 1 });
maintenanceSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model(
  "Maintenance",
  maintenanceSchema
);
