const express = require("express");
const {
  createBatch,
  getBatchesByIngredient,
  getBatchesByStore,
  updateBatch,
  deleteBatch,
} = require("../controllers/ingredientBatch.controller");

const router = express.Router();

// Tạo batch mới
router.post("/", createBatch);

// Lấy batch theo ingredient
router.get("/ingredient/:ingredientId", getBatchesByIngredient);

// Lấy batch theo store
router.get("/store/:storeId", getBatchesByStore);

// Cập nhật batch
router.put("/:id", updateBatch);

// Xoá batch
router.delete("/:id", deleteBatch);

module.exports = router;
