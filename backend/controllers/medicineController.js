'use strict';

const Medicine = require('../models/Medicine');
const { asyncHandler, AppError } = require('../utils/errors');

/** GET /api/medicines - full list for the bill-form type-ahead (single user). */
const list = asyncHandler(async (req, res) => {
  const medicines = await Medicine.find().sort({ name: 1 }).limit(1000).lean();
  res.json({ medicines });
});

/** POST /api/medicines - create or update a medicine (upsert by name). */
const create = asyncHandler(async (req, res) => {
  const medicine = await Medicine.upsertFromBillItem(req.body);
  if (!medicine) throw new AppError('Medicine name is required', 422);
  res.status(201).json({ message: 'Medicine saved', medicine });
});

/** DELETE /api/medicines/:id */
const remove = asyncHandler(async (req, res) => {
  const medicine = await Medicine.findByIdAndDelete(req.params.id);
  if (!medicine) throw new AppError('Medicine not found', 404);
  res.json({ message: 'Medicine removed' });
});

module.exports = { list, create, remove };
