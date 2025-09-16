const mongoose = require("mongoose");

var userVoucherUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      required: true,
    },
    usedCount: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserVoucherUsage", userVoucherUsageSchema);
