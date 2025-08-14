const express = require('express');
const router = express.Router();
const stationController = require('../controllers/stationController');

// Get all stations
router.get('/', stationController.getAllStations);
// Static/collection routes must come before parameterized routes
router.get('/fuel-products', stationController.getFuelProducts);
router.get('/inventory', stationController.getStationsInventory);
router.get('/total-inventory', stationController.getTotalInventory);
// Prices routes
router.get('/:id/prices', stationController.getStationPrices);
router.post('/:id/prices', stationController.addStationPrice);
router.put('/:id/prices/:priceId', stationController.updateStationPrice);
router.delete('/:id/prices/:priceId', stationController.deleteStationPrice);
// Store routes
router.get('/:id/store', stationController.getStationStore);
router.post('/:id/store', stationController.updateStationStore);
// Pumps routes
router.get('/:id/pumps', stationController.getPumpsForStation);
router.post('/:id/pumps', stationController.addPump);
// Get a single station by id
router.get('/:id', stationController.getStation);
// Create a new station
router.post('/', stationController.createStation);
// Update a station
router.put('/:id', stationController.updateStation);
// Delete a station
router.delete('/:id', stationController.deleteStation);

module.exports = router; 