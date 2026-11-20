const { Joi, objectId, optionalString } = require('./common');
const { ORDER_TYPES } = require('../utils/constants');

// kept as plain strings (YYYY-MM-DD or ISO) so day-inclusive range logic in the services still works
const dateString = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}/).messages({ 'string.pattern.base': '{{#label}} must be a valid date' });

const item = Joi.object({
  product: objectId.required(),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().min(0),
});

// Which parties each order type requires / forbids.
const parties = {
  supplier: Joi.when('orderType', { is: 'purchase', then: objectId.required(), otherwise: Joi.forbidden() }),
  customer: Joi.when('orderType', { is: 'sale', then: objectId.required(), otherwise: Joi.forbidden() }),
  sourceWarehouse: Joi.when('orderType', { is: Joi.valid('sale', 'transfer'), then: objectId.required(), otherwise: Joi.forbidden() }),
  destinationWarehouse: Joi.when('orderType', { is: Joi.valid('purchase', 'transfer'), then: objectId.required(), otherwise: Joi.forbidden() }),
};

const base = {
  items: Joi.array().items(item).min(1).required(),
  tax: Joi.number().min(0).default(0),
  discount: Joi.number().min(0).default(0),
  orderDate: Joi.date().iso(),
  expectedDeliveryDate: Joi.date().iso().allow(null, ''),
  notes: optionalString(1000),
};

const create = Joi.object({
  orderType: Joi.string().valid(...ORDER_TYPES).required(),
  ...parties,
  ...base,
});

// orderType is fixed once created; the client must resend it so conditional rules still apply.
const update = Joi.object({
  orderType: Joi.string().valid(...ORDER_TYPES).required(),
  ...parties,
  ...base,
});

const receive = Joi.object({
  items: Joi.array()
    .items(Joi.object({ itemId: objectId.required(), quantity: Joi.number().integer().min(1).required() }))
    .min(1)
    .required(),
  remarks: optionalString(300),
});

const remarks = Joi.object({ remarks: optionalString(300) });

const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string().valid('orderDate', 'grandTotal', 'orderNumber', 'createdAt', 'status'),
  order: Joi.string().valid('asc', 'desc'),
  orderType: Joi.string().valid(...ORDER_TYPES),
  status: Joi.string().max(30),
  supplier: objectId,
  customer: objectId,
  warehouse: objectId,
  from: dateString,
  to: dateString,
}).unknown(false);

module.exports = { create, update, receive, remarks, listQuery };
