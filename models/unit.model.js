const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, lowercase: true, trim: true }, // ví dụ: "kg", "gram", "liter", "piece"
    type: { type: String, enum: ["weight", "volume", "count"], required: true }, // loại đơn vị
    baseUnit: { type: String }, // đơn vị gốc để quy đổi, ví dụ: "gram" cho weight, "ml" cho volume
    ratio: { type: Number }, // tỉ lệ chuyển đổi so với đơn vị gốc
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", UnitSchema);
