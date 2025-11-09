const asyncHandler = require("express-async-handler");
const Unit = require("../models/unit.model");

// 🆕 Tạo đơn vị (unit) cho 1 cửa hàng cụ thể
const createUnit = asyncHandler(async (req, res) => {
  try {
    const { name, type, storeId } = req.body;

    if (!storeId) return res.status(400).json({ success: false, message: "storeId is required" });

    // Kiểm tra trùng tên trong cùng cửa hàng
    const exists = await Unit.findOne({ name: name.toLowerCase(), storeId });
    if (exists)
      return res.status(400).json({
        success: false,
        message: "Unit already exists in this store",
      });

    const unit = new Unit({ name, type, storeId });
    await unit.save();

    res.status(201).json({ success: true, data: unit });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ success: false, message: "Duplicate unit name in this store" });

    res.status(500).json({ success: false, message: err.message });
  }
});

// 📋 Lấy tất cả đơn vị theo storeId
const getUnits = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;
    const { activeOnly } = req.query;

    if (!storeId) return res.status(400).json({ success: false, message: "storeId is required" });

    const query = { storeId };
    if (activeOnly === "true") {
      query.isActive = true;
    }

    const units = await Unit.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: units });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy 1 unit theo id
const getUnitById = asyncHandler(async (req, res) => {
  try {
    const unit = await Unit.findById(req.params.id);
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });
    res.status(200).json({ success: true, data: unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ✏️ Cập nhật đơn vị
const updateUnit = asyncHandler(async (req, res) => {
  try {
    const { name, type, isActive, storeId } = req.body;

    if (!storeId) return res.status(400).json({ success: false, message: "storeId is required" });

    const unit = await Unit.findOneAndUpdate({ _id: req.params.id, storeId }, { name, type, isActive }, { new: true });

    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });

    res.json({ success: true, message: "Updated successfully", data: unit });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({
        success: false,
        message: "Unit name already exists in this store",
      });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa unit (soft delete)
const deleteUnit = asyncHandler(async (req, res) => {
  try {
    const unit = await Unit.deleteOne({ _id: req.params.id });
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });
    res.json({ success: true, message: "Unit deactivated", unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = {
  createUnit,
  getUnits,
  getUnitById,
  updateUnit,
  deleteUnit,
};
