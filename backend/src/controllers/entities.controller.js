const Product = require('../models/Product');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Warehouse = require('../models/Warehouse');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { asyncHandler, ok } = require('../utils/helpers');
const { createCrudController } = require('./crud.factory');

const blockIfReferenced = async (checks, label) => {
  for (const [name, promise] of checks) {
    if (await promise) {
      throw ApiError.conflict(
        `Cannot delete this ${label}: it is referenced by ${name}. Deactivate it instead to keep history intact.`
      );
    }
  }
};

/* ------------------------------ Products ------------------------------ */
const productCtrl = createCrudController({
  Model: Product,
  label: 'Product',
  searchFields: ['productName', 'SKU', 'brand', 'barcode'],
  filterFields: ['category', 'status', 'brand'],
  sortFields: ['productName', 'SKU', 'sellingPrice', 'costPrice', 'category', 'createdAt'],
  defaultSort: { createdAt: -1 },
  // attach total stock across warehouses to each listed product
  decorateList: async (products) => {
    const totals = await Inventory.aggregate([
      { $match: { product: { $in: products.map((p) => p._id) } } },
      { $group: { _id: '$product', totalQuantity: { $sum: '$quantity' }, reserved: { $sum: '$reservedQuantity' } } },
    ]);
    const map = new Map(totals.map((t) => [String(t._id), t]));
    return products.map((p) => ({
      ...p,
      totalQuantity: map.get(String(p._id))?.totalQuantity || 0,
      reservedQuantity: map.get(String(p._id))?.reserved || 0,
    }));
  },
  // product detail shows stock per warehouse (Product <-> Warehouse many-to-many via Inventory)
  decorateOne: async (product) => {
    const stock = await Inventory.find({ product: product._id }).populate('warehouse', 'warehouseName warehouseCode');
    return {
      ...product,
      stock: stock.map((s) => s.toJSON()),
      totalQuantity: stock.reduce((sum, s) => sum + s.quantity, 0),
    };
  },
  beforeDelete: async (doc) => {
    await blockIfReferenced(
      [
        ['purchase/sales/transfer orders', Order.exists({ 'items.product': doc._id })],
        ['stock movement history', StockMovement.exists({ product: doc._id })],
        ['existing stock', Inventory.exists({ product: doc._id, quantity: { $gt: 0 } })],
      ],
      'product'
    );
  },
  afterDelete: (doc) => Inventory.deleteMany({ product: doc._id }),
});

// distinct category values (categories are plain strings on Product, there is no Category model)
productCtrl.categories = asyncHandler(async (_req, res) => {
  const categories = await Product.distinct('category');
  return ok(res, categories.sort((a, b) => a.localeCompare(b)));
});

/* ------------------------------ Suppliers ------------------------------ */
const supplierCtrl = createCrudController({
  Model: Supplier,
  label: 'Supplier',
  searchFields: ['supplierName', 'contactPerson', 'email', 'phone', 'GSTIN'],
  filterFields: ['status'],
  sortFields: ['supplierName', 'createdAt'],
  decorateOne: async (s) => ({
    ...s,
    orderCount: await Order.countDocuments({ supplier: s._id }),
  }),
  beforeDelete: (doc) => blockIfReferenced([['purchase orders', Order.exists({ supplier: doc._id })]], 'supplier'),
});

/* ------------------------------ Customers ------------------------------ */
const customerCtrl = createCrudController({
  Model: Customer,
  label: 'Customer',
  searchFields: ['customerName', 'email', 'phone', 'GSTIN'],
  filterFields: ['status'],
  sortFields: ['customerName', 'createdAt'],
  decorateOne: async (c) => ({
    ...c,
    orderCount: await Order.countDocuments({ customer: c._id }),
  }),
  beforeDelete: (doc) => blockIfReferenced([['sales orders', Order.exists({ customer: doc._id })]], 'customer'),
});

/* ------------------------------ Warehouses ------------------------------ */
const withStockTotals = async (warehouses) => {
  const totals = await Inventory.aggregate([
    { $match: { warehouse: { $in: warehouses.map((w) => w._id) } } },
    {
      $group: {
        _id: '$warehouse',
        productCount: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
        totalStock: { $sum: '$quantity' },
        reserved: { $sum: '$reservedQuantity' },
      },
    },
  ]);
  const map = new Map(totals.map((t) => [String(t._id), t]));
  return warehouses.map((w) => ({
    ...w,
    productCount: map.get(String(w._id))?.productCount || 0,
    totalStock: map.get(String(w._id))?.totalStock || 0,
    reservedStock: map.get(String(w._id))?.reserved || 0,
  }));
};

const warehouseCtrl = createCrudController({
  Model: Warehouse,
  label: 'Warehouse',
  searchFields: ['warehouseName', 'warehouseCode', 'location'],
  filterFields: ['status'],
  sortFields: ['warehouseName', 'warehouseCode', 'createdAt'],
  populate: { path: 'manager', select: 'name email role' },
  decorateList: withStockTotals,
  decorateOne: async (w) => (await withStockTotals([w]))[0],
  beforeSave: async (data) => {
    if (!data.manager) {
      data.manager = null;
      return;
    }
    const manager = await User.findById(data.manager);
    if (!manager || manager.status !== 'Active') throw ApiError.badRequest('Manager must be an active user');
    if (manager.role === ROLES.STAFF) throw ApiError.badRequest('Manager must be an Admin or Inventory Manager');
  },
  beforeDelete: async (doc) => {
    await blockIfReferenced(
      [
        ['orders', Order.exists({ $or: [{ sourceWarehouse: doc._id }, { destinationWarehouse: doc._id }] })],
        ['stock movement history', StockMovement.exists({ warehouse: doc._id })],
        ['existing stock', Inventory.exists({ warehouse: doc._id, quantity: { $gt: 0 } })],
        ['assigned users', User.exists({ assignedWarehouse: doc._id })],
      ],
      'warehouse'
    );
  },
  afterDelete: (doc) => Inventory.deleteMany({ warehouse: doc._id }),
});

/* ------------------------------ Users (Admin) ------------------------------ */
const userCtrl = createCrudController({
  Model: User,
  label: 'User',
  searchFields: ['name', 'email'],
  filterFields: ['role', 'status'],
  sortFields: ['name', 'email', 'role', 'createdAt'],
  populate: { path: 'assignedWarehouse', select: 'warehouseName warehouseCode' },
  beforeSave: async (data, { req, doc }) => {
    if (data.assignedWarehouse === '') data.assignedWarehouse = null;
    if (data.assignedWarehouse && !(await Warehouse.exists({ _id: data.assignedWarehouse }))) {
      throw ApiError.badRequest('Assigned warehouse not found');
    }
    if (doc && String(doc._id) === String(req.user._id)) {
      if (data.status === 'Inactive') throw ApiError.badRequest('You cannot deactivate your own account');
      if (data.role && data.role !== doc.role) throw ApiError.badRequest('You cannot change your own role');
    }
  },
  beforeDelete: async (doc, { req }) => {
    if (String(doc._id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete your own account');
    await blockIfReferenced(
      [
        ['orders they created', Order.exists({ createdBy: doc._id })],
        ['stock movement history', StockMovement.exists({ performedBy: doc._id })],
        ['warehouses they manage', Warehouse.exists({ manager: doc._id })],
      ],
      'user'
    );
  },
});

module.exports = { productCtrl, supplierCtrl, customerCtrl, warehouseCtrl, userCtrl };
