const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: String,
    address: {
      full_address: String,
      lat: Number,
      lon: Number,
    },
    storeCategory: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SystemCategory",
      },
    ],
    avatar: { filePath: String, url: String },
    cover: { filePath: String, url: String },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "BLOCKED"],
      default: "APPROVED",
    },
    openStatus: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },
    openHour: {
      type: String,
      required: true,
      default: "08:00",
    },
    closeHour: {
      type: String,
      required: true,
      default: "18:00",
    },
    paperWork: {
      IC_front: { filePath: String, url: String },
      IC_back: { filePath: String, url: String },
      businessLicense: { filePath: String, url: String },
      storePicture: [
        {
          filePath: String,
          url: String,
        },
      ],
    },
    staff: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Store", storeSchema);
