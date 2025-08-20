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

// Get monthly sales data
router.get('/monthly', salesController.getMonthlySales);

// Get daily sales trend for current month
router.get('/daily-trend', salesController.getDailySalesTrend);

// Get sales summaries grouped by date with filters
router.get('/summaries', salesController.getSalesSummaries);

// Get all sales across all stations
router.get('/', salesController.getAllSales);

// Get all sales for a specific client
router.get('/client/:clientId', salesController.getSalesByClient);

// Get all sales for a specific date
router.get('/date/:date', salesController.getSalesByDate);

// Get attendant performance data
router.get('/attendant-performance', salesController.getAttendantPerformance);

// Get detailed sales for a specific attendant
router.get('/attendant-sales', salesController.getAttendantSales);

// Test route to check sales data
router.get('/test', salesController.testSalesData);

module.exports = router;
