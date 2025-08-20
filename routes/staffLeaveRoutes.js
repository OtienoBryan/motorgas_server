const express = require('express');
const router = express.Router();
const staffLeaveController = require('../controllers/staffLeaveController');

// Get all staff leaves with optional filters
router.get('/', staffLeaveController.getStaffLeaves);

// Get staff leave by ID
router.get('/:id', staffLeaveController.getLeaveById);

// Create new leave record
router.post('/', staffLeaveController.createLeave);

// Update leave record
router.put('/:id', staffLeaveController.updateLeave);

// Delete leave record
router.delete('/:id', staffLeaveController.deleteLeave);

// Approve leave
router.put('/:id/approve', staffLeaveController.approveLeave);

module.exports = router;
