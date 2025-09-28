const mongoose = require("mongoose");

const wasteSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Store",
    required: true,
  },
  ingredientBatchId: { type: mongoose.Schema.Types.ObjectId, ref: "IngredientBatch", required: true },
  quantity: { type: Number, required: true },
  reason: { type: String, enum: ["expired", "spoiled", "damaged", "other"], required: true },
  otherReason: { type: String },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Waste", wasteSchema);
