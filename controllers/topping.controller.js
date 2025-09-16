const asyncHandler = require("express-async-handler");
const Topping = require("../models/topping.model");
const ToppingGroup = require("../models/toppingGroup.model");
const Dish = require("../models/dish.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const { getPaginatedData } = require("../utils/paging");
const mongoose = require("mongoose");

const getStoreToppings = asyncHandler(async (req, res, next) => {
    const { limit, page } = req.query;
    const { store_id } = req.params;
    let filterOptions = { store: store_id };

    const response = await getPaginatedData(
        ToppingGroup,
        filterOptions,
        [
            {
                path: "toppings",
                select: "name price",
            },
        ],
        limit,
        page
    );
    res.status(200).json(
        response
    );
});

const getDishToppings = asyncHandler(async (req, res, next) => {
    const { dish_id } = req.params;

    // Fetch the dish with its topping groups and toppings
    const dish = await Dish.findById(dish_id).populate({
        path: "toppingGroups",
        populate: {
            path: "toppings",
        },
    });

    if (!dish) {
        return next(createError(404, "Dish not found"));
    }

    if (!dish.toppingGroups || dish.toppingGroups.length === 0) {
        return next(createError(404, "No topping groups found for this dish"));
    }

    // Sanitize: remove toppingGroup field from each topping
    const cleanedToppingGroups = dish.toppingGroups.map((group) => {
        const cleanedToppings = group.toppings.map((topping) => {
            const { toppingGroup, ...rest } = topping.toObject(); // Remove toppingGroup
            return rest;
        });
        return {
            ...group.toObject(),
            toppings: cleanedToppings,
        };
    });

    res.status(200).json(
        successResponse(cleanedToppingGroups, "Toppings retrieved successfully")
    );
});

const getToppingById = asyncHandler(async (req, res, next) => {
    const { topping_id } = req.params;

    if (!topping_id) {
        return next(createError(400, "Topping ID is required"));
    }

    const topping = await Topping.findById(topping_id)
        .select("name price description")
        .populate("store", "name");

    if (!topping) {
        return next(createError(404, "Topping not found"));
    }

    res.status(200).json(
        successResponse(topping, "Topping retrieved successfully")
    );
});

const getToppingGroupById = asyncHandler(async (req, res, next) => {
    const { group_id } = req.params;

    if (!group_id) {
        return next(createError(400, "Topping group ID is required"));
    }

    // Truy vấn danh sách món ăn
    const toppingGroup = await ToppingGroup.findById(group_id).populate({
        path: "toppings",
        select: "-toppingGroup",
    });

    if (!toppingGroup) {
        return next(createError(400, "Topping group not found"));
    }

    res.status(200).json(
        successResponse(toppingGroup, "Topping group retrieved successfully")
    );
});

const createToppingGroup = asyncHandler(async (req, res, next) => {
    const { store_id } = req.params;
    const { name, onlyOnce, toppings } = req.body;

    // Validate store_id
    const store = await Store.findById(store_id);
    if (!store) {
        return next(createError(400, "Store not found"));
    }

    // Create a new ToppingGroup
    const toppingGroup = new ToppingGroup({
        name,
        store: store_id,
        onlyOnce,
        toppings, // Expecting an array of toppings from request body
    });

    // Save to database
    await toppingGroup.save();
    const result = toppingGroup.toObject();

    const filteredResult = {
        _id: result._id,
        name: result.name,
        onlyOnce: result.onlyOnce,
    };

    res.status(201).json(
        successResponse(filteredResult, "Topping group created successfully")
    );
});

const createToppingInGroup = asyncHandler(async (req, res, next) => {
    const { group_id } = req.params;
    const { name, price } = req.body;

    if (!name || price === undefined) {
        return next(createError(400, "Topping name and price are required"));
    }

    // Ensure price is stored as a Number
    const parsedPrice = Number(price);
    if (isNaN(parsedPrice)) {
        return next(createError(400, "Invalid price format"));
    }

    // Find the topping group
    let toppingGroup = await ToppingGroup.findById(group_id);
    if (!toppingGroup) {
        return next(createError(400, "Topping group not found"));
    }

    // Create a new Topping document
    const newTopping = await Topping.create({
      name,
      price: parsedPrice,
      toppingGroupId: group_id, // Associate it with the group
    });

    // Push the new topping's ObjectId to the toppingGroup
    toppingGroup.toppings.push(newTopping._id);
    await toppingGroup.save();

    const result = newTopping.toObject();
    const filteredResult = {
        _id: result._id,
        name: result.name,
        price: result.price,
    };

    res.status(201).json(
        successResponse(filteredResult, "Topping created successfully")
    );

});

const updateToppingInGroup = asyncHandler(async (req, res, next) => {
    const { group_id, topping_id } = req.params;
    const { name, price } = req.body;

    // Validate input
    if (!name || price == null) {
        return next(createError(400, "Name and price are required"));
    }

    // Find and update the topping
    const updatedTopping = await Topping.findOneAndUpdate(
      { _id: topping_id, toppingGroupId: group_id },
      { name, price },
      { new: true }
    );

    if (!updatedTopping) {
        return next(createError(404, "Topping not found in the specified group"));
    }
    res.status(200).json(
        successResponse(null, "Topping updated successfully")
    );

});

const deleteToppingInGroup = asyncHandler(async (req, res, next) => {
    const { group_id, topping_id } = req.params;

    // Find the topping group
    let toppingGroup = await ToppingGroup.findById(group_id);
    if (!toppingGroup) {
        return next(createError(400, "Topping group not found"));
    }

    // Find and remove the topping
    const initialLength = toppingGroup.toppings.length;
    toppingGroup.toppings = toppingGroup.toppings.filter(
      (topping) => topping._id.toString() !== topping_id
    );

    if (toppingGroup.toppings.length === initialLength) {
        return next(createError(404, "Topping not found in the group"));
    }

    // Save the updated group
    await toppingGroup.save();

    // Also delete the topping document
    await Topping.findByIdAndDelete(topping_id);

    res.status(200).json(successResponse(null, "Topping deleted successfully"));
})

const deleteToppingGroup = asyncHandler(async (req, res, next) => {
    const { group_id } = req.params;

    // Find the group first
    const deletedGroup = await ToppingGroup.findByIdAndDelete(group_id);

    if (!deletedGroup) {
        return next(createError(404, "Topping group not found"));
    }

    // Delete all toppings that belong to this group
    await Topping.deleteMany({ toppingGroup: group_id });

    res.status(200).json(successResponse(null, "Topping group and all toppings deleted successfully"));
});

module.exports = {
    getStoreToppings,
    getDishToppings,
    getToppingGroupById,
    getToppingById,
    createToppingGroup,
    createToppingInGroup,
    updateToppingInGroup,
    deleteToppingInGroup,
    deleteToppingGroup,
};
