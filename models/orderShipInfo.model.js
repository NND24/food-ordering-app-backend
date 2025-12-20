const mongoose = require("mongoose");

var orderShipInfoSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    shipLocation: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    address: {
      type: String,
      trim: true,
    },
    detailAddress: {
      type: String,
      trim: true,
    },
    contactName: {
      type: String,
      trim: true,
    },
    contactPhonenumber: {
      type: String,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
    },
    // ===== Hình thức giao hàng =====
    deliveryType: {
      type: String,
      enum: ["IN_STORE", "THIRD_PARTY"],
    },

    // ===== Thông tin người giao =====
    deliverer: {
      staffId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Staff",
        default: null,
      },
      name: {
        type: String,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },
    deliveryHistory: [
      {
        deliverer: {
          staffId: mongoose.Schema.Types.ObjectId,
          name: String,
          phone: String,
        },
        assignedAt: Date,
        assignedBy: mongoose.Schema.Types.ObjectId,
        type: {
          type: String,
          enum: ["ASSIGN", "REASSIGN"],
        },
      },
    ],
  },
  { timestamps: true }
);

// Create a 2dsphere index to support geospatial queries
orderShipInfoSchema.index({ shipLocation: "2dsphere" });

module.exports = mongoose.model("OrderShipInfo", orderShipInfoSchema);
