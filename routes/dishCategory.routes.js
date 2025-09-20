const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");

const {
  getStoreCategories,
  getCategoryById,
  createCategory,
  updateCategoryById,
  deleteCategoryById,
} = require("../controllers/dishCategory.controller");

const router = express.Router();

router.get("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getStoreCategories);
// router.get("/store/:storeId", getStoreCategories);

router.get("/:categoryId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getCategoryById);
// router.get("/:categoryId", getCategoryById);

router.post("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), createCategory);
// router.post("/store/:storeId", createCategory);

router.put("/:categoryId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), updateCategoryById);
// router.put("/:categoryId", updateCategoryById);

router.delete("/:categoryId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), deleteCategoryById);
router.delete("/:categoryId", deleteCategoryById);

module.exports = router;
