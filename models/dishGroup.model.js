const mongoose = require("mongoose");

const dishGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  storeId: { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true },
  dishes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Dish" }],
  isActive: { type: Boolean, default: true },
});

module.exports = mongoose.model("DishGroup", dishGroupSchema);
