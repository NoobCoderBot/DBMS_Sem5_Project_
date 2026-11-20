const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { validate, validateObjectId } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const { ROLES } = require('../utils/constants');
const { listQuery } = require('../validators/common');
const authValidator = require('../validators/auth.validator');
const entity = require('../validators/entity.validator');
const orderValidator = require('../validators/order.validator');
const inventoryValidator = require('../validators/inventory.validator');

const authCtrl = require('../controllers/auth.controller');
const { productCtrl, supplierCtrl, customerCtrl, warehouseCtrl, userCtrl } = require('../controllers/entities.controller');
const inventoryCtrl = require('../controllers/inventory.controller');
const orderCtrl = require('../controllers/order.controller');
const reportCtrl = require('../controllers/report.controller');

const { ADMIN, MANAGER, STAFF } = ROLES;
const ALL = [ADMIN, MANAGER, STAFF];
const OPS = [ADMIN, MANAGER];

const router = express.Router();

/* ------------------------------- Auth ------------------------------- */
const auth = express.Router();
auth.post('/register', authLimiter, validate(authValidator.register), authCtrl.register);
auth.post('/login', authLimiter, validate(authValidator.login), authCtrl.login);
auth.get('/me', protect, authCtrl.me);
auth.put('/profile', protect, validate(authValidator.updateProfile), authCtrl.updateProfile);
auth.put('/change-password', protect, validate(authValidator.changePassword), authCtrl.changePassword);
router.use('/auth', auth);

/** Wires standard CRUD routes with per-verb role lists. */
function crudRoutes(path, ctrl, validators, roles, extra) {
  const r = express.Router();
  r.use(protect);
  if (extra) extra(r); // extra routes must be registered before '/:id'
  r.get('/', authorize(...roles.read), validate(listQuery, 'query'), ctrl.list);
  r.post('/', authorize(...roles.create), validate(validators.create), ctrl.create);
  r.get('/:id', authorize(...roles.read), validateObjectId('id'), ctrl.getOne);
  r.put('/:id', authorize(...roles.update), validateObjectId('id'), validate(validators.update), ctrl.update);
  r.delete('/:id', authorize(...roles.remove), validateObjectId('id'), ctrl.remove);
  router.use(path, r);
}

crudRoutes('/products', productCtrl, entity.product, { read: ALL, create: OPS, update: OPS, remove: OPS }, (r) =>
  r.get('/categories', authorize(...ALL), productCtrl.categories)
);
crudRoutes('/suppliers', supplierCtrl, entity.supplier, { read: OPS, create: OPS, update: OPS, remove: OPS });
crudRoutes('/customers', customerCtrl, entity.customer, { read: ALL, create: ALL, update: OPS, remove: OPS });
crudRoutes('/warehouses', warehouseCtrl, entity.warehouse, { read: ALL, create: OPS, update: OPS, remove: OPS });
crudRoutes('/users', userCtrl, entity.user, { read: [ADMIN], create: [ADMIN], update: [ADMIN], remove: [ADMIN] });

/* ----------------------------- Inventory ----------------------------- */
const inventory = express.Router();
inventory.use(protect);
inventory.get('/', authorize(...ALL), validate(inventoryValidator.inventoryQuery, 'query'), inventoryCtrl.list);
inventory.post('/adjustments', authorize(...OPS), validate(inventoryValidator.adjustment), inventoryCtrl.adjust);
inventory.get('/warehouse/:warehouseId', authorize(...ALL), validateObjectId('warehouseId'), validate(inventoryValidator.inventoryQuery, 'query'), inventoryCtrl.byWarehouse);
inventory.get('/product/:productId', authorize(...ALL), validateObjectId('productId'), validate(inventoryValidator.inventoryQuery, 'query'), inventoryCtrl.byProduct);
inventory.get('/:id', authorize(...ALL), validateObjectId('id'), inventoryCtrl.getOne);
router.use('/inventory', inventory);

/* ------------------------------ Orders ------------------------------ */
// Role checks that depend on the order type live in the order service (sales: all roles,
// purchases/transfers: Admin + Inventory Manager); staff are also restricted to sales orders.
const orders = express.Router();
orders.use(protect);
orders.get('/', authorize(...ALL), validate(orderValidator.listQuery, 'query'), orderCtrl.list);
orders.post('/', authorize(...ALL), validate(orderValidator.create), orderCtrl.create);
orders.get('/:id', authorize(...ALL), validateObjectId('id'), orderCtrl.getOne);
orders.put('/:id', authorize(...ALL), validateObjectId('id'), validate(orderValidator.update), orderCtrl.update);
orders.delete('/:id', authorize(...ALL), validateObjectId('id'), orderCtrl.remove);
orders.patch('/:id/confirm', authorize(...ALL), validateObjectId('id'), orderCtrl.confirm);
orders.patch('/:id/process', authorize(...ALL), validateObjectId('id'), orderCtrl.process);
orders.patch('/:id/receive', authorize(...ALL), validateObjectId('id'), validate(orderValidator.receive), orderCtrl.receive);
orders.patch('/:id/ship', authorize(...ALL), validateObjectId('id'), orderCtrl.ship);
orders.patch('/:id/deliver', authorize(...ALL), validateObjectId('id'), orderCtrl.deliver);
orders.patch('/:id/complete-transfer', authorize(...ALL), validateObjectId('id'), orderCtrl.completeTransfer);
orders.patch('/:id/cancel', authorize(...ALL), validateObjectId('id'), validate(orderValidator.remarks), orderCtrl.cancel);
router.use('/orders', orders);

/* -------------------------- Stock movements -------------------------- */
const movements = express.Router();
movements.use(protect, authorize(...OPS));
movements.get('/', validate(inventoryValidator.movementQuery, 'query'), inventoryCtrl.listMovements);
movements.get('/:id', validateObjectId('id'), inventoryCtrl.getMovement);
router.use('/stock-movements', movements);

/* ------------------------------ Reports ------------------------------ */
const reports = express.Router();
reports.use(protect);
reports.get('/dashboard', authorize(...ALL), reportCtrl.dashboard);
reports.get('/inventory', authorize(...OPS), reportCtrl.inventory);
reports.get('/purchases', authorize(...OPS), reportCtrl.purchases);
reports.get('/sales', authorize(...OPS), reportCtrl.sales);
reports.get('/low-stock', authorize(...OPS), reportCtrl.lowStock);
reports.get('/warehouse', authorize(...OPS), reportCtrl.warehouse);
reports.get('/valuation', authorize(...OPS), reportCtrl.valuation);
reports.get('/stock-movements', authorize(...OPS), reportCtrl.movementSummary);
router.use('/reports', reports);

module.exports = router;
