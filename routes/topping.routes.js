const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const roleAuthMiddleware = require("../middlewares/roleAuthMiddleware");
const {
    getStoreToppings,
    getDishToppings,
    getToppingById,
    getToppingGroupById,
    createToppingGroup,
    createToppingInGroup,
    updateToppingInGroup,
    deleteToppingInGroup,
    deleteToppingGroup,

} = require("../controllers/topping.controller");


const router = express.Router();
router.get("/store/:store_id",authMiddleware,roleAuthMiddleware(["owner", "staff", "manager"]), getStoreToppings);
// router.get("/store/:store_id", getStoreToppings);

router.get("/topping-group/:group_id",authMiddleware,roleAuthMiddleware(["owner", "staff",  "manager"]), getToppingGroupById);
// router.get("/topping-group/:group_id", getToppingGroupById);

router.get("/dish/:dish_id", authMiddleware,roleAuthMiddleware(["owner", "staff",  "manager"]), getDishToppings);
// router.get("/dish/:dish_id", getDishToppings);

router.get("/topping-group/:group_id",authMiddleware,roleAuthMiddleware(["owner",  "staff", "manager"]), getToppingById);
// router.get("/:topping_id", getToppingById);

router.post("/store/:store_id/topping-group", authMiddleware, roleAuthMiddleware(["owner",  "manager"]), createToppingGroup);
// router.post("/store/:store_id/topping-group", createToppingGroup);

router.post("/topping-group/:group_id/topping", authMiddleware, roleAuthMiddleware(["owner",  "manager"]), createToppingInGroup);
// router.post("/topping-group/:group_id/topping", createToppingInGroup);

router.put("/topping-group/:group_id/topping/:topping_id", authMiddleware, roleAuthMiddleware(["owner",  "manager"]), updateToppingInGroup);
// router.put("/topping-group/:group_id/topping/:topping_id", updateToppingInGroup);

router.delete("/topping-group/:group_id/topping/:topping_id", authMiddleware, roleAuthMiddleware(["owner",  "manager"]), deleteToppingInGroup);
// router.delete("/topping-group/:group_id/topping/:topping_id", deleteToppingInGroup);

router.delete("/topping-group/:group_id", authMiddleware, roleAuthMiddleware(["owner",  "manager"]), deleteToppingGroup);
// router.delete("/topping-group/:group_id", deleteToppingGroup);

module.exports = router;