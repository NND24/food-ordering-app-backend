const Dish = require("../models/dish.model");
const Waste = require("../models/waste.model");
const Store = require("../models/store.model");
const DishGroup = require("../models/dishGroup.model");
const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");
const { getRevenueByDish } = require("../controllers/recommend.controller");
const { getIngredientStock } = require("../config/expireBatches");

/**
 * Tính waste phân bổ theo món dựa trên ingredient
 */
async function getWasteByDish(storeId, dishIds) {
  const wasteByIngredient = await Waste.aggregate([
    { $match: { storeId } },
    {
      $lookup: {
        from: "ingredientbatches",
        localField: "ingredientBatchId",
        foreignField: "_id",
        as: "batch",
      },
    },
    { $unwind: "$batch" },
    {
      $group: {
        _id: "$batch.ingredient",
        totalWasteQty: { $sum: "$quantity" },
      },
    },
  ]);

  const dishWasteMap = new Map();

  for (const waste of wasteByIngredient) {
    const ingredientId = waste._id;
    const totalWasteQty = waste.totalWasteQty || 0;

    const dishes = await Dish.find({
      _id: { $in: dishIds },
      "ingredients.ingredient": ingredientId,
    })
      .select("_id ingredients")
      .lean();

    if (!dishes.length) continue;

    const sumQty =
      dishes.reduce((sum, d) => {
        const ing = d.ingredients.find((i) => i.ingredient.toString() === ingredientId.toString());
        return sum + (ing?.quantity || 0);
      }, 0) || 0.0001;

    for (const d of dishes) {
      const ing = d.ingredients.find((i) => i.ingredient.toString() === ingredientId.toString());
      if (!ing) continue;
      const ratio = ing.quantity / sumQty;
      const allocWaste = totalWasteQty * ratio;
      dishWasteMap.set(d._id.toString(), (dishWasteMap.get(d._id.toString()) || 0) + allocWaste);
    }
  }

  return dishWasteMap;
}

async function collectRecommendDataForStore(storeId, startDate, endDate) {
  try {
    console.log(`🕑 Collecting data for store: ${storeId}`);

    const dishes = await Dish.find({ storeId, status: { $ne: "INACTIVE" } })
      .populate("ingredients.ingredient")
      .lean();

    if (!dishes.length) {
      console.warn(`⚠️ No dishes found for store ${storeId}`);
      return;
    }

    // Lấy doanh thu
    const revenues = await getRevenueByDish(storeId, startDate, endDate);

    // Lấy nhóm món
    const dishGroups = await DishGroup.find({ storeId, isActive: true }).select("_id name dishes").lean();
    const groupMap = new Map();
    dishGroups.forEach((g) => {
      g.dishes.forEach((dishId) => groupMap.set(dishId.toString(), { groupId: g._id, groupName: g.name }));
    });

    // Tính waste theo dish
    const dishIds = dishes.map((d) => d._id);
    const dishWasteMap = await getWasteByDish(storeId, dishIds);

    const rows = [];
    for (const dish of dishes) {
      const ingredients = Array.isArray(dish.ingredients) ? dish.ingredients : [];
      let totalStock = 0;
      for (const ing of ingredients) {
        if (!ing?.ingredient?._id) continue;
        const stock = await getIngredientStock(ing.ingredient._id);
        totalStock += stock;
      }

      const revenueInfo = revenues.find((r) => r.dishId?.toString() === dish._id.toString());
      const waste = dishWasteMap.get(dish._id.toString()) || 0;

      const groupInfo = groupMap.get(dish._id.toString()) || {};

      rows.push({
        dishId: dish._id.toString(),
        name: dish.name,
        dishGroupId: groupInfo.groupId ? groupInfo.groupId.toString() : null,
        dishGroupName: groupInfo.groupName || null,
        ingredientCount: ingredients.length,
        toppingCount: Array.isArray(dish.toppingGroups) ? dish.toppingGroups.length : 0,
        totalRevenue: revenueInfo?.totalRevenue || 0,
        totalSold: revenueInfo?.totalQuantity || 0,
        totalIngredientStock: totalStock,
        totalIngredientWaste: waste,
        ingredients: ingredients.map((i) => i.ingredient.name),
      });
    }

    const folderPath = path.join(__dirname, "../ml/recommendDishDataset");
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

    const filePath = path.join(folderPath, `store_${storeId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));

    console.log(`✅ Dataset saved for store ${storeId}: ${rows.length} dishes → ${filePath}`);
  } catch (err) {
    console.error(`❌ Error collecting data for store ${storeId}:`, err);
  }
}

async function collectRecommendDataForAllStores(startDate, endDate) {
  const stores = await Store.find().select("_id name");
  for (const store of stores) {
    await collectRecommendDataForStore(store._id, startDate, endDate);
  }
}

// Ví dụ dùng: thu thập dữ liệu tháng hiện tại
const now = moment().tz("Asia/Ho_Chi_Minh");
const startDate = now.clone().startOf("month").toDate();
const endDate = now.clone().endOf("month").toDate();

module.exports = { collectRecommendDataForStore, collectRecommendDataForAllStores, startDate, endDate };
