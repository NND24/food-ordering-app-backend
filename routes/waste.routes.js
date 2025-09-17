const express = require("express");
const {
  createWaste,
  getWasteList,
  getWasteById,
  deleteWaste,
  getWasteReport,
} = require("../controllers/waste.controller");

const router = express.Router();

// POST /waste
router.post("/", createWaste);

// GET /waste
router.get("/", getWasteList);

// GET /waste/:id
router.get("/:id", getWasteById);

// DELETE /waste/:id
router.delete("/:id", deleteWaste);

// GET /waste/report
router.get("/report/summary", getWasteReport);

module.exports = router;
