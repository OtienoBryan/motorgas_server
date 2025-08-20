const express = require('express');
const router = express.Router();
const vehicleConversionController = require('../controllers/vehicleConversionController');

// Get all vehicle conversions
router.get('/', vehicleConversionController.getAllConversions);

// Get vehicle conversion by ID
router.get('/:id', vehicleConversionController.getConversionById);

// Create new vehicle conversion
router.post('/', vehicleConversionController.createConversion);

// Update vehicle conversion
router.put('/:id', vehicleConversionController.updateConversion);

// Delete vehicle conversion
router.delete('/:id', vehicleConversionController.deleteConversion);

// Get conversions by vehicle plate
router.get('/vehicle/:vehiclePlate', vehicleConversionController.getConversionsByVehicle);

// Get conversions by date range
router.get('/date-range', vehicleConversionController.getConversionStats);

// Get conversion statistics
router.get('/stats/summary', vehicleConversionController.getConversionStats);

module.exports = router;
