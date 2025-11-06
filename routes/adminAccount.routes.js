const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
    getAllAdmins,
    createAdmin,
    updateAdminInfo
} = require("../controllers/adminAccount.controller");

const router = express.Router();

router.get("/", authMiddleware, getAllAdmins);
router.post("/", authMiddleware, createAdmin);
router.put("/:id", authMiddleware, updateAdminInfo);

module.exports = router;