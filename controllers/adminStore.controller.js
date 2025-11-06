const Store = require("../models/store.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const asyncHandler = require("express-async-handler");

const getAllStores = asyncHandler(async (req, res, next) => {
  try {
    const stores = await Store.find({})
      .select("name address avatar status createdAt")
      .sort({ createdAt: -1 });

    if (!stores || stores.length === 0) {
      return res
        .status(200)
        .json(successResponse([], "Không tìm thấy cửa hàng nào trong hệ thống."));
    }

    return res
      .status(200)
      .json(successResponse(stores, "Lấy danh sách cửa hàng thành công."));
  } catch (error) {
    next(error);
  }
});

const getStoreById = asyncHandler(async (req, res, next) => {
  try {

    const storeId = req.params.id;

    const store = await Store.findById(storeId)
      .populate("storeCategory")
      .select("-staff");

    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng với ID này."));
    }

    return res
      .status(200)
      .json(successResponse(store, "Lấy chi tiết cửa hàng thành công."));
  } catch (error) {
    next(error);
  }
});

const approveStore = asyncHandler(async (req, res, next) => {
  try {
    const storeId = req.params.id;

    const store = await Store.findByIdAndUpdate(
      storeId,
      {
        status: "APPROVED",
      },
      { new: true, runValidators: true }
    );

    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng để phê duyệt."));
    }


    return res
      .status(200)
      .json(successResponse(null, `Cửa hàng ${store.name} đã được phê duyệt thành công.`));

  } catch (error) {
    next(error);
  }
});


const suspendStore = asyncHandler(async (req, res, next) => {
  try {
    const storeId = req.params.id;
    const store = await Store.findByIdAndUpdate(
      storeId,
      {
        status: "BLOCKED",
      },
      { new: true, runValidators: true }
    );

    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng để tạm khóa."));
    }

    return res
      .status(200)
      .json(successResponse(null, `Cửa hàng ${store.name} đã bị tạm khóa thành công.`));

  } catch (error) {
    next(error);
  }
});

module.exports = {
  getAllStores,
  getStoreById,
  approveStore,
  suspendStore,
};
