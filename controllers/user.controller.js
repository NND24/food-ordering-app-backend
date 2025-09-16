const User = require("../models/user.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");

const getUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  try {
    const getUser = await User.findById(id).select("name email phonenumber gender role avatar isGoogleLogin");

    if (getUser) {
      res.json(getUser);
    } else {
      next(createError(404, "User not found!"));
    }
  } catch (error) {
    next(error);
  }
});

const updateUser = asyncHandler(async (req, res, next) => {
  const userId = req?.user?._id;
  try {
    const updateUser = await User.findByIdAndUpdate(userId, req.body, { new: true });
    res.json(updateUser);
  } catch (error) {
    next(error);
  }
});

module.exports = { getUser, updateUser };
