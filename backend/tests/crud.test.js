const { connect, disconnect, clearAll, makeUser, api, makeProduct, makeSupplier, makeCustomer, makeWarehouse, setStock } = require('./helpers');
const { Order, Product, StockMovement } = require('../src/models');

let admin;
let manager;
let staff;

beforeAll(() => connect('sf_crud'));
afterAll(disconnect);
beforeEach(async () => {
  await clearAll();
  admin = await makeUser('Admin');
  manager = await makeUser('Inventory Manager');
  staff = await makeUser('Staff');
});

const productBody = (over = {}) => ({
  productName: 'Wireless Mouse',
  SKU: 'wm-100',
  category: 'Accessories',
  brand: 'Logi',
  unit: 'pcs',
  costPrice: 8,
  sellingPrice: 15,
  reorderLevel: 5,
  ...over,
});

describe('Products CRUD', () => {
  test('create / read / update / delete lifecycle', async () => {
    const c = await api(manager.token).post('/api/products', productBody());
    expect(c.status).toBe(201);
    expect(c.body.data.SKU).toBe('WM-100'); // SKU is normalised to upper case
    const id = c.body.data._id;

    const r = await api(staff.token).get(`/api/products/${id}`);
    expect(r.status).toBe(200);
    expect(r.body.data.stock).toEqual([]);

    const u = await api(manager.token).put(`/api/products/${id}`, { sellingPrice: 20 });
    expect(u.status).toBe(200);
    expect(u.body.data.sellingPrice).toBe(20);

    const d = await api(manager.token).delete(`/api/products/${id}`);
    expect(d.status).toBe(200);
    expect((await api(manager.token).get(`/api/products/${id}`)).status).toBe(404);
  });

  test('prevents duplicate SKU (case-insensitive) and validates input', async () => {
    await api(manager.token).post('/api/products', productBody());
    const dup = await api(manager.token).post('/api/products', productBody({ productName: 'Other', SKU: 'WM-100' }));
    expect(dup.status).toBe(409);
    const dupLower = await api(manager.token).post('/api/products', productBody({ productName: 'Other', SKU: 'wm-100' }));
    expect(dupLower.status).toBe(409);

    const bad = await api(manager.token).post('/api/products', productBody({ SKU: 'NEW-1', costPrice: -5 }));
    expect(bad.status).toBe(400);
    const missing = await api(manager.token).post('/api/products', { productName: 'No sku' });
    expect(missing.status).toBe(400);
    expect((await api(manager.token).get('/api/products/not-an-id')).status).toBe(400);
  });

  test('server-side search, filter, sort and pagination', async () => {
    for (let i = 1; i <= 12; i += 1) {
      await makeProduct({ productName: `Gadget ${i}`, SKU: `G-${i}`, category: i % 2 ? 'Odd' : 'Even', sellingPrice: i * 10 });
    }
    await makeProduct({ productName: 'Hammer', SKU: 'H-1', category: 'Tools' });

    const page1 = await api(staff.token).get('/api/products?limit=5&page=1&sortBy=sellingPrice&order=asc&category=Odd');
    expect(page1.body.pagination.total).toBe(6);
    expect(page1.body.data).toHaveLength(5);
    expect(page1.body.data[0].SKU).toBe('G-1');
    expect(page1.body.pagination.totalPages).toBe(2);

    const search = await api(staff.token).get('/api/products?search=hamm');
    expect(search.body.data.map((p) => p.SKU)).toEqual(['H-1']);
    // regex characters in search must be treated literally, not crash
    expect((await api(staff.token).get('/api/products?search=(((')).status).toBe(200);
  });

  test('lists distinct categories for filters', async () => {
    await makeProduct({ category: 'Tools' });
    await makeProduct({ category: 'Tools' });
    await makeProduct({ category: 'Audio' });
    const res = await api(staff.token).get('/api/products/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['Audio', 'Tools']);
  });

  test('cannot delete a product that has transaction history; deactivation works', async () => {
    const product = await makeProduct();
    const wh = await makeWarehouse();
    await setStock(product._id, wh._id, 5);
    const blocked = await api(admin.token).delete(`/api/products/${product._id}`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.message).toMatch(/Deactivate/i);

    const off = await api(admin.token).put(`/api/products/${product._id}`, { status: 'Inactive' });
    expect(off.body.data.status).toBe('Inactive');
  });
});

describe('Suppliers & Customers CRUD', () => {
  test('supplier lifecycle, GSTIN validation, duplicate email, delete protection', async () => {
    const body = { supplierName: 'Acme Traders', contactPerson: 'Ravi', email: 'acme@test.local', phone: '9876543210', GSTIN: '29ABCDE1234F1Z5' };
    const c = await api(manager.token).post('/api/suppliers', body);
    expect(c.status).toBe(201);

    expect((await api(manager.token).post('/api/suppliers', { ...body, supplierName: 'Another', GSTIN: undefined })).status).toBe(409);
    expect((await api(manager.token).post('/api/suppliers', { supplierName: 'Bad GST', GSTIN: '123' })).status).toBe(400);

    const list = await api(manager.token).get('/api/suppliers?search=acme');
    expect(list.body.pagination.total).toBe(1);
    expect((await api(manager.token).put(`/api/suppliers/${c.body.data._id}`, { phone: '9000000000' })).body.data.phone).toBe('9000000000');

    // referenced by an order => cannot delete
    const sup = c.body.data._id;
    const wh = await makeWarehouse();
    const p = await makeProduct();
    await api(manager.token).post('/api/orders', { orderType: 'purchase', supplier: sup, destinationWarehouse: String(wh._id), items: [{ product: String(p._id), quantity: 1 }] });
    expect((await api(manager.token).delete(`/api/suppliers/${sup}`)).status).toBe(409);

    const free = await makeSupplier();
    expect((await api(manager.token).delete(`/api/suppliers/${free._id}`)).status).toBe(200);
    expect((await api(staff.token).get('/api/suppliers')).status).toBe(403);
  });

  test('customer lifecycle: staff may create, only managers update/delete', async () => {
    const c = await api(staff.token).post('/api/customers', { customerName: 'Globex', email: 'g@test.local' });
    expect(c.status).toBe(201);
    const id = c.body.data._id;
    expect((await api(staff.token).put(`/api/customers/${id}`, { phone: '123456' })).status).toBe(403);
    expect((await api(manager.token).put(`/api/customers/${id}`, { phone: '1234567' })).status).toBe(200);
    expect((await api(staff.token).delete(`/api/customers/${id}`)).status).toBe(403);
    expect((await api(manager.token).delete(`/api/customers/${id}`)).status).toBe(200);
  });
});

describe('Warehouses CRUD', () => {
  test('lifecycle with manager reference, unique code, aggregated stock totals', async () => {
    const body = { warehouseName: 'Central Hub', warehouseCode: 'ctr-01', location: 'Chennai', manager: String(manager.user._id), contactNumber: '0441234567' };
    const c = await api(manager.token).post('/api/warehouses', body);
    expect(c.status).toBe(201);
    expect(c.body.data.warehouseCode).toBe('CTR-01');
    expect(c.body.data.manager.name).toBeTruthy();

    expect((await api(manager.token).post('/api/warehouses', { ...body, warehouseName: 'Dup' })).status).toBe(409);
    expect((await api(manager.token).post('/api/warehouses', { ...body, warehouseCode: 'X2', manager: String(staff.user._id) })).status).toBe(400);

    const p = await makeProduct();
    await setStock(p._id, c.body.data._id, 40);
    const detail = await api(staff.token).get(`/api/warehouses/${c.body.data._id}`);
    expect(detail.body.data.totalStock).toBe(40);
    expect(detail.body.data.productCount).toBe(1);

    expect((await api(manager.token).delete(`/api/warehouses/${c.body.data._id}`)).status).toBe(409);
    const empty = await makeWarehouse();
    expect((await api(manager.token).delete(`/api/warehouses/${empty._id}`)).status).toBe(200);
  });
});

describe('Users CRUD (Admin only)', () => {
  test('admin manages users; passwords are hashed and never returned', async () => {
    const c = await api(admin.token).post('/api/users', { name: 'New Manager', email: 'nm@test.local', password: 'Manager123', role: 'Inventory Manager' });
    expect(c.status).toBe(201);
    expect(c.body.data.password).toBeUndefined();
    expect(c.body.data.role).toBe('Inventory Manager');

    const login = await api().post('/api/auth/login', { email: 'nm@test.local', password: 'Manager123' });
    expect(login.status).toBe(200);

    const u = await api(admin.token).put(`/api/users/${c.body.data._id}`, { status: 'Inactive' });
    expect(u.body.data.status).toBe('Inactive');

    expect((await api(admin.token).get('/api/users?role=Staff')).body.data.every((x) => x.role === 'Staff')).toBe(true);
    expect((await api(manager.token).post('/api/users', { name: 'X', email: 'x@test.local', password: 'Manager123' })).status).toBe(403);
    expect((await api(admin.token).post('/api/users', { name: 'Dup', email: 'nm@test.local', password: 'Manager123' })).status).toBe(409);
  });

  test('admin cannot delete / deactivate / demote themselves; referenced users cannot be deleted', async () => {
    expect((await api(admin.token).delete(`/api/users/${admin.user._id}`)).status).toBe(400);
    expect((await api(admin.token).put(`/api/users/${admin.user._id}`, { status: 'Inactive' })).status).toBe(400);
    expect((await api(admin.token).put(`/api/users/${admin.user._id}`, { role: 'Staff' })).status).toBe(400);

    const wh = await makeWarehouse({ manager: manager.user._id });
    expect(wh).toBeTruthy();
    expect((await api(admin.token).delete(`/api/users/${manager.user._id}`)).status).toBe(409);
    expect((await api(admin.token).delete(`/api/users/${staff.user._id}`)).status).toBe(200);
  });
});

describe('Orders CRUD & read-only stock movements', () => {
  test('order draft can be created, edited, listed, filtered and deleted; totals computed server-side', async () => {
    const sup = await makeSupplier({ supplierName: 'Zenith Supplies' });
    const wh = await makeWarehouse({ warehouseName: 'North Depot' });
    const p1 = await makeProduct({ costPrice: 10 });
    const p2 = await makeProduct({ costPrice: 20 });

    const body = {
      orderType: 'purchase',
      supplier: String(sup._id),
      destinationWarehouse: String(wh._id),
      items: [
        { product: String(p1._id), quantity: 5 },
        { product: String(p2._id), quantity: 2, unitPrice: 25 },
      ],
      tax: 10,
      discount: 5,
    };
    const c = await api(manager.token).post('/api/orders', body);
    expect(c.status).toBe(201);
    expect(c.body.data.status).toBe('Draft');
    expect(c.body.data.orderNumber).toMatch(/^PO-/);
    expect(c.body.data.subtotal).toBe(100); // 5*10 + 2*25
    expect(c.body.data.grandTotal).toBe(105); // 100 + 10 - 5
    const id = c.body.data._id;

    const upd = await api(manager.token).put(`/api/orders/${id}`, { ...body, items: [{ product: String(p1._id), quantity: 10 }], tax: 0, discount: 0 });
    expect(upd.body.data.grandTotal).toBe(100);

    const byName = await api(manager.token).get('/api/orders?search=zenith&orderType=purchase&status=Draft');
    expect(byName.body.pagination.total).toBe(1);
    const byWh = await api(manager.token).get(`/api/orders?warehouse=${wh._id}`);
    expect(byWh.body.pagination.total).toBe(1);
    const future = await api(manager.token).get('/api/orders?from=2999-01-01');
    expect(future.body.pagination.total).toBe(0);

    expect((await api(manager.token).delete(`/api/orders/${id}`)).status).toBe(200);
    expect((await api(manager.token).get(`/api/orders/${id}`)).status).toBe(404);
  });

  test('order validation: conditional parties, duplicate products, same-warehouse transfers', async () => {
    const sup = await makeSupplier();
    const wh = await makeWarehouse();
    const wh2 = await makeWarehouse();
    const p = await makeProduct();
    const item = { product: String(p._id), quantity: 1 };

    const noSupplier = await api(manager.token).post('/api/orders', { orderType: 'purchase', destinationWarehouse: String(wh._id), items: [item] });
    expect(noSupplier.status).toBe(400);
    const wrongParty = await api(manager.token).post('/api/orders', { orderType: 'purchase', supplier: String(sup._id), customer: String(sup._id), destinationWarehouse: String(wh._id), items: [item] });
    expect(wrongParty.status).toBe(400);
    const dupLines = await api(manager.token).post('/api/orders', { orderType: 'purchase', supplier: String(sup._id), destinationWarehouse: String(wh._id), items: [item, item] });
    expect(dupLines.status).toBe(400);
    const same = await api(manager.token).post('/api/orders', { orderType: 'transfer', sourceWarehouse: String(wh._id), destinationWarehouse: String(wh._id), items: [item] });
    expect(same.status).toBe(400);
    expect(same.body.message).toMatch(/differ/i);
    const emptyItems = await api(manager.token).post('/api/orders', { orderType: 'transfer', sourceWarehouse: String(wh._id), destinationWarehouse: String(wh2._id), items: [] });
    expect(emptyItems.status).toBe(400);
  });

  test('staff cannot create/see purchase orders', async () => {
    const sup = await makeSupplier();
    const wh = await makeWarehouse();
    const p = await makeProduct();
    const res = await api(staff.token).post('/api/orders', { orderType: 'purchase', supplier: String(sup._id), destinationWarehouse: String(wh._id), items: [{ product: String(p._id), quantity: 1 }] });
    expect(res.status).toBe(403);
    const po = await api(manager.token).post('/api/orders', { orderType: 'purchase', supplier: String(sup._id), destinationWarehouse: String(wh._id), items: [{ product: String(p._id), quantity: 1 }] });
    expect((await api(staff.token).get(`/api/orders/${po.body.data._id}`)).status).toBe(403);
    expect((await api(staff.token).get('/api/orders?orderType=purchase')).status).toBe(403);
    expect((await api(staff.token).get('/api/orders')).body.pagination.total).toBe(0);
  });

  test('stock movements are read-only through the API and immutable in the model', async () => {
    const p = await makeProduct();
    const wh = await makeWarehouse();
    const adj = await api(manager.token).post('/api/inventory/adjustments', { product: String(p._id), warehouse: String(wh._id), type: 'increase', quantity: 5, reason: 'Initial count' });
    expect(adj.status).toBe(201);
    const id = adj.body.data.movement._id;

    expect((await api(admin.token).get(`/api/stock-movements/${id}`)).status).toBe(200);
    expect((await api(admin.token).put(`/api/stock-movements/${id}`, { quantity: 99 })).status).toBe(404);
    expect((await api(admin.token).delete(`/api/stock-movements/${id}`)).status).toBe(404);
    expect((await api(admin.token).post('/api/stock-movements', {})).status).toBe(404);

    await expect(StockMovement.updateOne({ _id: id }, { quantity: 99 })).rejects.toThrow(/immutable/i);
    await expect(StockMovement.deleteOne({ _id: id })).rejects.toThrow(/immutable/i);
    const doc = await StockMovement.findById(id);
    doc.remarks = 'tampered';
    await expect(doc.save()).rejects.toThrow(/immutable/i);

    const filtered = await api(admin.token).get(`/api/stock-movements?movementType=Adjustment&product=${p._id}&from=2000-01-01&to=2999-12-31`);
    expect(filtered.body.pagination.total).toBe(1);

    // a date-only "to" filter is inclusive of the whole day (today's movement must still match)
    const today = new Date().toISOString().slice(0, 10);
    expect((await api(admin.token).get(`/api/stock-movements?from=${today}&to=${today}`)).body.pagination.total).toBe(1);
    expect((await api(admin.token).get('/api/stock-movements?to=2000-01-01')).body.pagination.total).toBe(0);
    expect((await api(admin.token).get('/api/stock-movements?from=not-a-date')).status).toBe(400);
    expect(Order).toBeDefined();
    expect(Product).toBeDefined();
  });
});

describe('Misc API behaviour', () => {
  test('unknown routes return a consistent 404 JSON error and health check works', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect((await api().get('/api/health')).body.data.status).toBe('ok');
  });
});
