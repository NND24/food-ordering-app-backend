const asyncHandler = require("express-async-handler");
const IngredientBatch = require("../models/ingredientBatch.model");

// Tạo batch mới
const createBatch = asyncHandler(async (req, res) => {
  try {
    const { ingredient, quantity, costPerUnit, expiryDate, storeId, supplierName, storageLocation } = req.body;

    const batch = new IngredientBatch({
      ingredient,
      quantity,
      remainingQuantity: quantity,
      costPerUnit,
      totalCost: quantity * costPerUnit,
      expiryDate,
      storeId,
      supplierName,
      storageLocation,
    });

    await batch.save();
    res.status(201).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy tất cả batch theo nguyên liệu
const getBatchesByIngredient = asyncHandler(async (req, res) => {
  try {
    const { ingredientId } = req.params;
    const batches = await IngredientBatch.find({ ingredient: ingredientId }).populate("ingredient").populate("storeId");
    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const getBatchById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params; // batch id
    const batch = await IngredientBatch.findById(id).populate("ingredient").populate("storeId");

    if (!batch) {
      return res.status(404).json({ success: false, message: "Không tìm thấy lô nhập" });
    }

    res.status(200).json({ success: true, data: batch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy tất cả batch theo cửa hàng
const getBatchesByStore = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;
    const batches = await IngredientBatch.find({ storeId }).populate("ingredient").populate("storeId");
    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật batch
const updateBatch = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    // nếu có quantity hoặc costPerUnit thì tính lại totalCost
    if (req.body.quantity || req.body.costPerUnit) {
      const batch = await IngredientBatch.findById(id);
      if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });

      const quantity = req.body.quantity ?? batch.quantity;
      const costPerUnit = req.body.costPerUnit ?? batch.costPerUnit;

      req.body.totalCost = quantity * costPerUnit;
    }

    const updatedBatch = await IngredientBatch.findByIdAndUpdate(id, req.body, { new: true });
    if (!updatedBatch) return res.status(404).json({ success: false, message: "Batch not found" });

    res.json({ success: true, message: "Update successfully", data: updatedBatch });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xoá batch
const deleteBatch = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await IngredientBatch.findByIdAndDelete(id);
    if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });
    res.json({ success: true, message: "Batch deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = {
  createBatch,
  getBatchesByIngredient,
  getBatchById,
  getBatchesByStore,
  updateBatch,
  deleteBatch,
};
