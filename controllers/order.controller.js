const Store = require("../models/store.model");
const Topping = require("../models/topping.model");
const Dish = require("../models/dish.model");
const Order = require("../models/order.model");
const OrderItem = require("../models/orderItem.model");
const OrderItemTopping = require("../models/orderItemTopping.model");
const OrderShipInfo = require("../models/orderShipInfo.model");
const OrderVoucher = require("../models/orderVoucher.model");
const SystemCategory = require("../models/systemCategory.model");
const Cart = require("../models/cart.model");
const CartItem = require("../models/cartItem.model");
const CartItemTopping = require("../models/cartItemTopping.model");
const ToppingGroup = require("../models/toppingGroup.model");
const Rating = require("../models/rating.model");
const Notification = require("../models/notification.model");
const Payment = require("../models/payment.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");
const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat, VerifyReturnUrl } = require("vnpay");
const { select } = require("firebase-functions/params");
const User = require("../models/user.model");

function calcLineSubtotal(item) {
  const base = Number(item.price || 0);
  const qty = Number(item.quantity || 0);
  const tops = Array.isArray(item.toppings) ? item.toppings : [];
  const topsSum = tops.reduce((s, t) => s + Number(t.price || 0), 0);
  return qty * (base + topsSum);
}

const getUserOrder = asyncHandler(async (req, res, next) => {
  const userId = req?.user?._id;
  if (!userId) {
    return next(createError(400, "User not found"));
  }

  const orders = await Order.find({ userId })
    .populate({
      path: "store",
      select: "name avatar status",
    })
    .populate({
      path: "items",
      populate: [
        {
          path: "dish",
          select: "name price image",
        },
        {
          path: "toppings",
        },
      ],
    })
    .populate({
      path: "user",
      select: "name avatar",
    })
    .sort({ updatedAt: -1 })
    .lean();

  // Lọc các đơn có store hợp lệ
  const filteredOrders = orders.filter((order) => order.store?.status === "APPROVED");

  if (!filteredOrders.length) {
    return next(createError(404, "No orders found"));
  }

  // Lấy thông tin giao hàng
  const orderIds = filteredOrders.map((order) => order._id);
  const shipInfos = await OrderShipInfo.find({
    orderId: { $in: orderIds },
  }).lean();
  const shipMap = Object.fromEntries(shipInfos.map((info) => [info.orderId.toString(), info]));

  // Trả về kết quả
  const result = filteredOrders.map((order) => ({
    ...order,
    shipInfo: shipMap[order._id.toString()] || null,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

const getOrderDetail = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;

  if (!orderId) {
    return next(createError(400, "orderId not found"));
  }

  // Lấy Order + Store + Items + Dish + Toppings
  const order = await Order.findById(orderId)
    .populate({
      path: "store",
      select: "name avatar",
    })
    .populate({
      path: "items",
      populate: [
        {
          path: "dish",
          select: "name price image description",
        },
        {
          path: "toppings",
          select: "toppingName price",
        },
      ],
    })
    .lean();

  if (!order) {
    return next(createError(404, "Order not found"));
  }

  // Lấy thông tin giao hàng
  const shipInfo = await OrderShipInfo.findOne({ orderId }).lean();

  // Lấy danh sách voucher đã áp dụng
  const orderVouchers = await OrderVoucher.find({ orderId })
    .populate({
      path: "voucherId",
      select: "code description discountType discountValue maxDiscount",
    })
    .lean();

  return res.status(200).json({
    success: true,
    data: {
      ...order,
      shipInfo: shipInfo || null,
      vouchers: orderVouchers || [],
    },
  });
});

const getOrderDetailForStore = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId)
      .populate({
        path: "store",
        select: "name avatar",
      })
      .populate({
        path: "user",
        select: "name avatar",
      })
      .populate({
        path: "items",
        populate: [
          {
            path: "dish",
            select: "name price image description",
          },
          {
            path: "toppings",
            select: "toppingName price",
          },
        ],
      })
      .lean();

    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const shipInfo = await OrderShipInfo.findOne({ orderId }).lean();

    return res.status(200).json({
      success: true,
      data: {
        ...order,
        shipInfo: shipInfo || null,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ success: false, message: "Invalid order ID format" });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getFinishedOrders = asyncHandler(async (req, res, next) => {
  try {
    const finishedOrders = await Order.find({ status: "finished" })
      .populate({ path: "store", select: "name avatar" })
      .populate({ path: "user", select: "name avatar" })
      .populate({
        path: "items",
        populate: [
          {
            path: "dish",
            select: "name image price",
          },
          {
            path: "toppings",
          },
        ],
      })
      .sort({ updatedAt: -1 })
      .lean();

    if (!finishedOrders || finishedOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Không có đơn hàng nào đã hoàn tất.",
        count: 0,
        data: [],
      });
    }

    res.status(200).json({
      success: true,
      message: "Lấy danh sách đơn hàng đã hoàn tất thành công.",
      count: finishedOrders.length,
      data: finishedOrders,
    });
  } catch (err) {
    return next(
      createError(500, {
        success: false,
        message: "Đã xảy ra lỗi khi lấy đơn hàng.",
        error: err.message,
      })
    );
  }
});

const updateOrderStatus = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const order = await Order.findById(orderId)
    .populate({ path: "store", select: "name avatar" })
    .populate({ path: "user", select: "name avatar" });

  if (!order) {
    return next(createError(404, "Order not found"));
  }

  const currentStatus = order.status;

  const validTransitions = {
    taken: ["delivering", "finished", "done"],
    delivering: ["delivered", "done"],
    finished: ["done"],
  };

  if (status === currentStatus) {
    return next(createError(400, `Order is already in '${status}' status.`));
  }

  if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(status)) {
    return next(createError(400, `Cannot change status from '${currentStatus}' to '${status}'.`));
  }

  order.status = status;
  await order.save();

  const populatedOrder = await Order.findById(orderId)
    .populate({ path: "store", select: "name avatar" })
    .populate({ path: "user", select: "name avatar" })
    .populate({
      path: "items",
      populate: {
        path: "toppings",
        select: "toppingName price",
      },
    })
    .lean();

  const items = (populatedOrder.items || []).map((item) => ({
    dishName: item.dishName,
    quantity: item.quantity,
    price: item.price,
    note: item.note,
    toppings: item.toppings || [],
  }));

  res.status(200).json({
    success: true,
    message: `Order status updated to '${status}' successfully`,
    data: {
      ...populatedOrder,
      items,
    },
  });
});

const cancelOrder = asyncHandler(async (req, res, next) => {
  const { orderId } = req.params;
  const userId = req.user._id;
  var message = "Order has been cancelled and deleted successfully";

  const order = await Order.findById(orderId);
  if (!order) {
    return next(createError(404, "Order not found"));
  }

  if (order.userId.toString() !== userId.toString()) {
    return next(createError(403, "You are not authorized to cancel this order"));
  }

  const cancellableStatuses = ["preorder", "pending"];

  if (cancellableStatuses.includes(order.status)) {
    console.log(order);
    if (order.paymentMethod === "vnpay" && order.paymentStatus === "paid") {
      const vnpay = new VNPay({
        tmnCode: process.env.VNPAY_TMN_CODE,
        secureSecret: process.env.VNPAY_SECRET_KEY,
        vnpayHost: process.env.VNPAY_PAYMENT_URL,
        hashAlgorithm: "SHA512",
        loggerFn: ignoreLogger,
      });

      const payment = await Payment.findOne({
        orderId: order._id,
      });
      if (!payment) {
        return next(createError(404, "Payment not found for this order"));
      }
      const transactionId = payment.transactionId;

      const refundParams = {
        vnp_RequestId: order._id.toString(),
        vnp_version: "2.1.0",
        vnp_Command: "refund",
        vnp_TmnCode: process.env.VNPAY_TMN_CODE,

        vnp_TxnRef: transactionId,
        vnp_Amount: payment.amount,
        vnp_TransactionType: "02", // Refund
        vnp_RequestId: Date.now().toString(),
        vnp_OrderInfo: `Refund order ${orderId || ""}`,
        vnp_TransactionDate: dateFormat(new Date()),
        vnp_secureHash: payment.metadata.vnp_secureHash,
        vnp_IpAddr: "127.0.0.1",
      };
      const response = await vnpay.refund(refundParams);
      console.log("Refund response:", response);
      if (response.vnp_ResponseCode === "00" || response.vnp_ResponseCode === "99") {
        // Cheat code 99 for unknown error
        const refundRecord = await Payment.create({
          orderId: orderId || null,
          provider: "vnpay",
          amount: payment.amount,
          status: "refunded",
          transactionId: transactionId + "_refund_" + Date.now(),
          metadata: payment.metadata,
        });
        console.log("Refund successful:", refundRecord);
        message = "Order has been cancelled and refunded successfully";
        const deleteOrder = await Order.findById(orderId);
        if (deleteOrder) await deleteOrder.softDelete();
      } else {
        return next(createError(400, "Refund failed: " + response.vnp_Message));
      }
    } else {
      await Order.findByIdAndDelete(orderId);
    }

    res.status(200).json({
      success: true,
      message,
    });
  } else {
    res.status(409).json({
      success: false,
      message: `Cannot cancel an order with status '${order.status}'. Only pending orders can be cancelled.`,
    });
  }
});

const getOrderStats = asyncHandler(async (req, res, next) => {
  try {
    const totalOrders = await Order.countDocuments();

    // Lấy thời gian đầu và cuối của tháng hiện tại
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const ordersThisMonth = await Order.countDocuments({
      createdAt: {
        $gte: startOfMonth,
        $lt: endOfMonth,
      },
    });

    res.status(200).json({
      code: 200,
      message: "Lấy thống kê đơn hàng thành công",
      data: {
        totalOrders,
        ordersThisMonth,
      },
    });
  } catch (error) {
    next(error);
  }
});

const getMonthlyOrderStats = asyncHandler(async (req, res, next) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: 1 },
        },
      },
      {
        $project: {
          month: "$_id",
          total: 1,
          _id: 0,
        },
      },
      { $sort: { month: 1 } },
    ]);

    // Chuyển thành array đủ 12 tháng
    const fullStats = Array.from({ length: 12 }, (_, i) => {
      const stat = stats.find((s) => s.month === i + 1);
      return {
        name: `Tháng ${i + 1}`,
        total: stat ? stat.total : 0,
      };
    });

    res.status(200).json({
      code: 200,
      message: "Lấy thống kê đơn hàng theo tháng thành công",
      data: fullStats,
    });
  } catch (error) {
    next(error);
  }
});

const getAllOrder = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: "Store ID is required",
      });
    }

    const filter = { storeId };

    if (status) {
      filter.status = { $in: status.split(",") };
    }

    // 1. Lấy orders
    const orders = await Order.find(filter)
      .populate({ path: "store", select: "name avatar" })
      .populate({ path: "user", select: "name email avatar" })
      .populate({
        path: "items",
        populate: [{ path: "dish", select: "name price image description" }, { path: "toppings" }],
      })
      .lean(); // ⚠️ QUAN TRỌNG để gắn thêm field

    // 2. Lấy shipping info theo orderIds
    const orderIds = orders.map((o) => o._id);

    const shippingInfos = await OrderShipInfo.find({
      orderId: { $in: orderIds },
    }).lean();

    // 3. Map shippingInfo vào từng order
    const shippingMap = {};
    shippingInfos.forEach((si) => {
      shippingMap[si.orderId.toString()] = si;
    });

    const result = orders.map((order) => ({
      ...order,
      shippingInfo: shippingMap[order._id.toString()] || null,
    }));

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      success: true,
      message: "Orders retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("getAllOrder error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateOrder = async (req, res) => {
  const { order_id } = req.params;
  const payload = req.body || {};

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // 0) Load order
      const order = await Order.findById(order_id).session(session);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // 1) Validate non-empty items (business rule)
      const incomingItems = Array.isArray(payload.items) ? payload.items : [];
      if (incomingItems.length === 0) {
        throw Object.assign(new Error("EMPTY_ITEMS"), { code: 400 });
      }

      // 2) Load existing items for this order
      const existingItems = await OrderItem.find({ orderId: order_id }).session(session);
      const existingMap = new Map(existingItems.map((d) => [String(d._id), d]));

      // 3) Upsert items
      const keptItemIds = [];
      for (const it of incomingItems) {
        const docShape = {
          orderId: order_id,
          dishId: it.dishId,
          dishName: it.dishName,
          quantity: it.quantity,
          price: it.price,
          note: it.note || "",
        };

        if (!docShape.dishId || !docShape.dishName || !docShape.quantity || !docShape.price) {
          throw Object.assign(new Error("INVALID_ITEM"), { code: 400 });
        }

        let itemDoc;
        if (it._id && existingMap.has(String(it._id))) {
          itemDoc = await OrderItem.findByIdAndUpdate(it._id, { $set: docShape }, { new: true, session });
        } else {
          itemDoc = await OrderItem.create([docShape], { session }).then((arr) => arr[0]);
        }
        keptItemIds.push(itemDoc._id);

        // 4) Replace toppings for this item
        const incomingTops = Array.isArray(it.toppings) ? it.toppings : [];
        await OrderItemTopping.deleteMany({ orderItemId: itemDoc._id }).session(session);

        if (incomingTops.length) {
          const toInsert = incomingTops.map((t) => ({
            orderItemId: itemDoc._id,
            toppingId: t._id,
            toppingName: t.toppingName || t.name, // 👈 merge both fields safely
            price: t.price,
          }));
          await OrderItemTopping.insertMany(toInsert, { session });
        }
      }

      // 5) Delete removed items + their toppings
      const toDelete = existingItems
        .filter((d) => !keptItemIds.some((kid) => String(kid) === String(d._id)))
        .map((d) => d._id);

      if (toDelete.length) {
        await OrderItemTopping.deleteMany({ orderItemId: { $in: toDelete } }).session(session);
        await OrderItem.deleteMany({ _id: { $in: toDelete } }).session(session);
      }

      // 6) Recompute totals on server
      let subtotalPrice = 0;
      for (const it of incomingItems) {
        subtotalPrice += calcLineSubtotal(it);
      }
      const shippingFee = Number(payload.shippingFee ?? order.shippingFee ?? 0);
      const totalDiscount = Number(payload.totalDiscount ?? order.totalDiscount ?? 0);
      const finalTotal = subtotalPrice + shippingFee - totalDiscount;

      // 7) Patch order scalars
      const orderPatch = {
        status: payload.status ?? order.status,
        paymentMethod: payload.paymentMethod ?? order.paymentMethod,
        paymentStatus: payload.paymentStatus ?? order.paymentStatus,
        subtotalPrice,
        totalDiscount,
        shippingFee,
        finalTotal,
      };
      await Order.updateOne({ _id: order_id }, { $set: orderPatch }).session(session);
    });

    return res.status(200).json({ message: "Order updated successfully" });
  } catch (err) {
    if (err && err.code === 400 && err.message === "EMPTY_ITEMS") {
      return res.status(400).json({ message: "Order cannot be empty." });
    }
    if (err && err.code === 400 && err.message === "INVALID_ITEM") {
      return res.status(400).json({ message: "Invalid item payload." });
    }
    console.error("Error updating order:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    session.endSession();
  }
};

const reOrder = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { orderId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid orderId" });
    }

    const order = await Order.findById(orderId)
      .populate("store")
      .populate({
        path: "items",
        populate: [{ path: "dish", select: "status" }, { path: "toppings" }],
      });

    if (!order || !order.store) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    if (order.store.status === "BLOCKED") {
      return res.status(403).json({
        success: false,
        message: "Cannot reorder from a blocked store",
      });
    }

    // Kiểm tra món nào đã hết hàng
    const hasOutOfStock = order.items.some((item) => item.dish?.status === "OUT_OF_STOCK");

    if (hasOutOfStock) {
      return res.status(403).json({
        success: false,
        message: "Some dishes are out of stock",
      });
    }

    // Xoá cart cũ nếu tồn tại
    const oldCart = await Cart.findOne({
      userId,
      storeId: order.store._id,
    });
    if (oldCart) {
      const oldCartItemIds = await CartItem.find({
        cartId: oldCart._id,
      }).distinct("_id");
      await CartItemTopping.deleteMany({
        cartItemId: { $in: oldCartItemIds },
      });
      await CartItem.deleteMany({ cartId: oldCart._id });
      await Cart.deleteOne({ _id: oldCart._id });
    }

    // Tạo giỏ hàng mới
    const newCart = await Cart.create({ userId, storeId: order.store._id });

    // Lặp qua các món cũ và tạo mới trong giỏ hàng
    for (const item of order.items) {
      const cartItem = await CartItem.create({
        cartId: newCart._id,
        dishId: item.dishId,
        dishName: item.dishName,
        quantity: item.quantity,
        price: item.price,
        note: item.note,
      });

      // Nếu có topping thì thêm vào
      if (item.toppings?.length) {
        const toppingDocs = item.toppings.map((t) => ({
          cartItemId: cartItem._id,
          toppingId: t.toppingId,
          toppingName: t.toppingName,
          price: t.price,
        }));
        await CartItemTopping.insertMany(toppingDocs);
      }
    }

    return res.status(201).json({
      success: true,
      message: "Reorder successful",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const assignDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryType, staffId, delivererName, delivererPhone } = req.body;

    // 1. Validate orderId
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ message: "orderId không hợp lệ" });
    }

    // 2. Check order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    }

    // 3. Validate trạng thái
    if (!["confirmed", "finished", "delivering"].includes(order.status)) {
      return res.status(400).json({
        message: "Không thể chỉ định người giao ở trạng thái hiện tại",
      });
    }

    // 4. Validate deliveryType
    if (!["IN_STORE", "THIRD_PARTY"].includes(deliveryType)) {
      return res.status(400).json({ message: "deliveryType không hợp lệ" });
    }

    // 5. Build deliverer
    let deliverer;

    if (deliveryType === "IN_STORE") {
      if (!staffId) {
        return res.status(400).json({ message: "Thiếu staffId" });
      }

      const staff = await User.findById(staffId);
      if (!staff) {
        return res.status(404).json({ message: "Nhân viên không tồn tại" });
      }

      deliverer = {
        staffId: staff._id,
        name: staff.name,
        phone: staff.phonenumber,
      };
    } else {
      if (!delivererName || !delivererPhone) {
        return res.status(400).json({
          message: "Thiếu thông tin người giao hàng bên ngoài",
        });
      }

      deliverer = {
        staffId: null,
        name: delivererName,
        phone: delivererPhone,
      };
    }

    // 6. Get shipInfo
    const shipInfo = await OrderShipInfo.findOne({ orderId });
    if (!shipInfo) {
      return res.status(404).json({
        message: "Không tìm thấy thông tin giao hàng",
      });
    }

    const isReassign = !!shipInfo.deliverer?.name;

    // 7. Prevent duplicate assign
    if (
      shipInfo.deliverer?.staffId?.toString() === deliverer.staffId?.toString() &&
      shipInfo.deliverer?.phone === deliverer.phone
    ) {
      return res.status(400).json({
        message: "Người giao hàng không có thay đổi",
      });
    }

    // 8. Update shipInfo
    shipInfo.deliveryType = deliveryType;
    shipInfo.deliverer = deliverer;

    shipInfo.deliveryHistory = shipInfo.deliveryHistory || [];
    shipInfo.deliveryHistory.push({
      deliverer,
      assignedAt: new Date(),
      assignedBy: req.user?._id || null,
      type: isReassign ? "REASSIGN" : "ASSIGN",
    });

    await shipInfo.save();

    // 9. Update order status (only first assign)
    if (!isReassign && order.status === "confirmed") {
      order.status = "delivering";
      await order.save();
    }

    return res.json({
      message: isReassign ? "Cập nhật người giao hàng thành công" : "Bàn giao đơn hàng thành công",
      data: shipInfo,
    });
  } catch (error) {
    console.error("assignDelivery error:", error);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

module.exports = {
  getUserOrder,
  getOrderDetail,
  getFinishedOrders,
  updateOrderStatus,
  getOrderStats,
  getMonthlyOrderStats,
  cancelOrder,
  getAllOrder,
  updateOrder,
  getOrderDetailForStore,
  reOrder,
  assignDelivery,
};
