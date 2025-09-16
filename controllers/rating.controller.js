const Store = require("../models/store.model");
const Dish = require("../models/dish.model");
const Rating = require("../models/rating.model");
const asyncHandler = require("express-async-handler");
const createError = require("../utils/createError");
const { getPaginatedData } = require("../utils/paging");
const {getStoreIdFromUser} = require("../utils/getStoreIdFromUser")

const getAllStoreRating = asyncHandler(async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { limit, page, sort } = req.query;

    const filterOptions = { storeId };

    const result = await getPaginatedData(
      Rating,
      filterOptions,
      [
        {
          path: "user",
          select: "name avatar",
        },
        {
          path: "order",
          populate: [
            {
              path: "store",
              select: "name",
            },
            {
              path: "user",
              select: "name avatar",
            },
            {
              path: "items",
              populate: {
                path: "toppings",
              },
            },
          ],
        },
      ],
      parseInt(limit),
      parseInt(page)
    );

    if (sort === "desc") {
      result.data = result.data.sort((a, b) => b.ratingValue - a.ratingValue);
    } else if (sort === "asc") {
      result.data = result.data.sort((a, b) => a.ratingValue - b.ratingValue);
    }

    res.status(200).json(result);
  } catch (error) {
    next(createError(500, error.message));
  }
});

const getDetailRating = asyncHandler(async (req, res, next) => {
  try {
    const { ratingId } = req.params;

    const currentRating = await Rating.findById(ratingId).populate("store");

    if (!currentRating) {
      next(createError(404, "Rating not found"));
    }

    res.status(200).json(currentRating);
  } catch (error) {
    next(createError(500, error.message));
  }
});

const addStoreRating = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user?._id;
    const { storeId, orderId, ratingValue, comment, images } = req.body;

    // Validate bắt buộc
    if (!userId) return next(createError(401, "User not authenticated"));
    if (!storeId || !orderId) return next(createError(400, "Missing storeId or orderId"));
    if (typeof ratingValue !== "number" || ratingValue < 1 || ratingValue > 5)
      return next(createError(400, "Rating value must be a number between 1 and 5"));

    // Kiểm tra comment hoặc images nếu cần ít nhất 1 trong 2
    if (!comment?.trim() && (!images || images.length === 0)) {
      return next(createError(400, "Comment or image is required"));
    }

    // Kiểm tra người dùng đã đánh giá đơn hàng này chưa
    const existing = await Rating.findOne({ userId, orderId });
    if (existing) {
      return next(createError(409, "You have already rated this order"));
    }

    await Rating.create({
      userId,
      storeId,
      orderId,
      ratingValue,
      comment,
      images,
    });

    res.status(201).json({ success: true, message: "Add rating successfully" });
  } catch (error) {
    next(createError(500, error.message));
  }
});

const editStoreRating = asyncHandler(async (req, res, next) => {
  try {
    const { ratingId } = req.params;
    const { ratingValue, comment, images } = req.body;

    // Kiểm tra ratingId
    if (!ratingId) {
      return next(createError(400, "Missing ratingId"));
    }

    // Validate ratingValue nếu có
    if (ratingValue !== undefined) {
      const value = Number(ratingValue);
      if (isNaN(value) || value < 1 || value > 5) {
        return next(createError(400, "Rating value must be a number between 1 and 5"));
      }
    }

    const currentRating = await Rating.findById(ratingId);

    if (!currentRating) {
      return next(createError(404, "Rating not found"));
    }

    // Cập nhật các trường nếu có thay đổi
    if (ratingValue !== undefined) currentRating.ratingValue = ratingValue;
    if (comment !== undefined) currentRating.comment = comment;
    if (images !== undefined) currentRating.images = images;

    currentRating.updatedAt = new Date();

    await currentRating.save();

    res.status(200).json({
      success: true,
      message: "Rating updated successfully",
    });
  } catch (error) {
    next(createError(500, error.message));
  }
});

const deleteStoreRating = asyncHandler(async (req, res, next) => {
  try {
    const { ratingId } = req.params;
    const currentRating = await Rating.findById(ratingId);

    if (!currentRating) {
      next(createError(404, "Rating not found"));
    }

    await Rating.findByIdAndDelete(ratingId);

    res.status(200).json({
      success: true,
      message: "Delete rating successfully",
    });
  } catch (error) {
    next(createError(500, error.message));
  }
});


const getRatingsByStore = asyncHandler(async (req, res, next) => {
  try {
    const userId = req?.user?._id;
    const storeId = await getStoreIdFromUser(userId);
    const { page, limit, replied, sort = "-createdAt" } = req.query;

    const filterOptions = { storeId };

    // Replied filter logic
    if (replied === "true") {
      filterOptions.storeReply = { $ne: "" };
    } else if (replied === "false") {
      filterOptions.storeReply = "";
    }

    // Use your pagination helper
    const result = await getPaginatedData(
      Rating,
      filterOptions,
      "user order", // populate both
      limit,
      page,
      sort
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getRatingsByStore:", error.message);
    next(createError(500, error.message));
  }
});

const replyToRating = asyncHandler(async (req, res, next) => {
  try {
    const ratingId = req.params.id;
    const userId = req?.user?._id;
    const storeId = await getStoreIdFromUser(userId);
    const { storeReply } = req.body;

    if (typeof storeReply !== "string") {
      return next(createError(400,"Reply must be a string"))
    }

    const rating = await Rating.findById(ratingId);

    if (!rating) {
      return next(createError(404,"Rating not found"))
    }

    if (rating.storeId.toString() !== storeId.toString()) {
      return next(createError(403,"You are not authorized to reply to this rating"))
    }

    rating.storeReply = storeReply;
    await rating.save();

    res.status(200).json({
      success: true,
      message: "Reply saved successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error in replyToRating:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = {
  getAllStoreRating,
  getDetailRating,
  addStoreRating,
  editStoreRating,
  deleteStoreRating,
  getRatingsByStore,
  replyToRating
};
