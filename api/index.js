// Vercel serverless function - wraps Express app from dist/server.cjs
const { app } = require("../dist/server.cjs");

module.exports = (req, res) => {
  return new Promise((resolve, reject) => {
    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
      originalEnd.apply(res, args);
      resolve();
      return res;
    };
    try {
      app(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
};