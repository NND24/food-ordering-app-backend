const express = require("express");
const {
  createCategory,
  getCategoriesByStore,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getActiveCategoriesByStore,
} = require("../controllers/ingredientCategory.controller");

const router = express.Router();

// Tạo danh mục mới
router.post("/", createCategory);

// Lấy danh sách danh mục theo store
router.get("/store/:storeId", getCategoriesByStore);

// Lấy danh sách danh mục active theo store
router.get("/store/active/:storeId", getActiveCategoriesByStore);

// Lấy chi tiết danh mục
router.get("/:id", getCategoryById);

// Cập nhật danh mục
router.put("/:id", updateCategory);

// Xoá danh mục
router.delete("/:id", deleteCategory);

module.exports = router;
