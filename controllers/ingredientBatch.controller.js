const asyncHandler = require("express-async-handler");
const Unit = require("../models/unit.model");
const IngredientBatch = require("../models/ingredientBatch.model");
const Ingredient = require("../models/ingredient.model");
const Dish = require("../models/dish.model");
const Topping = require("../models/topping.model");
const { updateIngredientStatus, updateDishStatus, updateToppingStatus } = require("../config/expireBatches");

// Tạo batch mới
const createBatch = asyncHandler(async (req, res) => {
  try {
    const {
      ingredient,
      quantity,
      costPerUnit,
      inputUnit,
      expiryDate,
      storeId,
      supplierName,
      storageLocation,
      batchCode,
    } = req.body;

    if (!ingredient || !quantity || !costPerUnit || !inputUnit || !storeId) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // 1️⃣ Lấy đơn vị nhập
    const unit = await Unit.findById(inputUnit);
    if (!unit) {
      return res.status(400).json({
        success: false,
        message: "Invalid input unit",
      });
    }

    const ratio = unit.ratio || 1;

    // 2️⃣ Quy đổi về base unit
    const quantityInBase = quantity * ratio;
    const costPerBaseUnit = costPerUnit / ratio;

    // 3️⃣ Lưu batch theo BASE UNIT
    const batch = new IngredientBatch({
      ingredient,
      inputUnit: unit._id,
      quantity: quantityInBase,
      remainingQuantity: quantityInBase,
      costPerUnit: costPerBaseUnit,
      totalCost: quantity * costPerUnit, // tổng tiền gốc KHÔNG đổi
      expiryDate,
      storeId,
      supplierName,
      storageLocation,
      batchCode,
    });

    await batch.save();

    // 🔄 Update trạng thái liên quan
    await updateIngredientStatus(ingredient);

    const dishes = await Dish.find({ "ingredients.ingredient": ingredient });
    for (const dish of dishes) {
      await updateDishStatus(dish._id);
    }

    const toppings = await Topping.find({ "ingredients.ingredient": ingredient });
    for (const topping of toppings) {
      await updateToppingStatus(topping._id);
    }

    res.status(201).json({
      success: true,
      data: batch,
    });
  } catch (error) {
    console.error("❌ Lỗi khi tạo batch:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Lấy tất cả batch theo nguyên liệu
const getBatchesByIngredient = asyncHandler(async (req, res) => {
  try {
    const { ingredientId } = req.params;
    const batches = await IngredientBatch.find({ ingredient: ingredientId })
      .populate({
        path: "ingredient",
        populate: { path: "unit" },
      })
      .populate("storeId");
    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const getBatchById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params; // batch id
    const batch = await IngredientBatch.findById(id)
      .populate({
        path: "ingredient",
        populate: { path: "unit" },
      })
      .populate("inputUnit", "name ratio baseUnit")
      .populate("storeId");

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
    const batches = await IngredientBatch.find({ storeId })
      .populate({
        path: "ingredient",
        populate: {
          path: "unit",
          select: "name ratio baseUnit",
        },
      })
      .populate("inputUnit", "name ratio baseUnit")
      .populate("storeId")
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: batches });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật batch
const updateBatch = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const batch = await IngredientBatch.findById(id);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // lấy giá trị mới nếu có, không thì lấy giá trị cũ
    const quantity = req.body.quantity !== undefined ? req.body.quantity : batch.quantity;

    const costPerUnit = req.body.costPerUnit !== undefined ? req.body.costPerUnit : batch.costPerUnit;

    // luôn đảm bảo totalCost đúng
    req.body.totalCost = quantity * costPerUnit;

    const updatedBatch = await IngredientBatch.findByIdAndUpdate(id, req.body, { new: true });

    res.json({
      success: true,
      message: "Update successfully",
      data: updatedBatch,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
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
