const SystemCategory = require("../models/systemCategory.model");
const Store = require("../models/store.model");
const Cart = require("../models/cart.model");
const CartItem = require("../models/cartItem.model");
const CartItemTopping = require("../models/cartItemTopping.model");
const Dish = require("../models/dish.model");
const ToppingGroup = require("../models/toppingGroup.model");
const Topping = require("../models/topping.model");
const Rating = require("../models/rating.model");
const Notification = require("../models/notification.model");
const Order = require("../models/order.model");
const OrderItem = require("../models/orderItem.model");
const OrderItemTopping = require("../models/orderItemTopping.model");
const OrderShipInfo = require("../models/orderShipInfo.model");
const OrderVoucher = require("../models/orderVoucher.model");
const Voucher = require("../models/voucher.model");
const UserVoucherUsage = require("../models/userVoucherUsage.model");
const { getStoreSockets, getIo } = require("../utils/socketManager");

const storeSockets = getStoreSockets();

const getUserCart = async (req, res) => {
  try {
    const userId = req?.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const carts = await Cart.find({ userId })
      .populate({
        path: "store",
        populate: { path: "storeCategory" },
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
            populate: {
              path: "topping",
              select: "name price",
            },
          },
        ],
      })
      .lean();

    if (!carts || carts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Carts not found",
      });
    }

    // Lọc các cart của store đã được duyệt
    const approvedCarts = carts.filter((cart) => cart.store?.status === "APPROVED");

    const storeRatings = await Rating.aggregate([
      {
        $group: {
          _id: "$storeId",
          avgRating: { $avg: "$ratingValue" },
          amountRating: { $sum: 1 },
        },
      },
    ]);

    const updatedCarts = approvedCarts.map((cart) => {
      const rating = storeRatings.find((r) => r._id.toString() === cart.store._id.toString());

      return {
        ...cart,
        store: {
          ...cart.store,
          avgRating: rating?.avgRating || 0,
          amountRating: rating?.amountRating || 0,
        },
      };
    });

    res.status(200).json({
      success: true,
      data: updatedCarts,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDetailCart = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { cartId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!cartId) {
      return res.status(400).json({ success: false, message: "Cart ID is required" });
    }

    const cart = await Cart.findById(cartId)
      .populate({
        path: "store",
        populate: { path: "storeCategory", select: "name" },
      })
      .populate({
        path: "items",
        populate: [
          {
            path: "dish",
            select: "name image price description",
          },
          {
            path: "toppings",
            populate: {
              path: "topping",
              select: "name price",
            },
          },
        ],
      })
      .lean();

    if (!cart || cart.userId.toString() !== userId.toString()) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        cartId: cart._id,
        store: cart.store,
        items: cart.items,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateCart = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { storeId, dishId, quantity, toppings = [], note } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!storeId || !dishId || quantity === undefined) {
      return res.status(400).json({ success: false, message: "Invalid request body" });
    }

    const dish = await Dish.findById(dishId);
    if (!dish || dish.storeId.toString() !== storeId.toString().trim()) {
      return res.status(400).json({ success: false, message: "Invalid dish or store mismatch" });
    }

    // Validate toppings
    let validToppingIds = new Set();
    if (toppings.length > 0) {
      const toppingGroups = await ToppingGroup.find({ store: storeId }).select("_id");
      const toppingGroupIds = toppingGroups.map((g) => g._id);

      const validToppings = await Topping.find({ toppingGroupId: { $in: toppingGroupIds } });
      const validToppingIds = new Set(validToppings.map((t) => t._id.toString()));

      const invalidToppings = toppings.filter((tid) => !validToppingIds.has(tid.toString()));

      if (invalidToppings.length > 0) {
        return res.status(400).json({
          success: false,
          message: "Some toppings are not valid for this store",
        });
      }
    }

    // Find or create Cart
    let cart = await Cart.findOne({ userId, storeId });
    if (!cart) {
      if (quantity === 0) {
        return res.status(400).json({ success: false, message: "Cannot add item with quantity 0" });
      }
      cart = await Cart.create({ userId, storeId });
    }

    // Check if CartItem exists
    let cartItem = await CartItem.findOne({ cartId: cart._id, dishId: dishId });

    if (cartItem) {
      if (quantity === 0) {
        // Xóa CartItem + các CartItemTopping liên quan
        await CartItemTopping.deleteMany({ cartItemId: cartItem._id });
        await CartItem.deleteOne({ _id: cartItem._id });
      } else {
        // Cập nhật CartItem
        cartItem.quantity = quantity;
        cartItem.note = note;
        await cartItem.save();

        // Xóa và tạo lại CartItemTopping
        await CartItemTopping.deleteMany({ cartItemId: cartItem._id });

        for (const toppingId of toppings) {
          const topping = await Topping.findById(toppingId);
          if (topping) {
            await CartItemTopping.create({
              cartItemId: cartItem._id,
              toppingId: topping._id,
              toppingName: topping.name,
              price: topping.price,
            });
          }
        }
      }
    } else {
      if (quantity > 0) {
        // Tạo CartItem mới
        cartItem = await CartItem.create({
          cartId: cart._id,
          dishId: dish._id,
          dishName: dish.name,
          quantity,
          price: dish.price,
          note,
        });

        for (const toppingId of toppings) {
          const topping = await Topping.findById(toppingId);
          if (topping) {
            await CartItemTopping.create({
              cartItemId: cartItem._id,
              toppingId: topping._id,
              toppingName: topping.name,
              price: topping.price,
            });
          }
        }
      }
    }

    // Kiểm tra nếu cart không còn CartItem nào thì xóa Cart
    const remainingItems = await CartItem.find({ cartId: cart._id });
    if (remainingItems.length === 0) {
      await Cart.findByIdAndDelete(cart._id);
      return res.status(200).json({ success: true, message: "Cart deleted because it's empty" });
    }

    res.status(200).json({
      success: true,
      message: "Cart updated successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const clearCartItem = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { storeId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!storeId) {
      return res.status(400).json({ success: false, message: "Store ID is required" });
    }

    const cart = await Cart.findOne({ userId, storeId });
    if (!cart) {
      return res.status(404).json({ success: false, message: "Cart not found" });
    }

    const cartItems = await CartItem.find({ cartId: cart._id });
    const cartItemIds = cartItems.map((item) => item._id);

    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItemIds } });
    await CartItem.deleteMany({ cartId: cart._id });
    await Cart.deleteOne({ _id: cart._id });

    return res.status(200).json({ success: true, message: "Cart for store cleared successfully" });
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

const clearCart = async (req, res) => {
  try {
    const userId = req?.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not found" });
    }

    const carts = await Cart.find({ userId });
    const cartIds = carts.map((cart) => cart._id);

    const cartItems = await CartItem.find({ cartId: { $in: cartIds } });
    const cartItemIds = cartItems.map((item) => item._id);

    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItemIds } });
    await CartItem.deleteMany({ cartId: { $in: cartIds } });
    await Cart.deleteMany({ userId });

    res.status(200).json({ success: true, message: "All carts cleared successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const completeCart = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const {
      storeId,
      paymentMethod,
      customerName,
      customerPhonenumber,
      deliveryAddress,
      detailAddress,
      note,
      location = [],
      shippingFee = 0,
      vouchers = [], // danh sách voucherId
    } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: "User not found" });

    if (!storeId || !paymentMethod || !deliveryAddress || !Array.isArray(location) || location.length !== 2) {
      return res.status(400).json({ success: false, message: "Invalid request body" });
    }

    const cart = await Cart.findOne({ userId, storeId });
    if (!cart) return res.status(400).json({ success: false, message: "Cart not found" });

    // Lấy cart items và populate dish, toppings
    const cartItems = await CartItem.find({ cartId: cart._id }).populate("dish").populate("toppings");
    if (!cartItems.length) return res.status(400).json({ success: false, message: "Cart is empty" });

    // --- Tính subtotalPrice từ cartItems ---
    let subtotalPrice = 0;
    for (const item of cartItems) {
      const dishPrice = (item.dish?.price || 0) * item.quantity;
      const toppingsPrice =
        (Array.isArray(item.toppings) ? item.toppings.reduce((sum, topping) => sum + (topping.price || 0), 0) : 0) *
        item.quantity;
      subtotalPrice += dishPrice + toppingsPrice;
    }

    // --- Tính totalDiscount từ vouchers ---
    let totalDiscount = 0;
    const validVouchers = [];
    const now = new Date();

    for (const voucherId of vouchers) {
      const voucher = await Voucher.findById(voucherId);
      if (!voucher || !voucher.isActive) continue;

      // Check ngày hiệu lực
      if (voucher.startDate > now || voucher.endDate < now) continue;

      // Check minOrderAmount
      if (voucher.minOrderAmount && subtotalPrice < voucher.minOrderAmount) continue;

      // Tính discount
      let discount = 0;
      if (voucher.discountType === "PERCENTAGE") {
        discount = (subtotalPrice * voucher.discountValue) / 100;
        if (voucher.maxDiscount) discount = Math.min(discount, voucher.maxDiscount);
      } else if (voucher.discountType === "FIXED") {
        discount = voucher.discountValue;
      }

      totalDiscount += discount;
      validVouchers.push({ voucher, discount });
    }

    const finalTotal = Math.max(0, subtotalPrice - totalDiscount + shippingFee);

    // --- Tạo order ---
    const newOrder = await Order.create({
      userId,
      storeId,
      paymentMethod,
      status: "pending",
      subtotalPrice,
      totalDiscount,
      shippingFee,
      finalTotal,
    });

    // --- Lưu các OrderItem từ CartItem ---
    for (const item of cartItems) {
      const orderItem = await OrderItem.create({
        orderId: newOrder._id,
        dishId: item.dish?._id,
        dishName: item.dishName,
        price: item.price,
        quantity: item.quantity,
        note: item.note || "",
      });

      // Nếu có topping, lưu vào OrderItemTopping
      if (Array.isArray(item.toppings) && item.toppings.length) {
        for (const topping of item.toppings) {
          await OrderItemTopping.create({
            orderItemId: orderItem._id,
            toppingId: topping._id,
            toppingName: topping.toppingName,
            price: topping.price,
          });
        }
      }
    }

    // --- Lưu thông tin giao hàng ---
    await OrderShipInfo.create({
      orderId: newOrder._id,
      shipLocation: { type: "Point", coordinates: location },
      address: deliveryAddress,
      detailAddress,
      contactName: customerName,
      contactPhonenumber: customerPhonenumber,
      note,
    });

    // --- Lưu voucher đã dùng ---
    for (const { voucher, discount } of validVouchers) {
      await OrderVoucher.create({
        orderId: newOrder._id,
        voucherId: voucher._id,
        discountAmount: discount,
      });

      // Update Voucher usage
      voucher.usedCount = (voucher.usedCount || 0) + 1;
      await voucher.save();

      // Update UserVoucherUsage
      await UserVoucherUsage.findOneAndUpdate(
        { userId, voucherId: voucher._id },
        { $inc: { usedCount: 1 }, startDate: voucher.startDate },
        { upsert: true, new: true }
      );
    }

    // --- Clear cart ---
    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItems.map((i) => i._id) } });
    await CartItem.deleteMany({ cartId: cart._id });
    await Cart.findByIdAndDelete(cart._id);

    // --- Thông báo cho store ---
    const store = await Store.findById(storeId);
    const newNotification = await Notification.create({
      userId: store.owner,
      orderId: newOrder._id,
      title: "New Order has been placed",
      message: "You have a new order!",
      type: "order",
      status: "unread",
    });
    console.log(storeId)

    if (storeSockets[storeId]) {
      storeSockets[storeId].forEach((socketId) => {
        const io = getIo();
        io.to(socketId).emit("newOrderNotification", {
          notification: {
            id: newNotification._id,
            title: newNotification.title,
            message: newNotification.message,
            type: newNotification.type,
            status: newNotification.status,
            createdAt: newNotification.createdAt,
            updatedAt: newNotification.updatedAt,
          },
          order: {
            id: newOrder.id,
            customerName: newOrder.customerName,
            totalPrice: newOrder.totalPrice,
            status: newOrder.status,
            createdAt: newOrder.createdAt,
          },
          userId: userId,
        });
        console.log(
          `[NOTIFICATION] Notification sent to socket ID: ${socketId}`
        );
      });
    }

    

    return res.status(201).json({
      success: true,
      message: "Order placed successfully",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUserCart,
  getDetailCart,
  clearCartItem,
  clearCart,
  completeCart,
  updateCart,
};
