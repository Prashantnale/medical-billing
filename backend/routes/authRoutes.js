'use strict';

const express = require('express');
const authController = require('../controllers/authController');
const { registerRules, loginRules, changePasswordRules } = require('../validators/authValidator');
const { validate } = require('../middleware/validate');
const { requireAuthApi, requireSetupModeApi } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiters');

const router = express.Router();

// One-time owner registration (only before an admin exists)
router.post('/register', requireSetupModeApi, authLimiter, registerRules, validate, authController.register);

router.post('/login', authLimiter, loginRules, validate, authController.login);

router.post('/logout', authController.logout);

router.get('/status', (req, res) => authController.status(req, res));

router.post('/change-password', requireAuthApi, authLimiter, changePasswordRules, validate, authController.changePassword);

module.exports = router;
