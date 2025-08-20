const db = require('../config/database');

const vehicleConversionController = {
  // Get all vehicle conversions
  getAllConversions: async (req, res) => {
    try {
      // Ensure vehicle_conversions table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS vehicle_conversions (
          id INT(11) NOT NULL AUTO_INCREMENT,
          vehicle_plate VARCHAR(20) NOT NULL,
          vehicle_type VARCHAR(50) NOT NULL,
          conversion_type VARCHAR(100) NOT NULL,
          amount_charged DECIMAL(10,2) NOT NULL,
          service_date DATE NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

      const [rows] = await db.query(`
        SELECT * FROM vehicle_conversions 
        ORDER BY service_date DESC, created_at DESC
      `);

      res.json(rows);
    } catch (error) {
      console.error('Error getting vehicle conversions:', error);
      res.status(500).json({ message: 'Error getting vehicle conversions', error: error.message });
    }
  },

  // Get vehicle conversion by ID
  getConversionById: async (req, res) => {
    try {
      const { id } = req.params;
      
      const [rows] = await db.query(`
        SELECT * FROM vehicle_conversions WHERE id = ?
      `, [id]);

      if (rows.length === 0) {
        return res.status(404).json({ message: 'Vehicle conversion not found' });
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Error getting vehicle conversion:', error);
      res.status(500).json({ message: 'Error getting vehicle conversion', error: error.message });
    }
  },

  // Create new vehicle conversion
  createConversion: async (req, res) => {
    try {
      const { vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date, comment } = req.body;

      // Validate required fields
      if (!vehicle_plate || !vehicle_type || !conversion_type || !amount_charged || !service_date) {
        return res.status(400).json({ 
          message: 'Missing required fields: vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date' 
        });
      }

      // Validate amount
      if (isNaN(amount_charged) || amount_charged <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number' });
      }

      // Validate date
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(service_date)) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Ensure vehicle_conversions table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS vehicle_conversions (
          id INT(11) NOT NULL AUTO_INCREMENT,
          vehicle_plate VARCHAR(20) NOT NULL,
          vehicle_type VARCHAR(50) NOT NULL,
          conversion_type VARCHAR(100) NOT NULL,
          amount_charged DECIMAL(10,2) NOT NULL,
          service_date DATE NOT NULL,
          comment TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

      const [result] = await db.query(`
        INSERT INTO vehicle_conversions (vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date, comment)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date, comment || null]);

      const [newConversion] = await db.query(`
        SELECT * FROM vehicle_conversions WHERE id = ?
      `, [result.insertId]);

      res.status(201).json({
        message: 'Vehicle conversion created successfully',
        conversion: newConversion[0]
      });
    } catch (error) {
      console.error('Error creating vehicle conversion:', error);
      res.status(500).json({ message: 'Error creating vehicle conversion', error: error.message });
    }
  },

  // Update vehicle conversion
  updateConversion: async (req, res) => {
    try {
      const { id } = req.params;
      const { vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date, comment } = req.body;

      // Validate required fields
      if (!vehicle_plate || !vehicle_type || !conversion_type || !amount_charged || !service_date) {
        return res.status(400).json({ 
          message: 'Missing required fields: vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date' 
        });
      }

      // Validate amount
      if (isNaN(amount_charged) || amount_charged <= 0) {
        return res.status(400).json({ message: 'Amount must be a positive number' });
      }

      // Validate date
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(service_date)) {
        return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
      }

      // Check if conversion exists
      const [existing] = await db.query(`
        SELECT id FROM vehicle_conversions WHERE id = ?
      `, [id]);

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Vehicle conversion not found' });
      }

      // Update conversion
      await db.query(`
        UPDATE vehicle_conversions 
        SET vehicle_plate = ?, vehicle_type = ?, conversion_type = ?, amount_charged = ?, service_date = ?, comment = ?
        WHERE id = ?
      `, [vehicle_plate, vehicle_type, conversion_type, amount_charged, service_date, comment || null, id]);

      const [updatedConversion] = await db.query(`
        SELECT * FROM vehicle_conversions WHERE id = ?
      `, [id]);

      res.json({
        message: 'Vehicle conversion updated successfully',
        conversion: updatedConversion[0]
      });
    } catch (error) {
      console.error('Error updating vehicle conversion:', error);
      res.status(500).json({ message: 'Error updating vehicle conversion', error: error.message });
    }
  },

  // Delete vehicle conversion
  deleteConversion: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if conversion exists
      const [existing] = await db.query(`
        SELECT id FROM vehicle_conversions WHERE id = ?
      `, [id]);

      if (existing.length === 0) {
        return res.status(404).json({ message: 'Vehicle conversion not found' });
      }

      // Delete conversion
      await db.query(`
        DELETE FROM vehicle_conversions WHERE id = ?
      `, [id]);

      res.json({ message: 'Vehicle conversion deleted successfully' });
    } catch (error) {
      console.error('Error deleting vehicle conversion:', error);
      res.status(500).json({ message: 'Error deleting vehicle conversion', error: error.message });
    }
  },

  // Get conversions by vehicle plate
  getConversionsByVehicle: async (req, res) => {
    try {
      const { vehiclePlate } = req.params;

      const [rows] = await db.query(`
        SELECT * FROM vehicle_conversions 
        WHERE vehicle_plate LIKE ? 
        ORDER BY service_date DESC, created_at DESC
      `, [`%${vehiclePlate}%`]);

      res.json(rows);
    } catch (error) {
      console.error('Error getting conversions by vehicle:', error);
      res.status(500).json({ message: 'Error getting conversions by vehicle', error: error.message });
    }
  },

  // Get conversions by date range
  getConversionsByDateRange: async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Start date and end date are required' });
      }

      const [rows] = await db.query(`
        SELECT * FROM vehicle_conversions 
        WHERE service_date BETWEEN ? AND ?
        ORDER BY service_date DESC, created_at DESC
      `, [startDate, endDate]);

      res.json(rows);
    } catch (error) {
      console.error('Error getting conversions by date range:', error);
      res.status(500).json({ message: 'Error getting conversions by date range', error: error.message });
    }
  },

  // Get conversion statistics
  getConversionStats: async (req, res) => {
    try {
      const [totalConversions] = await db.query(`
        SELECT COUNT(*) as total FROM vehicle_conversions
      `);

      const [totalAmount] = await db.query(`
        SELECT SUM(amount_charged) as total FROM vehicle_conversions
      `);

      const [conversionsByType] = await db.query(`
        SELECT conversion_type, COUNT(*) as count, SUM(amount_charged) as total_amount
        FROM vehicle_conversions 
        GROUP BY conversion_type 
        ORDER BY count DESC
      `);

      const [recentConversions] = await db.query(`
        SELECT * FROM vehicle_conversions 
        ORDER BY service_date DESC, created_at DESC 
        LIMIT 5
      `);

      res.json({
        totalConversions: totalConversions[0].total,
        totalAmount: totalAmount[0].total || 0,
        conversionsByType,
        recentConversions
      });
    } catch (error) {
      console.error('Error getting conversion statistics:', error);
      res.status(500).json({ message: 'Error getting conversion statistics', error: error.message });
    }
  }
};

module.exports = vehicleConversionController;
