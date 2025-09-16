const mongoose = require("mongoose");

const cartItemToppingSchema = new mongoose.Schema(
  {
    cartItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CartItem",
      required: true,
    },
    toppingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topping",
      required: true,
    },
    toppingName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Virtual để lấy thông tin topping đầy đủ
cartItemToppingSchema.virtual("topping", {
  ref: "Topping",
  localField: "toppingId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("CartItemTopping", cartItemToppingSchema);
