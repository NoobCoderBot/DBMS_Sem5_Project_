const mongoose = require('mongoose');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const supplierSchema = new mongoose.Schema(
  {
    supplierName: { type: String, required: [true, 'Supplier name is required'], trim: true, maxlength: 150 },
    contactPerson: { type: String, trim: true, maxlength: 100, default: '' },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      set: emptyToUndefined,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email address'],
    },
    phone: { type: String, trim: true, maxlength: 20, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    GSTIN: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      set: emptyToUndefined,
      match: [GSTIN_REGEX, 'Invalid GSTIN'],
    },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

supplierSchema.index({ supplierName: 1 });
supplierSchema.index({ supplierName: 'text', contactPerson: 'text' });
supplierSchema.index({ status: 1 });

supplierSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Supplier', supplierSchema);
module.exports.GSTIN_REGEX = GSTIN_REGEX;
