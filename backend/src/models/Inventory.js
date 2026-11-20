const mongoose = require('mongoose');

const intField = (extra = {}) => ({
  type: Number,
  default: 0,
  min: 0,
  validate: { validator: Number.isInteger, message: '{PATH} must be a whole number' },
  ...extra,
});

const inventorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    quantity: intField({ min: [0, 'Stock cannot be negative'] }),
    reservedQuantity: intField({ min: [0, 'Reserved quantity cannot be negative'] }),
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: false, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One row per (product, warehouse): this is the junction table of the Product <-> Warehouse M:N relationship.
inventorySchema.index({ product: 1, warehouse: 1 }, { unique: true });
inventorySchema.index({ warehouse: 1 });
inventorySchema.index({ quantity: 1 });

inventorySchema.virtual('availableQuantity').get(function available() {
  return this.quantity - this.reservedQuantity;
});

inventorySchema.pre('validate', function reservedCheck() {
  if (this.reservedQuantity > this.quantity) {
    this.invalidate('reservedQuantity', 'Reserved quantity cannot exceed stock on hand');
  }
});

inventorySchema.set('toJSON', {
  virtuals: true,
  transform: (_d, ret) => {
    delete ret.__v;
    delete ret.id;
    return ret;
  },
});

module.exports = mongoose.model('Inventory', inventorySchema);
