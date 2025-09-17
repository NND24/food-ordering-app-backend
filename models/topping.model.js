const mongoose = require("mongoose");

const toppingSchema = new mongoose.Schema(
  {
    toppingGroupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ToppingGroup",
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
  },
  { timestamps: true }
);
module.exports = mongoose.model("Topping", toppingSchema);
