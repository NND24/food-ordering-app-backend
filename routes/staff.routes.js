const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDbId");

const {
  addAnEmployee,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  getAllEmployeesInStore,
} = require("../controllers/staff.controller");

// Thêm 1 nhân viên vào cửa hàng
router.post(
  "/stores/:storeId",
  authMiddleware,
  validateMongoDbId("storeId"),
  addAnEmployee
);

// Lấy thông tin 1 nhân viên
router.get(
  "/:userId",
  authMiddleware,
  validateMongoDbId("userId"),
  getEmployeeById
);

// Cập nhật thông tin nhân viên
router.put(
  "/:userId",
  authMiddleware,
  validateMongoDbId("userId"),
  updateEmployee
);

// Xóa nhân viên khỏi cửa hàng
router.delete(
  "/stores/:storeId/:userId",
  authMiddleware,
  validateMongoDbId("storeId"),
  validateMongoDbId("userId"),
  deleteEmployee
);

// Lấy danh sách nhân viên trong cửa hàng
router.get(
  "/stores/:storeId",
  authMiddleware,
  validateMongoDbId("storeId"),
  getAllEmployeesInStore
);

module.exports = router;
