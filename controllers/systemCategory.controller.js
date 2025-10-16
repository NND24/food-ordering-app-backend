const SystemCategory = require("../models/systemCategory.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");

const getAllSystemCategory = asyncHandler(async (req, res, next) => {
  try {
    const getSystemCategory = await SystemCategory.find();

    res.status(200).json({
      success: true,
      data: getSystemCategory,
    });
  } catch (error) {
    next(error);
  }
});

const getSystemCategoryByStoreId = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  if (!storeId) {
    return next(createError(400, "Store ID is required"));
  }

  // 🔍 Tìm cửa hàng và lấy danh mục đã đăng ký
  const store = await Store.findById(storeId).select("storeCategory");
  if (!store) {
    return next(createError(404, "Store not found"));
  }

  // 🔍 Lấy chi tiết các danh mục
  const categories = await SystemCategory.find({
    _id: { $in: store.storeCategory },
  });

  res.status(200).json({
    success: true,
    data: categories,
    count: categories.length,
    message: "System categories retrieved successfully for this store",
  });
});

const getSystemCategory = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    const getSystemCategory = await SystemCategory.findById(id).select("name image");

    if (getSystemCategory) {
      res.status(200).json({
        success: true,
        data: getSystemCategory,
      });
    } else {
      return res.status(404).json({
        success: false,
        message: "System Category not found",
      });
    }
  } catch (error) {
    next(error);
  }
});

const createSystemCategory = asyncHandler(async (req, res, next) => {
  const { name, image } = req.body;

  if (!name || typeof name !== "string") {
    return res.status(400).json({
      success: false,
      message: "Tên loại thức ăn không hợp lệ",
    });
  }

  if (!image || !image.url) {
    return res.status(400).json({
      success: false,
      message: "Ảnh loại thức ăn không hợp lệ",
    });
  }

  const exists = await SystemCategory.isNameExists(name);
  if (exists) {
    return res.status(409).json({
      success: false,
      message: "Loại thức ăn đã tồn tại",
    });
  }

  await SystemCategory.create({
    name,
    image,
  });

  res.status(201).json({
    success: true,
    message: "Tạo loại thức ăn thành công",
  });
});

const updateSystemCategory = asyncHandler(async (req, res, next) => {
  const SystemCategoryId = req.params.id;
  try {
    const updateSystemCategory = await SystemCategory.findByIdAndUpdate(SystemCategoryId, req.body, { new: true });
    res.json(updateSystemCategory);
  } catch (error) {
    next(error);
  }
});

const deleteSystemCategory = asyncHandler(async (req, res, next) => {
  const SystemCategoryId = req.params.id;
  try {
    await SystemCategory.findByIdAndDelete(SystemCategoryId);
    res.status(200).json({ success: true, message: "Delete SystemCategory successfully!" });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  getAllSystemCategory,
  getSystemCategoryByStoreId,
  getSystemCategory,
  createSystemCategory,
  updateSystemCategory,
  deleteSystemCategory,
};
