const asyncHandler = require("express-async-handler");
const Ingredient = require("../models/ingredient.model");

// Tạo nguyên liệu
const createIngredient = asyncHandler(async (req, res) => {
  const { name, unit, description, category, reorderLevel, storeId, status } = req.body;

  if (!name || !unit || !category || !storeId) {
    return res.status(400).json({ success: false, message: "Thiếu dữ liệu bắt buộc" });
  }

  const ingredient = new Ingredient({
    name,
    unit,
    description,
    category,
    reorderLevel,
    storeId,
    status: status || "ACTIVE",
  });

  await ingredient.save();
  res.status(201).json({ success: true, data: ingredient });
});

// Lấy danh sách nguyên liệu theo store
const getIngredientsByStore = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const ingredients = await Ingredient.find({ storeId }).populate("category unit");
  res.status(200).json({ success: true, data: ingredients });
});

// Lấy danh sách nguyên liệu đang hoạt động (status = ACTIVE)
const getActiveIngredientsByStore = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const ingredients = await Ingredient.find({ storeId, status: "ACTIVE" }).populate("category unit");
  res.status(200).json({ success: true, data: ingredients });
});

// Lấy nguyên liệu theo category
const getIngredientsByCategory = asyncHandler(async (req, res) => {
  const { categoryId, storeId } = req.params;

  if (!storeId) {
    return res.status(400).json({ success: false, message: "storeId is required" });
  }

  const ingredients = await Ingredient.find({
    storeId,
    category: categoryId,
  })
    .populate("unit", "name type")
    .sort({ name: 1 });

  res.status(200).json({ success: true, data: ingredients });
});

// Lấy chi tiết nguyên liệu
const getIngredientById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ingredient = await Ingredient.findById(id).populate("category unit");
  if (!ingredient) {
    return res.status(404).json({ success: false, message: "Ingredient not found" });
  }
  res.status(200).json({ success: true, data: ingredient });
});

// Cập nhật nguyên liệu
const updateIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, unit, description, category, reorderLevel, status } = req.body;

  const ingredient = await Ingredient.findByIdAndUpdate(
    id,
    { name, unit, description, category, reorderLevel, status },
    { new: true }
  );

  if (!ingredient) {
    return res.status(404).json({ success: false, message: "Ingredient not found" });
  }

  res.json({ success: true, message: "Update successfully", data: ingredient });
});

// Xoá nguyên liệu
const deleteIngredient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const ingredient = await Ingredient.findByIdAndDelete(id);

  if (!ingredient) {
    return res.status(404).json({ success: false, message: "Ingredient not found" });
  }

  res.json({ success: true, message: "Ingredient deleted" });
});

module.exports = {
  createIngredient,
  getIngredientsByStore,
  getActiveIngredientsByStore,
  getIngredientsByCategory,
  getIngredientById,
  updateIngredient,
  deleteIngredient,
};
