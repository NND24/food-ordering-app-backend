const mongoose = require("mongoose");

const IngredientBatchSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient", required: true },
    quantity: { type: Number, required: true }, // số lượng hiện có trong batch
    costPerUnit: { type: Number, required: true }, // giá nhập / đơn vị
    totalCost: { type: Number },
    remainingQuantity: { type: Number, required: true }, // số lượng còn lại
    receivedDate: { type: Date, default: Date.now },
    expiryDate: { type: Date }, // ngày hết hạn
    status: { type: String, enum: ["active", "expired", "finished"], default: "active" },
    supplierName: { type: String },
    storageLocation: { type: String }, // ví dụ: "Tủ đông A1"
  },
  { timestamps: true }
);

module.exports = mongoose.model("IngredientBatch", IngredientBatchSchema);
