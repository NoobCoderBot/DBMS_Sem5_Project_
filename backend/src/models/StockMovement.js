const mongoose = require('mongoose');
const { MOVEMENT_TYPES } = require('../utils/constants');

const { Schema } = mongoose;

/**
 * Immutable ledger of every stock change.
 * `quantity` is signed: positive = stock in, negative = stock out.
 * Invariant: newQuantity === previousQuantity + quantity.
 */
const stockMovementSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    movementType: { type: String, enum: MOVEMENT_TYPES, required: true },
    quantity: { type: Number, required: true, validate: { validator: (v) => Number.isInteger(v) && v !== 0, message: 'quantity must be a non-zero integer' } },
    previousQuantity: { type: Number, required: true, min: 0 },
    newQuantity: { type: Number, required: true, min: 0 },
    referenceOrder: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
    remarks: { type: String, trim: true, maxlength: 500, default: '' },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ product: 1, warehouse: 1, createdAt: -1 });
stockMovementSchema.index({ warehouse: 1, createdAt: -1 });
stockMovementSchema.index({ movementType: 1, createdAt: -1 });
stockMovementSchema.index({ referenceOrder: 1 });
stockMovementSchema.index({ performedBy: 1 });
stockMovementSchema.index({ createdAt: -1 });

stockMovementSchema.pre('validate', function checkInvariant() {
  if (this.newQuantity !== this.previousQuantity + this.quantity) {
    this.invalidate('newQuantity', 'newQuantity must equal previousQuantity + quantity');
  }
});

// --- Immutability: movements can only ever be inserted ---
const immutable = () => {
  throw new Error('Stock movements are immutable and cannot be modified or deleted');
};
[
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'replaceOne',
  'deleteOne',
  'deleteMany',
].forEach((op) => stockMovementSchema.pre(op, immutable));
stockMovementSchema.pre('save', function blockResave() {
  if (!this.isNew) immutable();
});

stockMovementSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);
