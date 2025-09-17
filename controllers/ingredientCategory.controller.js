const asyncHandler = require("express-async-handler");
const IngredientCategory = require("../models/ingredientCategory.model");

// Tạo mới danh mục
const createCategory = asyncHandler(async (req, res) => {
  try {
    const { name, storeId, description } = req.body;
    const category = new IngredientCategory({ name, storeId, description });
    await category.save();
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy danh sách danh mục theo store
const getCategoriesByStore = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;
    const categories = await IngredientCategory.find({ storeId });
    res.json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy chi tiết 1 danh mục
const getCategoryById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const category = await IngredientCategory.findById(id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật danh mục
const updateCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const category = await IngredientCategory.findByIdAndUpdate(id, { name, description }, { new: true });
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.status(200).json({ success: true, message: "Update successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xoá danh mục
const deleteCategory = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const category = await IngredientCategory.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = {
  createCategory,
  getCategoriesByStore,
  getCategoryById,
  updateCategory,
  deleteCategory,
};
