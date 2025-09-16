const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    provider: {
      type: String,
      enum: ["vnpay", "momo", "zalopay", "stripe", "paypal", "other"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "VND",
    },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "refunded", "cancelled"],
      default: "pending",
    },
    transactionId: {
      type: String, // e.g., vnp_TxnRef or momoTransId
      required: true,
      unique: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed, // Allow any structure
      default: {},
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

module.exports = mongoose.model("Payment", paymentSchema);
