const inventoryService = require('../services/inventory.service');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const {
  asyncHandler,
  ok,
  created,
  escapeRegex,
  parsePagination,
  buildPagination,
  parseSort,
  parseDateRange,
} = require('../utils/helpers');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');

const list = asyncHandler(async (req, res) => {
  const { data, pagination } = await inventoryService.listInventory(req.query);
  return ok(res, data, undefined, 200, { pagination });
});

const getOne = asyncHandler(async (req, res) => ok(res, await inventoryService.getInventoryById(req.params.id)));

const byWarehouse = asyncHandler(async (req, res) => {
  const { warehouse, data, pagination } = await inventoryService.getByWarehouse(req.params.warehouseId, req.query);
  return ok(res, data, undefined, 200, { pagination, warehouse });
});

const byProduct = asyncHandler(async (req, res) => {
  const { product, data, pagination } = await inventoryService.getByProduct(req.params.productId, req.query);
  return ok(res, data, undefined, 200, { pagination, product });
});

const adjust = asyncHandler(async (req, res) => {
  const result = await inventoryService.adjustStock(req.body, req.user);
  return created(res, result, 'Stock adjusted');
});

/* --------------------------- Stock movements (read-only) --------------------------- */
const MOVEMENT_POPULATE = [
  { path: 'product', select: 'productName SKU unit' },
  { path: 'warehouse', select: 'warehouseName warehouseCode' },
  { path: 'referenceOrder', select: 'orderNumber orderType status' },
  { path: 'performedBy', select: 'name email' },
];

const listMovements = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  ['product', 'warehouse', 'movementType', 'referenceOrder'].forEach((f) => {
    if (req.query[f]) filter[f] = req.query[f];
  });
  const range = parseDateRange(req.query);
  if (range) filter.createdAt = range;

  if (req.query.search) {
    const rx = new RegExp(escapeRegex(req.query.search), 'i');
    const products = await Product.find({ $or: [{ productName: rx }, { SKU: rx }] }).select('_id');
    const warehouses = await Warehouse.find({ warehouseName: rx }).select('_id');
    filter.$or = [
      { product: { $in: products.map((p) => p._id) } },
      { warehouse: { $in: warehouses.map((w) => w._id) } },
      { remarks: rx },
    ];
  }

  const sort = parseSort(req.query, ['createdAt', 'quantity'], { createdAt: -1 });
  const [data, total] = await Promise.all([
    StockMovement.find(filter).sort(sort).skip(skip).limit(limit).populate(MOVEMENT_POPULATE),
    StockMovement.countDocuments(filter),
  ]);
  return ok(res, data, undefined, 200, { pagination: buildPagination(total, page, limit) });
});

const getMovement = asyncHandler(async (req, res) => {
  const movement = await StockMovement.findById(req.params.id).populate(MOVEMENT_POPULATE);
  if (!movement) throw ApiError.notFound('Stock movement not found');
  return ok(res, movement);
});

module.exports = { list, getOne, byWarehouse, byProduct, adjust, listMovements, getMovement };
