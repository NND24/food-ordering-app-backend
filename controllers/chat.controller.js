const User = require("../models/user.model");
const Chat = require("../models/chat.model");
const Message = require("../models/message.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");

// POST /api/v1/chat/:id — tạo chat giữa 2 user (có thể kèm storeId)
const createChat = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { storeId } = req.body;

  if (!id) return next(createError(400, "UserId params not sent with request"));

  let isChat = await Chat.findOne({
    users: { $all: [req.user._id, id] },
  });

  if (isChat) {
    return res.json(isChat._id);
  }

  const chatData = {
    users: [req.user._id, id],
    ...(storeId && { store: storeId }),
  };

  const createdChat = await Chat.create(chatData);
  res.status(200).json(createdChat._id);
});

// POST /api/v1/chat/:id/store/:storeId — user tạo chat với cửa hàng
const createStoreChat = asyncHandler(async (req, res, next) => {
  const { id, storeId } = req.params;

  if (!id || !storeId) return next(createError(400, "UserId or StoreId params not sent with request"));

  const store = await Store.findById(storeId);
  if (!store || !store.owner) return next(createError(404, "Store or store owner not found"));

  const ownerId = store.owner;

  let isChat = await Chat.findOne({
    users: { $all: [ownerId, id] },
    store: storeId,
  })
    .populate("users", "name avatar")
    .populate("latestMessage")
    .populate("store", "name avatar");

  if (isChat) {
    isChat = await User.populate(isChat, {
      path: "latestMessage.sender",
      select: "name avatar",
    });
    return res.json(isChat);
  }

  const createdChat = await Chat.create({
    users: [ownerId, id],
    store: storeId,
  });

  const fullChat = await Chat.findById(createdChat._id)
    .populate("users", "name avatar")
    .populate("latestMessage")
    .populate("store", "name avatar");

  const populatedChat = await User.populate(fullChat, {
    path: "latestMessage.sender",
    select: "name avatar",
  });

  return res.status(200).json(populatedChat);
});

// GET /api/v1/chat — lấy tất cả chat của user hiện tại
const getAllChats = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const userRoles = req.user.role || [];

  let chatQuery = [{ users: userId }];

  if (userRoles.includes("staff") || userRoles.includes("manager")) {
    const stores = await Store.find({ staff: userId }).select("owner");
    const ownerIds = stores.map((s) => s.owner);
    if (ownerIds.length > 0) chatQuery.push({ users: { $in: ownerIds } });
  } else if (userRoles.includes("storeOwner")) {
    const store = await Store.findOne({ owner: userId }).select("_id");
    if (store) chatQuery.push({ store: store._id });
  }

  let chats = await Chat.find({ $or: chatQuery })
    .populate("store", "name avatar")
    .populate("latestMessage")
    .sort({ updatedAt: -1 });

  chats = await Promise.all(
    chats.map(async (chat) => {
      const populatedUsers = await Promise.all(
        chat.users.map((uid) => User.findById(uid).select("name avatar").lean())
      );

      let populatedSender = null;
      if (chat.latestMessage?.sender) {
        populatedSender = await User.findById(chat.latestMessage.sender).select("name avatar").lean();
      }

      return {
        ...chat.toObject(),
        users: populatedUsers,
        latestMessage: chat.latestMessage
          ? { ...chat.latestMessage.toObject(), sender: populatedSender }
          : null,
      };
    })
  );

  res.status(200).json(chats);
});

// DELETE /api/v1/chat/delete/:id
const deleteChat = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  await Message.deleteMany({ chat: id });
  await Chat.findByIdAndDelete(id);
  res.json({ success: true, data: "Delete successful!" });
});

module.exports = { createChat, createStoreChat, getAllChats, deleteChat };
