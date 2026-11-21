'use strict';

const settingsService = require('../services/settingsService');
const { asyncHandler } = require('../utils/errors');

const get = asyncHandler(async (req, res) => {
  res.json({ settings: await settingsService.getSettings() });
});

const update = asyncHandler(async (req, res) => {
  const settings = await settingsService.updateSettings(req.body);
  res.json({ message: 'Settings saved', settings });
});

module.exports = { get, update };
