'use strict';

const express = require('express');
const medicineController = require('../controllers/medicineController');
const { requireAuthApi } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { medicineRules } = require('../validators/medicineValidator');

const router = express.Router();

router.use(requireAuthApi);

router.get('/', medicineController.list);
router.post('/', medicineRules, validate, medicineController.create);
router.delete('/:id', medicineController.remove);

module.exports = router;
