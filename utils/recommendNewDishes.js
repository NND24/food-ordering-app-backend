const Dish = require("../models/dish.model");
const { predictRevenue } = require("./predictRevenue");

async function recommendNewDishes(storeId, topN = 5) {
  const dishes = await Dish.find({ storeId, status: { $ne: "INACTIVE" } })
    .populate("ingredients.ingredient")
    .lean();

  const dishesWithPred = [];
  for (const d of dishes) {
    const totalSold = d.totalSold || 0;
    const totalIngredientStock = d.ingredients.reduce((sum, i) => sum + (i.ingredient.stock || 0), 0);
    const totalIngredientWaste = d.ingredients.reduce((sum, i) => sum + (i.ingredient.waste || 0), 0);
    const ingredientCount = d.ingredients.length;
    const toppingCount = d.toppingGroups?.length || 0;

    const predRevenue = await predictRevenue({
      totalSold,
      totalIngredientStock,
      totalIngredientWaste,
      ingredientCount,
      toppingCount,
    });

    dishesWithPred.push({ ...d, predictedRevenue: predRevenue });
  }

  // Chọn top predictedRevenue
  const topDishes = dishesWithPred.sort((a, b) => b.predictedRevenue - a.predictedRevenue).slice(0, topN);

  // Sinh món mới dựa trên rule: thay nguyên liệu, thêm nguyên liệu phổ biến
  const ingredientCountMap = {};
  topDishes.forEach((d) => {
    d.ingredients.forEach((i) => {
      const name = i.ingredient.name.toLowerCase();
      ingredientCountMap[name] = (ingredientCountMap[name] || 0) + 1;
    });
  });
  const popularIngredients = Object.entries(ingredientCountMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const newDishes = topDishes.map((d) => {
    const newDish = JSON.parse(JSON.stringify(d));
    // Thay nguyên liệu chính: ví dụ 1st ingredient
    if (newDish.ingredients.length > 0 && popularIngredients.length > 0) {
      newDish.ingredients[0].ingredient.name = popularIngredients[0];
    }
    newDish.name = `New ${d.name}`;
    return newDish;
  });

  return newDishes;
}

module.exports = { recommendNewDishes };
