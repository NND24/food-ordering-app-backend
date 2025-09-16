const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    cartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cart",
      required: true,
    },
    dishId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Dish",
      required: true,
    },
    dishName: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    note: {
      type: String,
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

// Virtual để lấy topping cho từng cart item
cartItemSchema.virtual("toppings", {
  ref: "CartItemTopping",
  localField: "_id",
  foreignField: "cartItemId",
});

//  Virtual để lấy thông tin dish đầy đủ
cartItemSchema.virtual("dish", {
  ref: "Dish",
  localField: "dishId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("CartItem", cartItemSchema);
