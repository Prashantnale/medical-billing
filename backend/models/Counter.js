'use strict';

const mongoose = require('mongoose');

/**
 * Atomic sequence counters. `findOneAndUpdate` + `$inc` guarantees that
 * two concurrent requests can never receive the same sequence number.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);
module.exports = Counter;
