const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { runInTransaction } = require('../utils/transaction');
const {
  addStock,
  removeStock,
  reserveStock,
  releaseStock,
  shipReservedStock,
  recordMovements,
} = require('./inventory.service');
const { getOrder, assertCanManage } = require('./order.service');

/**
 * Order state machine.
 *
 *  purchase: Draft -> Ordered -> Partially Received -> Received        (Cancelled from Draft / Ordered)
 *  sale:     Draft -> Confirmed(reserve) -> Processing -> Shipped(deduct) -> Delivered
 *                                                    (Cancelled from Draft / Confirmed / Processing, releases reservation)
 *  transfer: Pending -> In Transit(deduct source) -> Completed(add destination)
 *                                                    (Cancelled from Pending / In Transit, returns stock to source)
 *
 * Every transition runs inside a MongoDB transaction. The status change itself is an atomic
 * compare-and-set (`findOneAndUpdate` filtered on the expected current status), so duplicate or
 * concurrent requests can never process the same order twice.
 */

const sorted = (items) => [...items].sort((a, b) => String(a.product).localeCompare(String(b.product)));

async function loadMeta(session, id, expectedType) {
  const meta = await Order.findById(id).session(session).select('orderType status orderNumber');
  if (!meta) throw ApiError.notFound('Order not found');
  if (expectedType && !expectedType.includes(meta.orderType)) {
    throw ApiError.badRequest(`This action is not available for ${meta.orderType} orders`);
  }
  return meta;
}

/** Atomic compare-and-set status change. Returns the order as it was BEFORE the change. */
async function claim(session, id, from, to, extraSet = {}) {
  const before = await Order.findOneAndUpdate(
    { _id: id, status: { $in: from } },
    { $set: { status: to, ...extraSet } },
    { new: false, session }
  );
  if (!before) {
    const current = await Order.findById(id).session(session).select('status');
    if (!current) throw ApiError.notFound('Order not found');
    throw ApiError.conflict(`Order is "${current.status}"; this action requires status ${from.join(' or ')}`);
  }
  return before;
}

const noteFor = (order, text, remarks) => `${text} ${order.orderNumber}${remarks ? ` - ${remarks}` : ''}`;

async function run(id, actor, types, work) {
  const result = await runInTransaction(async (session) => {
    const meta = await loadMeta(session, id, types);
    assertCanManage(actor, meta.orderType);
    await work(session, meta);
    return meta._id;
  });
  return getOrder(result, actor);
}

/* ---------------- confirm: purchase Draft->Ordered | sale Draft->Confirmed (+reserve) ---------------- */
const confirmOrder = (id, actor) =>
  run(id, actor, ['purchase', 'sale'], async (session, meta) => {
    if (meta.orderType === 'purchase') {
      await claim(session, id, ['Draft'], 'Ordered');
      return;
    }
    const order = await claim(session, id, ['Draft'], 'Confirmed');
    for (const item of sorted(order.items)) {
      await reserveStock(session, { product: item.product, warehouse: order.sourceWarehouse, quantity: item.quantity });
    }
  });

/* ---------------- process: sale Confirmed -> Processing ---------------- */
const processOrder = (id, actor) =>
  run(id, actor, ['sale'], async (session) => {
    await claim(session, id, ['Confirmed'], 'Processing');
  });

/* ---------------- ship: sale -> Shipped (deduct reserved) | transfer Pending -> In Transit (deduct source) ---------------- */
const shipOrder = (id, actor) =>
  run(id, actor, ['sale', 'transfer'], async (session, meta) => {
    if (meta.orderType === 'sale') {
      const order = await claim(session, id, ['Confirmed', 'Processing'], 'Shipped');
      const movements = [];
      for (const item of sorted(order.items)) {
        const r = await shipReservedStock(session, { product: item.product, warehouse: order.sourceWarehouse, quantity: item.quantity });
        movements.push({
          product: item.product,
          warehouse: order.sourceWarehouse,
          movementType: 'Sale',
          quantity: -item.quantity,
          ...r,
          referenceOrder: order._id,
          remarks: noteFor(order, 'Shipped sales order'),
          performedBy: actor._id,
        });
      }
      await recordMovements(session, movements);
      return;
    }

    const order = await claim(session, id, ['Pending'], 'In Transit');
    await dispatchTransfer(session, order, actor);
  });

async function dispatchTransfer(session, order, actor) {
  const movements = [];
  for (const item of sorted(order.items)) {
    const r = await removeStock(session, { product: item.product, warehouse: order.sourceWarehouse, quantity: item.quantity });
    movements.push({
      product: item.product,
      warehouse: order.sourceWarehouse,
      movementType: 'Transfer Out',
      quantity: -item.quantity,
      ...r,
      referenceOrder: order._id,
      remarks: noteFor(order, 'Transfer out', ''),
      performedBy: actor._id,
    });
  }
  await recordMovements(session, movements);
}

/* ---------------- deliver: sale Shipped -> Delivered ---------------- */
const deliverOrder = (id, actor) =>
  run(id, actor, ['sale'], async (session) => {
    await claim(session, id, ['Shipped'], 'Delivered');
  });

/* ---------------- receive: purchase (supports partial receiving) ---------------- */
const receiveOrder = (id, { items: lines, remarks }, actor) =>
  run(id, actor, ['purchase'], async (session) => {
    const ids = lines.map((l) => String(l.itemId));
    if (new Set(ids).size !== ids.length) throw ApiError.badRequest('Each order line can appear only once per receipt');

    const order = await Order.findById(id).session(session);
    if (!['Ordered', 'Partially Received'].includes(order.status)) {
      throw ApiError.conflict(`Order is "${order.status}"; only Ordered or Partially Received orders can be received`);
    }

    const movements = [];
    for (const line of lines) {
      const item = order.items.id(line.itemId);
      if (!item) throw ApiError.badRequest('Receipt references a line that is not on this order');
      const remaining = item.quantity - item.receivedQuantity;
      if (line.quantity > remaining) {
        throw ApiError.badRequest(`Cannot receive ${line.quantity}; only ${remaining} still outstanding for one of the lines`);
      }

      // Atomic guard: increments only if received + qty still fits within ordered quantity.
      const res = await Order.updateOne(
        { _id: id, status: { $in: ['Ordered', 'Partially Received'] } },
        { $inc: { 'items.$[el].receivedQuantity': line.quantity } },
        { session, arrayFilters: [{ 'el._id': item._id, 'el.receivedQuantity': { $lte: item.quantity - line.quantity } }] }
      );
      if (res.modifiedCount !== 1) throw ApiError.conflict('This line was already received by another request');

      const r = await addStock(session, { product: item.product, warehouse: order.destinationWarehouse, quantity: line.quantity });
      movements.push({
        product: item.product,
        warehouse: order.destinationWarehouse,
        movementType: 'Purchase',
        quantity: line.quantity,
        ...r,
        referenceOrder: order._id,
        remarks: noteFor(order, 'Received against purchase order', remarks),
        performedBy: actor._id,
      });
    }
    await recordMovements(session, movements);

    const fresh = await Order.findById(id).session(session).select('items');
    const complete = fresh.items.every((i) => i.receivedQuantity >= i.quantity);
    await claim(session, id, ['Ordered', 'Partially Received'], complete ? 'Received' : 'Partially Received');
  });

/* ---------------- complete-transfer: Pending | In Transit -> Completed ---------------- */
const completeTransfer = (id, actor) =>
  run(id, actor, ['transfer'], async (session) => {
    const order = await claim(session, id, ['Pending', 'In Transit'], 'Completed');
    // A Pending transfer completed in one step still deducts the source first.
    if (order.status === 'Pending') await dispatchTransfer(session, order, actor);

    const movements = [];
    for (const item of sorted(order.items)) {
      const r = await addStock(session, { product: item.product, warehouse: order.destinationWarehouse, quantity: item.quantity });
      movements.push({
        product: item.product,
        warehouse: order.destinationWarehouse,
        movementType: 'Transfer In',
        quantity: item.quantity,
        ...r,
        referenceOrder: order._id,
        remarks: noteFor(order, 'Transfer in'),
        performedBy: actor._id,
      });
    }
    await recordMovements(session, movements);
  });

/* ---------------- cancel ---------------- */
const CANCELLABLE = {
  purchase: ['Draft', 'Ordered'],
  sale: ['Draft', 'Confirmed', 'Processing'],
  transfer: ['Pending', 'In Transit'],
};

const cancelOrder = (id, { remarks } = {}, actor) =>
  run(id, actor, null, async (session, meta) => {
    const order = await claim(session, id, CANCELLABLE[meta.orderType], 'Cancelled');

    if (order.orderType === 'sale' && ['Confirmed', 'Processing'].includes(order.status)) {
      for (const item of sorted(order.items)) {
        await releaseStock(session, { product: item.product, warehouse: order.sourceWarehouse, quantity: item.quantity });
      }
    }

    if (order.orderType === 'transfer' && order.status === 'In Transit') {
      const movements = [];
      for (const item of sorted(order.items)) {
        const r = await addStock(session, { product: item.product, warehouse: order.sourceWarehouse, quantity: item.quantity });
        movements.push({
          product: item.product,
          warehouse: order.sourceWarehouse,
          movementType: 'Return',
          quantity: item.quantity,
          ...r,
          referenceOrder: order._id,
          remarks: noteFor(order, 'Stock returned: cancelled in-transit transfer', remarks),
          performedBy: actor._id,
        });
      }
      await recordMovements(session, movements);
    }
  });

module.exports = { confirmOrder, processOrder, shipOrder, deliverOrder, receiveOrder, completeTransfer, cancelOrder };
