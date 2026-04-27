const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDBId");
const { uploadAvatarImage, uploadImages, deleteFile } = require("../controllers/upload.controller");
const { upload } = require("../config/cloudinary_connection");

const router = express.Router();

router.post("/avatar", authMiddleware, validateMongoDbId("id"), upload.single("file"), uploadAvatarImage);
router.post("/images", authMiddleware, validateMongoDbId("id"), upload.array("file", 10), uploadImages);
router.post("/register/images", (req, _res, next) => { req.query.type = "register"; next(); }, upload.array("file", 10), uploadImages);
router.delete("/delete-file", authMiddleware, deleteFile);

module.exports = router;
