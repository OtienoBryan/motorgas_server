const express = require('express');
const router = express.Router();
const stockTransferController = require('../controllers/stockTransferController');

// Get all stock transfers
router.get('/', stockTransferController.getAllStockTransfers);

// Get stock transfers by status
router.get('/status/:status', stockTransferController.getStockTransfersByStatus);

// Create a new stock transfer request
router.post('/', stockTransferController.createStockTransfer);

// Approve a stock transfer
router.post('/:transferId/approve', stockTransferController.approveStockTransfer);

// Reject a stock transfer
router.post('/:transferId/reject', stockTransferController.rejectStockTransfer);

// Get stock ledger for a specific barracks
router.get('/ledger/:barracksId', stockTransferController.getBarrackStockLedger);

// Get current stock levels for all barracks
router.get('/stock/all', stockTransferController.getAllBarrackStock);

// Get all barracks
router.get('/barracks', stockTransferController.getAllBarracks);

// Get all items
router.get('/items', stockTransferController.getAllItems);

module.exports = router;

