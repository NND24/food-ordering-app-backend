const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");
const {
  // ToppingGroup
  getStoreToppingGroups,
  getToppingGroupById,
  createToppingGroup,
  updateToppingGroup,
  toggleToppingGroup,
  deleteToppingGroup,
  // Topping
  getStoreToppings,
  getToppingById,
  createTopping,
  updateTopping,
  toggleTopping,
  deleteTopping,
  addToppingsToGroup,
} = require("../controllers/topping.controller");

const router = express.Router();

/**
 * ========================
 * ToppingGroup Routes
 * ========================
 */

// Lấy tất cả group + toppings theo store
router.get(
  "/topping-group/store/:storeId",
  authMiddleware,
  roleAuthMiddleware(["owner", "staff", "manager"]),
  getStoreToppingGroups
);

// Lấy 1 group theo ID
router.get(
  "/topping-group/:groupId",
  authMiddleware,
  roleAuthMiddleware(["owner", "staff", "manager"]),
  getToppingGroupById
);

// Tạo group
router.post("/topping-group/:storeId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), createToppingGroup);

// Thêm topping vào group
router.post(
  "/topping-group/:groupId/toppings",
  authMiddleware,
  roleAuthMiddleware(["owner", "manager"]),
  addToppingsToGroup
);

// Cập nhật group
router.put("/topping-group/:groupId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), updateToppingGroup);

// Toggle isActive group
router.put(
  "/topping-group/:groupId/toggle-active",
  authMiddleware,
  roleAuthMiddleware(["owner", "manager"]),
  toggleToppingGroup
);

// Xóa group
router.delete("/topping-group/:groupId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), deleteToppingGroup);

/**
 * ========================
 * Topping Routes
 * ========================
 */

// Lấy tất cả topping theo store
router.get("/store/:storeId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getStoreToppings);

// Lấy topping theo ID
router.get("/:toppingId", authMiddleware, roleAuthMiddleware(["owner", "staff", "manager"]), getToppingById);

// Tạo topping (có thể thêm vào nhiều group)
router.post("/:storeId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), createTopping);

// Cập nhật topping
router.put("/:toppingId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), updateTopping);

// Toggle isActive topping
router.put("/:toppingId/toggle-active", authMiddleware, roleAuthMiddleware(["owner", "manager"]), toggleTopping);

// Xóa topping
router.delete("/:toppingId", authMiddleware, roleAuthMiddleware(["owner", "manager"]), deleteTopping);

module.exports = router;
