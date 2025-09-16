const User = require("../models/user.model");
const Store = require("../models/store.model");
const ShippingFee = require("../models/shippingFee.model");
const jwt = require("jsonwebtoken");
const createError = require("../utils/createError");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const { OAuth2Client } = require("google-auth-library");
const sendEmail = require("../utils/sendEmail");
const mongoose = require("mongoose");

const hashPassword = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
};

const generateAccessToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const generateAccessAdminToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: "1d" });
};

const generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: "30d" });
};

const storeOwnByUser = asyncHandler(async (req, res, next) => {
  const { _id } = req.user;
  const findStore = await Store.findOne({
    $or: [{ owner: _id }, { staff: _id }],
  });

  if (!findStore) {
    return res
      .status(404)
      .json({ success: false, message: "No store found for this user" });
  }

  res.status(200).json({ data: findStore });
});

const register = asyncHandler(async (req, res, next) => {
  const { name, email, phonenumber, gender, password } = req.body;
  const findUser = await User.findOne({ email });
  if (!findUser) {
    await User.create({
      name,
      email,
      phonenumber,
      gender,
      password,
    });
    res
      .status(201)
      .json({ success: true, message: "Tạo tài khoản thành công" });
  } else {
    next(createError(409, { success: false, message: "Tài khoản đã tồn tại" }));
  }
});

const registerStoreOwner = asyncHandler(async (req, res, next) => {
  const { name, email, phonenumber, gender, password } = req.body;

  // Lúc gọi API này giả định đã qua bước check, nhưng vẫn nên kiểm tra lại email
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({
      message: "Email đã được sử dụng cho tài khoản khác",
    });
  }

  const newUser = await User.create({
    name,
    email,
    phonenumber,
    gender,
    password,
    role: ["owner"],
  });

  return res.status(201).json({
    message: "Tạo tài khoản chủ cửa hàng thành công",
    data: newUser,
  });
});

const deleteStoreOwnerById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // 1. Kiểm tra user tồn tại
  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({
      status: false,
      message: "Người dùng không tồn tại",
    });
  }

  // 2. Kiểm tra user có phải chủ cửa hàng không
  if (!user.role.includes("owner")) {
    return res.status(400).json({
      status: false,
      message: "Người dùng không phải là chủ cửa hàng",
    });
  }

  // 3. Xóa user
  await User.findByIdAndDelete(id);

  return res.status(200).json({
    status: true,
    message: "Xóa tài khoản chủ cửa hàng thành công",
  });
});

const checkRegisterStoreOwner = asyncHandler(async (req, res, next) => {
  const { name, email, phonenumber, gender, password } = req.body;

  // Email đã tồn tại
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(409).json({
      status: "error",
      message: "Email đã được sử dụng cho tài khoản khác",
    });
  }

  // Số điện thoại không hợp lệ
  if (!/^\d+$/.test(phonenumber)) {
    return res.status(400).json({
      status: "error",
      message: "Số điện thoại không hợp lệ. Chỉ được chứa số.",
    });
  }

  // Mật khẩu quá ngắn
  if (!password || password.length < 6) {
    return res.status(400).json({
      status: "error",
      message: "Mật khẩu phải có ít nhất 6 ký tự",
    });
  }

  // ✅ Hợp lệ
  return res.status(200).json({
    status: "success",
    message: "Thông tin hợp lệ, có thể tiến hành đăng ký",
  });
});

const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;
  const { getRole, getStore } = req.query; // Get query params for role and store info
  if (!email || !password) {
    next(
      createError(400, {
        success: false,
        message: "Vui lòng điền đầy đủ thông tin",
      })
    );
  }

  const findUser = await User.findOne({ email: email });

  if (findUser && (await findUser.isPasswordMatched(password))) {
    const refreshToken = generateRefreshToken(findUser._id);
    await User.findByIdAndUpdate(
      findUser._id,
      { refreshToken: refreshToken },
      { new: true }
    );
    // Check if the user is associated with a store
    const store = await Store.findOne({
      $or: [{ owner: findUser._id }, { staff: findUser._id }],
    }).select("_id name owner");

    res.cookie("refreshToken", refreshToken, {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
    });
    res.status(200).json({
      _id: findUser._id,
      token: generateAccessToken(findUser._id),
      ...(getRole === "true" && { role: findUser.role }), // Include role if getRole is true
      ...(getStore === "true" &&
        store && { storeId: store._id, ownerId: store.owner }), // Include storeId & name if requested
    });
  } else {
    return next(
      createError(401, {
        success: false,
        message: "Email hoặc mật khẩu không hợp lệ!",
      })
    );
  }
});

const registerStore = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      ownerId,
      name,
      description,
      storeCategory,
      avatar,
      cover,
      address, // { full_address, lat, lon }
      paperWork, // { IC_front, IC_back, businessLicense, storePicture: [] }
    } = req.body;

    // 1. Kiểm tra user tồn tại
    const user = await User.findById(ownerId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Chủ cửa hàng không tồn tại" });
    }

    // 2. Kiểm tra user đã có store chưa
    const existedStore = await Store.findOne({ owner: ownerId }).session(
      session
    );
    if (existedStore) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: "Người dùng đã có cửa hàng" });
    }

    // 3. Tạo store mới
    const newStore = await Store.create(
      [
        {
          name,
          owner: ownerId,
          description,
          storeCategory,
          avatar,
          cover,
          address: {
            full_address: address.full_address,
            lat: address.lat,
            lon: address.lon,
          },
          paperWork: {
            IC_front: paperWork.IC_front,
            IC_back: paperWork.IC_back,
            businessLicense: paperWork.businessLicense,
            storePicture: paperWork.storePicture,
          },
        },
      ],
      { session }
    );

    // 4. Tạo phí vận chuyển mặc định
    await ShippingFee.create(
      [
        {
          store: newStore[0]._id,
          fromDistance: 0,
          feePerKm: 2000,
        },
      ],
      { session }
    );

    // 5. Commit transaction
    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      status: true,
      message: "Tạo cửa hàng thành công",
      store: newStore[0],
    });
  } catch (error) {
    // Rollback nếu lỗi
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Error in registerStore:", error);
    res.status(500).json({ message: "Đã có lỗi xảy ra khi tạo cửa hàng" });
  }
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleLoginWithToken = asyncHandler(async (req, res, next) => {
  try {
    const { token } = req.body;
    console.log(token);
    if (!token)
      return res
        .status(400)
        .json({ success: false, message: "No token provided" });

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    // Kiểm tra xem user đã tồn tại chưa
    let user = await User.findOne({ email: payload.email });
    if (!user) {
      newUser = new User({
        name: payload.name,
        email: payload.email,
        password:
          "zxczczczcasfafhgmjh,hnfhrhdssdsdvsvx1232311131684535252131sdvvsvs",
        avatar: {
          filePath: "",
          url: payload.picture,
          createdAt: new Date(),
        },
        isGoogleLogin: true,
      });
      await newUser.save();

      const refreshToken = generateRefreshToken(newUser._id);
      await User.findByIdAndUpdate(
        newUser._id,
        {
          refreshToken: refreshToken,
        },
        { new: true }
      );
      res.cookie("refreshToken", refreshToken, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        _id: newUser?._id,
        token: generateAccessToken(newUser?._id),
      });
    } else {
      if (user.isGoogleLogin) {
        const refreshToken = generateRefreshToken(user._id);
        await User.findByIdAndUpdate(
          user._id,
          {
            refreshToken: refreshToken,
          },
          { new: true }
        );
        res.cookie("refreshToken", refreshToken, {
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
          _id: user?._id,
          token: generateAccessToken(user?._id),
        });
      } else {
        next(
          createError(409, { success: false, message: "Tài khoản đã tồn tại" })
        );
      }
    }
  } catch (error) {
    console.log(error);
    return next(
      createError(500, {
        success: false,
        message: "Google authentication failed!",
      })
    );
  }
});

const getRefreshToken = asyncHandler(async (req, res, next) => {
  const cookie = req?.cookies;
  if (!cookie?.refreshToken) {
    return next(
      createError(404, {
        success: false,
        message: "No refresh token in cookies",
      })
    );
  }

  const refreshToken = cookie.refreshToken;
  const user = await User.findOne({ refreshToken });
  if (!user) {
    return next(
      createError(404, {
        success: false,
        message: "No refresh token present in database or not matched",
      })
    );
  }

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, decoded) => {
    if (err || user.id !== decoded.id)
      return next(
        createError("400", {
          success: false,
          message: "There is something wrong with refresh token",
        })
      );
    const accessToken = generateAccessToken(user?._id);
    res.status(200).json({ accessToken });
  });
});

const logout = asyncHandler(async (req, res, next) => {
  const cookie = req.cookies;
  if (!cookie?.refreshToken)
    return next(
      createError(204, {
        success: false,
        message: "No refresh token in cookies",
      })
    );

  const refreshToken = cookie.refreshToken;
  const user = await User.findOne({ refreshToken });
  if (user) {
    await User.findOneAndUpdate(
      { refreshToken },
      { $set: { refreshToken: null } }
    );
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
  });
  res.status(200).json({ success: true, message: "Logout successful" });
});

const changePassword = asyncHandler(async (req, res, next) => {
  const { _id } = req.user;
  const { oldPassword, newPassword } = req.body;

  // Validate required fields
  if (!oldPassword || !newPassword) {
    return next(
      createError(400, {
        success: false,
        message: "Mật khẩu cũ và mật khẩu mới là bắt buộc",
      })
    );
  }

  // Find the user
  const user = await User.findById(_id);
  if (!user)
    return next(
      createError(404, { success: false, message: "User not found" })
    );

  // Kiểm tra mật khẩu cũ
  const isMatch = await user.isPasswordMatched(oldPassword);
  if (!isMatch)
    return next(
      createError(400, { success: false, message: "Mật khẩu cũ không đúng" })
    );

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: "Đổi mật khẩu thành công!" });
});

const resetPassword = asyncHandler(async (req, res, next) => {
  const { email, newPassword } = req.body;

  const user = await User.findOne({ email });
  if (!user)
    return next(
      createError(404, { success: false, message: "User not found" })
    );

  user.password = newPassword;
  await user.save();

  res.status(200).json({ success: true, message: "Đổi mật khẩu thành công!" });
});

const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;
  const user = await User.findOne({ email, isGoogleLogin: false });
  if (!user)
    return next(
      createError("404", {
        success: false,
        message:
          "Tài khoản không tồn tại hoặc tài khoản được đăng nhập bằng phương thức khác",
      })
    );

  const otp = await user.createOtp();
  await user.save();

  const resetURL = `
      <p>Mã OTP của bạn là: ${otp}</p>
      <p>Vui lòng nhập mã này để lấy lại mật khẩu. OTP sẽ hết hạn trong 2 phút</p>
    `;
  const data = {
    to: email,
    text: "",
    subject: "Forgot Password OTP",
    html: resetURL,
  };
  await sendEmail(data);
  res.status(200).json({ success: true, message: "Send email successfully" });
});

const checkOTP = asyncHandler(async (req, res, next) => {
  const { email, otp } = req.body;
  const hashedOTP = crypto.createHash("sha256").update(otp).digest("hex");

  const user = await User.findOne({
    email,
    otp: hashedOTP,
    otpExpires: { $gt: Date.now() },
  });

  if (!user)
    return next(
      createError("400", {
        success: false,
        message: "OPT đã hết hạn hoặc không đúng mã, vui lòng thử lại",
      })
    );

  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save();

  res.status(200).json("OTP hợp lệ");
});

module.exports = {
  register,
  login,
  googleLoginWithToken,
  getRefreshToken,
  logout,
  changePassword,
  resetPassword,
  forgotPassword,
  checkOTP,
  registerStoreOwner,
  checkRegisterStoreOwner,
  storeOwnByUser,
  registerStore,
  deleteStoreOwnerById,
};
