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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
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
    description: {
      type: String,
    },
    stockStatus: {
      type: String,
      enum: ["AVAILABLE", "OUT_OF_STOCK"],
      default: "AVAILABLE",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Dish", dishSchema);
