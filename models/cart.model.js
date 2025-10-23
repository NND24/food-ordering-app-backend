const mongoose = require("mongoose");

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    storeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

cartSchema.virtual("items", {
  ref: "CartItem",
  localField: "_id",
  foreignField: "cartId",
});

cartSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

cartSchema.virtual("store", {
  ref: "Store",
  localField: "storeId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("Cart", cartSchema);
