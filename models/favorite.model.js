const mongoose = require("mongoose");

// Favorite schema

var favoriteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    require: true,
  },
  storeId: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Store",
      require: false,
    },
  ],
});

favoriteSchema.virtual("store", {
  ref: "Store",
  localField: "storeId",
  foreignField: "_id",
});

module.exports = mongoose.model("Favorite", favoriteSchema);
