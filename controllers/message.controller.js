const Message = require("../models/message.model");
const User = require("../models/user.model");
const Chat = require("../models/chat.model");
const Store = require("../models/store.model");
const createError = require("../utils/createError");
const asyncHandler = require("express-async-handler");

// POST /api/v1/message/:id — gửi tin nhắn vào chat
const sendMessage = asyncHandler(async (req, res, next) => {
  const { id } = req.params; // chat ID

  const chat = await Chat.findById(id).populate("store").lean();
  if (!chat) return next(createError(404, "Chat not found"));

  const requestUser = await User.findById(req.user._id);
  if (!requestUser) return next(createError(404, "User not found"));

  const isStaff = requestUser.role?.some((r) => ["owner", "manager", "staff"].includes(r));
  const isClientChat = chat.users.some((uid) => uid.toString() === req.user._id.toString());

  let isStoreChat = false;
  let senderId = req.user._id;

  if (chat.store && isStaff) {
    const userStore = await Store.findOne({
      $or: [{ staff: requestUser._id }, { owner: requestUser._id }],
    });
    if (!userStore) return next(createError(403, "You do not belong to any store"));
    if (userStore._id.toString() !== chat.store._id.toString()) {
      return next(createError(403, "You do not belong to this store"));
    }
    isStoreChat = true;
    senderId = chat.store.owner;
  }

  if (!isClientChat && !isStoreChat) {
    return next(createError(403, "Not authorized to send messages in this chat"));
  }

  const newMessage = {
    sender: senderId,
    content: req.body?.content,
    image: req.body?.image,
    chat: id,
  };

  let message = await Message.create(newMessage);
  message = await message.populate("sender", "name avatar");
  message = await User.populate(message, { path: "chat.users", select: "name avatar" });

  await Chat.findByIdAndUpdate(id, { latestMessage: message });

  res.json({ success: true, data: message });
});

// GET /api/v1/message/:id — lấy tất cả tin nhắn của chat
const getAllMessages = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const messages = await Message.find({ chat: id }).lean();

  let chat = await Chat.findById(id).populate("store", "name avatar").populate("latestMessage").lean();
  if (!chat) return next(createError(404, "Chat not found"));

  const populatedUsers = await Promise.all(
    chat.users.map((uid) => User.findById(uid).select("name avatar").lean())
  );
  chat.users = populatedUsers;

  if (chat.latestMessage?.sender) {
    chat.latestMessage.sender = await User.findById(chat.latestMessage.sender)
      .select("name avatar")
      .lean();
  }

  const populatedMessages = await Promise.all(
    messages.map(async (msg) => {
      const sender = await User.findById(msg.sender).select("name avatar").lean();
      return { ...msg, sender };
    })
  );

  res.json({ chat, messages: populatedMessages });
});

// DELETE /api/v1/message/delete/:id
const deleteMessage = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  await Message.findByIdAndDelete(id);
  res.json({ success: true, data: "Delete successful!" });
});

module.exports = { sendMessage, getAllMessages, deleteMessage };
