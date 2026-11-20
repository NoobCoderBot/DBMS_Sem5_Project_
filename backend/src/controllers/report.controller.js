const reports = require('../services/report.service');
const { asyncHandler, ok } = require('../utils/helpers');

const wrap = (fn, paginated = false) =>
  asyncHandler(async (req, res) => {
    const result = await fn(req.query);
    if (paginated) return ok(res, result.rows, undefined, 200, { pagination: result.pagination, summary: result.summary });
    return ok(res, result);
  });

module.exports = {
  dashboard: asyncHandler(async (_req, res) => ok(res, await reports.dashboard())),
  inventory: wrap(reports.inventoryReport, true),
  lowStock: wrap(reports.lowStockReport, true),
  warehouse: wrap(reports.warehouseReport, true),
  valuation: wrap(reports.valuationReport),
  purchases: wrap((q) => reports.orderReport('purchase', q)),
  sales: wrap((q) => reports.orderReport('sale', q)),
  movementSummary: wrap(reports.movementSummary),
};
