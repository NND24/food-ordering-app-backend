const asyncHandler = require("express-async-handler");
const Store = require("../models/store.model");
const Dish = require("../models/dish.model");
const Order = require("../models/order.model");
const OrderItem = require("../models/orderItem.model");
const Waste = require("../models/waste.model");
const { HfInference } = require("@huggingface/inference");
require("dotenv").config();

// ⚠️ Token Hugging Face
const hf = new HfInference(process.env.HUGGINGFACEHUB_API_TOKEN);

/**
 * Tính doanh thu theo món
 */
const getRevenueByDish = async (storeId, startDate, endDate) => {
  const orders = await Order.find({
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
    createdAt: { $gte: startDate, $lte: endDate },
  }).select("_id");

  const orderIds = orders.map((o) => o._id);

  const result = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: "$dishId",
        dishName: { $first: "$dishName" },
        totalRevenue: { $sum: { $multiply: ["$price", "$quantity"] } },
        totalQuantity: { $sum: "$quantity" },
      },
    },
  ]);

  return result.map((r) => ({
    dishId: r._id,
    dishName: r.dishName,
    totalRevenue: Number(r.totalRevenue),
    totalQuantity: Number(r.totalQuantity),
  }));
};

/**
 * Tính waste theo món
 */
const getWasteByDish = async (storeId, startDate, endDate) => {
  const wasteByIngredient = await Waste.aggregate([
    { $match: { storeId, date: { $gte: startDate, $lte: endDate } } },
    { $lookup: { from: "ingredientbatches", localField: "ingredientBatchId", foreignField: "_id", as: "batch" } },
    { $unwind: "$batch" },
    { $group: { _id: "$batch.ingredientId", totalWasteQty: { $sum: "$quantity" } } },
  ]);

  const dishWasteMap = new Map();

  for (const waste of wasteByIngredient) {
    const ingredientId = waste._id;
    const totalWasteQty = waste.totalWasteQty || 0;

    const dishes = await Dish.find({ storeId, "ingredients.ingredient": ingredientId })
      .select("_id name ingredients")
      .lean();

    if (!dishes.length) continue;

    const sumQty =
      dishes.reduce((sum, d) => {
        if (!Array.isArray(d.ingredients)) return sum;
        const ing = d.ingredients.find((i) => i.ingredient?.toString() === ingredientId.toString());
        return sum + (ing?.quantity || 0);
      }, 0) || 0.0001;

    for (const d of dishes) {
      if (!Array.isArray(d.ingredients)) continue;
      const ing = d.ingredients.find((i) => i.ingredient?.toString() === ingredientId.toString());
      if (!ing) continue;
      const ratio = ing.quantity / sumQty;
      const allocWaste = totalWasteQty * ratio;
      dishWasteMap.set(d._id.toString(), (dishWasteMap.get(d._id.toString()) || 0) + allocWaste);
    }
  }

  const dishes = await Dish.find({ _id: { $in: Array.from(dishWasteMap.keys()) } })
    .select("_id name")
    .lean();

  return dishes.map((d) => ({
    dishId: d._id,
    dishName: d.name,
    totalWaste: Number((dishWasteMap.get(d._id.toString()) || 0).toFixed(3)),
  }));
};

/**
 * Phân tích dữ liệu & sinh gợi ý món ăn mới bằng model HF
 */
const generateDishSuggestions = async (store) => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const endDate = now;
  const storeId = store._id;

  const dishes = await Dish.find({ storeId, status: { $ne: "INACTIVE" } })
    .populate("ingredients.ingredient")
    .lean();

  const revenueData = await getRevenueByDish(storeId, startDate, endDate);
  const wasteData = await getWasteByDish(storeId, startDate, endDate);

  const topDishes = revenueData.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);
  const topDishNames = topDishes.map((d) => d.dishName).join(", ");

  const ingredientMap = {};
  for (const d of dishes) {
    (d.ingredients || []).forEach((i) => {
      if (i.ingredient?.name) {
        const name = i.ingredient.name.toLowerCase();
        ingredientMap[name] = (ingredientMap[name] || 0) + 1;
      }
    });
  }

  const topIngredients = Object.entries(ingredientMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 10)
    .join(", ");

  const prompt = `
Nhà hàng "${store.name}" chuyên về: ${store.storeCategory?.map((c) => c.name).join(", ") || "Ẩm thực Việt Nam"}.
Các món bán chạy nhất: ${topDishNames}.
Nguyên liệu phổ biến hiện có: ${topIngredients}.
Hãy gợi ý 3 món ăn mới, có tên hấp dẫn, dễ chế biến và phù hợp với phong cách của quán.
Trả về ở dạng JSON: [{"name": "...", "description": "...", "mainIngredients": ["..."]}]
`;

  try {
    const response = await hf.chatCompletion({
      model: "zai-org/GLM-4.6",
      messages: [
        {
          role: "system",
          content: "Bạn là đầu bếp chuyên nghiệp, sáng tạo món ăn mới hấp dẫn để giúp tăng doanh thu cho nhà hàng.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 500,
      temperature: 0.85,
      top_p: 0.9,
    });

    let text = response.choices?.[0]?.message?.content || "[]";

    // ✅ Loại bỏ ```json ``` và ``` nếu có
    text = text.replace(/```json|```/g, "").trim();

    // ✅ Tự động trích phần JSON trong văn bản
    const match = text.match(/\[.*\]|\{.*\}/s);
    if (match) text = match[0];

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      console.warn("⚠️ AI trả về không phải JSON hợp lệ:", text);
      parsed = [];
    }

    return parsed;
  } catch (err) {
    console.error("❌ Lỗi khi gọi model:", err.message);
    return [];
  }
};

/**
 * Gợi ý món ăn dựa trên các cửa hàng cùng category
 */
const getRecommendedDishesByCategory = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(400).json({ success: false, message: "Missing user ID" });

  // 1️⃣ Lấy thông tin cửa hàng của người dùng
  const store = await Store.findOne({ $or: [{ owner: userId }, { staff: userId }] })
    .populate("storeCategory", "_id name")
    .lean();

  if (!store) return res.status(404).json({ success: false, message: "Store not found" });

  const systemCategoryIds = store.storeCategory.map((c) => c._id);

  // 2️⃣ Lấy danh sách các cửa hàng khác cùng category
  const relatedStores = await Store.find({
    _id: { $ne: store._id },
    storeCategory: { $in: systemCategoryIds },
    status: "APPROVED",
  }).select("_id name");

  if (relatedStores.length === 0) return res.json({ success: true, message: "No related stores found", data: [] });

  const relatedStoreIds = relatedStores.map((s) => s._id);

  // 3️⃣ Lấy các món ăn từ các cửa hàng đó
  const popularDishes = await OrderItem.aggregate([
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    {
      $match: {
        "order.storeId": { $in: relatedStoreIds },
        "order.status": { $in: ["finished", "done", "delivered"] },
      },
    },
    {
      $group: {
        _id: "$dishId",
        dishName: { $first: "$dishName" },
        totalSold: { $sum: "$quantity" },
      },
    },
    { $sort: { totalSold: -1 } },
    { $limit: 20 }, // lấy top 20 món bán chạy nhất trong nhóm category
  ]);

  // 4️⃣ Lấy danh sách món ăn hiện có của quán
  const myDishIds = (await Dish.find({ storeId: store._id }).select("_id name").lean()).map((d) => d._id.toString());

  // 5️⃣ Lọc ra món mà quán chưa có
  const filtered = popularDishes.filter((d) => !myDishIds.includes(d._id.toString()));

  // 6️⃣ Lấy thông tin chi tiết của món ăn
  const detailedDishes = await Dish.find({ _id: { $in: filtered.map((d) => d._id) } })
    .populate("storeId", "name")
    .populate("category", "name")
    .lean();

  // 7️⃣ Kết hợp với dữ liệu totalSold
  const finalSuggestions = detailedDishes.map((dish) => {
    const stat = filtered.find((f) => f._id.toString() === dish._id.toString());
    return {
      _id: dish._id,
      name: dish.name,
      image: dish.image?.url,
      category: dish.category?.name,
      fromStore: dish.storeId?.name,
      totalSold: stat?.totalSold || 0,
    };
  });

  res.json({
    success: true,
    store: store.name,
    relatedStoreCount: relatedStores.length,
    data: finalSuggestions,
  });
});

/**
 * API chính: Gợi ý món ăn mới
 */
const getRecommendedDishes = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) return res.status(400).json({ success: false, message: "Missing user ID" });

  const store = await Store.findOne({ $or: [{ owner: userId }, { staff: userId }] })
    .populate("storeCategory")
    .lean();
  if (!store) return res.status(404).json({ success: false, message: "Store not found" });

  const suggestions = await generateDishSuggestions(store);
  res.json({ success: true, store: store.name, data: suggestions });
});

const improveVietnameseDescription = async (englishCaption) => {
  try {
    const response = await hf.chatCompletion({
      model: "zai-org/GLM-4.6",
      messages: [
        {
          role: "system",
          content:
            "Bạn là chuyên gia ẩm thực, hãy dịch mô tả món ăn sang tiếng Việt và viết lại sao cho ngắn gọn, hấp dẫn như mô tả thực đơn trong nhà hàng.",
        },
        {
          role: "user",
          content: `Dịch và viết lại mô tả cho món ăn sau: "${englishCaption}"`,
        },
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    let text = response.choices?.[0]?.message?.content?.trim();
    if (!text) return englishCaption;

    // Xử lý bỏ ``` nếu model có bọc lại
    text = text.replace(/```(?:json|text)?|```/g, "").trim();

    return text;
  } catch (err) {
    console.error("❌ Lỗi khi cải thiện mô tả:", err.message);
    return englishCaption;
  }
};

module.exports = { getRecommendedDishes, getRecommendedDishesByCategory, improveVietnameseDescription };
