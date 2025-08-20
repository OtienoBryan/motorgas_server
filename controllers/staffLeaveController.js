const db = require('../database/db');

const staffLeaveController = {
  // Get all staff leaves with optional filters
  getStaffLeaves: async (req, res) => {
    try {
      const { staffId, startDate, endDate, status } = req.query;
      
      console.log('Fetching staff leaves with filters:', { staffId, startDate, endDate, status });
      
      let query = `
        SELECT 
          sl.*,
          s.name as staff_name
        FROM staff_leaves sl
        LEFT JOIN staff s ON sl.staff_id = s.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (staffId) {
        query += ' AND sl.staff_id = ?';
        params.push(staffId);
      }
      
      if (startDate) {
        query += ' AND DATE(sl.start_date) >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        query += ' AND DATE(sl.end_date) <= ?';
        params.push(endDate);
      }
      
      if (status) {
        query += ' AND sl.status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY sl.start_date DESC';
      
      console.log('Executing query:', query);
      console.log('With parameters:', params);
      
      const [leaves] = await db.query(query, params);
      
      console.log('Raw leave records:', leaves);
      console.log('Number of leaves found:', leaves.length);
      
      // Map database fields to frontend fields
      const mappedLeaves = leaves.map(leave => ({
        id: leave.id,
        staffId: leave.staff_id,
        staffName: leave.staff_name || leave.staff_name,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by,
        createdAt: leave.created_at,
        updatedAt: leave.updated_at
      }));
      
      console.log('Mapped leaves:', mappedLeaves);
      
      res.json(mappedLeaves);
    } catch (error) {
      console.error('Error fetching staff leaves:', error);
      res.status(500).json({ message: 'Error fetching staff leaves', error: error.message });
    }
  },

  // Get staff leave by ID
  getLeaveById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [leaves] = await db.query(`
        SELECT 
          sl.*,
          s.name as staff_name
        FROM staff_leaves sl
        LEFT JOIN staff s ON sl.staff_id = s.id
        WHERE sl.id = ?
      `, [id]);
      
      if (leaves.length === 0) {
        return res.status(404).json({ message: 'Leave record not found' });
      }
      
      const leave = leaves[0];
      const mappedLeave = {
        id: leave.id,
        staffId: leave.staff_id,
        staffName: leave.staff_name || leave.staff_name,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by,
        createdAt: leave.created_at,
        updatedAt: leave.updated_at
      };
      
      res.json(mappedLeave);
    } catch (error) {
      console.error('Error fetching leave record:', error);
      res.status(500).json({ message: 'Error fetching leave record', error: error.message });
    }
  },

  // Create new leave record
  createLeave: async (req, res) => {
    try {
      const {
        staffId,
        staffName,
        leaveType,
        startDate,
        endDate,
        reason
      } = req.body;
      
      // Validate required fields
      if (!staffId || !staffName || !leaveType || !startDate || !endDate || !reason) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      const [result] = await db.query(`
        INSERT INTO staff_leaves (
          staff_id, staff_name, leave_type, start_date, end_date, reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
      `, [staffId, staffName, leaveType, startDate, endDate, reason]);
      
      const [newLeave] = await db.query(`
        SELECT * FROM staff_leaves WHERE id = ?
      `, [result.insertId]);
      
      const leave = newLeave[0];
      const mappedLeave = {
        id: leave.id,
        staffId: leave.staff_id,
        staffName: leave.staff_name,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by,
        createdAt: leave.created_at,
        updatedAt: leave.updated_at
      };
      
      res.status(201).json(mappedLeave);
    } catch (error) {
      console.error('Error creating leave record:', error);
      res.status(500).json({ message: 'Error creating leave record', error: error.message });
    }
  },

  // Update leave record
  updateLeave: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Build dynamic update query
      const updateFields = [];
      const params = [];
      
      if (updateData.staffName !== undefined) {
        updateFields.push('staff_name = ?');
        params.push(updateData.staffName);
      }
      
      if (updateData.leaveType !== undefined) {
        updateFields.push('leave_type = ?');
        params.push(updateData.leaveType);
      }
      
      if (updateData.startDate !== undefined) {
        updateFields.push('start_date = ?');
        params.push(updateData.startDate);
      }
      
      if (updateData.endDate !== undefined) {
        updateFields.push('end_date = ?');
        params.push(updateData.endDate);
      }
      
      if (updateData.reason !== undefined) {
        updateFields.push('reason = ?');
        params.push(updateData.reason);
      }
      
      if (updateData.status !== undefined) {
        updateFields.push('status = ?');
        params.push(updateData.status);
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({ message: 'No fields to update' });
      }
      
      updateFields.push('updated_at = NOW()');
      params.push(id);
      
      const query = `UPDATE staff_leaves SET ${updateFields.join(', ')} WHERE id = ?`;
      
      const [result] = await db.query(query, params);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Leave record not found' });
      }
      
      // Get updated record
      const [leaves] = await db.query(`
        SELECT 
          sl.*,
          s.name as staff_name
        FROM staff_leaves sl
        LEFT JOIN staff s ON sl.staff_id = s.id
        WHERE sl.id = ?
      `, [id]);
      
      const leave = leaves[0];
      const mappedLeave = {
        id: leave.id,
        staffId: leave.staff_id,
        staffName: leave.staff_name || leave.staff_name,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by,
        createdAt: leave.created_at,
        updatedAt: leave.updated_at
      };
      
      res.json(mappedLeave);
    } catch (error) {
      console.error('Error updating leave record:', error);
      res.status(500).json({ message: 'Error updating leave record', error: error.message });
    }
  },

  // Delete leave record
  deleteLeave: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [result] = await db.query('DELETE FROM staff_leaves WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Leave record not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting leave record:', error);
      res.status(500).json({ message: 'Error deleting leave record', error: error.message });
    }
  },

  // Approve leave
  approveLeave: async (req, res) => {
    try {
      const { id } = req.params;
      const { approvedBy } = req.body;
      
      if (!approvedBy) {
        return res.status(400).json({ message: 'Approver name is required' });
      }
      
      const [result] = await db.query(`
        UPDATE staff_leaves 
        SET status = 'approved', approved_by = ?, updated_at = NOW()
        WHERE id = ? AND status = 'pending'
      `, [approvedBy, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Leave record not found or already processed' });
      }
      
      // Get updated record
      const [leaves] = await db.query(`
        SELECT 
          sl.*,
          s.name as staff_name
        FROM staff_leaves sl
        LEFT JOIN staff s ON sl.staff_id = s.id
        WHERE sl.id = ?
      `, [id]);
      
      const leave = leaves[0];
      const mappedLeave = {
        id: leave.id,
        staffId: leave.staff_id,
        staffName: leave.staff_name || leave.staff_name,
        leaveType: leave.leave_type,
        startDate: leave.start_date,
        endDate: leave.end_date,
        reason: leave.reason,
        status: leave.status,
        approvedBy: leave.approved_by,
        createdAt: leave.created_at,
        updatedAt: leave.updated_at
      };
      
      res.json(mappedLeave);
    } catch (error) {
      console.error('Error approving leave:', error);
      res.status(500).json({ message: 'Error approving leave', error: error.message });
    }
  }
};

module.exports = staffLeaveController;
