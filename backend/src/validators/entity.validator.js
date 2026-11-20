const { Joi, objectId, optionalString, status, email, password, gstin, asPatch } = require('./common');
const { ROLE_LIST, PRODUCT_UNITS } = require('../utils/constants');

const product = Joi.object({
  productName: Joi.string().trim().min(2).max(150).required(),
  SKU: Joi.string().trim().uppercase().min(2).max(50).required(),
  description: optionalString(1000),
  category: Joi.string().trim().min(2).max(80).required(),
  brand: optionalString(80),
  unit: Joi.string().valid(...PRODUCT_UNITS),
  costPrice: Joi.number().min(0).required(),
  sellingPrice: Joi.number().min(0).required(),
  reorderLevel: Joi.number().integer().min(0),
  barcode: optionalString(50),
  status,
});

const supplier = Joi.object({
  supplierName: Joi.string().trim().min(2).max(150).required(),
  contactPerson: optionalString(100),
  email: email.allow('', null),
  phone: Joi.string().trim().pattern(/^[0-9+\-\s()]{6,20}$/).allow('', null).messages({ 'string.pattern.base': 'Invalid phone number' }),
  address: optionalString(300),
  GSTIN: gstin,
  status,
});

const customer = Joi.object({
  customerName: Joi.string().trim().min(2).max(150).required(),
  email: email.allow('', null),
  phone: Joi.string().trim().pattern(/^[0-9+\-\s()]{6,20}$/).allow('', null).messages({ 'string.pattern.base': 'Invalid phone number' }),
  address: optionalString(300),
  GSTIN: gstin,
  status,
});

const warehouse = Joi.object({
  warehouseName: Joi.string().trim().min(2).max(120).required(),
  warehouseCode: Joi.string().trim().uppercase().min(2).max(20).required(),
  location: optionalString(120),
  address: optionalString(300),
  manager: objectId.allow(null, ''),
  contactNumber: Joi.string().trim().pattern(/^[0-9+\-\s()]{6,20}$/).allow('', null).messages({ 'string.pattern.base': 'Invalid contact number' }),
  status,
});

const user = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  email: email.required(),
  password: password.required(),
  role: Joi.string().valid(...ROLE_LIST),
  status,
  assignedWarehouse: objectId.allow(null, ''),
});
// On update the password is optional (only re-hashed when provided).
const userUpdate = asPatch(user);

module.exports = {
  product: { create: product, update: asPatch(product) },
  supplier: { create: supplier, update: asPatch(supplier) },
  customer: { create: customer, update: asPatch(customer) },
  warehouse: { create: warehouse, update: asPatch(warehouse) },
  user: { create: user, update: userUpdate },
};
