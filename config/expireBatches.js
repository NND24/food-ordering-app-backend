const cron = require("node-cron");
const IngredientBatch = require("../models/ingredientBatch.model");
const Waste = require("../models/waste.model");
const Ingredient = require("../models/ingredient.model");
const Dish = require("../models/dish.model");
const Topping = require("../models/topping.model");

/**
 * Lấy tổng số lượng còn lại của 1 nguyên liệu trong tất cả batch active
 */
async function getIngredientStock(ingredientId) {
  const result = await IngredientBatch.aggregate([
    { $match: { ingredient: ingredientId, status: "active" } },
    { $group: { _id: "$ingredient", totalRemaining: { $sum: "$remainingQuantity" } } },
  ]);

  return result.length > 0 ? result[0].totalRemaining : 0;
}

async function updateIngredientStatus(ingredientId) {
  const totalRemaining = await getIngredientStock(ingredientId);

  let newStatus;
  if (totalRemaining > 0) {
    newStatus = "ACTIVE";
  } else {
    newStatus = "OUT_OF_STOCK";
  }

  // chỉ update nếu khác "INACTIVE" (tránh override)
  await Ingredient.updateOne({ _id: ingredientId, status: { $ne: "INACTIVE" } }, { $set: { status: newStatus } });
}

async function updateDishStatus(dishId) {
  const dish = await Dish.findById(dishId).populate("ingredients.ingredient");

  let canMake = true;
  for (const ing of dish.ingredients) {
    const stock = await getIngredientStock(ing.ingredient._id);
    if (stock < ing.quantity) {
      canMake = false;
      break;
    }
  }

  await Dish.updateOne(
    { _id: dishId, status: { $ne: "INACTIVE" } },
    { $set: { status: canMake ? "ACTIVE" : "OUT_OF_STOCK" } }
  );
}

async function updateToppingStatus(toppingId) {
  const topping = await Topping.findById(toppingId).populate("ingredients.ingredient");
  if (!topping) return;

  let canMake = true;
  for (const ing of topping.ingredients) {
    const stock = await getIngredientStock(ing.ingredient._id);
    if (stock < ing.quantity) {
      canMake = false;
      break;
    }
  }

  await Topping.updateOne(
    { _id: toppingId, status: { $ne: "INACTIVE" } }, // không override INACTIVE
    { $set: { status: canMake ? "ACTIVE" : "OUT_OF_STOCK" } }
  );
}

// chạy mỗi 1 tiếng "*/15 * * * * *" "0 * * * *"
cron.schedule("0 * * * *", async () => {
  console.log("🔄 Kiểm tra batch hết hạn...");
  const now = new Date();

  // ====== 1. Xử lý batch hết hạn ======
  const expiredBatches = await IngredientBatch.find({
    expiryDate: { $lte: now },
    status: "active",
    remainingQuantity: { $gt: 0 },
  });

  for (const batch of expiredBatches) {
    try {
      // tạo Waste
      await Waste.create({
        ingredientBatchId: batch._id,
        quantity: batch.remainingQuantity,
        reason: "expired",
      });

      // cập nhật batch trực tiếp
      await IngredientBatch.updateOne({ _id: batch._id }, { $set: { status: "expired", remainingQuantity: 0 } });

      console.log(`➡️ Batch ${batch._id} đã chuyển sang Waste`);

      // cập nhật nguyên liệu liên quan
      await updateIngredientStatus(batch.ingredient);

      // cập nhật toàn bộ dish dùng nguyên liệu này
      const dishes = await Dish.find({ "ingredients.ingredient": batch.ingredient });
      for (const dish of dishes) {
        await updateDishStatus(dish._id);
      }

      // cập nhật toàn bộ topping dùng nguyên liệu này
      const toppings = await Topping.find({ "ingredients.ingredient": batch.ingredient });
      for (const topping of toppings) {
        await updateToppingStatus(topping._id);
      }
    } catch (err) {
      console.error("❌ Lỗi xử lý batch:", err);
    }
  }

  // ====== 2. Kiểm tra toàn bộ nguyên liệu (cả có batch và không có batch) ======
  console.log("🔍 Kiểm tra tồn kho tất cả nguyên liệu...");
  const allIngredients = await Ingredient.find({});

  for (const ing of allIngredients) {
    await updateIngredientStatus(ing._id);

    // cập nhật toàn bộ dish có dùng nguyên liệu này
    const dishes = await Dish.find({ "ingredients.ingredient": ing._id });
    for (const dish of dishes) {
      await updateDishStatus(dish._id);
    }

    // cập nhật toàn bộ topping có dùng nguyên liệu này
    const toppings = await Topping.find({ "ingredients.ingredient": ing._id });
    for (const topping of toppings) {
      await updateToppingStatus(topping._id);
    }
  }
});
