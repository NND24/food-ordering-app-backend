const Voucher = require("../models/voucher.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");

const getVouchersByStore = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const now = new Date();

  try {
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({
        status: "error",
        message: "Store not found",
      });
    }

    const allVouchers = await Voucher.find({ storeId }).populate("storeId");

    if (!allVouchers || allVouchers.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No vouchers found for this store",
      });
    }

    const usable = [];
    const upcoming = [];
    const expiredOrDisabled = [];

    allVouchers.forEach((voucher) => {
      const isWithinDate = voucher.startDate <= now && now <= voucher.endDate;
      const notUsedUp = voucher.usageLimit
        ? voucher.usedCount < voucher.usageLimit
        : true;

      if (voucher.isActive && isWithinDate && notUsedUp) {
        usable.push(voucher);
      } else if (voucher.isActive && voucher.startDate > now) {
        upcoming.push(voucher);
      } else {
        expiredOrDisabled.push(voucher);
      }
    });

    const sortedVouchers = [...usable, ...upcoming, ...expiredOrDisabled];

    res.status(200).json({
      status: "success",
      message: "Vouchers fetched and sorted successfully",
      data: sortedVouchers,
    });
  } catch (error) {
    next(error);
  }
});

const createVoucher = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;

  try {
    if (!storeId) {
      return next(createError(400, "Missing storeId in params"));
    }

    const voucherData = {
      ...req.body,
      storeId,
    };

    const newVoucher = new Voucher(voucherData);
    const saved = await newVoucher.save();

    res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

const getVoucherById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  try {
    const voucher = await Voucher.findById(id).populate("storeId");

    if (!voucher) {
      return next(createError(404, "Voucher not found"));
    }

    res.json(voucher);
  } catch (error) {
    next(error);
  }
});

const updateVoucher = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  try {
    const updated = await Voucher.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return next(createError(404, "Voucher not found"));
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

const deleteVoucher = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  try {
    const deleted = await Voucher.findByIdAndDelete(id);

    if (!deleted) {
      return next(createError(404, "Voucher not found"));
    }

    res.json({ message: "Voucher deleted successfully" });
  } catch (error) {
    next(error);
  }
});

const toggleVoucherActiveStatus = asyncHandler(async (req, res, next) => {
  const { storeId, id } = req.params;

  try {
    const voucher = await Voucher.findOne({ _id: id, storeId });
    if (!voucher) {
      return res.status(404).json({
        status: "error",
        message: "Voucher not found for the specified store",
      });
    }

    voucher.isActive = !voucher.isActive;
    await voucher.save();

    res.status(200).json({
      status: "success",
      message: `Voucher has been ${
        voucher.isActive ? "activated" : "deactivated"
      } successfully.`,
      data: voucher,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = {
  getVouchersByStore,
  createVoucher,
  getVoucherById,
  updateVoucher,
  deleteVoucher,
  toggleVoucherActiveStatus,
};
