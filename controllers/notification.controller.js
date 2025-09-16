const Notification = require("../models/notification.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");
const getPaginatedData = require("../utils/paging").getPaginatedData;
const cron = require("node-cron");
const { getUserSockets } = require("../utils/socketManager");


const userSockets = getUserSockets();


const getNotifications = asyncHandler(async (req, res, next) => {
  try {
    const notification = await Notification.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    next(error);
  }
});

const updateNotification = asyncHandler(async (req, res, next) => {
  try {
    const notiId = req.params.id;
    const notification = await Notification.findById(notiId);
    if (!notification) {
      next(createError(404, { message: "Notification not found" }));
    } else {
      notification.status ? (notification.status = "read") : notification?.status;
    }

    await notification.save();

    res.status(200).json({
      success: true,
      message: "Update notification successfully!",
    });
  } catch (error) {
    next(error);
  }
});

const getStoreNotifications = asyncHandler(async (req, res, next) => {
  try {
    const storeId = req.params.storeId;
    const { page, limit } = req.query;

    const store = await Store.findById(storeId);
    if (!store) {
      return next(createError(404, "Store not found"));
    }

    const ownerId = store.owner;

    // Make sure your Notification model uses `userId` field to store the owner ID
    const result = await getPaginatedData(Notification, { userId: ownerId }, [], limit, page, { createdAt: 1 });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

const createNotification = asyncHandler(async (req, res, next) => {
    const {userId, title, message, type, orderId} = req.body
    io.on("connection", (socket) => {
      socket.on("sendNotification")
    });
    
});

cron.schedule("0 0 0 * * *", async () => {
  const thirtyDayAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await Notification.deleteMany({ status: "read", createdAt: { $lt: thirtyDayAgo } });
});

module.exports = { getNotifications, updateNotification, getStoreNotifications, createNotification };
