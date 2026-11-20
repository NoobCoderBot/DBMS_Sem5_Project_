const mongoose = require('mongoose');
const { PRODUCT_UNITS } = require('../utils/constants');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);

const productSchema = new mongoose.Schema(
  {
    productName: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 150 },
    SKU: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    category: { type: String, required: [true, 'Category is required'], trim: true, maxlength: 80 },
    brand: { type: String, trim: true, maxlength: 80, default: '' },
    unit: { type: String, enum: PRODUCT_UNITS, default: 'pcs' },
    costPrice: { type: Number, required: true, min: [0, 'Cost price cannot be negative'] },
    sellingPrice: { type: Number, required: true, min: [0, 'Selling price cannot be negative'] },
    reorderLevel: { type: Number, default: 10, min: 0, validate: Number.isInteger },
    barcode: { type: String, trim: true, unique: true, sparse: true, set: emptyToUndefined },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

productSchema.index({ productName: 'text', SKU: 'text', brand: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ productName: 1 });

productSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Product', productSchema);
