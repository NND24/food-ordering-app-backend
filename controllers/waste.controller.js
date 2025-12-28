const asyncHandler = require("express-async-handler");
const Waste = require("../models/waste.model");
const IngredientBatch = require("../models/ingredientBatch.model");

// Tạo waste record
const createWaste = asyncHandler(async (req, res) => {
  try {
    const { ingredientBatchId, quantity, reason, otherReason } = req.body;
    const staffId = req.user?._id; // lấy từ token auth

    const batch = await IngredientBatch.findById(ingredientBatchId).populate("ingredient").populate("inputUnit");
    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

    if (quantity > batch.remainingQuantity) {
      return res.status(400).json({ success: false, message: "Quantity exceeds remaining stock" });
    }

    let quantityInBaseUnit = quantity;

    if (batch.inputUnit) {
      quantityInBaseUnit = quantity * batch.inputUnit.ratio;
    }

    if (quantityInBaseUnit > batch.remainingQuantity) {
      return res.status(400).json({
        success: false,
        message: "Quantity exceeds remaining stock",
      });
    }

    // giảm tồn kho
    batch.remainingQuantity -= quantityInBaseUnit;
    if (batch.remainingQuantity <= 0) {
      batch.remainingQuantity = 0;
      batch.status = "finished";
    }
    await batch.save();

    // tạo waste record
    const waste = await Waste.create({
      storeId: batch.storeId,
      ingredientBatchId,
      quantity,
      reason,
      otherReason,
      staff: staffId,
    });

    res.status(201).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách waste
const getWasteList = asyncHandler(async (req, res) => {
  try {
    const { storeId } = req.params;

    const waste = await Waste.find({ storeId })
      .populate({
        path: "ingredientBatchId",
        populate: {
          path: "ingredient",
          populate: { path: "unit" },
        },
      })
      .populate("staff", "name email");

    res.status(200).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy chi tiết waste
const getWasteById = asyncHandler(async (req, res) => {
  try {
    const waste = await Waste.findById(req.params.id)
      .populate({
        path: "ingredientBatchId",
        populate: [
          {
            path: "ingredient",
            populate: { path: "unit" },
          },
          {
            path: "inputUnit",
          },
        ],
      })
      .populate("staff", "name email");
    if (!waste) return res.status(404).json({ success: false, message: "Waste not found" });
    res.status(200).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xóa waste record (rollback stock)
const deleteWaste = asyncHandler(async (req, res) => {
  try {
    const waste = await Waste.findById(req.params.id);
    if (!waste) return res.status(404).json({ success: false, message: "Waste not found" });

    const batch = await IngredientBatch.findById(waste.ingredientBatchId);
    if (batch) {
      batch.remainingQuantity += waste.quantity;
      await batch.save();
    }

    await waste.deleteOne();

    res.json({ success: true, message: "Waste deleted and stock rolled back" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Báo cáo waste
const getWasteReport = asyncHandler(async (req, res) => {
  try {
    const { from, to, groupBy = "reason" } = req.query;
    const filter = {};
    if (from && to) filter.date = { $gte: new Date(from), $lte: new Date(to) };

    const report = await Waste.aggregate([
      { $match: filter },
      {
        $group: {
          _id: `$${groupBy}`,
          totalQuantity: { $sum: "$quantity" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalQuantity: -1 } },
    ]);

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật waste record
const updateWaste = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { ingredientBatchId, quantity, reason, otherReason } = req.body;

  const waste = await Waste.findById(id);
  if (!waste) return res.status(404).json({ success: false, message: "Waste not found" });

  // 🔄 rollback batch cũ
  const oldBatch = await IngredientBatch.findById(waste.ingredientBatchId).populate("inputUnit");

  if (oldBatch) {
    const rollbackQty = waste.quantity * (oldBatch.inputUnit?.ratio || 1);

    oldBatch.remainingQuantity += rollbackQty;

    if (oldBatch.status === "finished" && oldBatch.remainingQuantity > 0) {
      oldBatch.status = "active";
    }

    await oldBatch.save();
  }

  // ✅ batch mới
  const newBatch = await IngredientBatch.findById(ingredientBatchId).populate("inputUnit");

  if (!newBatch) {
    return res.status(404).json({ success: false, message: "New batch not found" });
  }

  const quantityInBase = quantity * (newBatch.inputUnit?.ratio || 1);

  if (quantityInBase > newBatch.remainingQuantity) {
    return res.status(400).json({ success: false, message: "Quantity exceeds remaining stock" });
  }

  newBatch.remainingQuantity -= quantityInBase;

  if (newBatch.remainingQuantity <= 0) {
    newBatch.remainingQuantity = 0;
    newBatch.status = "finished";
  }

  await newBatch.save();

  // 📝 update waste
  waste.ingredientBatchId = ingredientBatchId;
  waste.quantity = quantity;
  waste.reason = reason;
  waste.otherReason = otherReason;
  waste.date = new Date();

  await waste.save();

  res.json({ success: true, data: waste });
});

module.exports = {
  createWaste,
  getWasteList,
  getWasteById,
  deleteWaste,
  getWasteReport,
  updateWaste,
};
