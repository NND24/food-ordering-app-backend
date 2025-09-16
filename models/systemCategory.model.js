const mongoose = require("mongoose");

var systemCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    unique: true,
    required: true,
  },
  image: {
    filePath: { type: String, required: false },
    url: {
      type: String,
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
});

systemCategorySchema.statics.isNameExists = async function (foodName) {
  const food = await this.findOne({ name: foodName }).exec();
  return food !== null;
};

module.exports = mongoose.model("SystemCategory", systemCategorySchema);
