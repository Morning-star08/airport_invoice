const { handleRequest } = require("../server");

module.exports = function handler(req, res) {
  req.url = "/";
  return handleRequest(req, res);
};
