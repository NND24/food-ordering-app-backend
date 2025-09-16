const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  updateNotification,
  getNotifications,
  getStoreNotifications,
  createNotification,
} = require("../controllers/notification.controller");

const router = express.Router();

router.get("/get-all-notifications", authMiddleware, getNotifications);

router.put("/update-notification/:id", authMiddleware, updateNotification);

router.get("/get-all-notifications/store/:storeId", authMiddleware, getStoreNotifications);

router.post("/create-notification", authMiddleware, createNotification);

module.exports = router;
