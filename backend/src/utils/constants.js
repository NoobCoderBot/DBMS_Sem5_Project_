const ROLES = Object.freeze({
  ADMIN: 'Admin',
  MANAGER: 'Inventory Manager',
  STAFF: 'Staff',
});
const ROLE_LIST = Object.values(ROLES);

const ORDER_TYPES = ['purchase', 'sale', 'transfer'];

const ORDER_STATUSES = Object.freeze({
  purchase: ['Draft', 'Ordered', 'Partially Received', 'Received', 'Cancelled'],
  sale: ['Draft', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
  transfer: ['Pending', 'In Transit', 'Completed', 'Cancelled'],
});
const ALL_ORDER_STATUSES = [...new Set(Object.values(ORDER_STATUSES).flat())];

const INITIAL_STATUS = Object.freeze({ purchase: 'Draft', sale: 'Draft', transfer: 'Pending' });
const EDITABLE_STATUSES = Object.freeze({ purchase: ['Draft'], sale: ['Draft'], transfer: ['Pending'] });

// Status counted as "real" business (not draft/cancelled) for monthly totals.
const COUNTED_STATUSES = Object.freeze({
  purchase: ['Ordered', 'Partially Received', 'Received'],
  sale: ['Confirmed', 'Processing', 'Shipped', 'Delivered'],
});
const PENDING_STATUSES = Object.freeze({
  purchase: ['Draft', 'Ordered', 'Partially Received'],
  sale: ['Draft', 'Confirmed', 'Processing'],
});

const MOVEMENT_TYPES = ['Purchase', 'Sale', 'Transfer In', 'Transfer Out', 'Adjustment', 'Return'];

const PRODUCT_UNITS = ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'box', 'pack', 'carton', 'pair', 'set'];

// Which roles may manage (create / transition) each order type.
const ORDER_ROLES = Object.freeze({
  purchase: [ROLES.ADMIN, ROLES.MANAGER],
  transfer: [ROLES.ADMIN, ROLES.MANAGER],
  sale: [ROLES.ADMIN, ROLES.MANAGER, ROLES.STAFF],
});

module.exports = {
  ROLES,
  ROLE_LIST,
  ORDER_TYPES,
  ORDER_STATUSES,
  ALL_ORDER_STATUSES,
  INITIAL_STATUS,
  EDITABLE_STATUSES,
  COUNTED_STATUSES,
  PENDING_STATUSES,
  MOVEMENT_TYPES,
  PRODUCT_UNITS,
  ORDER_ROLES,
};
