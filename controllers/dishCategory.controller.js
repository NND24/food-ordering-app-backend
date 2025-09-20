const asyncHandler = require("express-async-handler");
const DishCategory = require("../models/dishCategory.model");
const Dish = require("../models/dish.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const mongoose = require("mongoose");

const getStoreCategories = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  const categories = await DishCategory.find({
    store: new mongoose.Types.ObjectId(storeId),
  }).populate("dishes");

  res.status(200).json({
    success: true,
    data: categories,
  });
});

const getCategoryById = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;

  // Truy vấn danh sách món ăn
  const category = await DishCategory.findById(categoryId);

  if (!category) {
    return next(createError(404, "Category not found"));
  }

  res.status(200).json(successResponse(category, "Category retrieved successfully"));
});

const createCategory = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { name, description, isActive } = req.body;

  // Kiểm tra xem tên danh mục đã tồn tại trong cửa hàng chưa
  const existingCategory = await DishCategory.findOne({ name, store: storeId });
  if (existingCategory) {
    return next(createError(400, "Category already exists"));
  }

  // Tạo danh mục mới
  const newCategory = new DishCategory({
    name,
    description,
    isActive,
    store: storeId,
  });

  await newCategory.save();

  res.status(201).json(successResponse(newCategory, "Category created successfully"));
});

const updateCategoryById = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;
  const { name, description, isActive } = req.body;

  // Validate input
  if (!name) {
    return next(createError(400, "Category name is required"));
  }

  // Find and update category
  const updatedCategory = await DishCategory.findByIdAndUpdate(
    categoryId,
    { name, description, isActive },
    { new: true } // Return updated document
  );

  if (!updatedCategory) {
    return next(createError(404, "Category not found"));
  }
  res.status(200).json(successResponse(null, "Category updated successfully"));
});

const deleteCategoryById = asyncHandler(async (req, res, next) => {
  const { categoryId } = req.params;

  // Check if the category is used in any dish
  const dishesUsingCategory = await Dish.countDocuments({
    category: categoryId,
  });

  if (dishesUsingCategory > 0) {
    return res.status(400).json({
      message: "Cannot delete category, it is used in one or more dishes",
      data: dishesUsingCategory,
    });
  }

  // Find and delete category
  const deletedCategory = await DishCategory.findByIdAndDelete(categoryId);

  if (!deletedCategory) {
    return next(createError(404, "Category not found"));
  }
  res.status(200).json(successResponse(null, "Category deleted successfully"));
});

module.exports = {
  getStoreCategories,
  getCategoryById,
  createCategory,
  updateCategoryById,
  deleteCategoryById,
};
