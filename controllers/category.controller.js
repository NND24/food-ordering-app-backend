const asyncHandler = require("express-async-handler");
const Category = require("../models/category.model");
const Dish = require("../models/dish.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const { getPaginatedData } = require("../utils/paging");
const mongoose = require("mongoose");

const getStoreCategories = asyncHandler(async (req, res, next) => {
    const { name, limit, page } = req.query;
    const { store_id } = req.params;

    // Build filter options
    let filterOptions = { store: new mongoose.Types.ObjectId(store_id) };
    if (name) {
      filterOptions.name = { $regex: name, $options: "i" };
    }

    // Use your paginated data helper
    const response = await getPaginatedData(Category, filterOptions, "dishes", limit, page);

    res.status(200).json(
        response
    );
});

const getCategoryById = asyncHandler(async (req, res, next) => {
    const { category_id } = req.params;

    // Truy vấn danh sách món ăn
    const category = await Category.findById(category_id);

    if (!category) {
        return next(createError(404, "Category not found"));
    }

    res.status(200).json(successResponse(category, "Category retrieved successfully"));
});

const createCategory = asyncHandler(async (req, res, next) => {
    const { store_id } = req.params;
    const { name } = req.body;

    // Kiểm tra xem tên danh mục đã tồn tại trong cửa hàng chưa
    const existingCategory = await Category.findOne({ name, store: store_id });
    if (existingCategory) {
        return next(createError(400, "Category already exists"));
    }

    // Tạo danh mục mới
    const newCategory = new Category({
        name,
        store: store_id,
    });

    await newCategory.save();

    res.status(201).json(successResponse(newCategory, "Category created successfully"));
});

const updateCategoryById = asyncHandler(async (req, res, next) => {
    const { category_id } = req.params;
    const { name } = req.body;

    // Validate input
    if (!name) {
        return next(createError(400, "Category name is required"));
    }

    // Find and update category
    const updatedCategory = await Category.findByIdAndUpdate(
      category_id,
      { name },
      { new: true } // Return updated document
    );

    if (!updatedCategory) {
        return next(createError(404, "Category not found"));
    }
    res.status(200).json(successResponse(null, "Category updated successfully"));
});

const deleteCategoryById = asyncHandler(async (req, res, next) => {
    const { category_id } = req.params;

    // Check if the category is used in any dish
    const dishesUsingCategory = await Dish.countDocuments({
      category: category_id,
    });

    if (dishesUsingCategory > 0) {
        
      return res.status(400).json({
        message: "Cannot delete category, it is used in one or more dishes",
        data: dishesUsingCategory,
      });
    }

    // Find and delete category
    const deletedCategory = await Category.findByIdAndDelete(category_id);

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
    deleteCategoryById
};