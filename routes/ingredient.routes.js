const express = require("express");
const {
  createIngredient,
  getIngredientsByStore,
  getIngredientById,
  updateIngredient,
  deleteIngredient,
  getIngredientsByCategory,
  getActiveIngredientsByStore,
} = require("../controllers/ingredient.controller");

const router = express.Router();

// Tạo nguyên liệu
router.post("/", createIngredient);

// Lấy tất cả nguyên liệu theo store
router.get("/store/:storeId", getIngredientsByStore);

// Lấy tất cả nguyên liệu active theo store
router.get("/store/active/:storeId", getActiveIngredientsByStore);

// Lấy tất cả nguyên liệu theo category
router.get("/:categoryId/:storeId", getIngredientsByCategory);

// Lấy chi tiết nguyên liệu
router.get("/:id", getIngredientById);

// Cập nhật nguyên liệu
router.put("/:id", updateIngredient);

// Xoá nguyên liệu
router.delete("/:id", deleteIngredient);

module.exports = router;
