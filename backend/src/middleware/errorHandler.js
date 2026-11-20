const mongoose = require('mongoose');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { REPLICA_SET_HELP } = require('../config/db');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, _req, res, _next) => {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = errors[0]?.message || 'Validation failed';
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    message = fields.length ? `Duplicate value: ${fields.join(', ')} already exists` : 'Duplicate record';
    errors = fields.map((f) => ({ field: f, message: `${f} already exists` }));
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  } else if (/Transaction numbers are only allowed on a replica set/i.test(err.message || '') || err.code === 20) {
    status = 500;
    message = REPLICA_SET_HELP;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.hasErrorLabel?.('TransientTransactionError')) {
    status = 409;
    message = 'The operation conflicted with a concurrent request. Please retry.';
  }

  if (status >= 500) {
    if (!env.isTest) console.error(err);
    if (env.isProd) message = 'Internal server error';
  }

  res.status(status).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(!env.isProd && status >= 500 && { stack: err.stack }),
  });
};

module.exports = { notFound, errorHandler };
