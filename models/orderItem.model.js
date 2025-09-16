const mongoose = require("mongoose");

var orderItemSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
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
      required: false,
    },
  },
  { timestamps: true, toObject: { virtuals: true }, toJSON: { virtuals: true } }
);

orderItemSchema.virtual("dish", {
  ref: "Dish",
  localField: "dishId",
  foreignField: "_id",
  justOne: true,
});

orderItemSchema.virtual("toppings", {
  ref: "OrderItemTopping",
  localField: "_id",
  foreignField: "orderItemId",
});

module.exports = mongoose.model("OrderItem", orderItemSchema);
