const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true }, // ví dụ: "kg", "gram", "liter", "piece"
    type: { type: String, enum: ["weight", "volume", "count"], required: true }, // loại đơn vị
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store" }, // nếu muốn unit riêng cho từng store
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", UnitSchema);
