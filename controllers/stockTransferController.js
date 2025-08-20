const db = require('../config/database');

module.exports = {
  // Get all stock transfers
  getAllStockTransfers: async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT 
          st.*,
          fb.name as from_barracks_name,
          tb.name as to_barracks_name,
          i.name as item_name,
          i.unit as item_unit,
          ur.username as requester_username,
          ar.username as approver_username
        FROM stock_transfers st
        LEFT JOIN barracks fb ON st.from_barracks_id = fb.id
        LEFT JOIN barracks tb ON st.to_barracks_id = tb.id
        LEFT JOIN items i ON st.item_id = i.id
        LEFT JOIN users ur ON st.requested_by = ur.id
        LEFT JOIN users ar ON st.approved_by = ar.id
        ORDER BY st.created_at DESC
      `);

      res.json(rows);
    } catch (error) {
      console.error('Error getting stock transfers:', error);
      res.status(500).json({ message: 'Error getting stock transfers', error: error.message });
    }
  },

  // Get stock transfers by status
  getStockTransfersByStatus: async (req, res) => {
    try {
      const { status } = req.params;
      const [rows] = await db.query(`
        SELECT 
          st.*,
          fb.name as from_barracks_name,
          tb.name as to_barracks_name,
          i.name as item_name,
          i.unit as item_unit,
          ur.username as requester_username,
          ar.username as approver_username
        FROM stock_transfers st
        LEFT JOIN barracks fb ON st.from_barracks_id = fb.id
        LEFT JOIN barracks tb ON st.to_barracks_id = tb.id
        LEFT JOIN items i ON st.item_id = i.id
        LEFT JOIN users ur ON st.requested_by = ur.id
        LEFT JOIN users ar ON st.approved_by = ar.id
        WHERE st.status = ?
        ORDER BY st.created_at DESC
      `, [status]);

      res.json(rows);
    } catch (error) {
      console.error('Error getting stock transfers by status:', error);
      res.status(500).json({ message: 'Error getting stock transfers by status', error: error.message });
    }
  },

  // Create a new stock transfer request
  createStockTransfer: async (req, res) => {
    try {
      const {
        fromBarracksId,
        toBarracksId,
        itemId,
        quantity,
        comment
      } = req.body;

      const requestedBy = req.user?.id || 1; // Default to user ID 1 if not authenticated

      // Validate that from barracks has sufficient stock
      const [stockRows] = await db.query(
        'SELECT quantity FROM barrack_stock WHERE barracks_id = ? AND item_id = ?',
        [fromBarracksId, itemId]
      );

      if (stockRows.length === 0 || stockRows[0].quantity < quantity) {
        return res.status(400).json({ 
          message: 'Insufficient stock in source barracks' 
        });
      }

      // Insert the transfer request
      const [result] = await db.query(`
        INSERT INTO stock_transfers (
          from_barracks_id, to_barracks_id, item_id, quantity, 
          requested_by, request_date, comment
        ) VALUES (?, ?, ?, ?, ?, NOW(), ?)
      `, [fromBarracksId, toBarracksId, itemId, quantity, requestedBy, comment]);

      res.status(201).json({
        message: 'Stock transfer request created successfully',
        transferId: result.insertId
      });
    } catch (error) {
      console.error('Error creating stock transfer:', error);
      res.status(500).json({ message: 'Error creating stock transfer', error: error.message });
    }
  },

  // Approve a stock transfer
  approveStockTransfer: async (req, res) => {
    const connection = await db.getConnection();
    try {
      const { transferId } = req.params;
      const { comment } = req.body;
      const approvedBy = req.user?.id || 1; // Default to user ID 1 if not authenticated

      await connection.beginTransaction();

      // Get transfer details
      const [transferRows] = await connection.query(
        'SELECT * FROM stock_transfers WHERE id = ? AND status = "pending"',
        [transferId]
      );

      if (transferRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: 'Transfer request not found or already processed' });
      }

      const transfer = transferRows[0];

      // Check if source barracks still has sufficient stock
      const [stockRows] = await connection.query(
        'SELECT quantity FROM barrack_stock WHERE barracks_id = ? AND item_id = ?',
        [transfer.from_barracks_id, transfer.item_id]
      );

      if (stockRows.length === 0 || stockRows[0].quantity < transfer.quantity) {
        await connection.rollback();
        return res.status(400).json({ message: 'Insufficient stock in source barracks' });
      }

      // Update transfer status to approved
      await connection.query(
        'UPDATE stock_transfers SET status = "approved", approved_by = ?, approval_date = NOW(), comment = ? WHERE id = ?',
        [approvedBy, comment || transfer.comment, transferId]
      );

      // Deduct quantity from source barracks
      await connection.query(
        'UPDATE barrack_stock SET quantity = quantity - ? WHERE barracks_id = ? AND item_id = ?',
        [transfer.quantity, transfer.from_barracks_id, transfer.item_id]
      );

      // Add quantity to destination barracks
      const [destStockRows] = await connection.query(
        'SELECT id FROM barrack_stock WHERE barracks_id = ? AND item_id = ?',
        [transfer.to_barracks_id, transfer.item_id]
      );

      if (destStockRows.length > 0) {
        // Update existing stock
        await connection.query(
          'UPDATE barrack_stock SET quantity = quantity + ? WHERE barracks_id = ? AND item_id = ?',
          [transfer.quantity, transfer.to_barracks_id, transfer.item_id]
        );
      } else {
        // Create new stock entry
        await connection.query(
          'INSERT INTO barrack_stock (barracks_id, item_id, quantity) VALUES (?, ?, ?)',
          [transfer.to_barracks_id, transfer.item_id, transfer.quantity]
        );
      }

      // Record in stock ledger - OUT from source barracks
      await connection.query(`
        INSERT INTO stock_ledger (
          item_id, barracks_id, quantity_in, quantity_out, date, comment, 
          requested_by, approved_by, transfer_id
        ) VALUES (?, ?, 0, ?, NOW(), ?, ?, ?, ?)
      `, [
        transfer.item_id, 
        transfer.from_barracks_id, 
        transfer.quantity, 
        `Stock transfer out - ${transfer.quantity} to ${transfer.to_barracks_id}`,
        transfer.requested_by, 
        approvedBy, 
        transferId
      ]);

      // Record in stock ledger - IN to destination barracks
      await connection.query(`
        INSERT INTO stock_ledger (
          item_id, barracks_id, quantity_in, quantity_out, date, comment, 
          requested_by, approved_by, transfer_id
        ) VALUES (?, ?, ?, 0, NOW(), ?, ?, ?, ?)
      `, [
        transfer.item_id, 
        transfer.to_barracks_id, 
        transfer.quantity, 
        `Stock transfer in - ${transfer.quantity} from ${transfer.from_barracks_id}`,
        transfer.requested_by, 
        approvedBy, 
        transferId
      ]);

      await connection.commit();

      res.json({
        message: 'Stock transfer approved successfully',
        transferId: transferId
      });
    } catch (error) {
      await connection.rollback();
      console.error('Error approving stock transfer:', error);
      res.status(500).json({ message: 'Error approving stock transfer', error: error.message });
    } finally {
      connection.release();
    }
  },

  // Reject a stock transfer
  rejectStockTransfer: async (req, res) => {
    try {
      const { transferId } = req.params;
      const { comment } = req.body;
      const rejectedBy = req.user?.id || 1; // Default to user ID 1 if not authenticated

      // Update transfer status to rejected
      await db.query(
        'UPDATE stock_transfers SET status = "rejected", approved_by = ?, approval_date = NOW(), comment = ? WHERE id = ?',
        [rejectedBy, comment || 'Transfer rejected', transferId]
      );

      res.json({
        message: 'Stock transfer rejected successfully',
        transferId: transferId
      });
    } catch (error) {
      console.error('Error rejecting stock transfer:', error);
      res.status(500).json({ message: 'Error rejecting stock transfer', error: error.message });
    }
  },

  // Get stock ledger for a specific barracks
  getBarrackStockLedger: async (req, res) => {
    try {
      const { barracksId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // Get total count
      const [countRows] = await db.query(
        'SELECT COUNT(*) as total FROM stock_ledger WHERE barracks_id = ?',
        [barracksId]
      );

      // Get ledger entries with pagination
      const [rows] = await db.query(`
        SELECT 
          sl.*,
          i.name as item_name,
          i.unit as item_unit,
          ur.username as requester_username,
          ar.username as approver_username
        FROM stock_ledger sl
        LEFT JOIN items i ON sl.item_id = i.id
        LEFT JOIN users ur ON sl.requested_by = ur.id
        LEFT JOIN users ar ON sl.approved_by = ar.id
        WHERE sl.barracks_id = ? 
        ORDER BY sl.date DESC, sl.id DESC 
        LIMIT ? OFFSET ?
      `, [barracksId, limit, offset]);

      res.json({
        barracksId: parseInt(barracksId),
        totalEntries: countRows[0].total,
        currentPage: page,
        totalPages: Math.ceil(countRows[0].total / limit),
        entries: rows
      });
    } catch (error) {
      console.error('Error getting barrack stock ledger:', error);
      res.status(500).json({ message: 'Error getting barrack stock ledger', error: error.message });
    }
  },

  // Get current stock levels for all barracks
  getAllBarrackStock: async (req, res) => {
    try {
      const [rows] = await db.query(`
        SELECT 
          bs.*,
          b.name as barracks_name,
          b.location as barracks_location,
          i.name as item_name,
          i.unit as item_unit
        FROM barrack_stock bs
        LEFT JOIN barracks b ON bs.barracks_id = b.id
        LEFT JOIN items i ON bs.item_id = i.id
        ORDER BY b.name, i.name
      `);

      res.json(rows);
    } catch (error) {
      console.error('Error getting all barrack stock:', error);
      res.status(500).json({ message: 'Error getting all barrack stock', error: error.message });
    }
  },

  // Get all barracks
  getAllBarracks: async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM barracks ORDER BY name');
      res.json(rows);
    } catch (error) {
      console.error('Error getting barracks:', error);
      res.status(500).json({ message: 'Error getting barracks', error: error.message });
    }
  },

  // Get all items
  getAllItems: async (req, res) => {
    try {
      const [rows] = await db.query('SELECT * FROM items ORDER BY name');
      res.json(rows);
    } catch (error) {
      console.error('Error getting items:', error);
      res.status(500).json({ message: 'Error getting items', error: error.message });
    }
  }
};

