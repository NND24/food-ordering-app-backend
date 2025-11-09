const asyncHandler = require("express-async-handler");
const DishGroup = require("../models/dishGroup.model");
const Dish = require("../models/dish.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const mongoose = require("mongoose");

const getStoreDishGroups = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { activeOnly, dishActiveOnly } = req.query;

  if (!storeId) return res.status(400).json({ success: false, message: "storeId is required" });

  const query = { storeId };
  if (activeOnly === "true") {
    query.isActive = true;
  }

  const dishGroups = await DishGroup.find(query).populate({
    path: "dishes",
    match: dishActiveOnly === "true" ? { status: { $ne: "INACTIVE" } } : {},
  });

  res.status(200).json({
    success: true,
    data: dishGroups,
  });
});

const getActiveStoreDishGroups = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  const dishGroups = await DishGroup.find({
    storeId,
    isActive: true,
  }).populate("dishes");

  res.status(200).json({
    success: true,
    data: dishGroups,
  });
});

const getDishGroupById = asyncHandler(async (req, res, next) => {
  const { dishGroupId } = req.params;

  // Truy vấn danh sách món ăn
  const dishGroup = await DishGroup.findById(dishGroupId).populate("dishes");

  if (!dishGroup) {
    return next(createError(404, "DishGroup not found"));
  }

  res.status(200).json(successResponse(dishGroup, "DishGroup retrieved successfully"));
});

const createDishGroup = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { name, isActive, dishes = [] } = req.body;

  // Kiểm tra xem tên danh mục đã tồn tại trong cửa hàng chưa
  const existingDishGroup = await DishGroup.findOne({ name, store: storeId });
  if (existingDishGroup) {
    return next(createError(400, "DishGroup already exists"));
  }

  // Tạo danh mục mới
  const newDishGroup = new DishGroup({
    name,
    dishes,
    isActive,
    storeId,
  });

  await newDishGroup.save();

  res.status(201).json(successResponse(newDishGroup, "DishGroup created successfully"));
});

const updateDishGroupById = asyncHandler(async (req, res, next) => {
  const { dishGroupId } = req.params;
  const { name, isActive, dishes } = req.body;

  const group = await DishGroup.findById(dishGroupId);
  if (!group) return next(createError(404, "Dish group not found"));

  if (name !== undefined) group.name = name;
  if (isActive !== undefined) group.isActive = isActive;
  if (Array.isArray(dishes)) group.dishes = dishes;

  await group.save();

  const populatedGroup = await group.populate("dishes");

  res.status(200).json(successResponse(populatedGroup, "Dish group updated successfully"));
});

const toggleActiveDishGroup = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;

  const group = await DishGroup.findById(groupId);
  if (!group) return next(createError(404, "Dish group not found"));

  group.isActive = !group.isActive;
  await group.save();

  res.status(200).json(successResponse(group, "Dish group status toggled successfully"));
});

const deleteDishGroupById = asyncHandler(async (req, res, next) => {
  const { dishGroupId } = req.params;

  // Check if the DishGroup is used in any dish
  const dishesUsingDishGroup = await Dish.countDocuments({
    dishGroupId: dishGroupId,
  });

  if (dishesUsingDishGroup > 0) {
    return res.status(400).json({
      message: "Cannot delete DishGroup, it is used in one or more dishes",
      data: dishesUsingDishGroup,
    });
  }

  // Find and delete DishGroup
  const deletedDishGroup = await DishGroup.findByIdAndDelete(dishGroupId);

  if (!deletedDishGroup) {
    return next(createError(404, "DishGroup not found"));
  }
  res.status(200).json(successResponse(null, "DishGroup deleted successfully"));
});

module.exports = {
  getStoreDishGroups,
  getActiveStoreDishGroups,
  getDishGroupById,
  createDishGroup,
  updateDishGroupById,
  toggleActiveDishGroup,
  deleteDishGroupById,
};
