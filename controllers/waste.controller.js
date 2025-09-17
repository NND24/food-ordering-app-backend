const asyncHandler = require("express-async-handler");
const Waste = require("../models/waste.model");
const IngredientBatch = require("../models/ingredientBatch.model");

// Tạo waste record
const createWaste = asyncHandler(async (req, res) => {
  try {
    const { ingredientBatch, quantity, reason, otherReason, staff } = req.body;

    const batch = await IngredientBatch.findById(ingredientBatch);
    if (!batch) return res.status(404).json({ success: false, message: "Batch not found" });

    if (quantity > batch.remainingQuantity) {
      return res.status(400).json({ success: false, message: "Quantity exceeds remaining stock" });
    }

    batch.remainingQuantity -= quantity;
    await batch.save();

    const waste = await Waste.create({
      ingredientBatch,
      quantity,
      reason,
      otherReason,
      staff,
    });

    res.status(201).json({ success: true, data: waste });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy danh sách waste
const getWasteList = asyncHandler(async (req, res) => {
  try {
    const { from, to, reason, staff, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (from && to) filter.date = { $gte: new Date(from), $lte: new Date(to) };
    if (reason) filter.reason = reason;
    if (staff) filter.staff = staff;

    const waste = await Waste.find(filter)
      .populate({ path: "ingredientBatch", populate: { path: "ingredient" } })
      .skip((page - 1) * limit)
      .limit(Number(limit));

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
