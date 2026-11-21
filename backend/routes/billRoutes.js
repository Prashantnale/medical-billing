'use strict';

const express = require('express');
const billController = require('../controllers/billController');
const { createBillRules, cancelBillRules } = require('../validators/billValidator');
const { validate } = require('../middleware/validate');
const { requireAuthApi } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuthApi);

router.get('/', billController.list);
router.post('/', createBillRules, validate, billController.create);
router.get('/next-number', billController.nextNumber);
router.get('/stats', billController.stats);
router.get('/:id', billController.getById);
router.get('/:id/pdf', billController.pdf);
router.post('/:id/cancel', cancelBillRules, validate, billController.cancel);

module.exports = router;
