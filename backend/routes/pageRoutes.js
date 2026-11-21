'use strict';

const express = require('express');
const pageController = require('../controllers/pageController');
const { requireAuthPage, requireSetupMode } = require('../middleware/auth');

const router = express.Router();

// Entry point decides where to send the visitor
router.get('/', pageController.home);

// First-launch registration (only reachable while no admin exists)
router.get('/register', requireSetupMode, pageController.registerPage);
router.get('/login', pageController.loginPage);

// Protected pages
router.get('/dashboard', requireAuthPage, pageController.dashboardPage);
router.get('/bills', requireAuthPage, pageController.billsPage);
router.get('/bills/new', requireAuthPage, pageController.createBillPage);
router.get('/bills/view/:id', requireAuthPage, pageController.billViewPage);
router.get('/medicines', requireAuthPage, pageController.medicinesPage);
router.get('/settings', requireAuthPage, pageController.settingsPage);

module.exports = router;
