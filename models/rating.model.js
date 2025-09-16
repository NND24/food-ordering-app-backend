const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema(
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
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    ratingValue: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: "",
    },
    images: [
      {
        filePath: String,
        url: String,
      },
    ],
    storeReply: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true }, // Bật virtual khi dùng .toObject()
    toJSON: { virtuals: true }, // Bật virtual khi dùng .toJSON()
  }
);

// Virtual để gọi là `user` thay vì `userId`
ratingSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// Virtual để gọi là `store` thay vì `storeId`
ratingSchema.virtual("store", {
  ref: "Store",
  localField: "storeId",
  foreignField: "_id",
  justOne: true,
});

// Virtual để gọi là `order` thay vì `orderId`
ratingSchema.virtual("order", {
  ref: "Order",
  localField: "orderId",
  foreignField: "_id",
  justOne: true,
});

module.exports = mongoose.model("Rating", ratingSchema);
