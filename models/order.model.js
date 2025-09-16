const mongoose = require("mongoose");

// Order Schema
const orderSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["pending", "confirmed", "finished", "taken", "delivering", "delivered", "done", "cancelled"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "vnpay"],
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed", "cancelled"],
    },
    subtotalPrice: {
      type: Number,
    },
    totalDiscount: {
      type: Number,
    },
    shippingFee: {
      type: Number,
    },
    finalTotal: {
      type: Number,
      required: true,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true },
  }
);

orderSchema.virtual("items", {
  ref: "OrderItem",
  localField: "_id",
  foreignField: "orderId",
});

orderSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

orderSchema.virtual("store", {
  ref: "Store",
  localField: "storeId",
  foreignField: "_id",
  justOne: true,
});


function softDeletePlugin(schema, options) {
  const notDeletedCondition = { deleted: false };

  schema.pre(/^find/, function (next) {
    if (!this.getFilter().hasOwnProperty("deleted")) {
      this.where(notDeletedCondition);
    }
    next();
  });

  schema.methods.softDelete = function () {
    this.deleted = true;
    return this.save();
  };

  schema.statics.softDeleteById = function (id) {
    return this.findByIdAndUpdate(id, { deleted: true });
  };
}
orderSchema.plugin(softDeletePlugin);

module.exports = mongoose.model("Order", orderSchema);
