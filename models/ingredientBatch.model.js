const mongoose = require("mongoose");

const IngredientBatchSchema = new mongoose.Schema(
  {
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
    ingredient: { type: mongoose.Schema.Types.ObjectId, ref: "Ingredient", required: true },
    batchCode: { type: String, required: true, unique: true }, // mã lô để dễ phân biệt
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

IngredientBatchSchema.pre("validate", function (next) {
  if (!this.batchCode) {
    const random = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 ký tự
    this.batchCode = `BATCH-${Date.now()}-${random}`;
  }
  next();
});

module.exports = mongoose.model("IngredientBatch", IngredientBatchSchema);
