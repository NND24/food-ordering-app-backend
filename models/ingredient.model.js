const mongoose = require("mongoose");

const IngredientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    description: { type: String },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IngredientCategory",
      required: true,
    },
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    reorderLevel: { type: Number, default: 0 }, // ngưỡng cảnh báo tồn kho,
    status: {
      type: String,
      enum: ["ACTIVE", "OUT_OF_STOCK", "INACTIVE"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ingredient", IngredientSchema);
