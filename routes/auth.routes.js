const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  register,
  login,
  logout,
  getRefreshToken,
  changePassword,
  resetPassword,
  forgotPassword,
  checkOTP,
  googleLoginWithToken,
  storeOwnByUser,
  registerStoreOwner,
  checkRegisterStoreOwner,
  registerStore,
  deleteStoreOwnerById,
} = require("../controllers/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/register/store", registerStore);
router.post("/register/store-owner", registerStoreOwner);
router.delete("/store-owner/:id", deleteStoreOwnerById);

router.post("/check-register-store-owner", checkRegisterStoreOwner);
router.post("/login", login);
router.post("/store", authMiddleware, storeOwnByUser);
router.post("/login/google", googleLoginWithToken);
router.post("/forgot-password", forgotPassword);
router.post("/check-otp", checkOTP);

router.get("/logout", logout);
router.get("/refresh", getRefreshToken);

router.put("/change-password", authMiddleware, changePassword);
router.put("/reset-password", resetPassword);

module.exports = router;
