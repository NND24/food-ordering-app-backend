const asyncHandler = require("express-async-handler");
const Dish = require("../models/dish.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const mongoose = require("mongoose");

const getDishById = asyncHandler(async (req, res, next) => {
  const { dish_id } = req.params;

  if (!dish_id) {
    return next(createError(400, "Dish ID is required"));
  }

  const dish = await Dish.findById(dish_id)
    .select("name price description stockStatus image category toppingGroups")
    .populate("toppingGroups", "name price")
    .populate("category", "_id name");

  if (!dish) {
    return next(createError(404, "Dish not found"));
  }

  res.status(200).json(successResponse(dish, "Dish retrieved successfully"));
});

const getDishesByStoreId = asyncHandler(async (req, res, next) => {
  const { store_id } = req.params;

  if (!store_id) {
    return next(createError(400, "Store ID is required"));
  }

  const dishes = await Dish.find({
    storeId: new mongoose.Types.ObjectId(store_id),
  })
    .populate({ path: "category", select: "name" })
    .populate({
      path: "toppingGroups",
      select: "name toppings",
      populate: { path: "toppings", select: "name price" },
    });

  res.status(200).json(successResponse(dishes, "Dishes retrieved successfully"));
});

const createDish = asyncHandler(async (req, res, next) => {
  const { store_id } = req.params;
  const { name, price, description, stockStatus, image, category, toppingGroups } = req.body;

  if (!store_id) {
    return next(createError(400, "Store ID is required"));
  }
  if (!name || !price) {
    return next(createError(400, "All fields are required"));
  }

  const dish = new Dish({
    name,
    price,
    description,
    stockStatus,
    image,
    category,
    toppingGroups,
    storeId: new mongoose.Types.ObjectId(store_id),
  });

  await dish.save();

  res.status(201).json(successResponse(dish, "Dish created successfully"));
});

const changeStatus = asyncHandler(async (req, res, next) => {
  const { dish_id } = req.params;

  const dish = await Dish.findById(dish_id);
  if (!dish) {
    return next(createError(404, "Dish not found"));
  }

  dish.stockStatus = dish.stockStatus === "AVAILABLE" ? "OUT_OF_STOCK" : "AVAILABLE";
  await dish.save();

  res.status(200).json(successResponse(null, "Dish on/off stock status changed successfully"));
});

const updateDish = asyncHandler(async (req, res, next) => {
  const { dish_id } = req.params;
  const { name, price, description, image, category, toppingGroups } = req.body;

  if (!dish_id) {
    return next(createError(400, "Dish ID is required"));
  }

  const dish = await Dish.findById(dish_id);
  if (!dish) {
    return next(createError(404, "Dish not found"));
  }

  dish.name = name || dish.name;
  dish.price = price || dish.price;
  dish.description = description || dish.description;
  dish.image = image || dish.image;
  dish.category = category || dish.category;
  dish.toppingGroups = toppingGroups || dish.toppingGroups;

  await dish.save();

  res.status(200).json(successResponse(null, "Dish updated successfully"));
});

const deleteDish = asyncHandler(async (req, res, next) => {
  const { dish_id } = req.params;

  if (!dish_id) {
    return next(createError(400, "Dish ID is required"));
  }

  const dish = await Dish.findByIdAndDelete(dish_id);
  if (!dish) {
    return next(createError(404, "Dish not found"));
  }

  res.status(200).json(successResponse(null, "Dish deleted successfully"));
});

module.exports = {
  getDishById,
  getDishesByStoreId,
  createDish,
  changeStatus,
  updateDish,
  deleteDish,
};
