const mongoose = require("mongoose");

const IngredientCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("IngredientCategory", IngredientCategorySchema);
