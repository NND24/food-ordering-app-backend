import { faker } from "@faker-js/faker";
import { ObjectId } from "bson";

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
const stores = ["6809a3e2e1b83a3af1175d17"];
const dishes = [
  { id: "6814c4d38a256219c84a4b01", name: "Cơm trắng + Cải thìa + Bắp mĩ", price: 12000 },
  { id: "6814c4f98a256219c84a4b02", name: "CƠM TRỘN ĐÙI GÀ", price: 53000 },
  { id: "6814c55b8a256219c84a4b03", name: "CƠM TRỘN XÁ XÍU", price: 42000 },
  { id: "6814c5768a256219c84a4b04", name: "CƠM TRỘN THỊT BĂM", price: 38000 },
  { id: "6814c58f8a256219c84a4b05", name: "CƠM TRỘN XÚC XÍCH", price: 37000 },
  { id: "6814c58f8a256219c84a4b05", name: "CƠM TRỘN XÚC XÍCH", price: 37000 },
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
    const createdAt = randomDate(new Date("2025-11-01"), new Date("2025-12-31"));

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
const { orders, orderItems } = generateOrders(30);

// 2. Tạo orderShipInfos dựa trên orders vừa tạo
const orderShipInfos = generateOrderShipInfos(orders);

// 3. Ghi ra file JSON
fs.writeFileSync("orders_6809a3e2e1b83a3af1175d17.json", JSON.stringify(orders, null, 2));
fs.writeFileSync("orderItems_6809a3e2e1b83a3af1175d17.json", JSON.stringify(orderItems, null, 2));
fs.writeFileSync("orderShipInfos_6809a3e2e1b83a3af1175d17.json", JSON.stringify(orderShipInfos, null, 2));

console.log("Đã tạo orders.json, orderItems.json và orderShipInfos.json!");
