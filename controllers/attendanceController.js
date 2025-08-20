const db = require('../database/db');

const attendanceController = {
  // Get all attendance records with optional filters
  getAttendanceRecords: async (req, res) => {
    try {
      const { userId, stationId, status, startDate, endDate } = req.query;
      
      console.log('Fetching attendance records with filters:', { userId, stationId, status, startDate, endDate });
      
      // First, let's check if the table exists
      try {
        const [tableCheck] = await db.query('SHOW TABLES LIKE "checkin_records"');
        if (tableCheck.length === 0) {
          console.error('checkin_records table does not exist');
          return res.status(500).json({ 
            message: 'Attendance table does not exist. Please run the database setup script.',
            error: 'Table not found'
          });
        }
        console.log('checkin_records table exists');
      } catch (tableError) {
        console.error('Error checking table existence:', tableError);
        return res.status(500).json({ 
          message: 'Database error while checking table existence',
          error: tableError.message
        });
      }
      
      let query = `
        SELECT 
          cr.*,
          s.name as station_name
        FROM checkin_records cr
        LEFT JOIN stations s ON cr.station_id = s.id
        WHERE 1=1
      `;
      
      const params = [];
      
      if (userId) {
        query += ' AND cr.user_id = ?';
        params.push(userId);
      }
      
      if (stationId) {
        query += ' AND cr.station_id = ?';
        params.push(stationId);
      }
      
      if (status !== undefined && status !== '') {
        query += ' AND cr.status = ?';
        params.push(status);
      }
      
      if (startDate) {
        query += ' AND DATE(cr.time_in) >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        query += ' AND DATE(cr.time_in) <= ?';
        params.push(endDate);
      }
      
      query += ' ORDER BY cr.time_in DESC';
      
      console.log('Executing query:', query);
      console.log('With parameters:', params);
      
      const [records] = await db.query(query, params);
      
      console.log('Raw database records:', records);
      console.log('Number of records found:', records.length);
      
      // Map database fields to frontend fields
      const mappedRecords = records.map(record => ({
        id: record.id,
        userId: record.user_id,
        userName: record.user_name,
        stationId: record.station_id,
        stationName: record.station_name || 'Unknown Station',
        checkInLatitude: record.check_in_latitude,
        checkInLongitude: record.check_in_longitude,
        checkOutLatitude: record.check_out_latitude,
        checkOutLongitude: record.check_out_longitude,
        address: record.address,
        status: record.status,
        timeIn: record.time_in,
        timeOut: record.time_out,
        qrData: record.qr_data,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      }));
      
      console.log('Mapped records:', mappedRecords);
      
      res.json(mappedRecords);
    } catch (error) {
      console.error('Error fetching attendance records:', error);
      res.status(500).json({ message: 'Error fetching attendance records', error: error.message });
    }
  },

  // Get attendance record by ID
  getAttendanceRecordById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [records] = await db.query(`
        SELECT 
          cr.*,
          s.name as station_name
        FROM checkin_records cr
        LEFT JOIN stations s ON cr.station_id = s.id
        WHERE cr.id = ?
      `, [id]);
      
      if (records.length === 0) {
        return res.status(404).json({ message: 'Attendance record not found' });
      }
      
      const record = records[0];
      const mappedRecord = {
        id: record.id,
        userId: record.user_id,
        userName: record.user_name,
        stationId: record.station_id,
        stationName: record.station_name || 'Unknown Station',
        checkInLatitude: record.check_in_latitude,
        checkInLongitude: record.check_in_longitude,
        checkOutLatitude: record.check_out_latitude,
        checkOutLongitude: record.check_out_longitude,
        address: record.address,
        status: record.status,
        timeIn: record.time_in,
        timeOut: record.time_out,
        qrData: record.qr_data,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      };
      
      res.json(mappedRecord);
    } catch (error) {
      console.error('Error fetching attendance record:', error);
      res.status(500).json({ message: 'Error fetching attendance record', error: error.message });
    }
  },

  // Create check-in record
  createCheckIn: async (req, res) => {
    try {
      const {
        userId,
        userName,
        stationId,
        stationName,
        checkInLatitude,
        checkInLongitude,
        address,
        qrData
      } = req.body;
      
      // Validate required fields
      if (!userId || !userName || !stationId || !stationName || !checkInLatitude || !checkInLongitude) {
        return res.status(400).json({ message: 'Missing required fields' });
      }
      
      const [result] = await db.query(`
        INSERT INTO checkin_records (
          user_id, user_name, station_id, station_name,
          check_in_latitude, check_in_longitude, address, qr_data,
          status, time_in
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
      `, [
        userId, userName, stationId, stationName,
        checkInLatitude, checkInLongitude, address, qrData
      ]);
      
      const [newRecord] = await db.query(`
        SELECT * FROM checkin_records WHERE id = ?
      `, [result.insertId]);
      
      const record = newRecord[0];
      const mappedRecord = {
        id: record.id,
        userId: record.user_id,
        userName: record.user_name,
        stationId: record.station_id,
        stationName: record.station_name,
        checkInLatitude: record.check_in_latitude,
        checkInLongitude: record.check_in_longitude,
        checkOutLatitude: record.check_out_latitude,
        checkOutLongitude: record.check_out_longitude,
        address: record.address,
        status: record.status,
        timeIn: record.time_in,
        timeOut: record.time_out,
        qrData: record.qr_data,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      };
      
      res.status(201).json(mappedRecord);
    } catch (error) {
      console.error('Error creating check-in record:', error);
      res.status(500).json({ message: 'Error creating check-in record', error: error.message });
    }
  },

  // Check out (update existing record)
  checkOut: async (req, res) => {
    try {
      const { id } = req.params;
      const { checkOutLatitude, checkOutLongitude, address } = req.body;
      
      if (!checkOutLatitude || !checkOutLongitude) {
        return res.status(400).json({ message: 'Missing checkout coordinates' });
      }
      
      const [result] = await db.query(`
        UPDATE checkin_records 
        SET 
          check_out_latitude = ?,
          check_out_longitude = ?,
          address = ?,
          status = 0,
          time_out = NOW(),
          updated_at = NOW()
        WHERE id = ? AND status = 1
      `, [checkOutLatitude, checkOutLongitude, address, id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Record not found or already checked out' });
      }
      
      // Get updated record
      const [records] = await db.query(`
        SELECT 
          cr.*,
          s.name as station_name
        FROM checkin_records cr
        LEFT JOIN stations s ON cr.station_id = s.id
        WHERE cr.id = ?
      `, [id]);
      
      const record = records[0];
      const mappedRecord = {
        id: record.id,
        userId: record.user_id,
        userName: record.user_name,
        stationId: record.station_id,
        stationName: record.station_name || 'Unknown Station',
        checkInLatitude: record.check_in_latitude,
        checkInLongitude: record.check_in_longitude,
        checkOutLatitude: record.check_out_latitude,
        checkOutLongitude: record.check_out_longitude,
        address: record.address,
        status: record.status,
        timeIn: record.time_in,
        timeOut: record.time_out,
        qrData: record.qr_data,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      };
      
      res.json(mappedRecord);
    } catch (error) {
      console.error('Error checking out:', error);
      res.status(500).json({ message: 'Error checking out', error: error.message });
    }
  },

  // Update attendance record
  updateAttendanceRecord: async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Build dynamic update query
      const updateFields = [];
      const params = [];
      
      if (updateData.userName !== undefined) {
        updateFields.push('user_name = ?');
        params.push(updateData.userName);
      }
      
      if (updateData.stationId !== undefined) {
        updateFields.push('station_id = ?');
        params.push(updateData.stationId);
      }
      
      if (updateData.stationName !== undefined) {
        updateFields.push('station_name = ?');
        params.push(updateData.stationName);
      }
      
      if (updateData.address !== undefined) {
        updateFields.push('address = ?');
        params.push(updateData.address);
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
      
      const query = `UPDATE checkin_records SET ${updateFields.join(', ')} WHERE id = ?`;
      
      const [result] = await db.query(query, params);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Record not found' });
      }
      
      // Get updated record
      const [records] = await db.query(`
        SELECT 
          cr.*,
          s.name as station_name
        FROM checkin_records cr
        LEFT JOIN stations s ON cr.station_id = s.id
        WHERE cr.id = ?
      `, [id]);
      
      const record = records[0];
      const mappedRecord = {
        id: record.id,
        userId: record.user_id,
        userName: record.user_name,
        stationId: record.station_id,
        stationName: record.station_name || 'Unknown Station',
        checkInLatitude: record.check_in_latitude,
        checkInLongitude: record.check_in_longitude,
        checkOutLatitude: record.check_out_latitude,
        checkOutLongitude: record.check_out_longitude,
        address: record.address,
        status: record.status,
        timeIn: record.time_in,
        timeOut: record.time_out,
        qrData: record.qr_data,
        createdAt: record.created_at,
        updatedAt: record.updated_at
      };
      
      res.json(mappedRecord);
    } catch (error) {
      console.error('Error updating attendance record:', error);
      res.status(500).json({ message: 'Error updating attendance record', error: error.message });
    }
  },

  // Delete attendance record
  deleteAttendanceRecord: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [result] = await db.query('DELETE FROM checkin_records WHERE id = ?', [id]);
      
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Record not found' });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting attendance record:', error);
      res.status(500).json({ message: 'Error deleting attendance record', error: error.message });
    }
  },

  // Get attendance statistics
  getAttendanceStats: async (req, res) => {
    try {
      const { stationId, startDate, endDate } = req.query;
      
      console.log('Fetching attendance stats with filters:', { stationId, startDate, endDate });
      
      let whereClause = 'WHERE 1=1';
      const params = [];
      
      if (stationId) {
        whereClause += ' AND station_id = ?';
        params.push(stationId);
      }
      
      if (startDate) {
        whereClause += ' AND DATE(time_in) >= ?';
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += ' AND DATE(time_in) <= ?';
        params.push(endDate);
      }
      
      console.log('Stats where clause:', whereClause);
      console.log('Stats parameters:', params);
      
      // Get total check-ins
      const [totalCheckInsResult] = await db.query(`
        SELECT COUNT(*) as count FROM checkin_records ${whereClause}
      `, params);
      
      // Get total check-outs
      const [totalCheckOutsResult] = await db.query(`
        SELECT COUNT(*) as count FROM checkin_records ${whereClause} AND status = 0
      `, params);
      
      // Get active sessions
      const [activeSessionsResult] = await db.query(`
        SELECT COUNT(*) as count FROM checkin_records ${whereClause} AND status = 1
      `, params);
      
      // Calculate average session duration
      const [avgDurationResult] = await db.query(`
        SELECT 
          AVG(TIMESTAMPDIFF(MINUTE, time_in, time_out)) as avg_duration
        FROM checkin_records 
        ${whereClause} AND status = 0 AND time_out IS NOT NULL
      `, params);
      
      const stats = {
        totalCheckIns: totalCheckInsResult[0].count,
        totalCheckOuts: totalCheckOutsResult[0].count,
        activeSessions: activeSessionsResult[0].count,
        averageSessionDuration: avgDurationResult[0].avg_duration || 0
      };
      
      console.log('Calculated stats:', stats);
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching attendance stats:', error);
      res.status(500).json({ message: 'Error fetching attendance stats', error: error.message });
    }
  }
};

module.exports = attendanceController;
