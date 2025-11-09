const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, unit: true, required: true, lowercase: true, trim: true }, // ví dụ: "kg", "gram", "liter", "piece"
    type: { type: String, enum: ["weight", "volume", "count"], required: true }, // loại đơn vị
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

UnitSchema.index({ name: 1, storeId: 1 }, { unique: true });

module.exports = mongoose.model("Unit", UnitSchema);
