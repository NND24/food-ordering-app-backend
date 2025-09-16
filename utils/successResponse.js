const successResponse = (data = null, message = "Success") => {
    const response = {
      success: true,
      message,
    };
  
    if (data !== null) {
      response.data = data;
    }
  
    return response;
  };
  
  module.exports = successResponse;
  