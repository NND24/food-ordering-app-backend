const express = require("express");
const {
  createUnit,
  getUnits,
  getUnitById,
  updateUnit,
  deleteUnit,
  getBaseUnits,
  getUnitsByBaseUnit,
} = require("../controllers/unit.controller");

const router = express.Router();

router.post("/", createUnit); // Tạo unit mới
router.get("/store/:storeId", getUnits); // Lấy tất cả units
router.get("/base/:storeId", getBaseUnits); // Lấy tất cả base units
router.get("/by-base/:storeId", getUnitsByBaseUnit); // Lấy units theo baseUnit
router.get("/:id", getUnitById); // Lấy unit theo ID
router.put("/:id", updateUnit); // Cập nhật unit
router.delete("/:id", deleteUnit); // Xóa (deactivate) unit

module.exports = router;
