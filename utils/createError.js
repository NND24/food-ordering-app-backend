const createError = (status, message) => {
  const err = new Error(typeof message === "string" ? message : message?.message || "An error occurred");
  err.status = status;
  return err;
};

module.exports = createError;
