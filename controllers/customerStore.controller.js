const SystemCategory = require("../models/systemCategory.model");
const Category = require("../models/category.model");
const ToppingGroup = require("../models/toppingGroup.model");
const Topping = require("../models/topping.model");
const Store = require("../models/store.model");
const Rating = require("../models/rating.model");
const Dish = require("../models/dish.model");
const Order = require("../models/order.model");
const { getPaginatedData } = require("../utils/paging");

const getAllStore = async (req, res) => {
  try {
    const { keyword, category, sort, limit, page, lat, lon } = req.query;

    let filterOptions = {};

    // Lọc theo danh mục
    if (category) {
      const categories = Array.isArray(category) ? category : category.split(",");
      filterOptions.storeCategory = { $in: categories };
    }

    // Tìm kiếm theo keyword
    if (keyword && keyword.trim()) {
      const kw = keyword.trim();

      // 1. Lấy danh sách systemCategoryId có tên khớp keyword
      const matchedSystemCategories = await SystemCategory.find({
        name: { $regex: kw, $options: "i" },
      }).select("_id");
      const systemCategoryIds = matchedSystemCategories.map((c) => c._id);

      // 2. Lấy danh sách storeId từ Category (nếu category name khớp keyword)
      const matchedCategories = await Category.find({
        name: { $regex: kw, $options: "i" },
      }).select("store");
      const storeIdsFromCategory = matchedCategories.map((c) => c.store);

      // 3. Lấy danh sách storeId từ Dish (nếu dish name khớp keyword)
      const matchedDishes = await Dish.find({
        name: { $regex: kw, $options: "i" },
      }).select("storeId");
      const storeIdsFromDishes = matchedDishes.map((d) => d.storeId);

      // 4. Gộp điều kiện vào filterOptions
      filterOptions.$or = [
        { name: { $regex: kw, $options: "i" } }, // tên store
        { description: { $regex: kw, $options: "i" } }, // mô tả store
        { storeCategory: { $in: systemCategoryIds } }, // danh mục hệ thống
        { _id: { $in: storeIdsFromCategory } }, // từ category name
        { _id: { $in: storeIdsFromDishes } }, // từ dish name
      ];
    }

    // Lấy danh sách store
    let stores = await Store.find(filterOptions).populate("storeCategory").lean();

    // Ghép rating
    const storeRatings = await Rating.aggregate([
      {
        $group: {
          _id: "$storeId",
          avgRating: { $avg: "$ratingValue" },
          amountRating: { $sum: 1 },
        },
      },
    ]);

    stores = stores.map((store) => {
      const rating = storeRatings.find((r) => r._id.toString() === store._id.toString());
      return {
        ...store,
        avgRating: rating ? rating.avgRating : 0,
        amountRating: rating ? rating.amountRating : 0,
      };
    });

    // Nếu có tọa độ người dùng → tính khoảng cách và lọc trong bán kính 70km
    if (lat && lon) {
      const latUser = parseFloat(lat);
      const lonUser = parseFloat(lon);

      const toRad = (value) => (value * Math.PI) / 180;

      const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Bán kính trái đất (km)
        const dLat = toRad(lat2 - lat1);
        const dLon = toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      };

      // Tính distance từng store và lọc <= 70km
      stores = stores.map((store) => {
        if (store.address?.lat != null && store.address?.lon != null) {
          store.distance = calculateDistance(latUser, lonUser, store.address.lat, store.address.lon);
        } else {
          store.distance = Infinity; // Không có tọa độ → bỏ
        }
        return store;
      });

      stores = stores.filter((store) => store.distance <= 70);
    }

    // Sắp xếp theo các tiêu chí nếu có
    if (sort === "rating") {
      stores = stores.sort((a, b) => b.avgRating - a.avgRating);
    } else if (sort === "standout") {
      // Sắp xếp theo số lượng đơn hàng
      const storeOrders = await Order.aggregate([{ $group: { _id: "$storeId", orderCount: { $sum: 1 } } }]);

      stores = stores
        .map((store) => {
          const order = storeOrders.find((o) => o._id.toString() === store._id.toString());
          return {
            ...store,
            orderCount: order ? order.orderCount : 0,
          };
        })
        .sort((a, b) => b.orderCount - a.orderCount);
    } else if (sort === "name") {
      stores.sort((a, b) => a.name.localeCompare(b.name));
    }

    const totalItems = stores.length;

    // Phân trang nếu có limit + page
    if (limit && page) {
      const pageSize = parseInt(limit) || 10;
      const pageNumber = parseInt(page) || 1;
      const totalPages = Math.ceil(totalItems / pageSize);

      const paginatedStores = stores.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      // Trả kết quả có phân trang
      res.status(200).json({
        success: true,
        total: totalItems,
        totalPages,
        currentPage: pageNumber,
        pageSize,
        data: paginatedStores,
      });
    } else {
      // Trả kết quả đầy đủ
      res.status(200).json({
        success: true,
        total: totalItems,
        data: stores,
      });
    }
  } catch (error) {
    // Lỗi hệ thống
    res.status(500).json({ success: false, message: error.message });
  }
};

const getStoreInformation = async (req, res) => {
  try {
    const { storeId } = req.params; // Extract storeId correctly

    // Find store by ID
    const store = await Store.findById(storeId).populate("storeCategory");

    if (!store) {
      return res.status(404).json({
        success: false,
        message: "Store not found",
      });
    }

    // Calculate average rating
    const storeRatings = await Rating.aggregate([
      { $match: { store: store._id } }, // Only consider ratings for this store
      {
        $group: {
          _id: "$storeId",
          avgRating: { $avg: "$ratingValue" },
          amountRating: { $sum: 1 },
        },
      },
    ]);

    // Find rating data for the store
    const avgRating = storeRatings.length > 0 ? storeRatings[0].avgRating : 0;
    const amountRating = storeRatings.length > 0 ? storeRatings[0].amountRating : 0;

    res.status(200).json({
      success: true,
      data: {
        ...store.toObject(),
        avgRating,
        amountRating,
      },
    });
  } catch (error) {
    // Handle invalid ObjectId error
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid store ID format",
      });
    }

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllDishInStore = async (req, res) => {
  try {
    const { storeId } = req.params;

    const dishes = await Dish.find({ storeId }).populate("category", "name");

    res.status(200).json({
      status: true,
      data: dishes,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Lỗi khi lấy danh sách món ăn" });
  }
};

const getDetailDish = async (req, res) => {
  try {
    const { dishId } = req.params;

    const dish = await Dish.findById(dishId).populate([
      { path: "category", select: "name" },
      {
        path: "toppingGroups",
      },
    ]);

    if (!dish) {
      return res.status(404).json({
        success: false,
        message: "Dish not found",
      });
    }

    const toppingGroupsWithToppings = await Promise.all(
      dish.toppingGroups.map(async (group) => {
        const toppings = await Topping.find({ toppingGroupId: group._id }).select("name price");
        return {
          ...group.toObject(),
          toppings,
        };
      })
    );

    const dishWithToppings = {
      ...dish.toObject(),
      toppingGroups: toppingGroupsWithToppings,
    };

    res.status(200).json({
      success: true,
      data: dishWithToppings,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid format",
      });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = {
  getAllStore,
  getStoreInformation,
  getAllDishInStore,
  getDetailDish,
};
