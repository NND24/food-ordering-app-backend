const mongoose = require("mongoose");

const shippingFeeSchema = new mongoose.Schema(
  {
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    fromDistance: {
      type: Number, // Khoảng cách bắt đầu (km)
      required: true,
    },
    feePerKm: {
      type: Number, // Phí áp dụng cho mỗi km trong đoạn này (VND)
      required: true,
    },
  },
  { timestamps: true }
);
shippingFeeSchema.index({ store: 1, fromDistance: 1 }, { unique: true });

module.exports = mongoose.model("ShippingFee", shippingFeeSchema);
