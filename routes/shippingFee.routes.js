const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDBId");
const {
  getShippingFeesByStore,
  createShippingFee,
  updateShippingFee,
  deleteShippingFee,
  calculateShippingFee,
} = require("../controllers/shippingFee.controller");

const router = express.Router();

// Lấy danh sách các khoảng phí giao hàng của store
router.get(
  "/stores/:storeId",
  validateMongoDbId("storeId"),
  authMiddleware,
  getShippingFeesByStore
);

// Tạo mới một khoảng phí giao hàng
router.post(
  "/stores/:storeId",
  validateMongoDbId("storeId"),
  authMiddleware,
  createShippingFee
);

// Cập nhật một khoảng phí giao hàng cụ thể
router.put(
  "/stores/:storeId/:feeId",
  validateMongoDbId("storeId"),
  validateMongoDbId("feeId"),
  authMiddleware,
  updateShippingFee
);

// Xoá một khoảng phí giao hàng cụ thể
router.delete(
  "/stores/:storeId/:feeId",
  validateMongoDbId("storeId"),
  validateMongoDbId("feeId"),
  authMiddleware,
  deleteShippingFee
);

// Tính phí giao hàng dựa vào khoảng cách
router.get(
  "/stores/:storeId/calculate",
  validateMongoDbId("storeId"),
  calculateShippingFee // Truyền query ?distance=...
);

module.exports = router;
