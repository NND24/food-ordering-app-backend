const mongoose = require("mongoose");

// Dish Schema
const dishSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    image: {
      filePath: String,
      url: String,
    },
    toppingGroups: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ToppingGroup",
      },
    ],
    ingredients: [
      {
        ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient" },
        quantity: { type: Number, required: true }, // dùng bao nhiêu unit cho 1 món
      },
    ],
    description: {
      type: String,
    },
    stockStatus: {
      type: String,
      enum: ["AVAILABLE", "INACTIVE", "OUT_OF_STOCK"],
      default: "AVAILABLE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dish", dishSchema);
