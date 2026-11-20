const { connect, disconnect, clearAll, makeUser, api, makeProduct, makeSupplier, makeCustomer, makeWarehouse, setStock, stockOf } = require('./helpers');
const { Inventory, StockMovement, Order } = require('../src/models');

let admin;
let manager;
let staff;
let supplier;
let customer;
let whA;
let whB;
let p1;
let p2;

beforeAll(() => connect('sf_workflow'));
afterAll(disconnect);
beforeEach(async () => {
  jest.restoreAllMocks();
  await clearAll();
  admin = await makeUser('Admin');
  manager = await makeUser('Inventory Manager');
  staff = await makeUser('Staff');
  supplier = await makeSupplier();
  customer = await makeCustomer();
  whA = await makeWarehouse({ warehouseName: 'Warehouse A' });
  whB = await makeWarehouse({ warehouseName: 'Warehouse B' });
  p1 = await makeProduct({ productName: 'Widget', costPrice: 10, sellingPrice: 25 });
  p2 = await makeProduct({ productName: 'Gizmo', costPrice: 4, sellingPrice: 9 });
});

const id = (d) => String(d._id);
const createPO = (items) =>
  api(manager.token).post('/api/orders', {
    orderType: 'purchase',
    supplier: id(supplier),
    destinationWarehouse: id(whA),
    items: items.map(([p, quantity]) => ({ product: id(p), quantity })),
  });
const createSO = (items, token = staff.token) =>
  api(token).post('/api/orders', {
    orderType: 'sale',
    customer: id(customer),
    sourceWarehouse: id(whA),
    items: items.map(([p, quantity]) => ({ product: id(p), quantity })),
  });
const createTR = (items) =>
  api(manager.token).post('/api/orders', {
    orderType: 'transfer',
    sourceWarehouse: id(whA),
    destinationWarehouse: id(whB),
    items: items.map(([p, quantity]) => ({ product: id(p), quantity })),
  });
const patch = (token, orderId, action, body) => api(token).patch(`/api/orders/${orderId}/${action}`, body);

describe('Inventory adjustments', () => {
  const adjust = (body, token = manager.token) => api(token).post('/api/inventory/adjustments', { product: id(p1), warehouse: id(whA), ...body });

  test('increase and decrease record previous/new quantity in the ledger', async () => {
    const inc = await adjust({ type: 'increase', quantity: 30, reason: 'Opening stock' });
    expect(inc.status).toBe(201);
    expect(inc.body.data.movement).toMatchObject({ movementType: 'Adjustment', quantity: 30, previousQuantity: 0, newQuantity: 30 });

    const dec = await adjust({ type: 'decrease', quantity: 12, reason: 'Damaged in handling' });
    expect(dec.body.data.movement).toMatchObject({ quantity: -12, previousQuantity: 30, newQuantity: 18 });
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 18 });
  });

  test('requires a reason, prevents negative stock and respects reserved units', async () => {
    expect((await adjust({ type: 'increase', quantity: 5 })).status).toBe(400);
    expect((await adjust({ type: 'increase', quantity: 5, reason: '  ' })).status).toBe(400);
    expect((await adjust({ type: 'increase', quantity: 0, reason: 'zero' })).status).toBe(400);

    await setStock(p1._id, whA._id, 10, 8); // 2 available
    const tooMuch = await adjust({ type: 'decrease', quantity: 3, reason: 'Shrinkage' });
    expect(tooMuch.status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 8 });
    expect((await adjust({ type: 'decrease', quantity: 2, reason: 'Shrinkage' })).status).toBe(201);

    const none = await api(manager.token).post('/api/inventory/adjustments', { product: id(p2), warehouse: id(whA), type: 'decrease', quantity: 1, reason: 'Nothing here' });
    expect(none.status).toBe(409);
    expect(await Inventory.countDocuments({ product: p2._id })).toBe(0);
  });

  test('inventory listing: available quantity, filters, low-stock, warehouse/product views', async () => {
    await setStock(p1._id, whA._id, 20, 5);
    await setStock(p2._id, whA._id, 3); // <= reorder level 5 => low stock
    await setStock(p1._id, whB._id, 50);

    const all = await api(staff.token).get('/api/inventory');
    expect(all.body.pagination.total).toBe(3);
    const row = all.body.data.find((r) => r.product.productName === 'Widget' && r.warehouse.warehouseName === 'Warehouse A');
    expect(row).toMatchObject({ quantity: 20, reservedQuantity: 5, availableQuantity: 15, stockStatus: 'in-stock' });

    const low = await api(staff.token).get('/api/inventory?lowStock=true');
    expect(low.body.data.map((r) => r.product.productName)).toEqual(['Gizmo']);
    expect((await api(staff.token).get(`/api/inventory?warehouse=${whB._id}`)).body.pagination.total).toBe(1);
    expect((await api(staff.token).get('/api/inventory?search=gizmo')).body.pagination.total).toBe(1);
    expect((await api(staff.token).get(`/api/inventory/warehouse/${whA._id}`)).body.pagination.total).toBe(2);
    const byProduct = await api(staff.token).get(`/api/inventory/product/${p1._id}`);
    expect(byProduct.body.data).toHaveLength(2);
    expect((await api(staff.token).get(`/api/inventory/${row._id}`)).body.data.availableQuantity).toBe(15);
  });

  test('model rejects negative stock and invalid reservation', async () => {
    await expect(Inventory.create({ product: p1._id, warehouse: whA._id, quantity: -1 })).rejects.toThrow(/negative/i);
    await expect(Inventory.create({ product: p1._id, warehouse: whA._id, quantity: 5, reservedQuantity: 6 })).rejects.toThrow(/Reserved/i);
    await Inventory.create({ product: p1._id, warehouse: whA._id, quantity: 5 });
    await expect(Inventory.create({ product: p1._id, warehouse: whA._id, quantity: 1 })).rejects.toThrow(/duplicate/i);
  });
});

describe('Purchase orders', () => {
  test('stock only changes on receipt; full flow Draft -> Ordered -> Partially Received -> Received', async () => {
    const po = await createPO([[p1, 10], [p2, 6]]);
    const oid = po.body.data._id;
    expect(await Inventory.countDocuments()).toBe(0);

    expect((await patch(manager.token, oid, 'confirm')).body.data.status).toBe('Ordered');
    expect(await Inventory.countDocuments()).toBe(0); // ordering alone adds nothing

    const lines = (await api(manager.token).get(`/api/orders/${oid}`)).body.data.items;
    const l1 = lines.find((l) => l.product.productName === 'Widget');
    const l2 = lines.find((l) => l.product.productName === 'Gizmo');

    const part = await patch(manager.token, oid, 'receive', { items: [{ itemId: l1._id, quantity: 4 }] });
    expect(part.status).toBe(200);
    expect(part.body.data.status).toBe('Partially Received');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 4 });

    const rest = await patch(manager.token, oid, 'receive', {
      items: [{ itemId: l1._id, quantity: 6 }, { itemId: l2._id, quantity: 6 }],
      remarks: 'Second truck',
    });
    expect(rest.body.data.status).toBe('Received');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10 });
    expect(await stockOf(p2._id, whA._id)).toMatchObject({ quantity: 6 });

    const moves = await StockMovement.find({ referenceOrder: oid }).sort({ createdAt: 1 });
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.movementType === 'Purchase' && m.newQuantity === m.previousQuantity + m.quantity)).toBe(true);
  });

  test('prevents over-receiving, double receiving a closed order, and receiving before ordering', async () => {
    const po = await createPO([[p1, 5]]);
    const oid = po.body.data._id;
    const lineId = po.body.data.items[0]._id;

    const early = await patch(manager.token, oid, 'receive', { items: [{ itemId: lineId, quantity: 1 }] });
    expect(early.status).toBe(409);

    await patch(manager.token, oid, 'confirm');
    const over = await patch(manager.token, oid, 'receive', { items: [{ itemId: lineId, quantity: 6 }] });
    expect(over.status).toBe(400);
    expect(await Inventory.countDocuments()).toBe(0);

    expect((await patch(manager.token, oid, 'receive', { items: [{ itemId: lineId, quantity: 5 }] })).body.data.status).toBe('Received');
    const again = await patch(manager.token, oid, 'receive', { items: [{ itemId: lineId, quantity: 1 }] });
    expect(again.status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 5 });
  });

  test('concurrent duplicate receive requests only apply once', async () => {
    const po = await createPO([[p1, 10]]);
    const oid = po.body.data._id;
    const lineId = po.body.data.items[0]._id;
    await patch(manager.token, oid, 'confirm');

    const results = await Promise.all(
      Array.from({ length: 4 }, () => patch(manager.token, oid, 'receive', { items: [{ itemId: lineId, quantity: 10 }] }))
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10 });
    expect(await StockMovement.countDocuments({ referenceOrder: oid })).toBe(1);
  });

  test('purchase orders: cancel rules, staff blocked, state transitions validated', async () => {
    const po = await createPO([[p1, 5]]);
    const oid = po.body.data._id;
    expect((await patch(staff.token, oid, 'confirm')).status).toBe(403);
    expect((await patch(manager.token, oid, 'ship')).status).toBe(400); // wrong order type
    expect((await patch(manager.token, oid, 'complete-transfer')).status).toBe(400);
    expect((await patch(manager.token, oid, 'confirm')).status).toBe(200);
    expect((await patch(manager.token, oid, 'confirm')).status).toBe(409); // already ordered
    expect((await api(manager.token).put(`/api/orders/${oid}`, { orderType: 'purchase', supplier: id(supplier), destinationWarehouse: id(whA), items: [{ product: id(p1), quantity: 9 }] })).status).toBe(409);
    expect((await patch(manager.token, oid, 'cancel', { remarks: 'Supplier withdrew' })).body.data.status).toBe('Cancelled');
    expect((await patch(manager.token, oid, 'cancel')).status).toBe(409);
    expect(await Inventory.countDocuments()).toBe(0);
  });
});

describe('Sales orders: validation, reservation, shipping, cancellation', () => {
  beforeEach(async () => {
    await setStock(p1._id, whA._id, 10);
  });

  test('validates available stock on create and confirm (no overselling)', async () => {
    const tooMany = await createSO([[p1, 11]]);
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.message).toMatch(/Insufficient stock/);

    const a = await createSO([[p1, 7]]);
    const b = await createSO([[p1, 7]]); // each fits individually while nothing is reserved
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    expect((await patch(staff.token, a.body.data._id, 'confirm')).status).toBe(200);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 7, available: 3 });

    const second = await patch(staff.token, b.body.data._id, 'confirm');
    expect(second.status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ reserved: 7 });
    expect((await api(staff.token).get(`/api/orders/${b.body.data._id}`)).body.data.status).toBe('Draft'); // rolled back
  });

  test('confirm reserves, ship deducts stock + reservation and logs a Sale movement, deliver completes', async () => {
    const so = await createSO([[p1, 4]]);
    const oid = so.body.data._id;
    await patch(staff.token, oid, 'confirm');
    expect((await patch(staff.token, oid, 'process')).body.data.status).toBe('Processing');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 4 });
    expect(await StockMovement.countDocuments({ referenceOrder: oid })).toBe(0); // reservation is not a stock movement

    expect((await patch(staff.token, oid, 'deliver')).status).toBe(409); // must ship first
    const shipped = await patch(staff.token, oid, 'ship');
    expect(shipped.body.data.status).toBe('Shipped');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 6, reserved: 0 });
    const [mv] = await StockMovement.find({ referenceOrder: oid });
    expect(mv).toMatchObject({ movementType: 'Sale', quantity: -4, previousQuantity: 10, newQuantity: 6 });

    expect((await patch(staff.token, oid, 'ship')).status).toBe(409); // no double shipping
    expect((await patch(staff.token, oid, 'deliver')).body.data.status).toBe('Delivered');
    expect((await patch(staff.token, oid, 'cancel')).status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 6, reserved: 0 });
  });

  test('cancelling a confirmed order releases its reservation; shipped orders cannot be cancelled', async () => {
    const so = await createSO([[p1, 6]]);
    const oid = so.body.data._id;
    await patch(staff.token, oid, 'confirm');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ reserved: 6, available: 4 });

    expect((await patch(staff.token, oid, 'cancel', { remarks: 'Customer changed mind' })).body.data.status).toBe('Cancelled');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 0, available: 10 });
    expect((await patch(staff.token, oid, 'cancel')).status).toBe(409); // no double release
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ reserved: 0 });

    const so2 = await createSO([[p1, 2]]);
    await patch(staff.token, so2.body.data._id, 'confirm');
    await patch(staff.token, so2.body.data._id, 'ship');
    expect((await patch(staff.token, so2.body.data._id, 'cancel')).status).toBe(409);
  });

  test('draft sales orders can be cancelled without touching stock and then deleted', async () => {
    const so = await createSO([[p1, 3]]);
    const oid = so.body.data._id;
    expect((await patch(staff.token, oid, 'cancel')).body.data.status).toBe('Cancelled');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 0 });
    expect((await api(staff.token).delete(`/api/orders/${oid}`)).status).toBe(200);
  });

  test('concurrent confirmations cannot oversell and never double-reserve the same order', async () => {
    const orders = await Promise.all([createSO([[p1, 6]]), createSO([[p1, 6]])]);
    const results = await Promise.all(orders.map((o) => patch(staff.token, o.body.data._id, 'confirm')));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await stockOf(p1._id, whA._id)).reserved).toBe(6);

    await setStock(p2._id, whA._id, 50);
    const same = await createSO([[p2, 1]]);
    const dupes = await Promise.all(Array.from({ length: 4 }, () => patch(staff.token, same.body.data._id, 'confirm')));
    expect(dupes.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await stockOf(p2._id, whA._id)).reserved).toBe(1);
  });
});

describe('Warehouse transfers', () => {
  beforeEach(async () => {
    await setStock(p1._id, whA._id, 20);
  });

  test('complete-transfer moves stock atomically and records Transfer Out + Transfer In', async () => {
    const tr = await createTR([[p1, 8]]);
    expect(tr.body.data.orderNumber).toMatch(/^TR-/);
    expect(tr.body.data.status).toBe('Pending');
    const oid = tr.body.data._id;

    const done = await patch(manager.token, oid, 'complete-transfer');
    expect(done.body.data.status).toBe('Completed');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 12 });
    expect(await stockOf(p1._id, whB._id)).toMatchObject({ quantity: 8 });

    const moves = await StockMovement.find({ referenceOrder: oid }).sort({ createdAt: 1, quantity: 1 });
    expect(moves.map((m) => m.movementType).sort()).toEqual(['Transfer In', 'Transfer Out']);
    const out = moves.find((m) => m.movementType === 'Transfer Out');
    const inn = moves.find((m) => m.movementType === 'Transfer In');
    expect(out).toMatchObject({ quantity: -8, previousQuantity: 20, newQuantity: 12 });
    expect(inn).toMatchObject({ quantity: 8, previousQuantity: 0, newQuantity: 8 });

    expect((await patch(manager.token, oid, 'complete-transfer')).status).toBe(409); // no duplicate processing
    expect(await stockOf(p1._id, whB._id)).toMatchObject({ quantity: 8 });
  });

  test('in-transit flow: ship deducts source, complete credits destination; cancel in transit returns stock', async () => {
    const tr = await createTR([[p1, 5]]);
    const oid = tr.body.data._id;
    expect((await patch(manager.token, oid, 'ship')).body.data.status).toBe('In Transit');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 15 });
    expect((await stockOf(p1._id, whB._id)).quantity).toBe(0);
    expect((await patch(manager.token, oid, 'ship')).status).toBe(409);
    expect((await patch(manager.token, oid, 'complete-transfer')).body.data.status).toBe('Completed');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 15 });
    expect(await stockOf(p1._id, whB._id)).toMatchObject({ quantity: 5 });

    const tr2 = await createTR([[p1, 5]]);
    await patch(manager.token, tr2.body.data._id, 'ship');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10 });
    const cancelled = await patch(manager.token, tr2.body.data._id, 'cancel');
    expect(cancelled.body.data.status).toBe('Cancelled');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 15 });
    const types = (await StockMovement.find({ referenceOrder: tr2.body.data._id })).map((m) => m.movementType).sort();
    expect(types).toEqual(['Return', 'Transfer Out']);
  });

  test('insufficient source stock blocks the transfer and leaves both warehouses untouched', async () => {
    const tr = await createTR([[p1, 5], [p2, 3]]); // p2 has no stock at A
    const res = await patch(manager.token, tr.body.data._id, 'complete-transfer');
    expect(res.status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 20 }); // p1 deduction rolled back
    expect(await Inventory.countDocuments({ warehouse: whB._id })).toBe(0);
    expect(await StockMovement.countDocuments({ referenceOrder: tr.body.data._id })).toBe(0);
    expect((await api(manager.token).get(`/api/orders/${tr.body.data._id}`)).body.data.status).toBe('Pending');
  });

  test('stock reserved by sales orders cannot be transferred away', async () => {
    await setStock(p1._id, whA._id, 20, 18);
    const tr = await createTR([[p1, 5]]);
    expect((await patch(manager.token, tr.body.data._id, 'complete-transfer')).status).toBe(409);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 20, reserved: 18 });
  });

  test('staff cannot operate transfers', async () => {
    const tr = await createTR([[p1, 1]]);
    expect((await patch(staff.token, tr.body.data._id, 'complete-transfer')).status).toBe(403);
  });
});

describe('Transaction rollback', () => {
  test('a failure after inventory was updated rolls back every write (purchase receive)', async () => {
    const po = await createPO([[p1, 10], [p2, 5]]);
    const oid = po.body.data._id;
    await patch(manager.token, oid, 'confirm');
    const items = po.body.data.items.map((i) => ({ itemId: i._id, quantity: i.quantity }));

    // Simulate the ledger insert failing AFTER all inventory/order updates were applied.
    const spy = jest.spyOn(StockMovement, 'create').mockRejectedValueOnce(new Error('simulated ledger failure'));
    const res = await patch(manager.token, oid, 'receive', { items });
    expect(res.status).toBe(500);
    expect(spy).toHaveBeenCalled();

    expect(await Inventory.countDocuments()).toBe(0);
    expect(await StockMovement.countDocuments()).toBe(0);
    const order = await Order.findById(oid);
    expect(order.status).toBe('Ordered');
    expect(order.items.every((i) => i.receivedQuantity === 0)).toBe(true);

    // The system is still healthy: the same request succeeds once the fault is gone.
    const retry = await patch(manager.token, oid, 'receive', { items });
    expect(retry.status).toBe(200);
    expect(retry.body.data.status).toBe('Received');
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10 });
  });

  test('a failure while shipping a sale rolls back the stock deduction and status', async () => {
    await setStock(p1._id, whA._id, 10);
    const so = await createSO([[p1, 4]]);
    await patch(staff.token, so.body.data._id, 'confirm');

    jest.spyOn(StockMovement, 'create').mockRejectedValueOnce(new Error('simulated ledger failure'));
    const res = await patch(staff.token, so.body.data._id, 'ship');
    expect(res.status).toBe(500);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10, reserved: 4 });
    expect((await Order.findById(so.body.data._id)).status).toBe('Confirmed');
  });

  test('a failure while completing a transfer leaves both warehouses unchanged', async () => {
    await setStock(p1._id, whA._id, 10);
    const tr = await createTR([[p1, 4]]);
    jest.spyOn(StockMovement, 'create').mockRejectedValueOnce(new Error('simulated ledger failure'));
    expect((await patch(manager.token, tr.body.data._id, 'complete-transfer')).status).toBe(500);
    expect(await stockOf(p1._id, whA._id)).toMatchObject({ quantity: 10 });
    expect(await stockOf(p1._id, whB._id)).toMatchObject({ quantity: 0 });
    expect((await Order.findById(tr.body.data._id)).status).toBe('Pending');
  });
});

describe('Reports & dashboard (aggregations)', () => {
  test('dashboard stats reflect real data; reports aggregate correctly', async () => {
    await setStock(p1._id, whA._id, 100); // cost 10 => 1000
    await setStock(p2._id, whB._id, 3); // cost 4 => 12, below reorder level (5)
    const so = await createSO([[p1, 10]]);
    await patch(staff.token, so.body.data._id, 'confirm');
    await patch(staff.token, so.body.data._id, 'ship');
    const po = await createPO([[p1, 5]]);
    await patch(manager.token, po.body.data._id, 'confirm');

    const dash = (await api(admin.token).get('/api/reports/dashboard')).body.data;
    expect(dash.stats).toMatchObject({
      totalProducts: 2,
      totalWarehouses: 2,
      totalInventoryUnits: 93,
      inventoryValue: 90 * 10 + 12,
      lowStockProducts: 1,
      pendingPurchaseOrders: 1,
      pendingSalesOrders: 0,
    });
    expect(dash.tables.lowStock[0].productName).toBe('Gizmo');
    expect(dash.charts.monthlySales).toHaveLength(12);
    expect(dash.charts.monthlySales.at(-1).total).toBe(250);
    expect(dash.charts.warehouseStock.find((w) => w.name === 'Warehouse A').units).toBe(90);
    expect(dash.charts.categoryStock[0]).toMatchObject({ name: 'General', units: 93 });
    expect(dash.tables.recentMovements.length).toBe(1);

    const val = (await api(admin.token).get('/api/reports/valuation')).body.data;
    expect(val.summary).toMatchObject({ totalUnits: 93, costValue: 912 });
    const sales = (await api(admin.token).get('/api/reports/sales')).body.data;
    expect(sales.summary).toMatchObject({ orders: 1, totalAmount: 250 });
    expect(sales.byCustomer[0]).toMatchObject({ orders: 1, totalAmount: 250 });
    const purchases = (await api(admin.token).get('/api/reports/purchases')).body.data;
    expect(purchases.bySupplier[0].totalAmount).toBe(50);

    const inv = await api(admin.token).get('/api/reports/inventory');
    expect(inv.body.pagination.total).toBe(2);
    expect(inv.body.data.find((r) => r.productName === 'Widget').warehouses[0].warehouseName).toBe('Warehouse A');
    expect((await api(admin.token).get('/api/reports/low-stock')).body.data).toHaveLength(1);
    expect((await api(admin.token).get('/api/reports/warehouse')).body.data).toHaveLength(2);
    const mv = (await api(admin.token).get('/api/reports/stock-movements')).body.data;
    expect(mv.byType[0]).toMatchObject({ _id: 'Sale', unitsOut: 10 });
  });
});
