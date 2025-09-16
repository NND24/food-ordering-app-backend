const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDBId");
const {
  getStoreInfo,
  toggleOpenStatus,
  updateOpenCloseHours,
  updateStoreInfo,
  updateStoreImages,
  updateStoreAddress,
  updateStorePaperWork,
  changeStoreStatusTest
} = require("../controllers/store.controller");

const router = express.Router();

router.get("/", authMiddleware, getStoreInfo);
router.patch("/open-status", authMiddleware, toggleOpenStatus);
router.patch("/hours", authMiddleware, updateOpenCloseHours);
router.patch("/info", authMiddleware, updateStoreInfo);
router.patch("/images", authMiddleware, updateStoreImages);
router.patch("/address", authMiddleware, updateStoreAddress);
router.patch("/paperwork", authMiddleware, updateStorePaperWork);
router.post("/test/changeStatus", changeStoreStatusTest)

module.exports = router;
