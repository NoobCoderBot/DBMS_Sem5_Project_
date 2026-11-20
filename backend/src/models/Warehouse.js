const mongoose = require('mongoose');

const warehouseSchema = new mongoose.Schema(
  {
    warehouseName: { type: String, required: [true, 'Warehouse name is required'], trim: true, maxlength: 120 },
    warehouseCode: {
      type: String,
      required: [true, 'Warehouse code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    location: { type: String, trim: true, maxlength: 120, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    contactNumber: { type: String, trim: true, maxlength: 20, default: '' },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

warehouseSchema.index({ warehouseName: 1 });
warehouseSchema.index({ warehouseName: 'text', location: 'text' });
warehouseSchema.index({ manager: 1 });
warehouseSchema.index({ status: 1 });

warehouseSchema.set('toJSON', {
  transform: (_d, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Warehouse', warehouseSchema);
