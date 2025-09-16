const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");


const {
    getStoreCategories,
    getCategoryById,
    createCategory,
    updateCategoryById,
    deleteCategoryById,
} = require("../controllers/category.controller");

const router = express.Router();

router.get("/store/:store_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getStoreCategories);
// router.get("/store/:store_id", getStoreCategories);

router.get("/store/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getCategoryById); 
// router.get("/:category_id", getCategoryById);

router.post("/store/:store_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), createCategory);
// router.post("/store/:store_id", createCategory);

router.put("/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), updateCategoryById);
// router.put("/:category_id", updateCategoryById);

router.delete("/:category_id", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), deleteCategoryById);
router.delete("/:category_id", deleteCategoryById);

module.exports = router

