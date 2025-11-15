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

// --- Cache toàn cục để tránh query trùng lặp ---
const dishCache = new Map(); // key: dishId
const toppingCache = new Map(); // key: toppingId

/**
 * Tính toán nguyên liệu cần thiết để chế biến món + topping
 */
const calculateRequiredIngredients = async (dishId, quantity, toppingIds = []) => {
  const required = Object.create(null);

  // 🥘 1️⃣ Lấy món chính từ cache hoặc DB
  let dish = dishCache.get(dishId);
  if (!dish) {
    dish = await Dish.findById(dishId)
      .select("ingredients.quantity ingredients.ingredient")
      .populate("ingredients.ingredient", "_id")
      .lean();
    if (!dish) throw new Error(`Dish not found: ${dishId}`);
    dishCache.set(dishId, dish);
  }

  // Thêm nguyên liệu từ món chính
  for (const ing of dish.ingredients ?? []) {
    const id = ing.ingredient._id.toString();
    required[id] = (required[id] ?? 0) + ing.quantity * quantity;
  }

  // 🍢 2️⃣ Gom query topping chưa cache
  const uncachedIds = toppingIds.filter((id) => !toppingCache.has(id));

  if (uncachedIds.length > 0) {
    const toppingDocs = await Topping.find({ _id: { $in: uncachedIds } })
      .select("ingredients.quantity ingredients.ingredient")
      .populate("ingredients.ingredient", "_id")
      .lean();

    for (const t of toppingDocs) toppingCache.set(t._id.toString(), t);
  }

  // Thêm nguyên liệu từ topping
  for (const tid of toppingIds) {
    const topping = toppingCache.get(tid);
    if (!topping) continue;
    for (const ing of topping.ingredients ?? []) {
      const id = ing.ingredient._id.toString();
      required[id] = (required[id] ?? 0) + ing.quantity * quantity;
    }
  }

  return required; // { ingredientId: totalRequiredQty }
};

/**
 * Kiểm tra tồn kho nguyên liệu theo store
 */
const checkInventory = async (storeId, required) => {
  const ingredientIds = Object.keys(required);
  if (!ingredientIds.length) return;

  // 🔹 Gom query batch bằng aggregation (chỉ 1 query)
  const stock = await IngredientBatch.aggregate([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        ingredient: { $in: ingredientIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "active",
      },
    },
    {
      $group: {
        _id: "$ingredient",
        totalRemaining: { $sum: "$remainingQuantity" },
      },
    },
  ]);

  // 🔹 Map kết quả tồn kho
  const stockMap = Object.fromEntries(stock.map((s) => [s._id.toString(), s.totalRemaining]));

  // 🔹 Kiểm tra thiếu nguyên liệu
  const insufficient = ingredientIds.filter((id) => (stockMap[id] ?? 0) < required[id]);

  if (insufficient.length) {
    const names = await Ingredient.find({ _id: { $in: insufficient } }, "name")
      .lean()
      .then((docs) => docs.map((i) => i.name).join(", "));
    throw new Error(`Không đủ nguyên liệu: ${names}. Vui lòng giảm số lượng món.`);
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
    if (toppings.length > 0) {

      const toppingGroups = await ToppingGroup.find({ storeId: storeId }).select("toppings");
      let validToppingIds = new Set();
      toppingGroups.forEach((group) => {
        group.toppings.forEach((toppingId) => {
          validToppingIds.add(toppingId.toString());
        });
      });

      const invalidToppings = toppings.filter((tid) => !validToppingIds.has(tid.toString()));

      if (invalidToppings.length > 0) {
        return res.status(400).json({
          success: false,
          // message: "Some selected toppings are not available or configured for this store's groups.",
          message: `Một số topping không hợp lệ cho các nhóm của cửa hàng.`,
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

/**
 * Kiểm tra tồn kho cho toàn bộ giỏ hàng
 */
const checkCartInventory = async (storeId, cartItems = []) => {
  if (!cartItems.length) return;

  // Gom toàn bộ nguyên liệu cần thiết cho cả giỏ
  const totalRequired = Object.create(null);

  // ⚙️ 1️⃣ Tính toán song song nguyên liệu từng món
  const allRequired = await Promise.all(
    cartItems.map(async (item) => {
      const toppings = item.toppings?.map((t) => t._id?.toString?.() || t.toString()) || [];
      const dishId = item.dishId?.toString?.() || item.dish?._id?.toString?.();
      return calculateRequiredIngredients(dishId, item.quantity, toppings);
    })
  );

  // ⚙️ 2️⃣ Gộp tất cả nguyên liệu lại (cộng dồn số lượng)
  for (const req of allRequired) {
    for (const [ingredientId, qty] of Object.entries(req)) {
      totalRequired[ingredientId] = (totalRequired[ingredientId] ?? 0) + qty;
    }
  }

  // ⚙️ 3️⃣ Kiểm tra tồn kho chỉ 1 lần duy nhất
  await checkInventory(storeId, totalRequired);
};

const calculateIngredientCost = async (storeId, dishId, quantity, toppings = []) => {
  // 1️⃣ Tính toàn bộ nguyên liệu cần thiết
  const required = await calculateRequiredIngredients(dishId, quantity, toppings);
  const ingredientIds = Object.keys(required).map((id) => new mongoose.Types.ObjectId(id));

  // 2️⃣ Gom tất cả batch cần thiết trong 1 query duy nhất (FIFO)
  const batches = await IngredientBatch.find({
    storeId,
    ingredient: { $in: ingredientIds },
    status: "active",
  })
    .sort({ ingredient: 1, createdAt: 1 })
    .lean();

  // 3️⃣ Gom batch theo ingredientId
  const batchesByIngredient = {};
  for (const batch of batches) {
    const id = batch.ingredient.toString();
    if (!batchesByIngredient[id]) batchesByIngredient[id] = [];
    batchesByIngredient[id].push(batch);
  }

  // 4️⃣ Tính tổng cost theo FIFO logic
  let totalCost = 0;

  for (const [ingredientId, qtyNeeded] of Object.entries(required)) {
    let remaining = qtyNeeded;
    const ingBatches = batchesByIngredient[ingredientId] || [];

    for (const batch of ingBatches) {
      if (remaining <= 0) break;
      const usedQty = Math.min(batch.remainingQuantity, remaining);
      totalCost += usedQty * batch.costPerUnit;
      remaining -= usedQty;
    }

    if (remaining > 0) {
      throw new Error(`Không đủ nguyên liệu để tính cost cho nguyên liệu ${ingredientId}`);
    }
  }

  return totalCost;
};

const consumeIngredients = async (storeId, dishId, quantity, toppings = []) => {
  const required = await calculateRequiredIngredients(dishId, quantity, toppings);
  const ingredientIds = Object.keys(required).map((id) => new mongoose.Types.ObjectId(id));

  // 1️⃣ Lấy toàn bộ batch cần thiết trong 1 lần (FIFO)
  const batches = await IngredientBatch.find({
    storeId,
    ingredient: { $in: ingredientIds },
    status: "active",
  })
    .sort({ ingredient: 1, createdAt: 1 })
    .lean();

  // 2️⃣ Gom batch theo nguyên liệu
  const batchesByIngredient = {};
  for (const batch of batches) {
    const id = batch.ingredient.toString();
    if (!batchesByIngredient[id]) batchesByIngredient[id] = [];
    batchesByIngredient[id].push(batch);
  }

  // 3️⃣ Chuẩn bị các update để gửi bulk 1 lần
  const batchUpdates = [];
  const outOfStockIngredients = [];

  for (const [ingredientId, qtyNeeded] of Object.entries(required)) {
    let remaining = qtyNeeded;
    const ingBatches = batchesByIngredient[ingredientId] || [];

    for (const batch of ingBatches) {
      if (remaining <= 0) break;

      const usedQty = Math.min(batch.remainingQuantity, remaining);
      const newRemaining = batch.remainingQuantity - usedQty;

      batchUpdates.push({
        updateOne: {
          filter: { _id: batch._id },
          update:
            newRemaining > 0
              ? { $set: { remainingQuantity: newRemaining } }
              : { $set: { remainingQuantity: 0, status: "finished" } },
        },
      });

      remaining -= usedQty;
    }

    if (remaining > 0) {
      throw new Error(`Nguyên liệu ${ingredientId} không đủ để trừ kho`);
    }

    // Đánh dấu lại để check stock sau
    outOfStockIngredients.push(new mongoose.Types.ObjectId(ingredientId));
  }

  // 4️⃣ Thực hiện cập nhật batch 1 lần duy nhất
  if (batchUpdates.length > 0) {
    await IngredientBatch.bulkWrite(batchUpdates);
  }

  // 5️⃣ Kiểm tra tồn kho còn lại (gom toàn bộ 1 lần)
  const stockInfo = await IngredientBatch.aggregate([
    {
      $match: {
        storeId: new mongoose.Types.ObjectId(storeId),
        ingredient: { $in: outOfStockIngredients },
        status: "active",
      },
    },
    {
      $group: {
        _id: "$ingredient",
        total: { $sum: "$remainingQuantity" },
      },
    },
  ]);

  const stockMap = stockInfo.reduce((acc, s) => {
    acc[s._id.toString()] = s.total;
    return acc;
  }, {});

  const outOfStockIds = outOfStockIngredients.filter((id) => !stockMap[id.toString()] || stockMap[id.toString()] <= 0);

  // 6️⃣ Update trạng thái nguyên liệu hết hàng (bulk)
  if (outOfStockIds.length > 0) {
    await Ingredient.updateMany({ _id: { $in: outOfStockIds } }, { $set: { status: "OUT_OF_STOCK" } });
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

    const cartItems = await CartItem.find({ cartId: cart._id })
      .lean()
      .populate("dish", "price name")
      .populate("toppings", "price toppingName");

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
    await Promise.all(
      cartItems.map(async (item) => {
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
          await Promise.all(
            item.toppings.map((topping) =>
              OrderItemTopping.create({
                orderItemId: orderItem._id,
                toppingId: topping._id,
                toppingName: topping.toppingName,
                price: topping.price,
              })
            )
          );
        }
      })
    );

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
    await Promise.all(
      validVouchers.map(async ({ voucher, discount }) => {
        await OrderVoucher.create({ orderId: newOrder._id, voucherId: voucher._id, discountAmount: discount });
        await Voucher.findByIdAndUpdate(voucher._id, { $inc: { usedCount: 1 } });
        await UserVoucherUsage.findOneAndUpdate(
          { userId, voucherId: voucher._id },
          { $inc: { usedCount: 1 }, startDate: voucher.startDate },
          { upsert: true, new: true }
        );
      })
    );

    // --- clear cart ---
    await CartItemTopping.deleteMany({ cartItemId: { $in: cartItems.map((i) => i._id) } });
    await CartItem.deleteMany({ cartId: cart._id });
    await Cart.findByIdAndDelete(cart._id);

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
