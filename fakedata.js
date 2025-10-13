import { faker } from "@faker-js/faker";
import { ObjectId } from "mongodb";
import fs from "fs";

// Giả lập danh sách user, store, dish
const users = [
  "67ba0ddde145d9ad24039666",
  "67baf94d2f34b1faaae0c23e",
  "67c2945567f601b896470f8a",
  "67d19e969542ae5f4f86bcb4",
  "67e288b608a317e5f2c8936f",
  "68209fdeb430cb390ed0a3df",
  "6825dd775e5fca58977ffa0f",
  "688fa056e6331452d7ba9d89",
  "6890df653720d74ecfb9e83f",
];
const stores = ["67c6e409f1c07122e88619d6"];
const dishes = [
  { id: "67c997016e1a0a74d0efc6ae", name: "Gà Rán 1 Miếng", price: 30000 },
  { id: "68157ea718a6b80afd2e90c3", name: "Gà Rán 3 Miếng", price: 85000 },
  { id: "68157ed618a6b80afd2e90c4", name: "Gà Rán 6 Miếng", price: 200000 },
  { id: "68157e6e18a6b80afd2e90c2", name: "Gà Rán Phần", price: 87000 },
  { id: "68157eed18a6b80afd2e90c5", name: "Gà Sốt HS 1 Miếng", price: 41000 },
  { id: "68157f0118a6b80afd2e90c6", name: "Gà Sốt HS Phần", price: 95000 },
  { id: "68d2b73152536554b56bc852", name: "Gà Sốt HS 2 Miếng", price: 80000 },
  { id: "67c6e40af1c07122e88619e8", name: "Value Burger Tôm", price: 85000 },
  { id: "67c91ff49a1fffb184941d3a", name: "Combo Burger Bulgogi", price: 82000 },
  { id: "68157b8518a6b80afd2e90b3", name: "Value Burger Bulgogi", price: 88000 },
  { id: "68157bb918a6b80afd2e90b4", name: "Combo Burger Lchicken", price: 88000 },
  { id: "68157c1518a6b80afd2e90b5", name: "Value Burger Lchicken", price: 89000 },
  { id: "68157c3818a6b80afd2e90b6", name: "Combo Burger Double Double", price: 102000 },
  { id: "68157c6918a6b80afd2e90b7", name: "Value Burger Double Double", price: 119000 },
  { id: "68157c8c18a6b80afd2e90b8", name: "Combo Burger Mozzarella", price: 109000 },
  { id: "68157cad18a6b80afd2e90b9", name: "Value Burger Mozzarella", price: 122000 },
  { id: "68157cd218a6b80afd2e90ba", name: "Combo Burger Bò", price: 58000 },
  { id: "68157d0018a6b80afd2e90bb", name: "Value Burger Bò", price: 68000 },
  { id: "68157d2b18a6b80afd2e90bc", name: "Combo Burger Phô Mai", price: 74000 },
  { id: "68157d5218a6b80afd2e90bd", name: "Value Burger Phô Mai", price: 81000 },
  { id: "68157d8618a6b80afd2e90be", name: "Combo Burger Cá", price: 68000 },
  { id: "68157da918a6b80afd2e90bf", name: "Value Burger Cá", price: 75000 },
  { id: "68157dd418a6b80afd2e90c0", name: "Combo Burger Bò Teriyaki", price: 72000 },
  { id: "68157dd418a6b80afd2e90c1", name: "Value Burger Bò Teriyaki", price: 79000 },
];

// random cost dựa trên price, margin 20–40%
function randomCost(price) {
  const margin = faker.number.float({ min: 0.2, max: 0.4 });
  return Math.round(price * (1 - margin));
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function generateOrders(numOrders) {
  const orders = [];
  const orderItems = [];

  for (let i = 0; i < numOrders; i++) {
    const userId = users[Math.floor(Math.random() * users.length)];
    const storeId = stores[Math.floor(Math.random() * stores.length)];
    const status = "done";
    const paymentMethod = faker.helpers.arrayElement(["cash", "card"]);
    const createdAt = randomDate(new Date("2025-08-01"), new Date("2025-10-31"));

    const dish = dishes[Math.floor(Math.random() * dishes.length)];
    const quantity = faker.number.int({ min: 1, max: 3 });
    const cost = randomCost(dish.price);

    const subtotalPrice = dish.price * quantity;
    const totalCost = cost * quantity;
    const shippingFee = faker.number.int({ min: 0, max: 20000 });
    const finalTotal = subtotalPrice + shippingFee;

    const orderId = new ObjectId();

    orders.push({
      _id: { $oid: orderId.toString() },
      userId: { $oid: userId },
      storeId: { $oid: storeId },
      status,
      paymentMethod,
      subtotalPrice,
      totalDiscount: 0,
      shippingFee,
      finalTotal,
      totalCost,
      deleted: false,
      createdAt: { $date: createdAt.toISOString() },
      updatedAt: { $date: createdAt.toISOString() },
      __v: 0,
    });

    orderItems.push({
      _id: { $oid: new ObjectId().toString() },
      orderId: { $oid: orderId.toString() },
      dishId: { $oid: dish.id },
      dishName: dish.name,
      quantity,
      price: dish.price,
      cost,
      note: faker.lorem.sentence({ min: 3, max: 6 }),
      createdAt: { $date: createdAt.toISOString() },
      updatedAt: { $date: createdAt.toISOString() },
      __v: 0,
    });
  }

  return { orders, orderItems };
}

function generateOrderShipInfos(orders) {
  const orderShipInfos = [];

  for (const order of orders) {
    // Sinh random tọa độ (longitude, latitude) giả lập
    const longitude = faker.number.float({ min: 105.7, max: 106.0, precision: 0.000001 });
    const latitude = faker.number.float({ min: 10.7, max: 10.9, precision: 0.000001 });

    orderShipInfos.push({
      _id: { $oid: new ObjectId().toString() },
      orderId: order._id, // link tới order
      shipLocation: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
      address: faker.location.streetAddress(),
      detailAddress: faker.location.secondaryAddress(),
      contactName: faker.person.fullName(),
      contactPhonenumber: faker.phone.number("0#########"),
      note: faker.lorem.sentence({ min: 3, max: 6 }),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      __v: 0,
    });
  }

  return orderShipInfos;
}

// 1. Tạo orders và orderItems trước
const { orders, orderItems } = generateOrders(1000);

// 2. Tạo orderShipInfos dựa trên orders vừa tạo
const orderShipInfos = generateOrderShipInfos(orders);

// 3. Ghi ra file JSON
fs.writeFileSync("orders.json", JSON.stringify(orders, null, 2));
fs.writeFileSync("orderItems.json", JSON.stringify(orderItems, null, 2));
fs.writeFileSync("orderShipInfos.json", JSON.stringify(orderShipInfos, null, 2));

console.log("Đã tạo orders.json, orderItems.json và orderShipInfos.json!");
