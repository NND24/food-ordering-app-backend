const express = require("express");
const { createUnit, getStoreUnits, getUnitById, updateUnit, deleteUnit } = require("../controllers/unit.controller");

const router = express.Router();

router.post("/", createUnit); // Tạo unit mới
router.get("/:storeId", getStoreUnits); // Lấy tất cả units
router.get("/:id", getUnitById); // Lấy unit theo ID
router.put("/:id", updateUnit); // Cập nhật unit
router.delete("/:id", deleteUnit); // Xóa (deactivate) unit

module.exports = router;
