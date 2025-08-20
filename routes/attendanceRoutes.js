const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');

// Get all attendance records with optional filters
router.get('/', attendanceController.getAttendanceRecords);

// Get attendance statistics
router.get('/stats', attendanceController.getAttendanceStats);

// Get attendance record by ID
router.get('/:id', attendanceController.getAttendanceRecordById);

// Create check-in record
router.post('/checkin', attendanceController.createCheckIn);

// Check out (update existing record)
router.put('/:id/checkout', attendanceController.checkOut);

// Update attendance record
router.put('/:id', attendanceController.updateAttendanceRecord);

// Delete attendance record
router.delete('/:id', attendanceController.deleteAttendanceRecord);

module.exports = router;
