const Joi = require('joi');

const objectId = Joi.string().hex().length(24).messages({
  'string.hex': '{{#label}} must be a valid id',
  'string.length': '{{#label}} must be a valid id',
});

const optionalString = (max = 300) => Joi.string().trim().max(max).allow('', null);

const status = Joi.string().valid('Active', 'Inactive');

const email = Joi.string().trim().lowercase().email({ tlds: { allow: false } });

const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[A-Za-z]/, 'letter')
  .pattern(/\d/, 'digit')
  .messages({
    'string.pattern.name': 'Password must contain at least one letter and one number',
  });

const gstin = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
  .allow('', null)
  .messages({ 'string.pattern.base': 'GSTIN must be a valid 15-character GST number' });

/** Turns a create-schema into a partial-update schema (every key optional, at least one key). */
const asPatch = (schema) => schema.fork(Object.keys(schema.describe().keys), (f) => f.optional()).min(1);

/** Common list query params. Unknown keys are kept so each resource can add its own filters. */
const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string().max(40),
  order: Joi.string().valid('asc', 'desc'),
}).unknown(true);

module.exports = { Joi, objectId, optionalString, status, email, password, gstin, asPatch, listQuery };
