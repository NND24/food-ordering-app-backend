const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validateMongoDbId = require("../middlewares/validateMongoDBId");
const { uploadAvatarImage, uploadImages, deleteFile } = require("../controllers/upload.controller");
const { uploadToFirebase } = require("../config/firebase_connection");

const router = express.Router();

router.post("/avatar", authMiddleware, validateMongoDbId("id"), uploadToFirebase.single("file"), uploadAvatarImage);
router.post("/images", authMiddleware, validateMongoDbId("id"), uploadToFirebase.array("file", 10), uploadImages);
router.post("/register/images", uploadToFirebase.array("file", 10), uploadImages);
router.delete("/delete-file", authMiddleware, deleteFile);

module.exports = router;
