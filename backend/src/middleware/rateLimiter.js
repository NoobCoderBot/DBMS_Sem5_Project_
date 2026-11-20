const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, message },
  });

const apiLimiter = make(15 * 60 * 1000, 1000, 'Too many requests, please try again later');
const authLimiter = make(15 * 60 * 1000, 30, 'Too many authentication attempts, please try again later');

module.exports = { apiLimiter, authLimiter };
