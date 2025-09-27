const asyncHandler = require("express-async-handler");
const Topping = require("../models/topping.model");
const ToppingGroup = require("../models/toppingGroup.model");
const Dish = require("../models/dish.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");

/**
 * ========================
 * ToppingGroup Controllers
 * ========================
 */

// Lấy tất cả topping groups và toppings theo store
const getStoreToppingGroups = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  if (!storeId) return next(createError(400, "Store ID is required"));

  const groups = await ToppingGroup.find({ storeId }).populate({
    path: "toppings",
    select: "name price isActive",
  });

  res.status(200).json(successResponse(groups, "Topping groups retrieved successfully"));
});

const getActiveStoreToppingGroups = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  if (!storeId) return next(createError(400, "Store ID is required"));

  const groups = await ToppingGroup.find({ storeId, isActive: true }).populate({
    path: "toppings",
    select: "name price isActive",
  });

  res.status(200).json(successResponse(groups, "Topping groups active retrieved successfully"));
});

// Lấy topping group theo ID
const getToppingGroupById = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;
  if (!groupId) return next(createError(400, "Group ID is required"));

  const group = await ToppingGroup.findById(groupId).populate("toppings");
  if (!group) return next(createError(404, "Topping group not found"));

  res.status(200).json(successResponse(group, "Topping group retrieved successfully"));
});

// Tạo topping group
const createToppingGroup = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { name, onlyOnce, isActive, toppings = [], dishIds } = req.body;

  if (!name) return next(createError(400, "Group name is required"));

  const store = await Store.findById(storeId);
  if (!store) return next(createError(404, "Store not found"));

  const group = await ToppingGroup.create({ name, storeId, onlyOnce, isActive, toppings });

  if (dishIds && dishIds.length > 0) {
    await Dish.updateMany({ _id: { $in: dishIds } }, { $push: { toppingGroups: group._id } });
  }

  res.status(201).json(successResponse(group, "Topping group created successfully"));
});

// Cập nhật topping group
const updateToppingGroup = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;
  const { name, onlyOnce, isActive, toppings } = req.body;

  const group = await ToppingGroup.findById(groupId);
  if (!group) return next(createError(404, "Topping group not found"));

  if (name !== undefined) group.name = name;
  if (onlyOnce !== undefined) group.onlyOnce = onlyOnce;
  if (isActive !== undefined) group.isActive = isActive;
  if (Array.isArray(toppings)) group.toppings = toppings;

  await group.save();

  const populatedGroup = await group.populate("toppings");

  res.status(200).json(successResponse(populatedGroup, "Topping group updated successfully"));
});

// Toggle isActive topping group
const toggleToppingGroup = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;

  const group = await ToppingGroup.findById(groupId);
  if (!group) return next(createError(404, "Topping group not found"));

  group.isActive = !group.isActive;
  await group.save();

  res.status(200).json(successResponse(group, "Topping group status toggled successfully"));
});

// Xóa topping group và toppings bên trong
const deleteToppingGroup = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;

  const group = await ToppingGroup.findByIdAndDelete(groupId);
  if (!group) return next(createError(404, "Topping group not found"));

  await Topping.deleteMany({ _id: { $in: group.toppings } });

  res.status(200).json(successResponse(null, "Topping group and its toppings deleted successfully"));
});

/**
 * ===========
 * Topping Controllers
 * ===========
 */

// Lấy tất cả toppings của 1 store (riêng lẻ, không theo group)
const getStoreToppings = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  if (!storeId) return next(createError(400, "Store ID is required"));

  const toppings = await Topping.find({ storeId }).populate("ingredients.ingredient");

  res.status(200).json(successResponse(toppings, "Toppings retrieved successfully"));
});

// Lấy topping theo ID
const getToppingById = asyncHandler(async (req, res, next) => {
  const { toppingId } = req.params;
  const topping = await Topping.findById(toppingId).populate({
    path: "ingredients.ingredient",
    populate: {
      path: "unit",
      select: "name type",
    },
  });
  if (!topping) return next(createError(404, "Topping not found"));

  res.status(200).json(successResponse(topping, "Topping retrieved successfully"));
});

// Tạo topping
const createTopping = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { name, price, ingredients, status, toppingGroupIds } = req.body;

  if (!name || price == null) return next(createError(400, "Name and price are required"));

  const topping = await Topping.create({ storeId, name, price, ingredients, status });

  // Nếu có groupIds, thêm topping vào các group
  if (toppingGroupIds && toppingGroupIds.length > 0) {
    await ToppingGroup.updateMany({ _id: { $in: toppingGroupIds } }, { $push: { toppings: topping._id } });
  }

  res.status(201).json(successResponse(topping, "Topping created successfully"));
});

// Cập nhật topping
const updateTopping = asyncHandler(async (req, res, next) => {
  const { toppingId } = req.params;
  const { name, price, ingredients, status } = req.body;

  const topping = await Topping.findByIdAndUpdate(toppingId, { name, price, ingredients, status }, { new: true });

  if (!topping) return next(createError(404, "Topping not found"));

  res.status(200).json(successResponse(topping, "Topping updated successfully"));
});

// Toggle isActive topping
const toggleTopping = asyncHandler(async (req, res, next) => {
  const { toppingId } = req.params;

  const topping = await Topping.findById(toppingId);
  if (!topping) return next(createError(404, "Topping not found"));

  topping.isActive = !topping.isActive;
  await topping.save();

  res.status(200).json(successResponse(topping, "Topping status toggled successfully"));
});

// Xóa topping
const deleteTopping = asyncHandler(async (req, res, next) => {
  const { toppingId } = req.params;

  const topping = await Topping.findByIdAndDelete(toppingId);
  if (!topping) return next(createError(404, "Topping not found"));

  // Xóa topping khỏi tất cả nhóm
  await ToppingGroup.updateMany({ toppings: topping._id }, { $pull: { toppings: topping._id } });

  res.status(200).json(successResponse(null, "Topping deleted successfully"));
});

// Thêm topping vào group
const addToppingsToGroup = asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;
  const { toppingIds } = req.body; // Expect an array of topping IDs

  if (!Array.isArray(toppingIds) || toppingIds.length === 0) {
    return next(createError(400, "toppingIds must be a non-empty array"));
  }

  const group = await ToppingGroup.findById(groupId);
  if (!group) return next(createError(404, "Topping group not found"));

  // Lọc toppingIds mới, tránh trùng
  const newToppings = toppingIds.filter((id) => !group.toppings.includes(id));

  if (newToppings.length > 0) {
    group.toppings.push(...newToppings);
    await group.save();
  }

  res.status(200).json(successResponse(group, "Toppings added to group successfully"));
});

module.exports = {
  getStoreToppingGroups,
  getActiveStoreToppingGroups,
  getToppingGroupById,
  createToppingGroup,
  updateToppingGroup,
  toggleToppingGroup,
  deleteToppingGroup,
  getStoreToppings,
  createTopping,
  getToppingById,
  createTopping,
  updateTopping,
  toggleTopping,
  deleteTopping,
  addToppingsToGroup,
};
