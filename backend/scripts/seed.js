/**
 * Seeds StockFlow with consistent demo data.
 *
 * Every stock change goes through the real services (same transactions + ledger as the API),
 * so inventory, reservations and stock movements are guaranteed to agree.
 *
 *   npm run seed
 */
const mongoose = require('mongoose');
const env = require('../src/config/env');
const { connectDB } = require('../src/config/db');
const { User, Product, Supplier, Customer, Warehouse, Inventory, Order, StockMovement } = require('../src/models');
const orderService = require('../src/services/order.service');
const wf = require('../src/services/orderWorkflow.service');
const { adjustStock } = require('../src/services/inventory.service');
const { verifyConsistency } = require('./verify-consistency');

if (env.isProd && !process.argv.includes('--force')) {
  console.error('Refusing to seed (wipe) a production database. Pass --force if you really mean it.');
  process.exit(1);
}

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const gstin = (i, state = '33') => `${state}${'ABCDE'.replace(/./g, (c, k) => String.fromCharCode(65 + ((i * 3 + k * 5) % 26)))}${String(1000 + i * 37).slice(0, 4)}${String.fromCharCode(65 + (i % 26))}1Z${(i % 9) + 1}`;

async function wipe() {
  // raw collections: the immutable StockMovement hooks (rightly) block model-level deletes
  for (const Model of [StockMovement, Order, Inventory, Product, Supplier, Customer, Warehouse, User]) {
    await Model.collection.deleteMany({});
    await Model.syncIndexes();
  }
}

async function seedUsers() {
  const mk = (name, email, role, password) => User.create({ name, email, role, password });
  const admin = await mk('Aarav Mehta', 'admin@stockflow.com', 'Admin', 'Admin@123');
  const m1 = await mk('Priya Nair', 'manager1@stockflow.com', 'Inventory Manager', 'Manager@123');
  const m2 = await mk('Rohan Iyer', 'manager2@stockflow.com', 'Inventory Manager', 'Manager@123');
  const s1 = await mk('Kavya Reddy', 'staff1@stockflow.com', 'Staff', 'Staff@123');
  const s2 = await mk('Vikram Singh', 'staff2@stockflow.com', 'Staff', 'Staff@123');
  const s3 = await mk('Ananya Das', 'staff3@stockflow.com', 'Staff', 'Staff@123');
  return { admin, m1, m2, s1, s2, s3 };
}

async function seedWarehouses(u) {
  const defs = [
    { warehouseName: 'Chennai Central Warehouse', warehouseCode: 'WH-CHN', location: 'Chennai', address: 'SIDCO Industrial Estate, Guindy, Chennai 600032', manager: u.m1._id, contactNumber: '044-22334455' },
    { warehouseName: 'Bengaluru Distribution Hub', warehouseCode: 'WH-BLR', location: 'Bengaluru', address: 'Peenya 2nd Stage, Bengaluru 560058', manager: u.m2._id, contactNumber: '080-41112233' },
    { warehouseName: 'Mumbai Regional Depot', warehouseCode: 'WH-MUM', location: 'Mumbai', address: 'MIDC Andheri East, Mumbai 400093', manager: u.admin._id, contactNumber: '022-28887766' },
  ];
  const [chn, blr, mum] = await Warehouse.create(defs);
  await User.updateOne({ _id: u.m1._id }, { assignedWarehouse: chn._id });
  await User.updateOne({ _id: u.m2._id }, { assignedWarehouse: blr._id });
  await User.updateMany({ _id: { $in: [u.s1._id, u.s3._id] } }, { assignedWarehouse: chn._id });
  await User.updateOne({ _id: u.s2._id }, { assignedWarehouse: blr._id });
  return { chn, blr, mum };
}

// [name, SKU, category, brand, unit, cost, sell, reorderLevel]
const PRODUCT_DEFS = [
  ['Wireless Mouse M185', 'ELE-MS-001', 'Electronics', 'Logitech', 'pcs', 480, 699, 25],
  ['Mechanical Keyboard K2', 'ELE-KB-002', 'Electronics', 'Keychron', 'pcs', 4200, 5499, 10],
  ['27-inch IPS Monitor', 'ELE-MN-003', 'Electronics', 'Dell', 'pcs', 11800, 14499, 8],
  ['USB-C Hub 7-in-1', 'ELE-HB-004', 'Electronics', 'Anker', 'pcs', 1650, 2299, 15],
  ['Noise-Cancelling Headphones', 'ELE-HP-005', 'Electronics', 'Sony', 'pcs', 7400, 9990, 10],
  ['HDMI Cable 2m', 'ACC-HD-006', 'Accessories', 'AmazonBasics', 'pcs', 160, 349, 40],
  ['Laptop Sleeve 15"', 'ACC-LS-007', 'Accessories', 'Wildcraft', 'pcs', 320, 599, 30],
  ['Power Bank 20000mAh', 'ACC-PB-008', 'Accessories', 'Mi', 'pcs', 1050, 1599, 20],
  ['A4 Copier Paper (500 sheets)', 'STA-PP-009', 'Stationery', 'JK Paper', 'pack', 210, 295, 60],
  ['Ball Pen Blue (Box of 50)', 'STA-BP-010', 'Stationery', 'Reynolds', 'box', 240, 399, 30],
  ['Spiral Notebook A5', 'STA-NB-011', 'Stationery', 'Classmate', 'pcs', 38, 70, 100],
  ['Ergonomic Office Chair', 'FUR-CH-012', 'Furniture', 'Godrej', 'pcs', 5600, 7999, 6],
  ['Standing Desk 140cm', 'FUR-DK-013', 'Furniture', 'Featherlite', 'pcs', 12500, 16999, 4],
  ['Steel Filing Cabinet', 'FUR-FC-014', 'Furniture', 'Godrej', 'pcs', 6900, 9299, 5],
  ['Cordless Drill 12V', 'HAR-DR-015', 'Hardware', 'Bosch', 'pcs', 2900, 3999, 8],
  ['Tool Kit 120-piece', 'HAR-TK-016', 'Hardware', 'Stanley', 'set', 1850, 2699, 10],
  ['LED Bulb 9W (Pack of 4)', 'HAR-LB-017', 'Hardware', 'Philips', 'pack', 290, 449, 50],
  ['Safety Gloves (Pair)', 'HAR-SG-018', 'Hardware', 'Karam', 'pair', 75, 149, 40],
];

async function seedMasterData() {
  const products = await Product.create(
    PRODUCT_DEFS.map(([productName, SKU, category, brand, unit, costPrice, sellingPrice, reorderLevel], i) => ({
      productName, SKU, category, brand, unit, costPrice, sellingPrice, reorderLevel,
      description: `${brand} ${productName}`,
      barcode: `890${String(1000000000 + i * 7919).slice(0, 10)}`,
    }))
  );
  const P = Object.fromEntries(products.map((p) => [p.SKU, p]));

  const suppliers = await Supplier.create([
    { supplierName: 'Sri Lakshmi Electronics Wholesale', contactPerson: 'Murugan S', email: 'sales@lakshmielectronics.in', phone: '9840011223', address: 'Ritchie Street, Chennai', GSTIN: gstin(1) },
    { supplierName: 'Bharat Office Supplies Pvt Ltd', contactPerson: 'Deepa Kulkarni', email: 'orders@bharatoffice.in', phone: '9820099887', address: 'Lower Parel, Mumbai', GSTIN: gstin(2, '27') },
    { supplierName: 'Southern Hardware Traders', contactPerson: 'Rajesh Kumar', email: 'info@southernhardware.in', phone: '9444455667', address: 'Mint Street, Chennai', GSTIN: gstin(3) },
    { supplierName: 'Karnataka Furniture Mart', contactPerson: 'Suresh Gowda', email: 'sales@kfmart.in', phone: '9900112233', address: 'Rajajinagar, Bengaluru', GSTIN: gstin(4, '29') },
    { supplierName: 'Digital Edge Distributors', contactPerson: 'Neha Verma', email: 'neha@digitaledge.in', phone: '9811122334', address: 'Nehru Place, New Delhi', GSTIN: gstin(5, '07') },
  ]);

  const customerNames = [
    ['Zenith Technologies', 'procurement@zenithtech.in'], ['Orbit Infosystems', 'accounts@orbitinfo.in'], ['Greenfield School', 'admin@greenfield.edu.in'],
    ['Lotus Co-working Spaces', 'ops@lotuscowork.in'], ['Metro Retail Pvt Ltd', 'buying@metroretail.in'], ['Sunrise Hospital', 'stores@sunrisehospital.in'],
    ['Coastal Logistics', 'purchase@coastallogistics.in'], ['Nilgiri Constructions', 'site@nilgiricons.in'], ['Pixel Studio', 'hello@pixelstudio.in'],
    ['Hari Om Stationers', 'hariom@stationers.in'],
  ];
  const customers = await Customer.create(
    customerNames.map(([customerName, email], i) => ({
      customerName, email, phone: `98${String(40000000 + i * 123457).slice(0, 8)}`, address: ['Chennai', 'Bengaluru', 'Mumbai', 'Hyderabad', 'Pune'][i % 5], GSTIN: gstin(10 + i, ['33', '29', '27', '36', '27'][i % 5]),
    }))
  );
  return { P, suppliers, customers };
}

async function run() {
  await connectDB();
  console.log('Wiping existing data...');
  await wipe();

  const u = await seedUsers();
  const w = await seedWarehouses(u);
  const { P, suppliers: S, customers: C } = await seedMasterData();
  const skus = Object.keys(P);
  const lowStockSkus = new Set(['ELE-HP-005', 'FUR-DK-013', 'HAR-DR-015']); // deliberately low stock
  const noStockSku = 'HAR-SG-018'; // never purchased: zero stock

  const line = (sku, quantity, unitPrice) => ({ product: P[sku]._id, quantity, ...(unitPrice ? { unitPrice } : {}) });
  const itemIds = (order) => order.items.map((i) => ({ itemId: i._id, quantity: i.quantity }));

  async function purchase({ supplier, wh, lines, days, actor = u.m1, finish = 'received', tax = 0, discount = 0, notes = '' }) {
    const order = await orderService.createOrder(
      { orderType: 'purchase', supplier: supplier._id, destinationWarehouse: wh._id, items: lines, tax, discount, orderDate: daysAgo(days), expectedDeliveryDate: daysAgo(days - 7), notes },
      actor
    );
    if (finish === 'draft') return order;
    if (finish === 'cancelled') return wf.cancelOrder(order._id, { remarks: 'Supplier could not fulfil' }, actor);
    await wf.confirmOrder(order._id, actor);
    if (finish === 'ordered') return order;
    if (finish === 'partial') {
      const half = order.items.map((i) => ({ itemId: i._id, quantity: Math.max(1, Math.floor(i.quantity / 2)) }));
      return wf.receiveOrder(order._id, { items: half, remarks: 'First consignment' }, actor);
    }
    return wf.receiveOrder(order._id, { items: itemIds(order), remarks: 'Received in full' }, actor);
  }

  console.log('Creating purchase orders and receiving stock...');
  const qty = (sku, base) => (lowStockSkus.has(sku) ? 1 : base);
  // Opening stock for each warehouse (large POs, 5 months back)
  const stockable = skus.filter((s) => s !== noStockSku);
  await purchase({ supplier: S[0], wh: w.chn, days: 400, tax: 0, notes: 'Opening stock - Chennai', lines: stockable.map((s, i) => line(s, qty(s, 60 + (i * 17) % 90))) });
  await purchase({ supplier: S[1], wh: w.blr, days: 395, notes: 'Opening stock - Bengaluru', lines: stockable.map((s, i) => line(s, qty(s, 50 + (i * 13) % 70))) });
  await purchase({ supplier: S[2], wh: w.mum, days: 390, notes: 'Opening stock - Mumbai', lines: stockable.filter((_, i) => i % 2 === 0).map((s, i) => line(s, qty(s, 40 + (i * 11) % 60))) });
  // Replenishment through the months (never for deliberately low-stock products)
  await purchase({ supplier: S[4], wh: w.chn, days: 95, tax: 1800, lines: [line('ELE-MS-001', 80), line('ELE-HB-004', 40), line('ACC-HD-006', 120)] });
  await purchase({ supplier: S[1], wh: w.blr, days: 75, tax: 900, discount: 300, lines: [line('STA-PP-009', 200), line('STA-NB-011', 300), line('STA-BP-010', 80)] });
  await purchase({ supplier: S[3], wh: w.mum, days: 58, tax: 3200, lines: [line('FUR-CH-012', 12), line('FUR-FC-014', 8)] });
  await purchase({ supplier: S[2], wh: w.chn, days: 40, tax: 1200, lines: [line('HAR-TK-016', 25), line('HAR-LB-017', 150)] });
  await purchase({ supplier: S[0], wh: w.blr, days: 24, tax: 2400, discount: 500, lines: [line('ELE-MN-003', 14), line('ELE-KB-002', 20)] });
  await purchase({ supplier: S[4], wh: w.chn, days: 12, tax: 600, finish: 'partial', lines: [line('ACC-PB-008', 60), line('ACC-LS-007', 50)] });
  await purchase({ supplier: S[1], wh: w.mum, days: 6, finish: 'ordered', lines: [line('STA-PP-009', 100), line('STA-NB-011', 200)] });
  await purchase({ supplier: S[3], wh: w.blr, days: 3, finish: 'draft', lines: [line('FUR-CH-012', 6)] });
  await purchase({ supplier: S[2], wh: w.chn, days: 30, finish: 'cancelled', lines: [line('HAR-DR-015', 20)], notes: 'Price dispute' });

  console.log('Creating sales orders...');
  const sale = async ({ customer, wh, lines, days, actor = u.s1, finish = 'delivered', tax = 0, discount = 0 }) => {
    const order = await orderService.createOrder(
      { orderType: 'sale', customer: customer._id, sourceWarehouse: wh._id, items: lines, tax, discount, orderDate: daysAgo(days), expectedDeliveryDate: daysAgo(days - 4) },
      actor
    );
    if (finish === 'draft') return order;
    if (finish === 'cancelled') return wf.cancelOrder(order._id, { remarks: 'Customer cancelled' }, actor);
    await wf.confirmOrder(order._id, actor);
    if (finish === 'confirmed') return order;
    if (finish === 'processing') return wf.processOrder(order._id, actor);
    await wf.shipOrder(order._id, actor);
    if (finish === 'shipped') return order;
    return wf.deliverOrder(order._id, actor);
  };
  await sale({ customer: C[0], wh: w.chn, days: 110, lines: [line('ELE-MS-001', 10), line('ELE-KB-002', 4)], tax: 1500 });
  await sale({ customer: C[2], wh: w.chn, days: 98, lines: [line('STA-NB-011', 60), line('STA-PP-009', 20)], tax: 400, actor: u.s3 });
  await sale({ customer: C[4], wh: w.blr, days: 80, lines: [line('ACC-PB-008', 12), line('ACC-HD-006', 25)], tax: 900, discount: 200, actor: u.s2 });
  await sale({ customer: C[1], wh: w.chn, days: 66, lines: [line('ELE-HB-004', 15), line('ELE-MS-001', 20)], tax: 1800 });
  await sale({ customer: C[3], wh: w.mum, days: 52, lines: [line('FUR-CH-012', 5), line('FUR-FC-014', 2)], tax: 4200, discount: 1000, actor: u.admin });
  await sale({ customer: C[5], wh: w.blr, days: 45, lines: [line('HAR-LB-017', 40), line('HAR-TK-016', 3)], tax: 500, actor: u.s2 });
  await sale({ customer: C[6], wh: w.chn, days: 33, lines: [line('ELE-MN-003', 3)], tax: 2600 });
  await sale({ customer: C[8], wh: w.blr, days: 21, lines: [line('ELE-MN-003', 4), line('ELE-KB-002', 5)], tax: 3000, discount: 800, actor: u.s2 });
  await sale({ customer: C[7], wh: w.mum, days: 14, lines: [line('HAR-LB-017', 30), line('ACC-LS-007', 10)], tax: 300, actor: u.s3, finish: 'shipped' });
  await sale({ customer: C[9], wh: w.chn, days: 9, lines: [line('STA-BP-010', 20), line('STA-PP-009', 25)], tax: 200, finish: 'processing' });
  await sale({ customer: C[0], wh: w.chn, days: 5, lines: [line('ELE-HB-004', 8), line('ELE-MS-001', 12)], tax: 600, finish: 'confirmed' });
  await sale({ customer: C[4], wh: w.blr, days: 3, lines: [line('ACC-HD-006', 20)], finish: 'confirmed', actor: u.s2 });
  await sale({ customer: C[2], wh: w.chn, days: 2, lines: [line('STA-NB-011', 40)], finish: 'draft', actor: u.s3 });
  await sale({ customer: C[6], wh: w.blr, days: 18, lines: [line('ELE-KB-002', 2)], finish: 'cancelled' });

  console.log('Creating warehouse transfers...');
  const transfer = async ({ from, to, lines, days, finish = 'completed', actor = u.m1 }) => {
    const order = await orderService.createOrder(
      { orderType: 'transfer', sourceWarehouse: from._id, destinationWarehouse: to._id, items: lines, orderDate: daysAgo(days), notes: 'Inter-warehouse rebalancing' },
      actor
    );
    if (finish === 'pending') return order;
    if (finish === 'in-transit') return wf.shipOrder(order._id, actor);
    return wf.completeTransfer(order._id, actor);
  };
  await transfer({ from: w.chn, to: w.blr, days: 50, lines: [line('ELE-MS-001', 20), line('STA-PP-009', 30)] });
  await transfer({ from: w.blr, to: w.mum, days: 28, lines: [line('ACC-HD-006', 25)], actor: u.m2 });
  await transfer({ from: w.chn, to: w.mum, days: 7, lines: [line('ELE-HB-004', 6)], finish: 'in-transit' });
  await transfer({ from: w.blr, to: w.chn, days: 2, lines: [line('STA-BP-010', 10)], finish: 'pending', actor: u.m2 });

  console.log('Recording stock adjustments...');
  await adjustStock({ product: P['ACC-LS-007']._id, warehouse: w.chn._id, type: 'decrease', quantity: 3, reason: 'Damaged during stock-take' }, u.m1);
  await adjustStock({ product: P['HAR-LB-017']._id, warehouse: w.blr._id, type: 'decrease', quantity: 6, reason: 'Broken bulbs written off' }, u.m2);
  await adjustStock({ product: P['STA-NB-011']._id, warehouse: w.chn._id, type: 'increase', quantity: 12, reason: 'Found during cycle count' }, u.m1);
  await adjustStock({ product: P['ELE-KB-002']._id, warehouse: w.blr._id, type: 'increase', quantity: 5, reason: 'Customer return restocked' }, u.m2);

  const check = await verifyConsistency();
  const counts = Object.fromEntries(
    await Promise.all(
      [['users', User], ['warehouses', Warehouse], ['products', Product], ['suppliers', Supplier], ['customers', Customer], ['inventory rows', Inventory], ['orders', Order], ['stock movements', StockMovement]].map(
        async ([n, M]) => [n, await M.countDocuments()]
      )
    )
  );
  console.log('\nSeed complete:', counts);
  console.log(check.ok ? `Consistency check passed (${check.checkedRows} inventory rows)` : `CONSISTENCY PROBLEMS:\n${check.problems.join('\n')}`);
  console.log('\nDemo logins:\n  Admin:    admin@stockflow.com    / Admin@123\n  Manager:  manager1@stockflow.com / Manager@123\n  Staff:    staff1@stockflow.com   / Staff@123');
  await mongoose.disconnect();
  process.exit(check.ok ? 0 : 1);
}

run().catch(async (err) => {
  console.error('\nSeed failed:', err.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
