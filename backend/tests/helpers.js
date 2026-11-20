process.env.NODE_ENV = 'test';
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const request = require('supertest');

const app = require('../src/app');
const { User, Product, Supplier, Customer, Warehouse, Inventory } = require('../src/models');
const { signToken } = require('../src/utils/jwt');

let counter = 0;
const uid = () => `${Date.now().toString(36)}${(counter += 1)}`;

async function connect(dbName) {
  const base = process.env.TEST_MONGO_URI || fs.readFileSync(path.join(__dirname, '.uri'), 'utf8');
  const uri = base.replace(/\/\?/, `/${dbName}?`);
  await mongoose.connect(uri);
  // make sure unique indexes exist before tests rely on them
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

async function clearAll() {
  // raw collection access: test cleanup is the only place allowed to bypass the immutable ledger
  await Promise.all(Object.values(mongoose.models).map((m) => m.collection.deleteMany({})));
}

async function makeUser(role = 'Admin', extra = {}) {
  const user = await User.create({
    name: `${role} User`,
    email: `${uid()}@test.local`,
    password: 'Password123',
    role,
    ...extra,
  });
  return { user, token: signToken(user._id) };
}

const api = (token) => {
  const auth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (url) => auth(request(app).get(url)),
    post: (url, body) => auth(request(app).post(url)).send(body),
    put: (url, body) => auth(request(app).put(url)).send(body),
    patch: (url, body) => auth(request(app).patch(url)).send(body),
    delete: (url) => auth(request(app).delete(url)),
  };
};

const makeProduct = (extra = {}) =>
  Product.create({ productName: `Product ${uid()}`, SKU: `SKU-${uid()}`, category: 'General', costPrice: 10, sellingPrice: 15, reorderLevel: 5, ...extra });
const makeSupplier = (extra = {}) => Supplier.create({ supplierName: `Supplier ${uid()}`, ...extra });
const makeCustomer = (extra = {}) => Customer.create({ customerName: `Customer ${uid()}`, ...extra });
const makeWarehouse = (extra = {}) => Warehouse.create({ warehouseName: `Warehouse ${uid()}`, warehouseCode: `W${uid()}`.toUpperCase(), ...extra });
const setStock = (product, warehouse, quantity, reservedQuantity = 0) =>
  Inventory.findOneAndUpdate({ product, warehouse }, { quantity, reservedQuantity, lastUpdated: new Date() }, { upsert: true, new: true });
const stockOf = async (product, warehouse) => {
  const inv = await Inventory.findOne({ product, warehouse });
  return inv
    ? { quantity: inv.quantity, reserved: inv.reservedQuantity, available: inv.quantity - inv.reservedQuantity }
    : { quantity: 0, reserved: 0, available: 0 };
};

module.exports = { app, connect, disconnect, clearAll, makeUser, api, makeProduct, makeSupplier, makeCustomer, makeWarehouse, setStock, stockOf, uid };
