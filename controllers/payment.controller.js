const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");
const CartItem = require("../models/cartItem.model");
const Cart = require("../models/cart.model");
const Location = require("../models/location.model");
const Voucher = require("../models/voucher.model");
const Order = require("../models/order.model");
const Payment = require("../models/payment.model");
const convertCartToOrder = require("../utils/convertCartToOrder");
const mongoose = require("mongoose");
const {
    VNPay,
    ignoreLogger,
    ProductCode,
    VnpLocale,
    dateFormat,
    VerifyReturnUrl,
} = require("vnpay");
const paymentModel = require("../models/payment.model");

const getQRCode = asyncHandler(async (req, res, next) => {
    try {
        const { cartId } = req.params;
        const {
            userId,
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
        console.log("[getQRCode] Requested cartId:", cartId);

        const cart = await Cart.findById(cartId);
        if (!cart) {
            return next(createError(404, "Cart not found"));
        }

        const locationObject = await Location.create({
            userId,
            name: customerName,
            detailAddress,
            location: {
                type: "Point",
                coordinates: location, // [longitude, latitude]
            },
            address: deliveryAddress,
            contactPhonenumber: customerPhonenumber,
            contactName: customerName,
            note,
        });

        // Update Cart with new data
        cart.location = locationObject._id;
        cart.paymentMethod = paymentMethod;
        cart.shippingFee = shippingFee;
        cart.voucher = vouchers;
        await cart.save();

        // Generate txnRef from cartId + 6 random digits
        const randomSuffix = Math.floor(
            100000 + Math.random() * 900000
        ).toString();
        const txnRef = cartId + randomSuffix; // 24-char cartId + 6 digits = 30-char txnRef

        // Calculate total price and discounts
        const cartItems = await CartItem.find({ cartId: cart._id })
            .populate("dish")
            .populate("toppings");

        if (!cartItems.length) throw new Error("Cart is empty");

        let subtotalPrice = 0;
        for (const item of cartItems) {
            const dishPrice = (item.dish?.price || 0) * item.quantity;
            const toppingsPrice =
                (Array.isArray(item.toppings)
                    ? item.toppings.reduce(
                          (sum, topping) => sum + (topping.price || 0),
                          0
                      )
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
            if (
                voucher.minOrderAmount &&
                subtotalPrice < voucher.minOrderAmount
            )
                continue;

            let discount = 0;
            if (voucher.discountType === "PERCENTAGE") {
                discount = (subtotalPrice * voucher.discountValue) / 100;
                if (voucher.maxDiscount)
                    discount = Math.min(discount, voucher.maxDiscount);
            } else if (voucher.discountType === "FIXED") {
                discount = voucher.discountValue;
            }

            totalDiscount += discount;
            validVouchers.push({ voucher, discount });
        }

        const finalTotal = Math.max(
            0,
            subtotalPrice - totalDiscount + shippingFee
        );
        console.log("[getQRCode] Final total price:", finalTotal);
        const vnpay = new VNPay({
            tmnCode: process.env.VNPAY_TMN_CODE,
            secureSecret: process.env.VNPAY_SECRET_KEY,
            vnpayHost: process.env.VNPAY_PAYMENT_URL,
            testMode: true,
            hashAlgorithm: "SHA512",
            loggerFn: ignoreLogger,
        });

        const paymentParams = {
            vnp_Amount: finalTotal,
            vnp_IpAddr: "127.0.0.1",
            vnp_TxnRef: txnRef,
            vnp_OrderInfo: `Payment for order ${cart._id}`,
            vnp_ReturnUrl: process.env.VNPAY_RETURN_CHECK_PAYMENT,
            vnp_Locale: VnpLocale.VN,
            vnp_CreateDate: dateFormat(new Date()),
            vnp_ExpireDate: dateFormat(new Date(Date.now() + 15 * 60 * 1000)),
        };

        const paymentUrl = await vnpay.buildPaymentUrl(paymentParams);
        res.status(200).json({ paymentUrl });
    } catch (err) {
        console.error("[getQRCode] Error:", err);
        next(createError(500, "Không tạo được link thanh toán"));
    }
});

const handleVnpReturn = asyncHandler(async (req, res) => {
    console.log("[VNPay Return] Incoming query:", req.query);

    const vnpay = new VNPay({ secureSecret: process.env.VNPAY_SECRET_KEY });
    const isValid = await vnpay.verifyReturnUrl(req.query);

    if (!isValid) {
        return res.status(400).json({ message: "Invalid signature" });
    }

    const { vnp_TxnRef, vnp_ResponseCode } = req.query;

    // Extract the original 24-char cartId from the 30-char txnRef
    const cartId = vnp_TxnRef.slice(0, 24);
    const currentCart = await Cart.findById(cartId);

    try {
        if (vnp_ResponseCode === "00") {
            console.log(`[VNPay Return] Payment succeeded for cart ${cartId}`);

            // 🔥 Convert the cart to order
            const result = await convertCartToOrder(cartId);
            const orderId = result.orderId;
            const successOrder = await Order.findById(orderId);
            successOrder.paymentStatus = "paid";
            if (!result.success) {
                console.error(
                    "[VNPay Return] Order conversion failed:",
                    result.message
                );

                return res.redirect(
                    `http://localhost:3001/store/${currentCart.storeId}/cart`
                );
            }
            const existingPayment = await Payment.findOne({
                transactionId: vnp_TxnRef,
            });

            if (!existingPayment) {
                await Payment.create({
                    orderId,
                    provider: "vnpay",
                    amount: result.totalPrice,
                    status: "success",
                    transactionId: vnp_TxnRef,
                    metadata: req.query,
                });
            } else {
                console.log(
                    `[VNPay Return] Payment already saved for txnRef: ${vnp_TxnRef}`
                );
            }
            successOrder.save();
            return res.redirect(
                `http://localhost:3001/orders/detail-order/${result.orderId}?status=success`
            );
        } else {
            console.log(
                `[VNPay Return] Payment failed. Code: ${vnp_ResponseCode}`
            );
            return res.redirect(
                `http://localhost:3001/store/${currentCart.storeId}/cart?status=${vnp_ResponseCode}`
            );
        }
    } catch (err) {
        console.error("[VNPay Return] Error processing order:", err);
        return res.redirect(
            `http://localhost:3001/store/${currentCart.storeId}/cart?status=error`
        );
    }
});

const refundVNPayPayment = asyncHandler(async (req, res, next) => {
  const { transactionId, amount, orderId } = req.body;

  if (!transactionId || !amount) {
    return next(createError(400, "Missing refund transactionId or amount"));
  }

  try {
    const vnpay = new VNPay({
      tmnCode: process.env.VNPAY_TMN_CODE,
      secureSecret: process.env.VNPAY_SECRET_KEY,
      vnpayHost: process.env.VNPAY_PAYMENT_URL,
      hashAlgorithm: 'SHA512',
      loggerFn: ignoreLogger,
    });

    const refundParams = {
      vnp_TxnRef: transactionId,
      vnp_Amount: amount,
      vnp_TransactionType: '02', // Refund
      vnp_RequestId: Date.now().toString(),
      vnp_OrderInfo: `Refund order ${orderId || ""}`,
      vnp_TransactionDate: dateFormat(new Date()),
    };

    const response = await vnpay.refund(refundParams);

    if (response.vnp_ResponseCode === "00") {
      const refundRecord = await Payment.create({
        orderId: orderId || null,
        provider: 'vnpay',
        amount,
        status: 'refunded',
        transactionId: transactionId + "_refund_" + Date.now(),
        metadata: response,
      });

      return res.status(200).json({
        message: "Refund successful",
        data: refundRecord,
      });
    } else {
      return next(
        createError(400, `Refund failed: ${response.vnp_Message || "Unknown"}`)
      );
    }
  } catch (err) {
    console.error("[VNPay Refund] Error:", err);
    next(createError(500, "VNPay refund failed"));
  }
});

module.exports = { getQRCode, handleVnpReturn };
