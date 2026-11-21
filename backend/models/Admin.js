'use strict';

const mongoose = require('mongoose');

/**
 * Single-admin collection. Exactly one document can ever exist:
 * the unique index on `singleton` (constant value 'ADMIN') makes it
 * impossible to create a second admin account, even under a race,
 * because MongoDB rejects the duplicate key at the storage level.
 */
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    passwordHash: { type: String, required: true },
    // Always 'ADMIN' + unique => hard backend guarantee of a single owner.
    singleton: { type: String, default: 'ADMIN', enum: ['ADMIN'], select: false },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

adminSchema.index({ singleton: 1 }, { unique: true });

adminSchema.methods.toSafeJSON = function toSafeJSON() {
  return { id: this._id.toString(), name: this.name, email: this.email, lastLoginAt: this.lastLoginAt };
};

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin;
