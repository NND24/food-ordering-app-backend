const Store = require("../models/store.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const asyncHandler = require("express-async-handler");

// Get all status
const getStoreInfo = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;

    const store = await Store.findOne({ owner: userId })
      .select("-staff -owner")
      .populate("storeCategory");

    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    return res
      .status(200)
      .json(successResponse(store, "Lấy thông tin cửa hàng thành công."));
  } catch (error) {
    next(error);
  }
});

// Toggle open status
const toggleOpenStatus = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    // Toggle status
    store.openStatus = store.openStatus === "OPEN" ? "CLOSED" : "OPEN";
    await store.save();

    return res
      .status(200)
      .json(
        successResponse(
          { openStatus: store.openStatus },
          `Cửa hàng đã được chuyển sang trạng thái ${
            store.openStatus === "OPEN" ? "mở cửa" : "đóng cửa"
          }.`
        )
      );
  } catch (error) {
    next(error);
  }
});

// Handle giờ đóng/mở cửa
const isValidHourFormat = (value) => {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); // VD: 08:00, 23:59, 18:30
};

const updateOpenCloseHours = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { openHour, closeHour } = req.body;

    if (!openHour || !closeHour) {
      return next(createError(400, "Thiếu giờ mở hoặc giờ đóng cửa."));
    }

    if (!isValidHourFormat(openHour) || !isValidHourFormat(closeHour)) {
      return next(
        createError(
          400,
          "Định dạng giờ không hợp lệ. Dạng hợp lệ: HH:mm (VD: 08:00, 18:30)"
        )
      );
    }

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    store.openHour = openHour;
    store.closeHour = closeHour;
    await store.save();

    return res.status(200).json(
      successResponse(
        {
          openHour: store.openHour,
          closeHour: store.closeHour,
        },
        "Cập nhật giờ mở và đóng cửa thành công."
      )
    );
  } catch (error) {
    next(error);
  }
});

// Store info: name, descriptino, category
const updateStoreInfo = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { name, description, storeCategory } = req.body;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    if (name) store.name = name;
    if (description) store.description = description;
    if (storeCategory && Array.isArray(storeCategory)) {
      store.storeCategory = storeCategory;
    }

    await store.save();

    return res.status(200).json(
      successResponse(
        {
          name: store.name,
          description: store.description,
          storeCategory: store.storeCategory,
        },
        "Cập nhật thông tin cửa hàng thành công."
      )
    );
  } catch (error) {
    next(error);
  }
});

// Update avatar and cover
const updateStoreImages = asyncHandler(async (req, res) => {
  try {
    const userId = req.user._id;
    const { avatarUrl, coverUrl } = req.body;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    if (avatarUrl) {
      store.avatar = store.avatar || {};
      store.avatar.url = avatarUrl;
    }
    if (coverUrl) {
      store.cover = store.cover || {};
      store.cover.url = coverUrl;
    }

    await store.save();

    return res.status(200).json(
      successResponse(
        {
          avatar: avatarUrl,
          cover: coverUrl,
        },
        "Cập nhật hình ảnh cửa hàng thành công."
      )
    );
  } catch (error) {
    next(error);
  }
});
// Update address
const updateStoreAddress = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { full_address, lat, lon } = req.body;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    store.address = store.address || {};

    if (full_address !== undefined) store.address.full_address = full_address;
    if (lat !== undefined) store.address.lat = lat;
    if (lon !== undefined) store.address.lon = lon;

    await store.save();

    return res.status(200).json(
      successResponse(
        {
          full_address: store.address.full_address,
          lat: store.address.lat,
          lon: store.address.lon,
        },
        "Cập nhật địa chỉ cửa hàng thành công."
      )
    );
  } catch (error) {
    next(error);
  }
});
// Update documents
const updateStorePaperWork = asyncHandler(async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      IC_front,
      IC_back,
      businessLicense,
      storePicture, // Array of objects: [{ filePath, url }, ...]
    } = req.body;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return next(createError(404, "Không tìm thấy cửa hàng của bạn."));
    }

    store.paperWork = store.paperWork || {};

    if (IC_front) {
      store.paperWork.IC_front = {
        filePath: IC_front.filePath || "",
        url: IC_front.url || "",
      };
    }

    if (IC_back) {
      store.paperWork.IC_back = {
        filePath: IC_back.filePath || "",
        url: IC_back.url || "",
      };
    }

    if (businessLicense) {
      store.paperWork.businessLicense = {
        filePath: businessLicense.filePath || "",
        url: businessLicense.url || "",
      };
    }

    if (Array.isArray(storePicture)) {
      // Ghi đè toàn bộ ảnh cũ bằng ảnh mới
      store.paperWork.storePicture = storePicture.map((pic) => ({
        filePath: pic.filePath || "",
        url: pic.url || "",
      }));
    }

    await store.save();

    return res
      .status(200)
      .json(
        successResponse(
          store.paperWork,
          "Cập nhật thông tin giấy tờ cửa hàng thành công."
        )
      );
  } catch (error) {
    next(error);
  }
});

const changeStoreStatusTest = asyncHandler(async (req, res, next) => {
  const store = await Store.findById("67c6e409f1c07122e88619d6");
  if (store.openStatus == "CLOSED") {
    store.openStatus = "OPEN";
  }
  else {
    store.openStatus = "CLOSED";
  }
  await store.save();
  res.status(200).json({
    success: true,
    message: "Store status changed successfully",
    store,
  });
});
module.exports = {
  getStoreInfo,
  toggleOpenStatus,
  updateOpenCloseHours,
  updateStoreInfo,
  updateStoreImages,
  updateStoreAddress,
  updateStorePaperWork,
  changeStoreStatusTest
};
