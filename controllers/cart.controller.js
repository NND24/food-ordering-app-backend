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
const IngredientBatch = require("../models/ingredientBatch.model");
const Ingredient = require("../models/ingredient.model");
const { getStoreSockets, getIo } = require("../utils/socketManager");
const mongoose = require("mongoose");

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

const calculateRequiredIngredients = async (dishId, quantity, toppings) => {
  let required = {};

  const dish = await Dish.findById(dishId).populate("ingredients.ingredient");
  if (!dish) throw new Error("Dish not found");

  // Dish ingredients
  for (const ing of dish.ingredients) {
    const total = ing.quantity * quantity;
    required[ing.ingredient._id] = (required[ing.ingredient._id] || 0) + total;
  }

  // Topping ingredients
  if (toppings.length > 0) {
    const toppingDocs = await Topping.find({ _id: { $in: toppings } }).populate("ingredients.ingredient");
    for (const topping of toppingDocs) {
      for (const ing of topping.ingredients) {
        const total = ing.quantity * quantity;
        required[ing.ingredient._id] = (required[ing.ingredient._id] || 0) + total;
      }
    }
  }

  return required; // { ingredientId: totalRequiredQty }
};

const checkInventory = async (storeId, required) => {
  for (const [ingredientId, qty] of Object.entries(required)) {
    // Lấy tổng tồn kho ingredient từ tất cả batch
    const batches = await IngredientBatch.find({ storeId, ingredient: ingredientId, status: "active" });
    const totalRemaining = batches.reduce((sum, b) => sum + b.remainingQuantity, 0);

    if (totalRemaining < qty) {
      const ing = await Ingredient.findById(ingredientId);
      throw new Error(
        `Xin lỗi, hiện tại cửa hàng không đủ nguyên liệu để chế biến món này. Bạn vui lòng giảm số lượng`
      );
    }
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

    if (quantity > 0) {
      const requiredIngredients = await calculateRequiredIngredients(dishId, quantity, toppings);
      await checkInventory(storeId, requiredIngredients);
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

const checkCartInventory = async (storeId, cartItems) => {
  for (const item of cartItems) {
    const toppings = item.toppings?.map((t) => t._id || t) || [];
    const requiredIngredients = await calculateRequiredIngredients(
      item.dishId || item.dish._id,
      item.quantity,
      toppings
    );
    await checkInventory(storeId, requiredIngredients);
  }
};

const calculateIngredientCost = async (storeId, dishId, quantity, toppings = []) => {
  const required = await calculateRequiredIngredients(dishId, quantity, toppings);

  let totalCost = 0;
  for (const [ingredientId, qtyNeeded] of Object.entries(required)) {
    let remaining = qtyNeeded;

    // Lấy batch theo FIFO
    const batches = await IngredientBatch.find({
      storeId,
      ingredient: ingredientId,
      status: "active",
    }).sort({ createdAt: 1 });

    for (const batch of batches) {
      if (remaining <= 0) break;

      const usedQty = Math.min(batch.remainingQuantity, remaining);
      totalCost += usedQty * batch.costPerUnit;
      remaining -= usedQty;
    }

    if (remaining > 0) {
      throw new Error(`Không đủ nguyên liệu để tính cost cho ingredient ${ingredientId}`);
    }
  }

  return totalCost;
};

const consumeIngredients = async (storeId, dishId, quantity, toppings = []) => {
  const required = await calculateRequiredIngredients(dishId, quantity, toppings);

  for (const [ingredientId, qtyNeeded] of Object.entries(required)) {
    let remaining = qtyNeeded;

    const batches = await IngredientBatch.find({
      storeId,
      ingredient: ingredientId,
      status: "active",
    }).sort({ createdAt: 1 });

    for (const batch of batches) {
      if (remaining <= 0) break;

      const usedQty = Math.min(batch.remainingQuantity, remaining);
      batch.remainingQuantity -= usedQty;

      if (batch.remainingQuantity <= 0) {
        batch.status = "finished";
      }

      await batch.save();
      remaining -= usedQty;
    }

    if (remaining > 0) {
      throw new Error(`Nguyên liệu ${ingredientId} không đủ để trừ kho`);
    }

    // 🔽 Sau khi trừ hết batch, check tổng stock còn lại
    const totalRemaining = await IngredientBatch.aggregate([
      {
        $match: {
          storeId: new mongoose.Types.ObjectId(storeId),
          ingredient: new mongoose.Types.ObjectId(ingredientId),
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$remainingQuantity" },
        },
      },
    ]);

    const stockLeft = totalRemaining.length > 0 ? totalRemaining[0].total : 0;

    if (stockLeft <= 0) {
      await Ingredient.findByIdAndUpdate(ingredientId, { status: "OUT_OF_STOCK" });
    }
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
      vouchers = [],
    } = req.body;

    if (!userId) throw new Error("User not found");

    // --- lấy cart ---
    const cart = await Cart.findOne({ userId, storeId });
    if (!cart) throw new Error("Cart not found");

    const cartItems = await CartItem.find({ cartId: cart._id }).populate("dish").populate("toppings");
    if (!cartItems.length) throw new Error("Cart is empty");

    await checkCartInventory(storeId, cartItems);

    // --- subtotal ---
    let subtotalPrice = 0;
    for (const item of cartItems) {
      const dishPrice = (item.dish?.price || 0) * item.quantity;
      const toppingsPrice =
        (Array.isArray(item.toppings) ? item.toppings.reduce((sum, topping) => sum + (topping.price || 0), 0) : 0) *
        item.quantity;
      subtotalPrice += dishPrice + toppingsPrice;
    }

    // --- voucher ---
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

    // --- tạo order ---
    const newOrder = new Order({
      userId,
      storeId,
      paymentMethod,
      status: "pending",
      subtotalPrice,
      totalDiscount,
      shippingFee,
      finalTotal,
      totalCost: 0,
    });
    await newOrder.save();

    // --- order items ---
    let totalCost = 0;
    for (const item of cartItems) {
      const ingredientCost = await calculateIngredientCost(
        storeId,
        item.dish._id,
        item.quantity,
        item.toppings?.map((t) => t._id) || []
      );

      await consumeIngredients(storeId, item.dish._id, item.quantity, item.toppings?.map((t) => t._id) || []);

      totalCost += ingredientCost;

      const orderItem = await OrderItem.create({
        orderId: newOrder._id,
        dishId: item.dish?._id,
        dishName: item.dishName,
        price: item.price,
        quantity: item.quantity,
        note: item.note || "",
        cost: ingredientCost,
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

    newOrder.totalCost = totalCost;
    await newOrder.save();

    // --- shipping info ---
    await OrderShipInfo.create({
      orderId: newOrder._id,
      shipLocation: { type: "Point", coordinates: location },
      address: deliveryAddress,
      detailAddress,
      contactName: customerName,
      contactPhonenumber: customerPhonenumber,
      note,
    });

    // --- vouchers ---
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

    // --- clear cart ---
    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItems.map((i) => i._id) } });
    await CartItem.deleteMany({ cartId: cart._id });
    await Cart.findByIdAndDelete(cart._id);

    // --- notification ---
    const store = await Store.findById(storeId);
    const newNotification = await Notification.create({
      userId: store.owner,
      orderId: newOrder._id,
      title: "New Order has been placed",
      message: "You have a new order!",
      type: "order",
      status: "unread",
    });

    if (storeSockets[storeId]) {
      storeSockets[storeId].forEach((socketId) => {
        const io = getIo();
        io.to(socketId).emit("newOrderNotification", {
          notification: newNotification,
          order: {
            id: newOrder._id,
            customerName,
            totalPrice: newOrder.finalTotal,
            status: newOrder.status,
            createdAt: newOrder.createdAt,
          },
          userId: userId,
        });
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
