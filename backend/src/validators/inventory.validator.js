const { Joi, objectId } = require('./common');
const { MOVEMENT_TYPES } = require('../utils/constants');

const dateString = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}/).messages({ 'string.pattern.base': '{{#label}} must be a valid date' });

const adjustment = Joi.object({
  product: objectId.required(),
  warehouse: objectId.required(),
  type: Joi.string().valid('increase', 'decrease').required(),
  quantity: Joi.number().integer().min(1).required(),
  reason: Joi.string().trim().min(3).max(300).required().messages({
    'string.empty': 'An adjustment reason is required',
    'any.required': 'An adjustment reason is required',
    'string.min': 'Please give a meaningful adjustment reason',
  }),
});

const inventoryQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string().valid('productName', 'SKU', 'quantity', 'availableQuantity', 'lastUpdated', 'warehouseName'),
  order: Joi.string().valid('asc', 'desc'),
  warehouse: objectId,
  product: objectId,
  category: Joi.string().trim().max(80),
  stockStatus: Joi.string().valid('in-stock', 'low-stock', 'out-of-stock'),
  lowStock: Joi.boolean(),
}).unknown(false);

const movementQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string().valid('createdAt', 'quantity'),
  order: Joi.string().valid('asc', 'desc'),
  product: objectId,
  warehouse: objectId,
  movementType: Joi.string().valid(...MOVEMENT_TYPES),
  referenceOrder: objectId,
  from: dateString,
  to: dateString,
}).unknown(false);

module.exports = { adjustment, inventoryQuery, movementQuery };
