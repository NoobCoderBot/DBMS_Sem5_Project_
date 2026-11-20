const Product = require('../models/Product');
const Warehouse = require('../models/Warehouse');
const Supplier = require('../models/Supplier');
const Customer = require('../models/Customer');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const StockMovement = require('../models/StockMovement');
const { COUNTED_STATUSES, PENDING_STATUSES } = require('../utils/constants');
const { parseDateRange, parsePagination, buildPagination, escapeRegex, toObjectId, round2 } = require('../utils/helpers');

const col = (Model) => Model.collection.name;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- shared pipeline fragments ---------- */
const lookupProduct = [
  { $lookup: { from: col(Product), localField: 'product', foreignField: '_id', as: 'product' } },
  { $unwind: '$product' },
];
const lookupWarehouse = [
  { $lookup: { from: col(Warehouse), localField: 'warehouse', foreignField: '_id', as: 'warehouse' } },
  { $unwind: '$warehouse' },
];

/**
 * 3. Low-stock products. Product-level: total quantity across ALL warehouses <= reorderLevel.
 * Starts from Product so products with no inventory rows (zero stock) are included.
 */
function lowStockPipeline({ category, search } = {}) {
  const match = { status: 'Active' };
  if (category) match.category = category;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    match.$or = [{ productName: rx }, { SKU: rx }];
  }
  return [
    { $match: match },
    { $lookup: { from: col(Inventory), localField: '_id', foreignField: 'product', as: 'stock' } },
    {
      $addFields: {
        totalQuantity: { $sum: '$stock.quantity' },
        reservedQuantity: { $sum: '$stock.reservedQuantity' },
      },
    },
    { $match: { $expr: { $lte: ['$totalQuantity', '$reorderLevel'] } } },
    {
      $project: {
        productName: 1,
        SKU: 1,
        category: 1,
        unit: 1,
        reorderLevel: 1,
        totalQuantity: 1,
        reservedQuantity: 1,
        shortfall: { $subtract: ['$reorderLevel', '$totalQuantity'] },
      },
    },
    { $sort: { shortfall: -1, productName: 1 } },
  ];
}

/** 4 & 5. Monthly purchase / sales totals (last N months, gaps filled with zero). */
async function monthlyTotals(orderType, months = 12) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await Order.aggregate([
    { $match: { orderType, status: { $in: COUNTED_STATUSES[orderType] }, orderDate: { $gte: start } } },
    {
      $group: {
        _id: { y: { $year: '$orderDate' }, m: { $month: '$orderDate' } },
        total: { $sum: '$grandTotal' },
        orders: { $sum: 1 },
      },
    },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);
  const byKey = new Map(rows.map((r) => [`${r._id.y}-${r._id.m}`, r]));
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    const hit = byKey.get(`${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`);
    return {
      month: `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
      total: round2(hit?.total || 0),
      orders: hit?.orders || 0,
    };
  });
}

/** 1. Total inventory per warehouse. */
const warehouseTotalsPipeline = () => [
  {
    $group: {
      _id: '$warehouse',
      totalUnits: { $sum: '$quantity' },
      reservedUnits: { $sum: '$reservedQuantity' },
      productCount: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
    },
  },
  { $lookup: { from: col(Warehouse), localField: '_id', foreignField: '_id', as: 'warehouse' } },
  { $unwind: '$warehouse' },
  {
    $project: {
      _id: 1,
      warehouseName: '$warehouse.warehouseName',
      warehouseCode: '$warehouse.warehouseCode',
      location: '$warehouse.location',
      totalUnits: 1,
      reservedUnits: 1,
      availableUnits: { $subtract: ['$totalUnits', '$reservedUnits'] },
      productCount: 1,
    },
  },
  { $sort: { totalUnits: -1 } },
];

/** 6. Category-wise inventory. */
const categoryTotalsPipeline = () => [
  ...lookupProduct,
  {
    $group: {
      _id: '$product.category',
      totalUnits: { $sum: '$quantity' },
      productIds: { $addToSet: '$product._id' },
      costValue: { $sum: { $multiply: ['$quantity', '$product.costPrice'] } },
      retailValue: { $sum: { $multiply: ['$quantity', '$product.sellingPrice'] } },
    },
  },
  {
    $project: {
      _id: 0,
      category: '$_id',
      totalUnits: 1,
      productCount: { $size: '$productIds' },
      costValue: { $round: ['$costValue', 2] },
      retailValue: { $round: ['$retailValue', 2] },
    },
  },
  { $sort: { totalUnits: -1 } },
];

/* ------------------------------------------------------------------ *
 * Dashboard (all figures computed in MongoDB, none hard-coded)
 * ------------------------------------------------------------------ */
async function dashboard() {
  const [
    totalProducts,
    totalWarehouses,
    [invTotals],
    lowStockAll,
    pendingPurchases,
    pendingSales,
    monthlyPurchases,
    monthlySales,
    warehouseStock,
    categoryStock,
    recentMovements,
    recentOrders,
  ] = await Promise.all([
    Product.countDocuments({ status: 'Active' }),
    Warehouse.countDocuments({ status: 'Active' }),
    Inventory.aggregate([
      ...lookupProduct,
      {
        $group: {
          _id: null,
          units: { $sum: '$quantity' },
          value: { $sum: { $multiply: ['$quantity', '$product.costPrice'] } },
        },
      },
    ]),
    Product.aggregate([...lowStockPipeline(), { $limit: 50 }]),
    Order.countDocuments({ orderType: 'purchase', status: { $in: PENDING_STATUSES.purchase } }),
    Order.countDocuments({ orderType: 'sale', status: { $in: PENDING_STATUSES.sale } }),
    monthlyTotals('purchase'),
    monthlyTotals('sale'),
    Inventory.aggregate(warehouseTotalsPipeline()),
    Inventory.aggregate(categoryTotalsPipeline()),
    StockMovement.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('product', 'productName SKU')
      .populate('warehouse', 'warehouseName')
      .populate('performedBy', 'name'),
    Order.find()
      .sort({ createdAt: -1 })
      .limit(8)
      .populate('supplier', 'supplierName')
      .populate('customer', 'customerName')
      .populate('sourceWarehouse', 'warehouseName')
      .populate('destinationWarehouse', 'warehouseName'),
  ]);

  return {
    stats: {
      totalProducts,
      totalWarehouses,
      totalInventoryUnits: invTotals?.units || 0,
      inventoryValue: round2(invTotals?.value || 0),
      lowStockProducts: lowStockAll.length,
      pendingPurchaseOrders: pendingPurchases,
      pendingSalesOrders: pendingSales,
    },
    charts: {
      monthlyPurchases,
      monthlySales,
      warehouseStock: warehouseStock.map((w) => ({ name: w.warehouseName, units: w.totalUnits })),
      categoryStock: categoryStock.map((c) => ({ name: c.category, units: c.totalUnits })),
    },
    tables: {
      recentMovements,
      recentOrders,
      lowStock: lowStockAll.slice(0, 8),
    },
  };
}

/* 2. Product-wise stock across warehouses (paginated) */
async function inventoryReport(query) {
  const { page, limit, skip } = parsePagination(query, 20);
  const match = {};
  if (query.warehouse) match.warehouse = toObjectId(query.warehouse);
  const post = {};
  if (query.category) post['product.category'] = query.category;
  if (query.search) {
    const rx = new RegExp(escapeRegex(query.search), 'i');
    post.$or = [{ 'product.productName': rx }, { 'product.SKU': rx }];
  }

  const [res] = await Inventory.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$product',
        totalQuantity: { $sum: '$quantity' },
        reservedQuantity: { $sum: '$reservedQuantity' },
        rows: { $push: { warehouse: '$warehouse', quantity: '$quantity', reservedQuantity: '$reservedQuantity' } },
      },
    },
    { $lookup: { from: col(Product), localField: '_id', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    ...(Object.keys(post).length ? [{ $match: post }] : []),
    { $lookup: { from: col(Warehouse), localField: 'rows.warehouse', foreignField: '_id', as: 'whDocs' } },
    {
      $project: {
        _id: 1,
        productName: '$product.productName',
        SKU: '$product.SKU',
        category: '$product.category',
        unit: '$product.unit',
        reorderLevel: '$product.reorderLevel',
        totalQuantity: 1,
        reservedQuantity: 1,
        availableQuantity: { $subtract: ['$totalQuantity', '$reservedQuantity'] },
        warehouses: {
          $map: {
            input: '$rows',
            as: 'r',
            in: {
              warehouseName: {
                $arrayElemAt: [
                  { $map: { input: { $filter: { input: '$whDocs', as: 'd', cond: { $eq: ['$$d._id', '$$r.warehouse'] } } }, as: 'x', in: '$$x.warehouseName' } },
                  0,
                ],
              },
              quantity: '$$r.quantity',
              reservedQuantity: '$$r.reservedQuantity',
            },
          },
        },
      },
    },
    {
      $facet: {
        data: [{ $sort: { productName: 1 } }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
        totals: [{ $group: { _id: null, units: { $sum: '$totalQuantity' }, products: { $sum: 1 } } }],
      },
    },
  ]);
  return {
    rows: res.data,
    summary: { totalUnits: res.totals[0]?.units || 0, totalProducts: res.totals[0]?.products || 0 },
    pagination: buildPagination(res.total[0]?.count || 0, page, limit),
  };
}

async function lowStockReport(query) {
  const { page, limit, skip } = parsePagination(query, 20);
  const [res] = await Product.aggregate([
    ...lowStockPipeline({ category: query.category, search: query.search }),
    { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: 'count' }] } },
  ]);
  return { rows: res.data, pagination: buildPagination(res.total[0]?.count || 0, page, limit) };
}

async function warehouseReport() {
  const detailed = await Inventory.aggregate([
    ...lookupProduct,
    {
      $group: {
        _id: '$warehouse',
        totalUnits: { $sum: '$quantity' },
        reservedUnits: { $sum: '$reservedQuantity' },
        productCount: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, 1, 0] } },
        costValue: { $sum: { $multiply: ['$quantity', '$product.costPrice'] } },
      },
    },
    { $lookup: { from: col(Warehouse), localField: '_id', foreignField: '_id', as: 'warehouse' } },
    { $unwind: '$warehouse' },
    {
      $project: {
        warehouseName: '$warehouse.warehouseName',
        warehouseCode: '$warehouse.warehouseCode',
        location: '$warehouse.location',
        status: '$warehouse.status',
        totalUnits: 1,
        reservedUnits: 1,
        availableUnits: { $subtract: ['$totalUnits', '$reservedUnits'] },
        productCount: 1,
        costValue: { $round: ['$costValue', 2] },
      },
    },
    { $sort: { totalUnits: -1 } },
  ]);
  return { rows: detailed, summary: { totalUnits: detailed.reduce((s, r) => s + r.totalUnits, 0) } };
}

/** 7. Inventory valuation (cost vs. retail) by warehouse, category and product. */
async function valuationReport() {
  const [res] = await Inventory.aggregate([
    ...lookupProduct,
    ...lookupWarehouse,
    {
      $addFields: {
        costValue: { $multiply: ['$quantity', '$product.costPrice'] },
        retailValue: { $multiply: ['$quantity', '$product.sellingPrice'] },
      },
    },
    {
      $facet: {
        totals: [
          { $group: { _id: null, units: { $sum: '$quantity' }, costValue: { $sum: '$costValue' }, retailValue: { $sum: '$retailValue' } } },
        ],
        byWarehouse: [
          {
            $group: {
              _id: '$warehouse._id',
              name: { $first: '$warehouse.warehouseName' },
              units: { $sum: '$quantity' },
              costValue: { $sum: '$costValue' },
              retailValue: { $sum: '$retailValue' },
            },
          },
          { $sort: { costValue: -1 } },
        ],
        byCategory: [
          {
            $group: {
              _id: '$product.category',
              name: { $first: '$product.category' },
              units: { $sum: '$quantity' },
              costValue: { $sum: '$costValue' },
              retailValue: { $sum: '$retailValue' },
            },
          },
          { $sort: { costValue: -1 } },
        ],
        byProduct: [
          {
            $group: {
              _id: '$product._id',
              name: { $first: '$product.productName' },
              SKU: { $first: '$product.SKU' },
              unitCost: { $first: '$product.costPrice' },
              units: { $sum: '$quantity' },
              costValue: { $sum: '$costValue' },
              retailValue: { $sum: '$retailValue' },
            },
          },
          { $sort: { costValue: -1 } },
          { $limit: 100 },
        ],
      },
    },
  ]);
  const r2 = (rows) => rows.map((r) => ({ ...r, costValue: round2(r.costValue), retailValue: round2(r.retailValue) }));
  const t = res.totals[0] || { units: 0, costValue: 0, retailValue: 0 };
  return {
    summary: {
      totalUnits: t.units,
      costValue: round2(t.costValue),
      retailValue: round2(t.retailValue),
      potentialMargin: round2(t.retailValue - t.costValue),
    },
    byWarehouse: r2(res.byWarehouse),
    byCategory: r2(res.byCategory),
    byProduct: r2(res.byProduct),
  };
}

/** 8 & 9. Purchase / sales reports: monthly totals + supplier-wise or customer-wise breakdown. */
async function orderReport(orderType, query) {
  const party = orderType === 'purchase' ? { field: 'supplier', Model: Supplier, nameField: 'supplierName' } : { field: 'customer', Model: Customer, nameField: 'customerName' };
  const match = { orderType, status: { $in: COUNTED_STATUSES[orderType] } };
  const range = parseDateRange(query);
  if (range) match.orderDate = range;

  const [res] = await Order.aggregate([
    { $match: match },
    {
      $facet: {
        summary: [
          { $group: { _id: null, orders: { $sum: 1 }, totalAmount: { $sum: '$grandTotal' }, tax: { $sum: '$tax' }, discount: { $sum: '$discount' } } },
        ],
        byParty: [
          { $group: { _id: `$${party.field}`, orders: { $sum: 1 }, totalAmount: { $sum: '$grandTotal' } } },
          { $lookup: { from: col(party.Model), localField: '_id', foreignField: '_id', as: 'party' } },
          { $unwind: '$party' },
          { $project: { _id: 1, name: `$party.${party.nameField}`, orders: 1, totalAmount: { $round: ['$totalAmount', 2] } } },
          { $sort: { totalAmount: -1 } },
        ],
        byStatus: [{ $group: { _id: '$status', orders: { $sum: 1 }, totalAmount: { $sum: '$grandTotal' } } }, { $sort: { orders: -1 } }],
        topProducts: [
          { $unwind: '$items' },
          { $group: { _id: '$items.product', units: { $sum: '$items.quantity' }, amount: { $sum: '$items.subtotal' } } },
          { $lookup: { from: col(Product), localField: '_id', foreignField: '_id', as: 'p' } },
          { $unwind: '$p' },
          { $project: { _id: 1, name: '$p.productName', SKU: '$p.SKU', units: 1, amount: { $round: ['$amount', 2] } } },
          { $sort: { amount: -1 } },
          { $limit: 10 },
        ],
      },
    },
  ]);
  const s = res.summary[0] || { orders: 0, totalAmount: 0, tax: 0, discount: 0 };
  return {
    summary: {
      orders: s.orders,
      totalAmount: round2(s.totalAmount),
      tax: round2(s.tax),
      discount: round2(s.discount),
      averageOrderValue: s.orders ? round2(s.totalAmount / s.orders) : 0,
    },
    monthly: await monthlyTotals(orderType, 12),
    [orderType === 'purchase' ? 'bySupplier' : 'byCustomer']: res.byParty,
    byStatus: res.byStatus.map((r) => ({ ...r, totalAmount: round2(r.totalAmount) })),
    topProducts: res.topProducts,
  };
}

/** 10. Stock movement summary by type and warehouse. */
async function movementSummary(query) {
  const match = {};
  const range = parseDateRange(query);
  if (range) match.createdAt = range;
  const sums = {
    count: { $sum: 1 },
    unitsIn: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, '$quantity', 0] } },
    unitsOut: { $sum: { $cond: [{ $lt: ['$quantity', 0] }, { $abs: '$quantity' }, 0] } },
  };
  const [res] = await StockMovement.aggregate([
    { $match: match },
    {
      $facet: {
        byType: [{ $group: { _id: '$movementType', ...sums } }, { $sort: { count: -1 } }],
        byWarehouse: [
          { $group: { _id: '$warehouse', ...sums } },
          { $lookup: { from: col(Warehouse), localField: '_id', foreignField: '_id', as: 'w' } },
          { $unwind: '$w' },
          { $project: { name: '$w.warehouseName', count: 1, unitsIn: 1, unitsOut: 1 } },
          { $sort: { count: -1 } },
        ],
        totals: [{ $group: { _id: null, ...sums } }],
      },
    },
  ]);
  return { totals: res.totals[0] || { count: 0, unitsIn: 0, unitsOut: 0 }, byType: res.byType, byWarehouse: res.byWarehouse };
}

module.exports = {
  dashboard,
  inventoryReport,
  lowStockReport,
  warehouseReport,
  valuationReport,
  orderReport,
  movementSummary,
  monthlyTotals,
  lowStockPipeline,
  warehouseTotalsPipeline,
  categoryTotalsPipeline,
};
