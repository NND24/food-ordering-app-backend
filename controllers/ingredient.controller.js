const asyncHandler = require("express-async-handler");
const Ingredient = require("../models/ingredient.model");

// Tạo nguyên liệu
const createIngredient = asyncHandler(async (req, res) => {
  try {
    const { name, unit, description, category, reorderLevel, storeId } = req.body;
    const ingredient = new Ingredient({ name, unit, description, category, reorderLevel, storeId });
    await ingredient.save();
    res.status(201).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy danh sách nguyên liệu theo store
const getIngredientsByStore = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;
    const ingredients = await Ingredient.find({ storeId }).populate("category unit");
    res.status(200).json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Lấy chi tiết nguyên liệu
const getIngredientById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const ingredient = await Ingredient.findById(id).populate("category unit");
    if (!ingredient) return res.status(404).json({ success: false, message: "Ingredient not found" });
    res.status(200).json({ success: true, data: ingredient });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cập nhật nguyên liệu
const updateIngredient = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const { name, unit, description, category, reorderLevel } = req.body;
    const ingredient = await Ingredient.findByIdAndUpdate(
      id,
      { name, unit, description, category, reorderLevel },
      { new: true }
    );
    if (!ingredient) return res.status(404).json({ success: false, message: "Ingredient not found" });
    res.json({ success: true, message: "Update successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Xoá nguyên liệu
const deleteIngredient = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    const ingredient = await Ingredient.findByIdAndDelete(id);
    if (!ingredient) return res.status(404).json({ message: "Ingredient not found" });
    res.json({ success: true, message: "Ingredient deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = {
  createIngredient,
  getIngredientsByStore,
  getIngredientById,
  updateIngredient,
  deleteIngredient,
};
