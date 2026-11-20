const ApiError = require('../utils/ApiError');
const { isObjectId } = require('../utils/helpers');

/** Validates req[source] against a Joi schema; replaces it with the cleaned value. */
const validate =
  (schema, source = 'body') =>
  (req, _res, next) => {
    const { error, value } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const errors = error.details.map((d) => ({ field: d.path.join('.'), message: d.message.replace(/"/g, '') }));
      return next(ApiError.badRequest(errors[0].message, errors));
    }
    req[source] = value;
    next();
  };

const validateObjectId =
  (...params) =>
  (req, _res, next) => {
    for (const p of params) {
      if (!isObjectId(req.params[p])) return next(ApiError.badRequest(`Invalid ${p}`));
    }
    next();
  };

module.exports = { validate, validateObjectId };
