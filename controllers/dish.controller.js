const asyncHandler = require("express-async-handler");
const DishGroup = require("../models/dishGroup.model");
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
    .select("name price description stockStatus image category toppingGroups ingredients")
    .populate({
      path: "toppingGroups",
      populate: { path: "toppings" },
    })
    .populate("ingredients.ingredient");

  if (!dish) {
    return next(createError(404, "Dish not found"));
  }

  res.status(200).json(successResponse(dish, "Dish retrieved successfully"));
});

const getDishesByStoreId = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  if (!storeId) {
    return next(createError(400, "Store ID is required"));
  }

  const dishes = await Dish.find({
    storeId: new mongoose.Types.ObjectId(storeId),
  })
    .populate({
      path: "toppingGroups",
      populate: { path: "toppings" },
    })
    .populate("ingredients.ingredient");

  res.status(200).json(successResponse(dishes, "Dishes retrieved successfully"));
});

const createDish = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { name, price, description, stockStatus, image, toppingGroups, dishGroupIds, ingredients } = req.body;

  if (!storeId) {
    return next(createError(400, "Store ID is required"));
  }
  if (!name || !price) {
    return next(createError(400, "All fields are required"));
  }

  const dish = await Dish.create({
    name,
    price,
    description,
    stockStatus,
    image,
    toppingGroups,
    ingredients,
    storeId,
  });

  if (dishGroupIds && dishGroupIds.length > 0) {
    await DishGroup.updateMany({ _id: { $in: dishGroupIds } }, { $push: { dishes: dish._id } });
  }

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
  const { name, price, description, stockStatus, image, toppingGroups, ingredients } = req.body;

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
  dish.stockStatus = stockStatus || dish.stockStatus;
  dish.image = image || dish.image;
  dish.toppingGroups = toppingGroups || dish.toppingGroups;
  dish.ingredients = ingredients || dish.ingredients;

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
