const Store = require("../models/store.model");
const Cart = require("../models/cart.model");
const CartItem = require("../models/cartItem.model");
const CartItemTopping = require("../models/cartItemTopping.model");
const Location = require("../models/location.model")
const Notification = require("../models/notification.model");
const Order = require("../models/order.model");
const OrderItem = require("../models/orderItem.model");
const OrderItemTopping = require("../models/orderItemTopping.model");
const OrderShipInfo = require("../models/orderShipInfo.model");
const OrderVoucher = require("../models/orderVoucher.model");
const Voucher = require("../models/voucher.model");
const UserVoucherUsage = require("../models/userVoucherUsage.model");

const convertCartToOrder = async (cartId) => {
    const cart = await Cart.findById(cartId).populate("location");
    if (!cart) throw new Error("Cart not found");
  
    const {
      userId,
      storeId,
      paymentMethod,
      shippingFee = 0,
      voucher: vouchers = [],
      location,
    } = cart;
  
    const cartItems = await CartItem.find({ cartId: cart._id })
      .populate("dish")
      .populate("toppings");
  
    if (!cartItems.length) throw new Error("Cart is empty");
  
    let subtotalPrice = 0;
    for (const item of cartItems) {
      const dishPrice = (item.dish?.price || 0) * item.quantity;
      const toppingsPrice =
        (Array.isArray(item.toppings)
          ? item.toppings.reduce((sum, topping) => sum + (topping.price || 0), 0)
          : 0) * item.quantity;
      subtotalPrice += dishPrice + toppingsPrice;
    }
  
    let totalDiscount = 0;
    const validVouchers = [];
    const now = new Date();
  
    for (const voucherId of vouchers) {
      const voucher = await Voucher.findById(voucherId);
      if (!voucher || !voucher.isActive) continue;
      if (voucher.startDate > now || voucher.endDate < now) continue;
      if (voucher.minOrderAmount && subtotalPrice < voucher.minOrderAmount) continue;
  
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
  
    for (const item of cartItems) {
      const orderItem = await OrderItem.create({
        orderId: newOrder._id,
        dishId: item.dish?._id,
        dishName: item.dishName,
        price: item.price,
        quantity: item.quantity,
        note: item.note || "",
      });
  
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
  
    const locationObject = cart.location;
    if (!locationObject) throw new Error("Missing location info in cart");
  
    await OrderShipInfo.create({
      orderId: newOrder._id,
      shipLocation: locationObject.location,
      address: locationObject.address,
      detailAddress: locationObject.detailAddress,
      contactName: locationObject.contactName,
      contactPhonenumber: locationObject.contactPhonenumber,
      note: locationObject.note || "",
    });
  
    for (const { voucher, discount } of validVouchers) {
      await OrderVoucher.create({
        orderId: newOrder._id,
        voucherId: voucher._id,
        discountAmount: discount,
      });
  
      voucher.usedCount = (voucher.usedCount || 0) + 1;
      await voucher.save();
  
      await UserVoucherUsage.findOneAndUpdate(
        { userId, voucherId: voucher._id },
        { $inc: { usedCount: 1 }, startDate: voucher.startDate },
        { upsert: true, new: true }
      );
    }
  
    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItems.map(i => i._id) } });
    await CartItem.deleteMany({ cartId: cart._id });
    await Location.findByIdAndDelete(cart.location._id)
    await Cart.findByIdAndDelete(cart._id);
  
    const store = await Store.findById(storeId);
    if (store?.owner) {
      await Notification.create({
        userId: store.owner,
        orderId: newOrder._id,
        title: "New Order has been placed",
        message: "You have a new order!",
        type: "order",
        status: "unread",
      });
    }
  
    return {
      success: true,
      orderId: newOrder._id,
      totalPrice: finalTotal,
    };
  };
  
  module.exports = convertCartToOrder;
  