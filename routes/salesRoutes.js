const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

// Post a new sale
router.post('/', salesController.postSale);

// Get all sales for a specific station
router.get('/station/:stationId', salesController.getStationSales);

// Get station stock information
router.get('/station/:stationId/stock', salesController.getStationStock);

// Get station stock ledger
router.get('/station/:stationId/ledger', salesController.getStationStockLedger);

// Add stock to station
router.post('/station/:stationId/stock', salesController.addStationStock);

// Get all sales across all stations
router.get('/monthly', salesController.getMonthlySales);
router.get('/', salesController.getAllSales);

module.exports = router;
