const express = require("express");
const {
  getAllStore,
  getStoreInformation,
  getAllDishInStore,
  getDetailDish,
} = require("../controllers/customerStore.controller");
const validateMongoDbId = require("../middlewares/validateMongoDBId");

const router = express.Router();

router.get("/", getAllStore);
router.get("/:storeId", validateMongoDbId("storeId"), getStoreInformation);

router.get("/:storeId/dish", validateMongoDbId("storeId"), getAllDishInStore);
router.get("/dish/:dishId", validateMongoDbId("dishId"), getDetailDish);

module.exports = router;
