/**
 * Cross-checks the invariants that must always hold:
 *  1. Inventory.quantity == SUM(StockMovement.quantity) per (product, warehouse)
 *  2. Inventory.reservedQuantity == units on Confirmed / Processing sales orders per (product, warehouse)
 *  3. 0 <= reserved <= quantity
 *  4. Every movement satisfies newQuantity == previousQuantity + quantity
 *
 *   npm run verify
 */
const mongoose = require('mongoose');
const { Inventory, StockMovement, Order } = require('../src/models');

async function verifyConsistency() {
  const problems = [];
  const key = (p, w) => `${p}|${w}`;

  const [inventory, ledger, reservations, badMovements] = await Promise.all([
    Inventory.find().lean(),
    StockMovement.aggregate([{ $group: { _id: { p: '$product', w: '$warehouse' }, total: { $sum: '$quantity' } } }]),
    Order.aggregate([
      { $match: { orderType: 'sale', status: { $in: ['Confirmed', 'Processing'] } } },
      { $unwind: '$items' },
      { $group: { _id: { p: '$items.product', w: '$sourceWarehouse' }, reserved: { $sum: '$items.quantity' } } },
    ]),
    StockMovement.countDocuments({ $expr: { $ne: ['$newQuantity', { $add: ['$previousQuantity', '$quantity'] }] } }),
  ]);

  const ledgerMap = new Map(ledger.map((l) => [key(l._id.p, l._id.w), l.total]));
  const reservedMap = new Map(reservations.map((r) => [key(r._id.p, r._id.w), r.reserved]));

  for (const inv of inventory) {
    const k = key(inv.product, inv.warehouse);
    const ledgerTotal = ledgerMap.get(k) || 0;
    if (inv.quantity !== ledgerTotal) problems.push(`Inventory ${k}: quantity ${inv.quantity} != ledger ${ledgerTotal}`);
    const expectedReserved = reservedMap.get(k) || 0;
    if (inv.reservedQuantity !== expectedReserved) problems.push(`Inventory ${k}: reserved ${inv.reservedQuantity} != open sales ${expectedReserved}`);
    if (inv.quantity < 0 || inv.reservedQuantity < 0 || inv.reservedQuantity > inv.quantity) problems.push(`Inventory ${k}: invalid quantities`);
  }
  const invKeys = new Set(inventory.map((i) => key(i.product, i.warehouse)));
  for (const [k, total] of ledgerMap) if (!invKeys.has(k) && total !== 0) problems.push(`Ledger ${k}: ${total} units without an inventory row`);
  if (badMovements) problems.push(`${badMovements} movement(s) violate newQuantity = previousQuantity + quantity`);

  return { ok: problems.length === 0, problems, checkedRows: inventory.length };
}

module.exports = { verifyConsistency };

if (require.main === module) {
  const env = require('../src/config/env');
  mongoose
    .connect(env.mongoUri)
    .then(verifyConsistency)
    .then(async (r) => {
      console.log(r.ok ? `OK - ${r.checkedRows} inventory rows consistent with the ledger and open orders` : r.problems.join('\n'));
      await mongoose.disconnect();
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
