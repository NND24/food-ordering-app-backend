const asyncHandler = require("express-async-handler");
const Unit = require("../models/unit.model");
const Ingredient = require("../models/ingredient.model");

// 🆕 Tạo đơn vị (unit) cho 1 cửa hàng cụ thể
const createUnit = asyncHandler(async (req, res) => {
  const { name, type, storeId, baseUnit, ratio } = req.body;

  if (!storeId || !name || !type) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const unitName = name.trim().toLowerCase();

  /* ================= CHECK DUPLICATE NAME ================= */
  const exists = await Unit.findOne({ name: unitName, storeId });
  if (exists) {
    return res.status(400).json({
      success: false,
      message: "Unit already exists in this store",
    });
  }

  let finalBaseUnit = null;
  let finalRatio = 1;

  /* ================= BASE UNIT LOGIC ================= */
  if (baseUnit) {
    // baseUnit là STRING (name)
    const base = await Unit.findOne({
      name: baseUnit.toLowerCase(),
      storeId,
    });

    if (!base) {
      return res.status(400).json({
        success: false,
        message: "Base unit not found",
      });
    }

    if (base.type !== type) {
      return res.status(400).json({
        success: false,
        message: "Base unit type mismatch",
      });
    }

    if (!ratio || Number(ratio) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Ratio must be greater than 0",
      });
    }

    finalBaseUnit = base.name; // STRING
    finalRatio = Number(ratio);
  } else {
    // tạo đơn vị gốc → đảm bảo mỗi type chỉ có 1 base unit
    const existedBaseUnit = await Unit.findOne({
      storeId,
      type,
      baseUnit: null,
    });

    if (existedBaseUnit) {
      return res.status(400).json({
        success: false,
        message: `Base unit for type "${type}" already exists`,
      });
    }
  }

  /* ================= CREATE UNIT ================= */
  const unit = await Unit.create({
    name: unitName,
    type,
    storeId,
    baseUnit: finalBaseUnit, // string | null
    ratio: finalRatio,
  });

  res.status(201).json({
    success: true,
    data: unit,
  });
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

const getBaseUnits = asyncHandler(async (req, res) => {
  const { storeId } = req.params;
  const { type } = req.query;

  if (!storeId || !type) {
    return res.status(400).json({
      success: false,
      message: "storeId and type are required",
    });
  }

  const units = await Unit.find({
    storeId,
    type,
    baseUnit: null, // 👈 CHỈ đơn vị gốc
    isActive: true,
  }).sort({ name: 1 });

  res.json({
    success: true,
    data: units,
  });
});

const getUnitsByBaseUnit = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;
    const { baseUnit, activeOnly } = req.query;

    if (!storeId || !baseUnit) {
      return res.status(400).json({
        success: false,
        message: "storeId and baseUnit are required",
      });
    }

    const query = {
      storeId,
      $or: [
        { name: baseUnit }, // base unit (g)
        { baseUnit: baseUnit }, // unit con (kg)
      ],
    };

    if (activeOnly === "true") {
      query.isActive = true;
    }

    const units = await Unit.find(query).sort({ ratio: 1 }); // base unit lên đầu

    res.json({
      success: true,
      data: units,
    });
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
  const { name, type, isActive, storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({
      success: false,
      message: "storeId is required",
    });
  }

  // chỉ cho phép update các field này
  const updateData = {};

  if (name !== undefined) updateData.name = name.trim().toLowerCase();
  if (type !== undefined) updateData.type = type;
  if (isActive !== undefined) updateData.isActive = isActive;

  const unit = await Unit.findOneAndUpdate({ _id: req.params.id, storeId }, updateData, { new: true });

  if (!unit) {
    return res.status(404).json({
      success: false,
      message: "Unit not found",
    });
  }

  res.json({
    success: true,
    data: unit,
  });
});

// Xóa unit (soft delete)
const deleteUnit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({
      success: false,
      message: "storeId is required",
    });
  }

  // 1️⃣ Kiểm tra unit tồn tại
  const unit = await Unit.findOne({ _id: id, storeId });
  if (!unit) {
    return res.status(404).json({
      success: false,
      message: "Unit not found",
    });
  }

  // 2️⃣ Kiểm tra unit có đang được dùng trong Ingredient không
  const usedByIngredient = await Ingredient.exists({
    unit: id,
    storeId,
  });

  if (usedByIngredient) {
    return res.status(400).json({
      success: false,
      message: "Cannot delete unit because it is used by ingredients",
    });
  }

  await Unit.deleteOne({ _id: req.params.id });

  res.json({
    success: true,
    message: "Unit deactivated successfully",
  });
});

module.exports = {
  createUnit,
  getUnits,
  getBaseUnits,
  getUnitsByBaseUnit,
  getUnitById,
  updateUnit,
  deleteUnit,
};
