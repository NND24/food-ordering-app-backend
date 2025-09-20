const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, unit: true, required: true, lowercase: true, trim: true }, // ví dụ: "kg", "gram", "liter", "piece"
    type: { type: String, enum: ["weight", "volume", "count"], required: true }, // loại đơn vị
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Unit", UnitSchema);
