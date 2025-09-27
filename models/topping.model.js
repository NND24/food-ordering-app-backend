const mongoose = require("mongoose");

const toppingSchema = new mongoose.Schema(
  {
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    ingredients: [
      {
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
        quantity: { type: Number, required: true }, // dùng bao nhiêu unit cho 1 món
      },
    ],
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE", "OUT_OF_STOCK"],
      default: "ACTIVE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Topping", toppingSchema);
