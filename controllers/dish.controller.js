const asyncHandler = require("express-async-handler");
const Dish = require("../models/dish.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const { getPaginatedData } = require("../utils/paging");
const mongoose = require("mongoose");
const redisCache = require("../utils/redisCaches");

const getDishById = asyncHandler(async (req, res) => {
    const { dish_id } = req.params;

    if (!dish_id) {
        return next(createError(400, "Dish ID is required"));
    }

    const dish = await Dish.findById(dish_id)
        .select(
            "name price description stockStatus image categor toppingGroups"
        )
        .populate("toppingGroups", "name price")
        .populate("category", "_id name");

    if (!dish) {
        return next(createError(404, "Dish not found"));
    }

    res.status(200).json(successResponse(dish, "Dish retrieved successfully"));
});

const getDishesByStoreId = asyncHandler(async (req, res, next) => {
    const { store_id } = req.params;
    const { name, limit, page } = req.query;

    if (!store_id) {
        return next(createError(400, "store ID is required"));
    }

    const cacheKey = `dishes:store:${store_id}${name ? `:name=${name}` : ""}${
        limit ? `:limit=${limit}` : ""
    }${page ? `:page=${page}` : ""}`;
    console.log(`Cache key: ${cacheKey}`);
    const cached = await redisCache.get(cacheKey);
    if (cached) {
        return res
            .status(200)
            .json(
                successResponse(
                    cached,
                    "Dishes retrieved successfully (from cache)"
                )
            );
    }

    let filterOptions = { storeId: new mongoose.Types.ObjectId(store_id) };
    if (name) filterOptions.name = { $regex: name, $options: "i" };

    const result = await getPaginatedData(
        Dish,
        filterOptions,
        [
            { path: "category", select: "name" },
            {
                path: "toppingGroups",
                select: "name toppings",
                populate: { path: "toppings", select: "name price" },
            },
        ],
        limit,
        page
    );

    await redisCache.set(cacheKey, result);
    res.status(200).json(
        successResponse(result, "Dishes retrieved successfully")
    );
});

const createDish = asyncHandler(async (req, res, next) => {
    const { store_id } = req.params;
    const {
        name,
        price,
        description,
        stockStatus,
        image,
        category,
        toppingGroups,
    } = req.body;
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
    console.log(`Store effected: ${dish.storeId._id}`);
    await redisCache.del(`dishes:store:${dish.storeId._id}`);
    res.status(201).json(successResponse(dish, "Dish created successfully"));
});

const changeStatus = asyncHandler(async (req, res, next) => {
    const { dish_id } = req.params;
    console.log(`Change status for dish ID: ${dish_id}`);
    const dish = await Dish.findById(dish_id);
    console.log(dish);
    if (dish) {
        if (dish.stockStatus == "AVAILABLE") {
            dish.stockStatus = "OUT_OF_STOCK";
        } else {
            dish.stockStatus = "AVAILABLE";
        }
    }
    await dish.save();
    console.log(`Store effected: ${dish.storeId._id}`);
    await redisCache.del(`dishes:store:${dish.storeId._id}`);
    res.status(200).json(
        successResponse(null, "Dish on/off stock status change successfully")
    );
});

const updateDish = asyncHandler(async (req, res, next) => {
    const { dish_id } = req.params;
    const { name, price, description, image, category, toppingGroups } =
        req.body;

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
    console.log(`Store effected: ${dish.storeId._id}`);
    await redisCache.del(`dishes:store:${dish.storeId._id}`);
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
    console.log(`Store effected: ${dish.storeId._id}`);
    await redisCache.del(`dishes:store:${dish.storeId._id}`);
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
