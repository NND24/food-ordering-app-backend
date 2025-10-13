const Order = require("../models/order.model");
const Store = require("../models/store.model");
const Voucher = require("../models/voucher.model");
const OrderItem = require("../models/orderItem.model");
const OrderVoucher = require("../models/orderVoucher.model");
const Ingredient = require("../models/ingredient.model");
const Waste = require("../models/waste.model");
const UserVoucherUsage = require("../models/userVoucherUsage.model");
const moment = require("moment-timezone");
const asyncHandler = require("express-async-handler");
const successResponse = require("../utils/successResponse");
const createError = require("http-errors");
const mongoose = require("mongoose");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const analyzeBusinessResult = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const year = parseInt(req.query.year) || moment().year();
  const period = req.query.period || "month"; // day, week, month, year
  const groupBy = req.query.groupBy || "day"; // chỉ dùng khi period = month → day | week
  const date = req.query.date; // dùng khi period = day
  const week = parseInt(req.query.week);

  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });
  if (!store) {
    return res.status(404).json({ success: false, message: "Store not found" });
  }

  const storeId = store._id;

  // ---- 1️⃣ Xây matchStage theo loại period ----
  const matchStage = {
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
  };

  if (period === "day" && date) {
    // 🟩 Nếu xem theo ngày → chỉ 1 ngày cụ thể
    const startOfDay = moment(date).startOf("day").toDate();
    const endOfDay = moment(date).endOf("day").toDate();
    matchStage.createdAt = { $gte: startOfDay, $lte: endOfDay };
  } else if (period === "week" && week && year) {
    // 🟩 Nếu xem theo tuần → lấy đúng 7 ngày trong tuần đó
    const startOfWeek = moment().year(year).week(week).startOf("week").toDate();
    const endOfWeek = moment().year(year).week(week).endOf("week").toDate();
    matchStage.createdAt = { $gte: startOfWeek, $lte: endOfWeek };
  } else if (period === "month" && req.query.month) {
    // 🟩 Nếu xem theo tháng → lấy toàn bộ tháng
    const month = parseInt(req.query.month);
    const startOfMonth = moment({ year, month: month - 1 })
      .startOf("month")
      .toDate();
    const endOfMonth = moment({ year, month: month - 1 })
      .endOf("month")
      .toDate();
    matchStage.createdAt = { $gte: startOfMonth, $lte: endOfMonth };
  } else {
    // 🟩 Mặc định: cả năm
    matchStage.createdAt = {
      $gte: moment({ year }).startOf("year").toDate(),
      $lte: moment({ year }).endOf("year").toDate(),
    };
  }

  // ---- 2️⃣ Định dạng thời gian nhóm ----
  let dateFormat = "%Y-%m"; // mặc định theo tháng
  if (period === "day") dateFormat = "%H:00"; // theo giờ
  else if (period === "week") dateFormat = "%Y-%m-%d"; // theo ngày trong tuần
  else if (period === "month") {
    // 🟩 Nếu xem theo tháng → có thể nhóm theo ngày hoặc theo tuần
    if (groupBy === "day") dateFormat = "%Y-%m-%d";
    else if (groupBy === "week") dateFormat = "%Y-%U"; // tuần trong năm
  } else if (period === "year") dateFormat = "%Y-%m"; // mỗi tháng

  // ---- 3️⃣ Thực hiện aggregation ----
  const statsRaw = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          $dateToString: {
            format: dateFormat,
            date: "$createdAt",
            timezone: "Asia/Ho_Chi_Minh",
          },
        },
        revenue: { $sum: "$finalTotal" },
        cost: { $sum: "$totalCost" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // ---- 3️⃣b. Thống kê món ăn bán chạy ----
  const topDishesRaw = await OrderItem.aggregate([
    // Nối sang Order để lọc theo cửa hàng & thời gian
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: "$order" },
    {
      $match: {
        "order.storeId": storeId,
        "order.status": { $in: ["done", "delivered", "finished"] },
        "order.createdAt": matchStage.createdAt, // lọc theo khoảng thời gian của đơn hàng
      },
    },
    {
      $group: {
        _id: {
          dishId: "$dishId",
          timeGroup: {
            $dateToString: {
              format: dateFormat,
              date: "$order.createdAt",
              timezone: "Asia/Ho_Chi_Minh",
            },
          },
        },
        totalSold: { $sum: "$quantity" },
        totalRevenue: { $sum: { $multiply: ["$quantity", "$price"] } },
      },
    },
    {
      $lookup: {
        from: "dishes",
        localField: "_id.dishId",
        foreignField: "_id",
        as: "dish",
      },
    },
    { $unwind: "$dish" },
    {
      $project: {
        _id: 0,
        dishId: "$_id.dishId",
        timeGroup: "$_id.timeGroup",
        name: "$dish.name",
        category: "$dish.category",
        totalSold: 1,
        totalRevenue: 1,
      },
    },
    { $sort: { timeGroup: 1, totalSold: -1 } },
  ]);

  // Gom nhóm lại theo thời gian, chọn top 3 món mỗi khoảng
  const groupedTopDishes = {};
  for (const item of topDishesRaw) {
    if (!groupedTopDishes[item.timeGroup]) groupedTopDishes[item.timeGroup] = [];
    const list = groupedTopDishes[item.timeGroup];
    if (list.length < 3) list.push(item);
  }

  // ---- 🔹 Chọn món nổi bật mỗi giai đoạn ----
  for (const [period, dishes] of Object.entries(groupedTopDishes)) {
    const avgSold = dishes.reduce((a, b) => a + b.totalSold, 0) / dishes.length;
    const highlighted = dishes.filter((d) => d.totalSold >= avgSold * 1.5);
    groupedTopDishes[period] = highlighted.length > 0 ? highlighted.slice(0, 3) : dishes.slice(0, 3);
  }

  // ---- 🔹 Giới hạn hiển thị quá nhiều ngày ----
  const groupedTopDishesLimited = {};
  const allPeriods = Object.keys(groupedTopDishes);

  if (allPeriods.length > 10) {
    const periodTotals = allPeriods.map((period) => ({
      period,
      totalRevenue: groupedTopDishes[period].reduce((a, b) => a + b.totalRevenue, 0),
    }));

    const topPeriods = periodTotals.sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 5);

    topPeriods.forEach(({ period }) => {
      groupedTopDishesLimited[period] = groupedTopDishes[period];
    });
  } else {
    Object.assign(groupedTopDishesLimited, groupedTopDishes);
  }

  // ---- 4️⃣ Chuẩn hóa dữ liệu theo từng loại period ----
  let stats = statsRaw;

  // 🕐 Nếu xem theo ngày → đảm bảo có đủ 24 giờ
  if (period === "day") {
    const allHours = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, "0")}:00`);

    const normalizedStats = statsRaw.map((s) => {
      let hour = s._id.trim();
      if (/^\d{1,2}$/.test(hour)) hour = hour.padStart(2, "0") + ":00";
      else if (/^\d{1,2}:\d{2}$/.test(hour)) hour = hour.padStart(5, "0");
      else if (/^\d{1,2}h$/.test(hour)) hour = hour.replace("h", ":00").padStart(5, "0");
      return { ...s, _id: hour };
    });

    stats = allHours.map((hour) => {
      const existing = normalizedStats.find((s) => s._id === hour);
      return existing || { _id: hour, revenue: 0, cost: 0 };
    });
  }

  // 📅 Nếu xem theo tuần → đảm bảo có đủ 7 ngày
  if (period === "week" && week && year) {
    const startOfWeek = moment().year(year).week(week).startOf("week");
    const allDays = Array.from({ length: 7 }, (_, i) => startOfWeek.clone().add(i, "day").format("YYYY-MM-DD"));

    const normalizedStats = statsRaw.map((s) => ({
      ...s,
      _id: moment(s._id).format("YYYY-MM-DD"),
    }));

    stats = allDays.map((d) => {
      const existing = normalizedStats.find((s) => s._id === d);
      return existing || { _id: d, revenue: 0, cost: 0 };
    });
  }

  // 📅 Nếu xem theo tháng → hiển thị theo ngày hoặc theo tuần
  if (period === "month" && req.query.month) {
    const month = parseInt(req.query.month);
    const startOfMonth = moment({ year, month: month - 1 }).startOf("month");
    const endOfMonth = moment({ year, month: month - 1 }).endOf("month");

    if (groupBy === "day") {
      // 🗓️ Nhóm theo ngày trong tháng
      const daysInMonth = endOfMonth.date();
      const allDays = Array.from({ length: daysInMonth }, (_, i) =>
        startOfMonth.clone().add(i, "day").format("YYYY-MM-DD")
      );

      const normalizedStats = statsRaw.map((s) => ({
        ...s,
        _id: moment(s._id).format("YYYY-MM-DD"),
      }));

      stats = allDays.map((d) => {
        const existing = normalizedStats.find((s) => s._id === d);
        return existing || { _id: d, revenue: 0, cost: 0 };
      });
    } else if (groupBy === "week") {
      // 📆 Nhóm theo tuần trong tháng
      const startWeek = startOfMonth.week();
      const endWeek = endOfMonth.week();
      const allWeeks = Array.from({ length: endWeek - startWeek + 1 }, (_, i) => {
        const weekNum = startWeek + i;
        return `${year}-W${weekNum.toString().padStart(2, "0")}`;
      });

      const normalizedStats = statsRaw.map((s) => {
        const [y, w] = s._id.split("-");
        return { ...s, _id: `${y}-W${w.padStart(2, "0")}` };
      });

      stats = allWeeks.map((w) => {
        const existing = normalizedStats.find((s) => s._id === w);
        return existing || { _id: w, revenue: 0, cost: 0 };
      });
    }
  }

  // 📅 Nếu xem theo năm → đảm bảo có đủ 12 tháng
  if (period === "year") {
    const allMonths = Array.from({ length: 12 }, (_, i) => moment({ year, month: i }).format("YYYY-MM"));

    const normalizedStats = statsRaw.map((s) => ({
      ...s,
      _id: moment(s._id).format("YYYY-MM"),
    }));

    stats = allMonths.map((m) => {
      const existing = normalizedStats.find((s) => s._id === m);
      return existing || { _id: m, revenue: 0, cost: 0 };
    });
  }

  // ---- 5️⃣ Tính toán chỉ số ----
  const analysis = stats.map((s, i) => {
    const prev = stats[i - 1];
    const revenue = s.revenue || 0;
    const cost = s.cost || 0;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const growth = prev ? ((revenue - prev.revenue) / (prev.revenue || 1)) * 100 : 0;

    return {
      period: s._id,
      revenue,
      cost,
      profit,
      margin: Number(margin.toFixed(2)),
      growth: Number(growth.toFixed(2)),
    };
  });

  // ---- 7️⃣ Gợi ý món ăn theo thời gian ----
  const dishInsights = [];

  Object.entries(groupedTopDishesLimited).forEach(([period, dishes]) => {
    if (!dishes.length) return;

    // 🔸 Sắp xếp lại để lấy món bán chạy nhất
    const sorted = [...dishes].sort((a, b) => b.totalSold - a.totalSold);
    const bestDish = sorted[0];
    const avgSold = dishes.reduce((a, b) => a + b.totalSold, 0) / dishes.length;

    // 🔸 Tính tỷ lệ vượt trung bình
    const ratio = (bestDish.totalSold / avgSold).toFixed(2);

    // 🔸 Random chọn template để tạo cảm giác "đa dạng"
    const strongTemplates = [
      `🔥 Ở giai đoạn ${period}, món **"${bestDish.name}"** bán cực chạy (${bestDish.totalSold} phần, cao hơn trung bình ${ratio}×) — nên đẩy mạnh quảng cáo hoặc giảm giá nhẹ để tối đa hóa doanh thu.`,
      `📈 Trong ${period}, món **"${bestDish.name}"** bứt phá doanh số, chiếm tỉ trọng lớn nhất trong các đơn hàng — đề xuất đẩy mạnh hiển thị trong menu chính.`,
      `💰 "${bestDish.name}" đang tạo ra doanh thu vượt trội trong giai đoạn ${period} — nên cân nhắc bổ sung combo hoặc ưu đãi riêng.`,
    ];

    const stableTemplates = [
      `🍽 Trong khoảng ${period}, các món ${dishes
        .map((d) => `"${d.name}"`)
        .join(", ")} đều có doanh số ổn định — nên duy trì nguyên liệu và dự báo nhập hàng hợp lý.`,
      `🥗 Giai đoạn ${period} cho thấy sức mua ổn định ở các món ${dishes
        .map((d) => `"${d.name}"`)
        .join(", ")} — phù hợp để giữ nguyên giá và chiến lược hiện tại.`,
      `🧾 Các món ${dishes
        .map((d) => `"${d.name}"`)
        .join(", ")} duy trì doanh số tốt trong ${period} — nên tập trung đảm bảo chất lượng phục vụ.`,
    ];

    const weakTemplates = [
      `⚠️ Trong ${period}, không có món nào nổi bật rõ rệt — nên xem xét chương trình khuyến mãi hoặc thay đổi thực đơn để kích cầu.`,
      `🕐 Giai đoạn ${period} ghi nhận mức bán trung bình thấp — nên đánh giá lại menu hoặc cải thiện hình ảnh món ăn.`,
    ];

    // 🔸 Lựa chọn câu phù hợp theo tỷ lệ vượt trung bình
    if (bestDish.totalSold > avgSold * 1.5) {
      dishInsights.push(strongTemplates[Math.floor(Math.random() * strongTemplates.length)]);
    } else if (bestDish.totalSold < avgSold * 0.8) {
      dishInsights.push(weakTemplates[Math.floor(Math.random() * weakTemplates.length)]);
    } else {
      dishInsights.push(stableTemplates[Math.floor(Math.random() * stableTemplates.length)]);
    }
  });

  // ---- 6️⃣ Gọi sang Python service để phân tích sâu ----
  try {
    const response = await axios.post("http://127.0.0.1:8000/analyze", {
      data: analysis,
      scenario: req.body.scenario,
      period_type: period,
      groupBy: groupBy,
    });

    const result = response.data;

    return res.status(200).json(
      successResponse({
        analysis,
        ...result,
        topDishes: groupedTopDishesLimited,
        dishInsights,
      })
    );
  } catch (err) {
    console.error("Python service error:", err);
    return res.status(500).json({ error: "Python service failed" });
  }
});

const getStoreIdFromUser = async (userId) => {
  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });
  if (!store) throw createError(404, "Store not found");
  return store._id;
};

const parseDateRange = (from, to) => {
  if (!from || !to) {
    throw createError(400, "Both 'from' and 'to' query parameters are required");
  }
  const startDate = moment(from, "YYYY-MM-DD", true);
  const endDate = moment(to, "YYYY-MM-DD", true);
  if (!startDate.isValid() || !endDate.isValid()) {
    throw createError(400, "Invalid date format. Use YYYY-MM-DD");
  }
  if (endDate.isBefore(startDate)) {
    throw createError(400, "'to' date must be after 'from' date");
  }
  return {
    startDate: startDate.startOf("day").utc().toDate(),
    endDate: endDate.endOf("day").utc().toDate(),
  };
};

// Revenue
const getRevenueSummary = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });
  if (!store) return next(createError(404, "Store not found"));
  const storeId = store._id;

  const now = moment().tz("Asia/Ho_Chi_Minh");
  const startOfToday = now.clone().startOf("day").toDate();
  const startOfWeek = now.clone().startOf("isoWeek").toDate();
  const startOfMonth = now.clone().startOf("month").toDate();

  const matchBase = {
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
  };

  async function calcSummary(startDate) {
    const [orderAgg] = await Order.aggregate([
      { $match: { ...matchBase, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: "$finalTotal" },
          cost: { $sum: "$totalCost" },
        },
      },
    ]);

    // hao hụt nguyên liệu
    const wasteAgg = await Waste.aggregate([
      { $match: { storeId, date: { $gte: startDate } } },
      { $group: { _id: null, wasteCost: { $sum: "$quantity" } } },
      // nếu quantity * unitPrice thì cần lookup IngredientBatch để tính đúng giá trị
    ]);

    const revenue = orderAgg?.revenue || 0;
    const cost = orderAgg?.cost || 0;
    const wasteCost = wasteAgg[0]?.wasteCost || 0;

    const profit = revenue - cost - wasteCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { revenue, cost, wasteCost, profit, margin };
  }

  const [today, week, month] = await Promise.all([
    calcSummary(startOfToday),
    calcSummary(startOfWeek),
    calcSummary(startOfMonth),
  ]);

  return res.status(200).json(
    successResponse({
      today,
      week,
      month,
    })
  );
});

const getStartDates = () => {
  const now = moment().tz("Asia/Ho_Chi_Minh");
  return {
    today: now.clone().startOf("day").utc().toDate(),
    week: now.clone().startOf("isoWeek").utc().toDate(),
    month: now.clone().startOf("month").utc().toDate(),
  };
};

const revenueByPeriod = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const period = req.query.period || "day"; // day | week | month | year
  const month = parseInt(req.query.month); // 1-12
  const year = parseInt(req.query.year);

  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });
  if (!store) return res.status(404).json({ success: false, message: "Store not found" });

  const storeId = store._id;
  const now = moment().tz("Asia/Ho_Chi_Minh");

  let startDate, endDate, groupFormat, projectField;
  if (period === "day") {
    const m = month ? month - 1 : now.month();
    const y = year || now.year();
    startDate = moment({ year: y, month: m, day: 1 }).startOf("day").toDate();
    endDate = moment(startDate).endOf("month").endOf("day").toDate();
    groupFormat = "%Y-%m-%d";
    projectField = "date";
  } else if (period === "week") {
    const y = year || now.year();
    startDate = moment({ year: y }).startOf("year").startOf("isoWeek").toDate();
    endDate = moment({ year: y }).endOf("year").endOf("isoWeek").toDate();
    groupFormat = "%G-W%V"; // ISO week
    projectField = "week";
  } else if (period === "month") {
    const y = year || now.year();
    startDate = moment({ year: y, month: 0, day: 1 }).startOf("day").toDate();
    endDate = moment({ year: y, month: 11, day: 31 }).endOf("day").toDate();
    groupFormat = "%Y-%m";
    projectField = "month";
  } else if (period === "year") {
    groupFormat = "%Y";
    projectField = "year";
  }

  const match = { storeId, status: { $in: ["done", "delivered", "finished"] } };
  if (startDate && endDate) match.createdAt = { $gte: startDate, $lte: endDate };

  // 1. Aggregate revenue & cost từ Order
  const stats = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: groupFormat, date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        revenue: { $sum: "$finalTotal" },
        cost: { $sum: "$totalCost" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // 2. Aggregate wasteCost từ Waste
  const wasteAgg = await Waste.aggregate([
    {
      $match: {
        storeId,
        ...(startDate && endDate ? { date: { $gte: startDate, $lte: endDate } } : {}),
      },
    },
    {
      $lookup: {
        from: "ingredientbatches",
        localField: "ingredientBatchId",
        foreignField: "_id",
        as: "batch",
      },
    },
    { $unwind: "$batch" },
    {
      $group: {
        _id: { $dateToString: { format: groupFormat, date: "$date", timezone: "Asia/Ho_Chi_Minh" } },
        wasteCost: { $sum: { $multiply: ["$quantity", "$batch.unitPrice"] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // 3. Merge stats + wasteAgg
  const merged = stats.map((s) => {
    const waste = wasteAgg.find((w) => w._id === s._id);
    const wasteCost = waste ? waste.wasteCost : 0;
    const profit = s.revenue - (s.cost + wasteCost);
    const margin = s.revenue > 0 ? (profit / s.revenue) * 100 : 0;
    return {
      [projectField]: s._id,
      revenue: s.revenue,
      cost: s.cost,
      wasteCost,
      profit,
      margin,
    };
  });

  return res.status(200).json(successResponse(merged));
});

const revenueByItem = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const limit = parseInt(req.query.limit) || 5;
  const period = req.query.period || "day"; // day | week | month | year
  const month = parseInt(req.query.month);
  const year = parseInt(req.query.year);

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing user ID in token",
    });
  }

  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });

  if (!store) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized or store not found",
    });
  }

  const storeId = store._id;
  const now = moment().tz("Asia/Ho_Chi_Minh");

  let startDate, endDate;

  if (period === "day") {
    const m = month ? month - 1 : now.month(); // moment: month index 0-11
    const y = year || now.year();

    startDate = moment({ year: y, month: m, day: 1 }).startOf("day").toDate();
    endDate = moment(startDate).endOf("month").endOf("day").toDate();
  } else if (period === "week") {
    const y = year || now.year();
    // tuần đầu tiên và tuần cuối cùng trong năm theo ISO
    startDate = moment({ year: y }).startOf("year").startOf("isoWeek").toDate();
    endDate = moment({ year: y }).endOf("year").endOf("isoWeek").toDate();
  } else if (period === "month") {
    const y = year || now.year();
    startDate = moment({ year: y, month: 0, day: 1 }).startOf("day").toDate();
    endDate = moment({ year: y, month: 11, day: 31 }).endOf("day").toDate();
  } else if (period === "year") {
    // lấy toàn bộ, không filter theo thời gian
  }

  // Step 1: Get orderIds trong khoảng thời gian
  const match = {
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
  };
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  const orders = await Order.find(match).select("_id");
  const orderIds = orders.map((o) => o._id);

  // Step 2: Aggregate từ OrderItem
  const result = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $group: {
        _id: "$dishName",
        totalRevenue: { $sum: { $multiply: ["$price", "$quantity"] } },
        totalCost: { $sum: { $ifNull: ["$cost", 0] } },
        totalQuantity: { $sum: "$quantity" },
      },
    },
    {
      $addFields: {
        totalProfit: { $subtract: ["$totalRevenue", { $ifNull: ["$totalCost", 0] }] },
        margin: {
          $cond: [
            { $gt: ["$totalRevenue", 0] },
            {
              $divide: [{ $toDouble: { $ifNull: ["$totalProfit", 0] } }, { $toDouble: "$totalRevenue" }],
            },
            0,
          ],
        },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        dishName: "$_id",
        totalRevenue: 1,
        totalCost: 1,
        totalProfit: 1,
        margin: 1,
        totalQuantity: 1,
      },
    },
  ]);

  const formatted = result.map((r) => ({
    ...r,
    totalRevenue: Number(r.totalRevenue),
    totalCost: Number(r.totalCost),
    totalProfit: Number(r.totalProfit),
    margin: Number(r.margin),
  }));

  return res.status(200).json(successResponse(formatted));
});

const revenueByDishGroup = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  const limit = parseInt(req.query.limit) || 5;
  const period = req.query.period || "day"; // day | month | year
  const month = parseInt(req.query.month);
  const year = parseInt(req.query.year);

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing user ID in token",
    });
  }

  const storeId = await getStoreIdFromUser(userId);
  const now = moment().tz("Asia/Ho_Chi_Minh");

  let startDate, endDate;
  if (period === "day") {
    const m = month ? month - 1 : now.month();
    const y = year || now.year();
    startDate = moment({ year: y, month: m, day: 1 }).startOf("day").toDate();
    endDate = moment(startDate).endOf("month").endOf("day").toDate();
  } else if (period === "week") {
    const y = year || now.year();
    startDate = moment({ year: y }).startOf("year").startOf("isoWeek").toDate();
    endDate = moment({ year: y }).endOf("year").endOf("isoWeek").toDate();
  } else if (period === "month") {
    const y = year || now.year();
    startDate = moment({ year: y, month: 0, day: 1 }).startOf("day").toDate();
    endDate = moment({ year: y, month: 11, day: 31 }).endOf("day").toDate();
  } else if (period === "year") {
    // lấy toàn bộ năm → hoặc bỏ filter thời gian
  }

  const match = {
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
  };
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  // Lấy orderIds
  const orders = await Order.find(match).select("_id");
  const orderIds = orders.map((o) => o._id);

  // Aggregate theo group
  const results = await OrderItem.aggregate([
    { $match: { orderId: { $in: orderIds } } },
    {
      $lookup: {
        from: "dishes",
        localField: "dishId",
        foreignField: "_id",
        as: "dishDetail",
      },
    },
    { $unwind: "$dishDetail" },
    {
      $lookup: {
        from: "dishgroups",
        let: { dishId: "$dishId" },
        pipeline: [{ $match: { $expr: { $in: ["$$dishId", "$dishes"] } } }, { $project: { _id: 1, name: 1 } }],
        as: "dishGroup",
      },
    },
    { $unwind: "$dishGroup" },
    {
      $group: {
        _id: "$dishGroup._id",
        groupName: { $first: "$dishGroup.name" },
        totalRevenue: { $sum: { $multiply: ["$price", "$quantity"] } },
        totalCost: { $sum: { $ifNull: ["$cost", 0] } },
        totalQuantity: { $sum: "$quantity" },
      },
    },
    {
      $addFields: {
        totalProfit: { $subtract: ["$totalRevenue", "$totalCost"] },
        margin: {
          $cond: [{ $gt: ["$totalRevenue", 0] }, { $divide: ["$totalProfit", "$totalRevenue"] }, 0],
        },
      },
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: limit },
  ]);

  return res.status(200).json(successResponse(results));
});

const analyzeBusinessResultTest = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const year = parseInt(req.query.year) || moment().year();
  const period = req.query.period || "month"; // thêm param: day | week | month | year

  const store = await Store.findOne({
    $or: [{ owner: userId }, { staff: userId }],
  });
  if (!store) return res.status(404).json({ success: false, message: "Store not found" });

  const storeId = store._id;

  const matchStage = {
    storeId,
    status: { $in: ["done", "delivered", "finished"] },
    createdAt: {
      $gte: moment({ year }).startOf("year").toDate(),
      $lte: moment({ year }).endOf("year").toDate(),
    },
  };

  // format cho group
  let dateFormat = "%Y-%m"; // default month
  if (period === "day") dateFormat = "%Y-%m-%d";
  else if (period === "week") dateFormat = "%G-W%V"; // ISO week format
  else if (period === "year") dateFormat = "%Y";

  const stats = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" } },
        revenue: { $sum: "$finalTotal" },
        cost: { $sum: "$totalCost" },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Tính thêm profit, margin, growth
  const analysis = stats.map((s, i) => {
    const prev = stats[i - 1];
    const revenue = s.revenue || 0;
    const cost = s.cost || 0;
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const growth = prev ? ((revenue - prev.revenue) / (prev.revenue || 1)) * 100 : 0;

    return {
      period: s._id, // có thể là ngày, tuần, tháng, năm
      revenue,
      cost,
      profit,
      margin: Number(margin.toFixed(2)),
      growth: Number(growth.toFixed(2)),
    };
  });

  // --- Rule-based dự đoán ---
  const last = analysis[analysis.length - 1];
  const prev = analysis[analysis.length - 2];
  let predictions = [];

  if (last && prev) {
    if (last.growth > 10 && prev.growth > 10) {
      predictions.push("📈 Doanh thu có xu hướng tăng mạnh, dự kiến kỳ tới sẽ tiếp tục tăng.");
    }
    const revenueGrowth = ((last.revenue - prev.revenue) / (prev.revenue || 1)) * 100;
    const costGrowth = ((last.cost - prev.cost) / (prev.cost || 1)) * 100;
    if (costGrowth > revenueGrowth) {
      predictions.push("⚠️ Chi phí đang tăng nhanh hơn doanh thu, có thể ảnh hưởng đến lợi nhuận.");
    }
    if (last.margin < 15) {
      predictions.push("🔻 Biên lợi nhuận thấp, cần kiểm soát chi phí.");
    } else {
      predictions.push("✅ Biên lợi nhuận ổn định.");
    }
  }

  // Ước lượng kỳ tới
  const avgGrowth = analysis.slice(-3).reduce((acc, x) => acc + x.growth, 0) / Math.max(analysis.slice(-3).length, 1);
  const predictedRevenue = last ? Math.round(last.revenue * (1 + avgGrowth / 100)) : 0;
  const predictedProfit = last ? Math.round(predictedRevenue - last.cost) : 0;

  return res.status(200).json(
    successResponse({
      analysis,
      predictions,
      forecast: {
        predictedRevenue,
        predictedProfit,
        avgGrowth: avgGrowth.toFixed(2) + "%",
      },
    })
  );
});

// Order
const orderSummaryStats = asyncHandler(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "Missing user ID in token",
    });
  }

  const storeId = await getStoreIdFromUser(userId);

  if (!storeId) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: User is not linked to a store",
    });
  }

  const now = new Date();

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const matchStatus = {
    status: { $in: ["done", "delivered", "finished"] },
    storeId,
  };

  const [todayCount, weekCount, monthCount] = await Promise.all([
    Order.countDocuments({
      ...matchStatus,
      createdAt: { $gte: startOfToday },
    }),
    Order.countDocuments({
      ...matchStatus,
      createdAt: { $gte: startOfWeek },
    }),
    Order.countDocuments({
      ...matchStatus,
      createdAt: { $gte: startOfMonth },
    }),
  ]);

  return res.status(200).json(
    successResponse({
      today: todayCount,
      thisWeek: weekCount,
      thisMonth: monthCount,
    })
  );
});

const orderStatusRate = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const completedStatuses = ["done", "delivered", "finished"];
  const cancelledStatuses = ["cancelled"];

  const [completedCount, cancelledCount] = await Promise.all([
    Order.countDocuments({ storeId, status: { $in: completedStatuses } }),
    Order.countDocuments({ storeId, status: { $in: cancelledStatuses } }),
  ]);

  res.status(200).json(
    successResponse({
      completed: completedCount,
      cancelled: cancelledCount,
    })
  );
});

const ordersOverTime = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const { from, to } = req.query;

  let startDate, endDate;
  const now = new Date();

  if (from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
  } else {
    // Default: last 7 days
    endDate = new Date(now);
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 6);
  }

  // Ensure endDate includes full day
  endDate.setHours(23, 59, 59, 999);

  const results = await Order.aggregate([
    {
      $match: {
        storeId,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
        },
        orders: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
    {
      $project: {
        _id: 0,
        date: "$_id",
        orders: 1,
      },
    },
  ]);

  res.status(200).json(successResponse(results));
});

const orderStatusDistribution = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const { from, to } = req.query;
  let startDate, endDate;
  const now = new Date();

  if (from && to) {
    startDate = new Date(from);
    endDate = new Date(to);
  } else {
    endDate = new Date(now);
    startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 6); // default to last 7 days
  }

  endDate.setHours(23, 59, 59, 999);

  const results = await Order.aggregate([
    {
      $match: {
        storeId,
        createdAt: {
          $gte: startDate,
          $lte: endDate,
        },
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  // Convert to object like { pending: 5, confirmed: 10, ... }
  const statusMap = {};
  const validStatuses = ["pending", "confirmed", "finished", "taken", "delivering", "delivered", "done", "cancelled"];

  for (const status of validStatuses) {
    statusMap[status] = 0;
  }

  for (const item of results) {
    statusMap[item._id] = item.count;
  }

  res.status(200).json(successResponse(statusMap));
});

const ordersByTimeSlot = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  // Define time slots
  const timeSlots = [
    { label: "06:00-10:00", start: 6, end: 10 },
    { label: "10:00-14:00", start: 10, end: 14 },
    { label: "14:00-18:00", start: 14, end: 18 },
    { label: "18:00-22:00", start: 18, end: 22 },
  ];

  const results = await Order.aggregate([
    {
      $match: {
        storeId: storeId,
      },
    },
    {
      $project: {
        hour: {
          $hour: { date: "$createdAt", timezone: "Asia/Ho_Chi_Minh" },
        },
      },
    },
    {
      $group: {
        _id: "$hour",
        orders: { $sum: 1 },
      },
    },
  ]);

  // Create time slot summary in array format
  const slotCounts = timeSlots.map((slot) => ({
    timeSlot: slot.label,
    orders: 0,
  }));

  results.forEach((item) => {
    const hour = item._id;
    for (let i = 0; i < timeSlots.length; i++) {
      const slot = timeSlots[i];
      if (hour >= slot.start && hour < slot.end) {
        slotCounts[i].orders += item.orders;
        break;
      }
    }
  });

  return res.status(200).json(successResponse(slotCounts));
});

const averageSpendingPerOrder = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const result = await Order.aggregate([
    { $match: { storeId } },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$finalTotal" },
        totalOrders: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        averageSpending: {
          $cond: [
            { $eq: ["$totalOrders", 0] },
            0,
            {
              $round: [{ $divide: ["$totalRevenue", "$totalOrders"] }, 0],
            },
          ],
        },
      },
    },
  ]);

  return res.status(200).json(successResponse(result[0] || { averageSpending: 0 }));
});

// Items
const topSellingItems = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const limit = parseInt(req.query.limit) || 5;

  const results = await OrderItem.aggregate([
    {
      $lookup: {
        from: "dishes",
        localField: "dishId",
        foreignField: "_id",
        as: "dish",
      },
    },
    { $unwind: "$dish" },
    {
      $match: {
        "dish.storeId": storeId,
      },
    },
    {
      $group: {
        _id: "$dishId",
        dishName: { $first: "$dishName" },
        sold: { $sum: "$quantity" },
      },
    },
    { $sort: { sold: -1 } },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        dishName: 1,
        sold: 1,
      },
    },
  ]);

  return res.status(200).json(successResponse(results));
});

const revenueContributionByItem = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  const rawData = await OrderItem.aggregate([
    {
      $lookup: {
        from: "dishes",
        localField: "dishId",
        foreignField: "_id",
        as: "dish",
      },
    },
    { $unwind: "$dish" },
    {
      $match: {
        "dish.storeId": storeId,
      },
    },
    {
      $group: {
        _id: "$dishName",
        revenue: {
          $sum: { $multiply: ["$price", "$quantity"] },
        },
      },
    },
  ]);

  const totalRevenue = rawData.reduce((sum, item) => sum + item.revenue, 0);
  if (totalRevenue === 0) {
    return res.status(200).json(successResponse([]));
  }

  const contributionData = [];
  let othersRevenue = 0;

  rawData.forEach((item) => {
    const percent = (item.revenue / totalRevenue) * 100;
    if (percent < 5) {
      othersRevenue += item.revenue;
    } else {
      contributionData.push({
        dishName: item._id,
        contribution: Math.round(percent),
      });
    }
  });

  if (othersRevenue > 0) {
    contributionData.push({
      dishName: "Các món khác",
      contribution: Math.round((othersRevenue / totalRevenue) * 100),
    });
  }

  return res.status(200).json(successResponse(contributionData));
});

// Customer
const newCustomers = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  // Get all first-time orders of each customer at this store
  const firstOrders = await Order.aggregate([
    {
      $match: { storeId: storeId },
    },
    {
      $sort: { createdAt: 1 }, // Ensure oldest orders come first
    },
    {
      $group: {
        _id: "$customerId",
        firstOrder: { $first: "$createdAt" },
      },
    },
  ]);

  const today = moment().startOf("day");
  const startOfWeek = moment().startOf("isoWeek");
  const startOfMonth = moment().startOf("month");

  let countToday = 0;
  let countWeek = 0;
  let countMonth = 0;

  firstOrders.forEach((order) => {
    const created = moment(order.firstOrder);
    if (created.isSameOrAfter(today)) countToday++;
    if (created.isSameOrAfter(startOfWeek)) countWeek++;
    if (created.isSameOrAfter(startOfMonth)) countMonth++;
  });

  return res.status(200).json(
    successResponse({
      today: countToday,
      thisWeek: countWeek,
      thisMonth: countMonth,
    })
  );
});

const returningCustomerRate = asyncHandler(async (req, res) => {
  const userId = req.user?._id;
  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  const storeId = await getStoreIdFromUser(userId);
  if (!storeId) {
    return res.status(401).json({ success: false, message: "Unauthorized access" });
  }

  // Nhóm đơn hàng theo khách hàng tại cửa hàng này
  const customerOrders = await Order.aggregate([
    { $match: { storeId: storeId } },
    {
      $group: {
        _id: "$customerId",
        orderCount: { $sum: 1 },
      },
    },
  ]);

  const totalCustomers = customerOrders.length;
  const returningCustomers = customerOrders.filter((c) => c.orderCount > 1).length;

  const returningRate = totalCustomers > 0 ? ((returningCustomers / totalCustomers) * 100).toFixed(1) : 0;

  return res.status(200).json(
    successResponse({
      returningRate: parseFloat(returningRate),
    })
  );
});

// Voucher
const voucherUsageSummary = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { from, to } = req.query;

  // 1. Validate and parse date range
  let startDate, endDate;
  if (from && to) {
    const start = moment(from, "YYYY-MM-DD", true);
    const end = moment(to, "YYYY-MM-DD", true);
    if (!start.isValid() || !end.isValid()) {
      throw createError(400, "Invalid date format. Use YYYY-MM-DD");
    }
    if (end.isBefore(start)) {
      throw createError(400, "'to' date must be after 'from' date");
    }
    startDate = start.startOf("day").utc().toDate();
    endDate = end.endOf("day").utc().toDate();
  } else {
    ({ startDate, endDate } = parseDateRange()); // default last 30 days
  }

  // 2. Get store ID
  const storeId = await getStoreIdFromUser(userId);

  // 3. Get all voucher IDs for the store
  const storeVouchers = await Voucher.find({ storeId }).select("_id createdAt");
  const voucherIds = storeVouchers.map((voucher) => voucher._id);

  if (!voucherIds.length) {
    return res.status(200).json(
      successResponse({
        requestedTimeFrameUsed: 0,
        totalIssued: 0,
        usageRate: 0,
      })
    );
  }

  // 4. Calculate total issued = sum of usageLimit for all vouchers active in timeframe
  const totalIssuedAgg = await Voucher.aggregate([
    {
      $match: {
        storeId,
        createdAt: { $lte: endDate }, // issued before end date
        // optionally: { endDate: { $gte: startDate } } to ensure still valid
      },
    },
    {
      $group: {
        _id: null,
        totalIssued: { $sum: "$usageLimit" },
      },
    },
  ]);

  const totalIssued = totalIssuedAgg[0]?.totalIssued || 0;

  // 5. Aggregate voucher usage in timeframe
  const usageAggregation = await OrderVoucher.aggregate([
    {
      $match: {
        voucherId: { $in: voucherIds },
        appliedAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $count: "requestedTimeFrameUsed",
    },
  ]);

  const requestedTimeFrameUsed = usageAggregation[0]?.requestedTimeFrameUsed || 0;

  // 6. Calculate usage rate
  const usageRate = totalIssued > 0 ? (requestedTimeFrameUsed / totalIssued) * 100 : 0;

  // 7. Prepare response
  const responseData = {
    requestedTimeFrameUsed,
    totalIssued,
    usageRate,
  };

  return res.status(200).json(successResponse(responseData));
});

const topUsedVouchers = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { limit = 5 } = req.query; // Default limit to 5 if not provided

  // 1. Validate limit parameter
  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    throw createError(400, "Limit must be a positive number");
  }

  // 2. Get store ID
  const storeId = await getStoreIdFromUser(userId);

  // 3. Aggregate top used vouchers
  const topVouchers = await OrderVoucher.aggregate([
    {
      // Match vouchers for the store
      $lookup: {
        from: Voucher.collection.name,
        localField: "voucherId",
        foreignField: "_id",
        as: "voucherDetails",
      },
    },
    {
      $unwind: "$voucherDetails",
    },
    {
      $match: {
        "voucherDetails.storeId": storeId,
      },
    },
    {
      // Group by voucher and count usage
      $group: {
        _id: "$voucherId",
        code: { $first: "$voucherDetails.code" },
        discountValue: { $first: "$voucherDetails.discountValue" },
        usedCount: { $sum: 1 },
      },
    },
    {
      // Sort by usedCount in descending order
      $sort: {
        usedCount: -1,
      },
    },
    {
      // Limit the results
      $limit: parsedLimit,
    },
    {
      // Project the final output
      $project: {
        _id: 0,
        code: 1,
        usedCount: 1,
        discountValue: 1,
      },
    },
  ]);

  // 4. Send response
  return res.status(200).json(successResponse(topVouchers));
});

const voucherRevenueImpact = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { limit = 5 } = req.query;

  const parsedLimit = parseInt(limit);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    throw createError(400, "Limit must be a positive number");
  }

  const storeId = await getStoreIdFromUser(userId);

  // Get all voucher IDs for the store
  const storeVouchers = await Voucher.find({ storeId }).select("_id");
  const voucherIds = storeVouchers.map((voucher) => voucher._id);

  if (!voucherIds.length) {
    return res.status(200).json(
      successResponse({
        totalDiscountAmount: 0,
        revenueBeforeDiscount: 0,
        revenueAfterDiscount: 0,
        discountRatio: 0,
      })
    );
  }

  // Aggregate revenue impact
  const revenueImpact = await OrderVoucher.aggregate([
    {
      $match: { voucherId: { $in: voucherIds } },
    },
    {
      $lookup: {
        from: "orders",
        localField: "orderId",
        foreignField: "_id",
        as: "orderDetails",
      },
    },
    { $unwind: "$orderDetails" },
    {
      $match: {
        "orderDetails.status": {
          $in: ["done", "delivered", "finished"],
        }, // only completed orders
      },
    },
    {
      $group: {
        _id: null,
        totalDiscountAmount: { $sum: "$discountAmount" }, // actual applied discount
        revenueBeforeDiscount: {
          $sum: {
            $add: ["$orderDetails.subtotalPrice", "$orderDetails.shippingFee"],
          },
        },
        revenueAfterDiscount: { $sum: "$orderDetails.finalTotal" },
      },
    },
    {
      $project: {
        _id: 0,
        totalDiscountAmount: 1,
        revenueBeforeDiscount: 1,
        revenueAfterDiscount: 1,
        discountRatio: {
          $cond: {
            if: { $eq: ["$revenueBeforeDiscount", 0] },
            then: 0,
            else: {
              $multiply: [
                {
                  $divide: ["$totalDiscountAmount", "$revenueBeforeDiscount"],
                },
                100,
              ],
            },
          },
        },
      },
    },
  ]);

  const responseData = revenueImpact[0] || {
    totalDiscountAmount: 0,
    revenueBeforeDiscount: 0,
    revenueAfterDiscount: 0,
    discountRatio: 0,
  };

  return res.status(200).json(successResponse(responseData));
});

module.exports = {
  getRevenueSummary,
  getStartDates,
  revenueByPeriod,
  revenueByItem,
  revenueByDishGroup,
  analyzeBusinessResult,
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
  voucherRevenueImpact,
};
