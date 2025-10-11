const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");

const {
  getStoreDishGroups,
  getDishGroupById,
  createDishGroup,
  updateDishGroupById,
  deleteDishGroupById,
  getActiveStoreDishGroups,
  toggleActiveDishGroup,
} = require("../controllers/dishGroup.controller");

const router = express.Router();

router.get("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getStoreDishGroups);
router.get("/store/:storeId/active", getActiveStoreDishGroups);
router.get("/:dishGroupId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getDishGroupById);

router.post("/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), createDishGroup);

router.put("/:dishGroupId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), updateDishGroupById);
router.put(
  "/:dishGroupId/toggle-active",
  authMiddleware,
  roleAuthMiddleware(["owner", "manager"]),
  toggleActiveDishGroup
);

router.delete("/:dishGroupId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), deleteDishGroupById);

module.exports = router;
