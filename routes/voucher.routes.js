const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDBId");
const {
  createVoucher,
  getVouchersByStore,
  updateVoucher,
  getVoucherById,
  deleteVoucher,
  toggleVoucherActiveStatus,
} = require("../controllers/voucher.controller");

const router = express.Router();

// Lấy danh sách voucher của 1 store
router.get(
  "/stores/:storeId/vouchers",
  validateMongoDbId("storeId"),
  authMiddleware,
  getVouchersByStore
);

// Tạo voucher mới
router.post(
  "/stores/:storeId/vouchers",
  validateMongoDbId("storeId"),
  authMiddleware,
  createVoucher
);

// Toggle trạng thái hoạt động
router.patch(
  "/stores/:storeId/vouchers/:id/toggle-active",
  validateMongoDbId("storeId"),
  validateMongoDbId("id"),
  authMiddleware,
  toggleVoucherActiveStatus
);

// Cập nhật voucher
router.put(
  "/stores/:storeId/vouchers/:id",
  validateMongoDbId("storeId"),
  validateMongoDbId("id"),
  authMiddleware,
  updateVoucher
);

// Lấy chi tiết 1 voucher
router.get(
  "/stores/:storeId/vouchers/:id",
  validateMongoDbId("storeId"),
  validateMongoDbId("id"),
  authMiddleware,
  getVoucherById
);

// Xoá voucher
router.delete(
  "/stores/:storeId/vouchers/:id",
  validateMongoDbId("storeId"),
  validateMongoDbId("id"),
  authMiddleware,
  deleteVoucher
);

module.exports = router;
