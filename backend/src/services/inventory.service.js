const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const StockMovement = require('../models/StockMovement');
const ApiError = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const { escapeRegex, parsePagination, buildPagination, toObjectId } = require('../utils/helpers');

/* ------------------------------------------------------------------ *
 * Stock primitives. All take a Mongo session and use ATOMIC,
 * CONDITIONAL updates: the guard condition lives in the filter, so two
 * concurrent requests can never both pass the same check.
 * ------------------------------------------------------------------ */

async function describeShortage(product, warehouse, needed, label) {
  const [p, w, inv] = await Promise.all([
    Product.findById(product).select('productName SKU'),
    Warehouse.findById(warehouse).select('warehouseName'),
    Inventory.findOne({ product, warehouse }).select('quantity reservedQuantity'),
  ]);
  const available = inv ? inv.quantity - inv.reservedQuantity : 0;
  return ApiError.conflict(
    `${label} for ${p?.productName || 'product'} (${p?.SKU || product}) at ${w?.warehouseName || 'warehouse'}: ` +
      `requested ${needed}, available ${available}`
  );
}

/** Increase stock (creates the inventory row if missing). Returns previous/new quantity. */
async function addStock(session, { product, warehouse, quantity }) {
  const inv = await Inventory.findOneAndUpdate(
    { product, warehouse },
    { $inc: { quantity }, $set: { lastUpdated: new Date() }, $setOnInsert: { reservedQuantity: 0 } },
    { upsert: true, new: true, session, setDefaultsOnInsert: false }
  );
  return { previousQuantity: inv.quantity - quantity, newQuantity: inv.quantity };
}

/** Decrease unreserved stock. Fails (409) instead of going negative or touching reserved units. */
async function removeStock(session, { product, warehouse, quantity }) {
  const inv = await Inventory.findOneAndUpdate(
    {
      product,
      warehouse,
      $expr: { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, quantity] },
    },
    { $inc: { quantity: -quantity }, $set: { lastUpdated: new Date() } },
    { new: true, session }
  );
  if (!inv) throw await describeShortage(product, warehouse, quantity, 'Insufficient stock');
  return { previousQuantity: inv.quantity + quantity, newQuantity: inv.quantity };
}

/** Reserve available units for a confirmed sale. */
async function reserveStock(session, { product, warehouse, quantity }) {
  const inv = await Inventory.findOneAndUpdate(
    {
      product,
      warehouse,
      $expr: { $gte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, quantity] },
    },
    { $inc: { reservedQuantity: quantity }, $set: { lastUpdated: new Date() } },
    { new: true, session }
  );
  if (!inv) throw await describeShortage(product, warehouse, quantity, 'Cannot reserve stock');
  return inv;
}

/** Release a reservation (order cancelled). */
async function releaseStock(session, { product, warehouse, quantity }) {
  const inv = await Inventory.findOneAndUpdate(
    { product, warehouse, reservedQuantity: { $gte: quantity } },
    { $inc: { reservedQuantity: -quantity }, $set: { lastUpdated: new Date() } },
    { new: true, session }
  );
  if (!inv) throw ApiError.conflict('Reservation state is inconsistent; cannot release stock');
  return inv;
}

/** Ship reserved stock: deduct the stock AND the reservation together. */
async function shipReservedStock(session, { product, warehouse, quantity }) {
  const inv = await Inventory.findOneAndUpdate(
    { product, warehouse, reservedQuantity: { $gte: quantity }, quantity: { $gte: quantity } },
    { $inc: { quantity: -quantity, reservedQuantity: -quantity }, $set: { lastUpdated: new Date() } },
    { new: true, session }
  );
  if (!inv) throw ApiError.conflict('Reserved stock is not available to ship');
  return { previousQuantity: inv.quantity + quantity, newQuantity: inv.quantity };
}

/** Append immutable ledger rows. `quantity` is signed (+in / -out). */
async function recordMovements(session, movements) {
  if (!movements.length) return [];
  return StockMovement.create(movements, { session, ordered: true });
}

/** Check (without locking) that every line is currently available; used for draft validation. */
async function assertAvailable(warehouse, items) {
  const rows = await Inventory.find({ warehouse, product: { $in: items.map((i) => i.product) } });
  const byProduct = new Map(rows.map((r) => [String(r.product), r.quantity - r.reservedQuantity]));
  for (const item of items) {
    const available = byProduct.get(String(item.product)) || 0;
    if (available < item.quantity) throw await describeShortage(item.product, warehouse, item.quantity, 'Insufficient stock');
  }
}

/* ------------------------------------------------------------------ *
 * Manual adjustment (transactional: inventory update + ledger entry)
 * ------------------------------------------------------------------ */
async function adjustStock({ product, warehouse, type, quantity, reason }, actor) {
  const [p, w] = await Promise.all([Product.findById(product), Warehouse.findById(warehouse)]);
  if (!p) throw ApiError.notFound('Product not found');
  if (!w) throw ApiError.notFound('Warehouse not found');
  if (w.status !== 'Active') throw ApiError.badRequest('Cannot adjust stock in an inactive warehouse');

  return runInTransaction(async (session) => {
    const signed = type === 'increase' ? quantity : -quantity;
    const result =
      type === 'increase'
        ? await addStock(session, { product, warehouse, quantity })
        : await removeStock(session, { product, warehouse, quantity });

    const [movement] = await recordMovements(session, [
      {
        product,
        warehouse,
        movementType: 'Adjustment',
        quantity: signed,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        remarks: reason,
        performedBy: actor._id,
      },
    ]);
    return { movement, ...result };
  }).then(async (r) => ({
    inventory: await Inventory.findOne({ product, warehouse }).populate('product', 'productName SKU reorderLevel unit').populate('warehouse', 'warehouseName warehouseCode'),
    movement: r.movement,
  }));
}

/* ------------------------------------------------------------------ *
 * Read side: aggregation pipeline with $lookup / $unwind / $addFields / $facet
 * ------------------------------------------------------------------ */
const SORT_FIELDS = {
  productName: 'product.productName',
  SKU: 'product.SKU',
  quantity: 'quantity',
  availableQuantity: 'availableQuantity',
  lastUpdated: 'lastUpdated',
  warehouseName: 'warehouse.warehouseName',
};

function inventoryPipeline(query, extraMatch = {}) {
  const match = { ...extraMatch };
  if (query.warehouse) match.warehouse = toObjectId(query.warehouse);
  if (query.product) match.product = toObjectId(query.product);

  const post = {};
  if (query.category) post['product.category'] = query.category;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    post.$or = [{ 'product.productName': rx }, { 'product.SKU': rx }, { 'warehouse.warehouseName': rx }, { 'product.brand': rx }];
  }

  const statusMatch = {};
  const stockStatus = query.stockStatus || (query.lowStock === true || query.lowStock === 'true' ? 'low-stock' : null);
  if (stockStatus) statusMatch.stockStatus = stockStatus;

  const sortKey = SORT_FIELDS[query.sortBy] || 'lastUpdated';
  const dir = String(query.order).toLowerCase() === 'asc' ? 1 : -1;
  const { page, limit, skip } = parsePagination(query);

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'products', localField: 'product', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $lookup: { from: 'warehouses', localField: 'warehouse', foreignField: '_id', as: 'warehouse' } },
    { $unwind: '$warehouse' },
    ...(Object.keys(post).length ? [{ $match: post }] : []),
    {
      $addFields: {
        availableQuantity: { $subtract: ['$quantity', '$reservedQuantity'] },
        stockStatus: {
          $switch: {
            branches: [
              { case: { $lte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, 0] }, then: 'out-of-stock' },
              { case: { $lte: [{ $subtract: ['$quantity', '$reservedQuantity'] }, '$product.reorderLevel'] }, then: 'low-stock' },
            ],
            default: 'in-stock',
          },
        },
      },
    },
    ...(Object.keys(statusMatch).length ? [{ $match: statusMatch }] : []),
    {
      $project: {
        quantity: 1,
        reservedQuantity: 1,
        availableQuantity: 1,
        stockStatus: 1,
        lastUpdated: 1,
        'product._id': 1,
        'product.productName': 1,
        'product.SKU': 1,
        'product.category': 1,
        'product.brand': 1,
        'product.unit': 1,
        'product.reorderLevel': 1,
        'product.costPrice': 1,
        'warehouse._id': 1,
        'warehouse.warehouseName': 1,
        'warehouse.warehouseCode': 1,
      },
    },
    {
      $facet: {
        data: [{ $sort: { [sortKey]: dir, _id: dir } }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ];
  return { pipeline, page, limit };
}

async function listInventory(query, extraMatch = {}) {
  const { pipeline, page, limit } = inventoryPipeline(query, extraMatch);
  const [result] = await Inventory.aggregate(pipeline);
  const total = result.total[0]?.count || 0;
  return { data: result.data, pagination: buildPagination(total, page, limit) };
}

async function getInventoryById(id) {
  const [row] = (await listInventory({ limit: 1 }, { _id: toObjectId(id) })).data;
  if (!row) throw ApiError.notFound('Inventory record not found');
  return row;
}

async function getByWarehouse(warehouseId, query) {
  const w = await Warehouse.findById(warehouseId);
  if (!w) throw ApiError.notFound('Warehouse not found');
  return { warehouse: w, ...(await listInventory({ ...query, warehouse: warehouseId })) };
}

async function getByProduct(productId, query) {
  const p = await Product.findById(productId);
  if (!p) throw ApiError.notFound('Product not found');
  return { product: p, ...(await listInventory({ ...query, product: productId, limit: query.limit || 100 })) };
}

module.exports = {
  addStock,
  removeStock,
  reserveStock,
  releaseStock,
  shipReservedStock,
  recordMovements,
  assertAvailable,
  adjustStock,
  listInventory,
  getInventoryById,
  getByWarehouse,
  getByProduct,
};
