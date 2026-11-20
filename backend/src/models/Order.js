const mongoose = require('mongoose');
const { ORDER_TYPES, ORDER_STATUSES, ALL_ORDER_STATUSES } = require('../utils/constants');
const { round2 } = require('../utils/helpers');

const { Schema } = mongoose;
const ref = (model, extra = {}) => ({ type: Schema.Types.ObjectId, ref: model, ...extra });
const wholeNumber = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

const orderItemSchema = new Schema({
  product: ref('Product', { required: true }),
  quantity: { type: Number, required: true, min: [1, 'Quantity must be at least 1'], validate: wholeNumber },
  receivedQuantity: { type: Number, default: 0, min: 0, validate: wholeNumber },
  unitPrice: { type: Number, required: true, min: [0, 'Unit price cannot be negative'] },
  subtotal: { type: Number, default: 0, min: 0 },
});

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, trim: true },
    orderType: { type: String, enum: ORDER_TYPES, required: true },
    supplier: ref('Supplier', { default: null }),
    customer: ref('Customer', { default: null }),
    sourceWarehouse: ref('Warehouse', { default: null }),
    destinationWarehouse: ref('Warehouse', { default: null }),
    items: {
      type: [orderItemSchema],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'An order needs at least one item'],
    },
    subtotal: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ALL_ORDER_STATUSES, required: true },
    orderDate: { type: Date, default: Date.now },
    expectedDeliveryDate: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    createdBy: ref('User', { required: true }),
  },
  { timestamps: true }
);

orderSchema.index({ orderType: 1, status: 1, orderDate: -1 });
orderSchema.index({ supplier: 1, orderDate: -1 });
orderSchema.index({ customer: 1, orderDate: -1 });
orderSchema.index({ sourceWarehouse: 1 });
orderSchema.index({ destinationWarehouse: 1 });
orderSchema.index({ 'items.product': 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ orderDate: -1 });

// Conditional required parties per order type + status/type consistency + totals.
orderSchema.pre('validate', function validateOrder() {
  const t = this.orderType;
  if (t === 'purchase') {
    if (!this.supplier) this.invalidate('supplier', 'Supplier is required for purchase orders');
    if (!this.destinationWarehouse) this.invalidate('destinationWarehouse', 'Destination warehouse is required');
    if (this.customer || this.sourceWarehouse) this.invalidate('orderType', 'Purchase orders cannot have a customer or source warehouse');
  } else if (t === 'sale') {
    if (!this.customer) this.invalidate('customer', 'Customer is required for sales orders');
    if (!this.sourceWarehouse) this.invalidate('sourceWarehouse', 'Source warehouse is required');
    if (this.supplier || this.destinationWarehouse) this.invalidate('orderType', 'Sales orders cannot have a supplier or destination warehouse');
  } else if (t === 'transfer') {
    if (!this.sourceWarehouse) this.invalidate('sourceWarehouse', 'Source warehouse is required');
    if (!this.destinationWarehouse) this.invalidate('destinationWarehouse', 'Destination warehouse is required');
    if (this.supplier || this.customer) this.invalidate('orderType', 'Transfers cannot have a supplier or customer');
    if (this.sourceWarehouse && this.destinationWarehouse && String(this.sourceWarehouse) === String(this.destinationWarehouse)) {
      this.invalidate('destinationWarehouse', 'Source and destination warehouses must differ');
    }
  }

  if (t && this.status && !ORDER_STATUSES[t].includes(this.status)) {
    this.invalidate('status', `"${this.status}" is not a valid status for ${t} orders`);
  }

  let subtotal = 0;
  for (const item of this.items) {
    item.subtotal = round2(item.quantity * item.unitPrice);
    subtotal += item.subtotal;
    if (item.receivedQuantity > item.quantity) this.invalidate('items', 'Received quantity cannot exceed ordered quantity');
  }
  this.subtotal = round2(subtotal);
  const grand = round2(this.subtotal + this.tax - this.discount);
  if (grand < 0) this.invalidate('discount', 'Discount cannot exceed subtotal plus tax');
  this.grandTotal = Math.max(grand, 0);
});

orderSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Order', orderSchema);
