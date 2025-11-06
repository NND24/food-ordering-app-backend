const User = require("../models/user.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const asyncHandler = require("express-async-handler");

const getAllAdmins = asyncHandler(async (req, res, next) => {
    try {
        // Chỉ tìm những User có role chứa 'admin'
        const admins = await User.find({})
            .select("name email phonenumber avatar role createdAt")
            .sort({ createdAt: -1 });

        return res
            .status(200)
            .json(successResponse(admins, "Lấy danh sách tài khoản Admin thành công."));
    } catch (error) {
        next(error);
    }
});

const createAdmin = asyncHandler(async (req, res, next) => {
    const { name, email, password, phonenumber } = req.body;

    if (!name || !email || !password) {
        return next(createError(400, "Vui lòng điền đầy đủ Tên, Email và Mật khẩu."));
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(createError(400, "Email đã được sử dụng."));
    }

    const newAdmin = await User.create({
        name,
        email,
        password, // Sẽ được hash bởi pre('save') hook
        phonenumber,
        role: ["admin"], // Gán vai trò là ['admin']
        status: 'active'
    });

    // Loại bỏ mật khẩu trước khi gửi phản hồi
    newAdmin.password = undefined;

    return res
        .status(201)
        .json(successResponse(newAdmin, "Tạo tài khoản Admin thành công."));
});

const updateAdminInfo = asyncHandler(async (req, res, next) => {
    const adminId = req.params.id;
    const { name, email, phonenumber, avatar } = req.body;

    // 1. Kiểm tra tồn tại
    const admin = await User.findById(adminId);
    if (!admin || !admin.role.includes(adminRole)) {
        return next(createError(404, "Không tìm thấy tài khoản Admin hệ thống."));
    }

    // 2. Kiểm tra Email đã tồn tại và không phải là của chính user đang sửa
    if (email && email !== admin.email) {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return next(createError(400, "Email đã được sử dụng bởi tài khoản khác."));
        }
    }

    // 3. Cập nhật thông tin (Không cho phép sửa role và status tại đây)
    admin.name = name || admin.name;
    admin.email = email || admin.email;
    admin.phonenumber = phonenumber; // Cho phép là null/undefined để xóa
    admin.avatar = avatar;

    const updatedAdmin = await admin.save();

    updatedAdmin.password = undefined;

    return res
        .status(200)
        .json(successResponse(updatedAdmin, "Cập nhật thông tin Admin thành công."));
});

module.exports = {
    getAllAdmins,
    createAdmin,
    updateAdminInfo
};