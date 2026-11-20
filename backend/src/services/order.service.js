const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { INITIAL_STATUS, EDITABLE_STATUSES, ORDER_ROLES, ROLES } = require('../utils/constants');
const { runInTransaction } = require('../utils/transaction');
const { assertAvailable } = require('./inventory.service');
const {
  escapeRegex,
  parsePagination,
  buildPagination,
  parseSort,
  parseDateRange,
} = require('../utils/helpers');

const PREFIX = { purchase: 'PO', sale: 'SO', transfer: 'TR' };

const POPULATE = [
  { path: 'supplier', select: 'supplierName contactPerson email phone' },
  { path: 'customer', select: 'customerName email phone' },
  { path: 'sourceWarehouse', select: 'warehouseName warehouseCode' },
  { path: 'destinationWarehouse', select: 'warehouseName warehouseCode' },
  { path: 'items.product', select: 'productName SKU unit category' },
  { path: 'createdBy', select: 'name email role' },
];

const generateOrderNumber = (type) => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `${PREFIX[type]}-${stamp}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

/** Role gate per order type (sales: any role; purchases & transfers: Admin / Inventory Manager). */
function assertCanManage(user, orderType) {
  if (!ORDER_ROLES[orderType].includes(user.role)) {
    throw ApiError.forbidden(`Role "${user.role}" cannot manage ${orderType} orders`);
  }
}

/** Validate that referenced parties exist and are active; enforce transfer rules. */
async function validateParties(payload) {
  const { orderType, supplier, customer, sourceWarehouse, destinationWarehouse } = payload;
  const checks = [];
  const need = (promise, label) => checks.push(promise.then((doc) => {
    if (!doc) throw ApiError.badRequest(`${label} not found`);
    if (doc.status && doc.status !== 'Active') throw ApiError.badRequest(`${label} is inactive`);
  }));

  if (orderType === 'purchase') {
    need(Supplier.findById(supplier), 'Supplier');
    need(Warehouse.findById(destinationWarehouse), 'Destination warehouse');
  } else if (orderType === 'sale') {
    need(Customer.findById(customer), 'Customer');
    need(Warehouse.findById(sourceWarehouse), 'Source warehouse');
  } else {
    if (String(sourceWarehouse) === String(destinationWarehouse)) {
      throw ApiError.badRequest('Source and destination warehouses must differ');
    }
    need(Warehouse.findById(sourceWarehouse), 'Source warehouse');
    need(Warehouse.findById(destinationWarehouse), 'Destination warehouse');
  }
  await Promise.all(checks);
}

/** Resolve product lines: reject duplicates/inactive products and default the unit price. */
async function buildItems(rawItems, orderType) {
  const ids = rawItems.map((i) => String(i.product));
  if (new Set(ids).size !== ids.length) throw ApiError.badRequest('The same product appears on more than one line');

  const products = await Product.find({ _id: { $in: ids } });
  const map = new Map(products.map((p) => [String(p._id), p]));
  return rawItems.map((i) => {
    const p = map.get(String(i.product));
    if (!p) throw ApiError.badRequest('One or more products do not exist');
    if (p.status !== 'Active') throw ApiError.badRequest(`Product ${p.SKU} is inactive`);
    const defaultPrice = orderType === 'sale' ? p.sellingPrice : p.costPrice;
    return { product: p._id, quantity: i.quantity, unitPrice: i.unitPrice ?? defaultPrice, receivedQuantity: 0 };
  });
}

const assignablePayload = (payload) => ({
  supplier: payload.supplier || null,
  customer: payload.customer || null,
  sourceWarehouse: payload.sourceWarehouse || null,
  destinationWarehouse: payload.destinationWarehouse || null,
  tax: payload.tax || 0,
  discount: payload.discount || 0,
  orderDate: payload.orderDate || new Date(),
  expectedDeliveryDate: payload.expectedDeliveryDate || null,
  notes: payload.notes || '',
});

async function createOrder(payload, actor) {
  const { orderType } = payload;
  assertCanManage(actor, orderType);
  await validateParties(payload);
  const items = await buildItems(payload.items, orderType);
  if (orderType === 'sale') await assertAvailable(payload.sourceWarehouse, items);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const order = await Order.create({
        ...assignablePayload(payload),
        orderNumber: generateOrderNumber(orderType),
        orderType,
        items,
        status: INITIAL_STATUS[orderType],
        createdBy: actor._id,
      });
      return getOrder(order._id, actor);
    } catch (err) {
      const isNumberClash = err.code === 11000 && err.keyPattern?.orderNumber;
      if (!isNumberClash || attempt === 4) throw err;
    }
  }
  return null;
}

/** Staff may only see sales orders; everyone else sees everything. */
function visibleTypes(user) {
  return user.role === ROLES.STAFF ? ['sale'] : null;
}

async function getOrder(id, actor) {
  const order = await Order.findById(id).populate(POPULATE);
  if (!order) throw ApiError.notFound('Order not found');
  if (actor) {
    const types = visibleTypes(actor);
    if (types && !types.includes(order.orderType)) throw ApiError.forbidden('You cannot access this order');
  }
  return order;
}

async function listOrders(query, actor) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  const types = visibleTypes(actor);
  if (types) {
    if (query.orderType && !types.includes(query.orderType)) throw ApiError.forbidden('You cannot access these orders');
    filter.orderType = types[0];
  } else if (query.orderType) {
    filter.orderType = query.orderType;
  }

  if (query.status) filter.status = query.status;
  if (query.supplier) filter.supplier = query.supplier;
  if (query.customer) filter.customer = query.customer;
  if (query.warehouse) filter.$and = [{ $or: [{ sourceWarehouse: query.warehouse }, { destinationWarehouse: query.warehouse }] }];
  const range = parseDateRange(query);
  if (range) filter.orderDate = range;

  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    const [suppliers, customers, warehouses] = await Promise.all([
      Supplier.find({ supplierName: rx }).select('_id'),
      Customer.find({ customerName: rx }).select('_id'),
      Warehouse.find({ $or: [{ warehouseName: rx }, { warehouseCode: rx }] }).select('_id'),
    ]);
    const wIds = warehouses.map((w) => w._id);
    const or = [
      { orderNumber: rx },
      { supplier: { $in: suppliers.map((s) => s._id) } },
      { customer: { $in: customers.map((c) => c._id) } },
      { sourceWarehouse: { $in: wIds } },
      { destinationWarehouse: { $in: wIds } },
    ];
    filter.$and = [...(filter.$and || []), { $or: or }];
  }

  const sort = parseSort(query, ['orderDate', 'grandTotal', 'orderNumber', 'createdAt', 'status'], { orderDate: -1 });
  const [data, total] = await Promise.all([
    Order.find(filter).sort(sort).skip(skip).limit(limit).populate(POPULATE),
    Order.countDocuments(filter),
  ]);
  return { data, pagination: buildPagination(total, page, limit) };
}

async function updateOrder(id, payload, actor) {
  await runInTransaction(async (session) => {
    const order = await Order.findById(id).session(session);
    if (!order) throw ApiError.notFound('Order not found');
    assertCanManage(actor, order.orderType);
    if (payload.orderType !== order.orderType) throw ApiError.badRequest('Order type cannot be changed');
    if (!EDITABLE_STATUSES[order.orderType].includes(order.status)) {
      throw ApiError.conflict(`Orders in "${order.status}" status can no longer be edited`);
    }
    await validateParties(payload);
    const items = await buildItems(payload.items, order.orderType);
    if (order.orderType === 'sale') await assertAvailable(payload.sourceWarehouse, items);

    order.set({ ...assignablePayload(payload), items });
    await order.save({ session });
  });
  return getOrder(id, actor);
}

/** Delete only orders that never touched stock (Draft / Pending, or Cancelled without ledger entries). */
async function deleteOrder(id, actor) {
  const order = await Order.findById(id);
  if (!order) throw ApiError.notFound('Order not found');
  assertCanManage(actor, order.orderType);
  const deletable = EDITABLE_STATUSES[order.orderType].includes(order.status) || order.status === 'Cancelled';
  if (!deletable) throw ApiError.conflict(`Orders in "${order.status}" status cannot be deleted; cancel them instead`);
  if (await StockMovement.exists({ referenceOrder: order._id })) {
    throw ApiError.conflict('This order has stock movements and must be kept for audit history');
  }
  const res = await Order.deleteOne({ _id: id, status: order.status });
  if (!res.deletedCount) throw ApiError.conflict('Order changed state while deleting; please retry');
}

module.exports = { POPULATE, assertCanManage, createOrder, getOrder, listOrders, updateOrder, deleteOrder };
