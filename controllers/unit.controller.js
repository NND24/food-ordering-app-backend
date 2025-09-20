const asyncHandler = require("express-async-handler");
const Unit = require("../models/unit.model");

// Tạo unit mới
const createUnit = asyncHandler(async (req, res) => {
  try {
    const { name, type } = req.body;

    const exists = await Unit.findOne({ name });
    if (exists) return res.status(400).json({ success: false, message: "Unit already exists" });

    const unit = new Unit({ name, type });
    await unit.save();
    res.status(201).json({ success: true, data: unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy tất cả units
const getUnits = asyncHandler(async (req, res) => {
  try {
    const units = await Unit.find();
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

// Cập nhật unit
const updateUnit = asyncHandler(async (req, res) => {
  try {
    const { name, type, isActive } = req.body;

    const unit = await Unit.findByIdAndUpdate(req.params.id, { name, type, isActive }, { new: true });
    if (!unit) return res.status(404).json({ success: false, message: "Unit not found" });
    res.json({ success: true, message: "Updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa unit (soft delete)
const deleteUnit = asyncHandler(async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
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
