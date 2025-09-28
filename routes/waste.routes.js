const express = require("express");
const {
  createWaste,
  getWasteList,
  getWasteById,
  deleteWaste,
  getWasteReport,
  updateWaste,
} = require("../controllers/waste.controller");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// POST /waste
router.post("/", authMiddleware, createWaste);

// GET /waste
router.get("/store/:storeId", authMiddleware, getWasteList);

// GET /waste/:id
router.get("/:id", authMiddleware, getWasteById);

router.put("/:id", authMiddleware, updateWaste);

// DELETE /waste/:id
router.delete("/:id", authMiddleware, deleteWaste);

// GET /waste/report
router.get("/report/summary", authMiddleware, getWasteReport);

module.exports = router;
