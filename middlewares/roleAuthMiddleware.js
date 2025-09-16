const createError = require("../utils/createError");
const User = require("../models/user.model");

const roleAuthMiddleware = (roles) => {
    return async (req, res, next) => {
        try {
            console.log("User in request:", req.user);
            const employee = await User.findById(req.user.id);

            if (
                !employee ||
                !roles.some((role) => employee.role.includes(role))
            ) {
                return next(
                    createError(
                        403,
                        `Bạn không có quyền thực hiện hành động này. Quyền hiện tại: ${employee?.role}`
                    )
                );
            }
            next();
        } catch (error) {
            next(error);
        }
    };
};

module.exports = roleAuthMiddleware;