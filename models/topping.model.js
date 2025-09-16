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
  },
  { timestamps: true }
);
module.exports = mongoose.model("Topping", toppingSchema);
