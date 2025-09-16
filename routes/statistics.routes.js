const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");
const {
    getRevenueSummary,
    revenueByDay,
    revenueByItem,
    revenueByCategory,
    orderSummaryStats,
    orderStatusRate,
    ordersOverTime,
    orderStatusDistribution,
    topSellingItems,
    revenueContributionByItem,
    ordersByTimeSlot,
    newCustomers,
    returningCustomerRate,
    averageSpendingPerOrder,
    voucherUsageSummary,
    topUsedVouchers,
    voucherRevenueImpact

} = require("../controllers/statistics.controller");

const router = express.Router();

router.get("/revenue/summary", authMiddleware, getRevenueSummary);
router.get("/revenue/by-day", authMiddleware, revenueByDay);
router.get("/revenue/reve", authMiddleware, getRevenueSummary);
router.get("/revenue/by-item", authMiddleware, revenueByItem);
router.get("/revenue/by-category", authMiddleware, revenueByCategory);

router.get("/order/status-rate", authMiddleware, orderStatusRate);
router.get("/order/summary", authMiddleware, orderSummaryStats);
router.get("/order/over-time", authMiddleware, ordersOverTime);
router.get("/order/status-distribution", authMiddleware, orderStatusDistribution);
router.get("/orders/by-time-slot", authMiddleware, ordersByTimeSlot);

router.get("/top-selling-items", authMiddleware, topSellingItems);
router.get("/items/revenue-contribution", authMiddleware, revenueContributionByItem);

router.get("/customers/new", authMiddleware, newCustomers);
router.get("/customers/returning-rate", authMiddleware, returningCustomerRate);
router.get("/customers/average-spending", authMiddleware, averageSpendingPerOrder);

router.get("/vouchers/usage-summary", authMiddleware, voucherUsageSummary);
router.get("/vouchers/top-used", authMiddleware, topUsedVouchers);
router.get("/vouchers/revenue-impact", authMiddleware, voucherRevenueImpact);

module.exports = router;