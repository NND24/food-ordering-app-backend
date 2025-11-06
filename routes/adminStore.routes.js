const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  getAllStores,
  getStoreById,
  approveStore,
  suspendStore,
} = require("../controllers/adminStore.controller");

const router = express.Router();

router.get("/", authMiddleware, getAllStores);
router.get("/:id", authMiddleware, getStoreById);
router.put("/approve/:id", authMiddleware, approveStore);
router.put("/suspend/:id", authMiddleware, suspendStore);

module.exports = router;
