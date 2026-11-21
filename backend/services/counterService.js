'use strict';

const Counter = require('../models/Counter');
const { AppError } = require('../utils/errors');

const COUNTER_ID = 'invoice';

/** Atomically reserve the next sequence number (safe under concurrency). */
async function nextSequence() {
  const counter = await Counter.findOneAndUpdate(
    { _id: COUNTER_ID },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

/** Current highest reserved sequence (0 when no bill has been created). */
async function currentSequence() {
  const counter = await Counter.findById(COUNTER_ID).lean();
  return counter ? counter.seq : 0;
}

/**
 * Move the counter forward (never backward) so it matches
 * settings.nextInvoiceNumber - 1. Prevents number reuse/duplicates.
 */
async function syncSequenceWithSettings(settings) {
  const target = Math.max(1, Number(settings.nextInvoiceNumber) || 1) - 1;
  const current = await currentSequence();
  if (target > current) {
    await Counter.updateOne({ _id: COUNTER_ID }, { $set: { seq: target } }, { upsert: true });
  }
}

/** Format prefix + zero-padded sequence, e.g. INV- + 1 (pad 4) -> INV-0001 */
function formatInvoiceNumber(prefix, padding, seq) {
  return `${prefix || ''}${String(seq).padStart(padding || 4, '0')}`;
}

module.exports = { COUNTER_ID, nextSequence, currentSequence, syncSequenceWithSettings, formatInvoiceNumber };
