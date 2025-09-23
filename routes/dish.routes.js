const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");
const {
  getDishById,
  getDishesByStoreId,
  createDish,
  changeStatus,
  updateDish,
  deleteDish,
} = require("../controllers/dish.controller");

const router = express.Router();

router.get("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getDishesByStoreId);
router.get("/:dish_id", getDishById);
router.post("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), createDish);

router.post("/:dish_id/status", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), changeStatus);

router.put("/:dish_id", authMiddleware, roleAuthMiddleware(["owner", "manager"]), updateDish);
router.delete("/:dish_id", authMiddleware, roleAuthMiddleware(["owner", "manager"]), deleteDish);

module.exports = router;
