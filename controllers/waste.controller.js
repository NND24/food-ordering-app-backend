const asyncHandler = require("express-async-handler");
const Waste = require("../models/waste.model");
const IngredientBatch = require("../models/ingredientBatch.model");

// Tạo waste record
const createWaste = asyncHandler(async (req, res) => {
  try {
    const { ingredientBatchId, quantity, reason, otherReason, staff } = req.body;

    const batch = await IngredientBatch.findById(ingredientBatchId);
    if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });

    if (quantity > batch.remainingQuantity) {
      return res.status(400).json({ success: false, message: "Quantity exceeds remaining stock" });
    }

    batch.remainingQuantity -= quantity;
    if (batch.remainingQuantity === 0) batch.status = "finished";
    await batch.save();

    const waste = new Waste({
      ingredientBatchId,
      quantity,
      reason,
      otherReason,
      staff,
    });
    await waste.save();

    res.status(201).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách waste
const getWasteList = asyncHandler(async (req, res) => {
  try {
    const { from, to, reason, staff } = req.query;
    const filter = {};

    if (from && to) filter.date = { $gte: new Date(from), $lte: new Date(to) };
    if (reason) filter.reason = reason;
    if (staff) filter.staff = staff;

    const waste = await Waste.find(filter).populate({ path: "ingredientBatch", populate: { path: "ingredient" } });

    res.status(200).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy chi tiết waste
const getWasteById = asyncHandler(async (req, res) => {
  try {
    const waste = await Waste.findById(req.params.id).populate({
      path: "ingredientBatch",
      populate: { path: "ingredient" },
    });
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

    const batch = await IngredientBatch.findById(waste.ingredientBatch);
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

module.exports = {
  createWaste,
  getWasteList,
  getWasteById,
  deleteWaste,
  getWasteReport,
};
