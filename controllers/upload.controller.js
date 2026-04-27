const User = require("../models/user.model");
const asyncHandler = require("express-async-handler");
const createError = require("../utils/createError");
const { cloudinary } = require("../config/cloudinary_connection");
const { Readable } = require("stream");

const FOLDER_MAP = {
  avatars: "food-ordering-app/avatars",
  ratings: "food-ordering-app/ratings",
  messages: "food-ordering-app/messages",
  dishes: "food-ordering-app/dishes",
  stores: "food-ordering-app/stores",
  categories: "food-ordering-app/categories",
  register: "food-ordering-app/register",
};

const getFolder = (type) => FOLDER_MAP[type] || "food-ordering-app/images";

const uploadToCloudinary = (buffer, folderName) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: folderName, resource_type: "auto" },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          filePath: result.public_id,
          url: result.secure_url,
          createdAt: Date.now(),
        });
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

const uploadAvatarImage = asyncHandler(async (req, res, next) => {
  const userId = req?.user?._id;

  if (!req.file) {
    return next(createError(400, "No file uploaded"));
  }

  const uploadedImage = await uploadToCloudinary(req.file.buffer, getFolder("avatars"));

  const updateUser = await User.findByIdAndUpdate(
    userId,
    { avatar: uploadedImage },
    { new: true }
  ).select("name email phonenumber gender role avatar isGoogleLogin");

  if (!updateUser) {
    return next(createError(404, "User not found"));
  }

  res.status(200).json(updateUser);
});

const uploadImages = asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(createError(400, "No files uploaded"));
  }

  const folder = getFolder(req.query.type);

  const uploadedFileDetails = await Promise.all(
    req.files.map((file) => uploadToCloudinary(file.buffer, folder))
  );

  res.status(200).json(uploadedFileDetails);
});

const deleteFileFromCloudinary = async (publicId) => {
  const result = await cloudinary.uploader.destroy(publicId);
  if (result.result === "ok" || result.result === "not found") {
    return { message: "File deleted successfully" };
  }
  throw new Error(`Failed to delete file: ${result.result}`);
};

const deleteFile = asyncHandler(async (req, res, next) => {
  const { filePath } = req.body;

  if (!filePath) {
    return next(createError(400, "File path is required"));
  }

  const result = await deleteFileFromCloudinary(filePath);
  res.status(200).json(result);
});

module.exports = {
  uploadAvatarImage,
  uploadImages,
  deleteFile,
};
