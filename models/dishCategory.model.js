const mongoose = require("mongoose");

const dishCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  store: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }],
});

module.exports = mongoose.model("DishCategory", dishCategorySchema);
