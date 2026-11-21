'use strict';

const express = require('express');
const settingsController = require('../controllers/settingsController');
const { updateSettingsRules } = require('../validators/settingsValidator');
const { validate } = require('../middleware/validate');
const { requireAuthApi } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuthApi);

router.get('/', settingsController.get);
router.put('/', updateSettingsRules, validate, settingsController.update);

module.exports = router;
