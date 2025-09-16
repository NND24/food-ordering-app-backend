const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    detailAddress: {
      type: String,
      trim: true,
    },
    contactName: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    contactPhonenumber: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["home", "company", "familiar"],
      default: "familiar",
    },
  },
  {
    timestamps: true,
  }
);

locationSchema.index({ location: "2dsphere" });

module.exports = mongoose.model("Location", locationSchema);
