const mongoose = require('mongoose');

const emptyToUndefined = (v) => (v === '' || v === null ? undefined : v);
const GSTIN_REGEX = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const customerSchema = new mongoose.Schema(
  {
    customerName: { type: String, required: [true, 'Customer name is required'], trim: true, maxlength: 150 },
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

customerSchema.index({ customerName: 1 });
customerSchema.index({ customerName: 'text' });
customerSchema.index({ status: 1 });

customerSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Customer', customerSchema);
