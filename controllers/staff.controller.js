const User = require("../models/user.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const successResponse = require("../utils/successResponse");
const asyncHandler = require("express-async-handler");

const addAnEmployee = asyncHandler(async (req, res, next) => {
  try {
    const { storeId } = req.params;
    const { name, email, password, phonenumber, gender, role } = req.body;

    // 1. Kiểm tra tồn tại store
    const store = await Store.findById(storeId);
    if (!store) {
      return next(createError(404, "Cửa hàng không tồn tại."));
    }

    // 2. Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return next(createError(400, "Email đã tồn tại."));
    }

    // 3. Kiểm tra role hợp lệ
    const validRoles = ["staff", "manager"];
    if (!role || !validRoles.includes(role)) {
      return next(
        createError(
          400,
          "Role không hợp lệ. Chỉ chấp nhận 'staff' hoặc 'manager'."
        )
      );
    }

    // 4. Tạo user mới với role duy nhất
    const newEmployee = await User.create({
      name,
      email,
      password: password || "123456",
      phonenumber,
      gender,
      role, // Không cần là mảng
    });

    // 5. Gắn nhân viên vào store
    store.staff.push(newEmployee._id);
    await store.save();

    // 6. Trả về kết quả
    return res.status(201).json(
      successResponse(
        {
          employee: {
            id: newEmployee._id,
            name: newEmployee.name,
            email: newEmployee.email,
            role: newEmployee.role,
          },
          storeId: store._id,
        },
        "Thêm nhân viên thành công!"
      )
    );
  } catch (error) {
    next(error);
  }
});

// Lấy thông tin 1 nhân viên
const getEmployeeById = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;

  const employee = await User.findById(userId).select(
    "-password -refreshToken -otp -otpExpires"
  );
  if (!employee) return next(createError(404, "Không tìm thấy nhân viên."));

  return res
    .status(200)
    .json(successResponse(employee, "Lấy thông tin nhân viên thành công!"));
});

// Cập nhật thông tin nhân viên
const updateEmployee = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  const { name, email, phonenumber, gender, role } = req.body;

  // 1. Tìm user theo ID
  const employee = await User.findById(userId);
  if (!employee) {
    return next(createError(404, "Không tìm thấy nhân viên."));
  }

  // 2. Nếu email được cập nhật và khác email cũ
  if (email && email !== employee.email) {
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return next(
        createError(400, "Email đã được sử dụng bởi người dùng khác.")
      );
    }
    employee.email = email;
  }

  // 3. Cập nhật các thông tin khác
  employee.name = name || employee.name;
  employee.phonenumber = phonenumber || employee.phonenumber;
  employee.gender = gender || employee.gender;

  // 4. Cập nhật role nếu hợp lệ
  const validRoles = ["staff", "manager"];
  if (role && typeof role === "string" && validRoles.includes(role)) {
    employee.role = role;
  }

  // 5. Lưu user
  await employee.save();

  // 6. Trả về kết quả
  return res.status(200).json(
    successResponse(
      {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
      },
      "Cập nhật thông tin nhân viên thành công!"
    )
  );
});

// Xóa nhân viên
const deleteEmployee = asyncHandler(async (req, res, next) => {
  const { storeId, userId } = req.params;

  const store = await Store.findById(storeId);
  if (!store) {
    return next(createError(404, "Cửa hàng không tồn tại."));
  }

  const employee = await User.findById(userId);
  if (!employee) {
    return next(createError(404, "Không tìm thấy nhân viên."));
  }

  // ✅ Không cho xóa owner
  if (employee.role === "owner") {
    return next(createError(403, "Không thể xóa nhân viên có quyền 'owner'."));
  }

  // ✅ Không cho xóa chính mình
  if (req.user._id.toString() === userId) {
    return next(createError(403, "Bạn không thể tự xóa chính mình."));
  }

  // ✅ Xóa nhân viên khỏi store.staff
  store.staff = store.staff.filter((id) => id.toString() !== userId);
  await store.save();

  // ✅ Xóa nhân viên khỏi DB
  await User.findByIdAndDelete(userId);

  return res
    .status(200)
    .json(successResponse(null, "Xóa nhân viên thành công!"));
});

const getAllEmployeesInStore = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { page = 1, limit = 10, search = "", role = "" } = req.query;

  const store = await Store.findById(storeId).populate("staff");
  if (!store) return next(createError(404, "Cửa hàng không tồn tại."));

  const employeeIds = store.staff.map((user) => user._id);

  const roleFilter = role ? [role] : ["manager", "staff"];

  const queryFilter = {
    _id: { $in: employeeIds },
    role: { $in: roleFilter },
    name: { $regex: search, $options: "i" },
  };

  const total = await User.countDocuments(queryFilter);

  const employees = await User.find(queryFilter)
    .select("avatar name role")
    .skip((page - 1) * limit)
    .limit(Number(limit));

  res.status(200).json(
    successResponse(
      {
        total,
        currentPage: Number(page),
        totalPages: Math.ceil(total / limit),
        employees,
      },
      "Danh sách nhân viên"
    )
  );
});

module.exports = {
  addAnEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getAllEmployeesInStore,
};
