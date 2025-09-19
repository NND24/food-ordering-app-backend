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

router.get("/store/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getCategoryById);
// router.get("/:category_id", getCategoryById);

router.post("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), createCategory);
// router.post("/store/:storeId", createCategory);

router.put("/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), updateCategoryById);
// router.put("/:category_id", updateCategoryById);

router.delete("/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), deleteCategoryById);
router.delete("/:category_id", deleteCategoryById);

module.exports = router;
