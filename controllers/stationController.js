const db = require('../database/db');

// Helper to format DATETIME string adjusted by a timezone offset (in minutes)
function formatDateTimeWithOffset(offsetMinutes) {
  const now = new Date();
  // Get UTC time in ms, then apply offset minutes
  const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
  const target = new Date(utcMs + offsetMinutes * 60000);

  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  const year = target.getUTCFullYear();
  const month = pad(target.getUTCMonth() + 1);
  const day = pad(target.getUTCDate());
  const hours = pad(target.getUTCHours());
  const minutes = pad(target.getUTCMinutes());
  const seconds = pad(target.getUTCSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const stationController = {
  getAllStations: async (req, res) => {
    try {
      const [stations] = await db.query('SELECT * FROM stations ORDER BY name');
      res.json(stations);
    } catch (error) {
      console.error('Error fetching stations:', error);
      res.status(500).json({ message: 'Error fetching stations', error: error.message });
    }
  },

  getStation: async (req, res) => {
    try {
      const [stations] = await db.query('SELECT * FROM stations WHERE id = ?', [req.params.id]);
      if (stations.length === 0) {
        return res.status(404).json({ message: 'Station not found' });
      }
      res.json(stations[0]);
    } catch (error) {
      console.error('Error fetching station:', error);
      res.status(500).json({ message: 'Error fetching station', error: error.message });
    }
  },

  createStation: async (req, res) => {
    const { name, address, phone, email } = req.body;
    try {
      const [result] = await db.query(
        'INSERT INTO stations (name, address, phone, email) VALUES (?, ?, ?, ?)',
        [name, address, phone, email]
      );
      const [newStation] = await db.query('SELECT * FROM stations WHERE id = ?', [result.insertId]);
      res.status(201).json(newStation[0]);
    } catch (error) {
      console.error('Error creating station:', error);
      res.status(500).json({ message: 'Error creating station', error: error.message });
    }
  },

  updateStation: async (req, res) => {
    const { name, address, phone, email } = req.body;
    try {
      await db.query(
        'UPDATE stations SET name = ?, address = ?, phone = ?, email = ? WHERE id = ?',
        [name, address, phone, email, req.params.id]
      );
      const [updatedStation] = await db.query('SELECT * FROM stations WHERE id = ?', [req.params.id]);
      if (updatedStation.length === 0) {
        return res.status(404).json({ message: 'Station not found' });
      }
      res.json(updatedStation[0]);
    } catch (error) {
      console.error('Error updating station:', error);
      res.status(500).json({ message: 'Error updating station', error: error.message });
    }
  },

  deleteStation: async (req, res) => {
    try {
      const [result] = await db.query('DELETE FROM stations WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Station not found' });
      }
      res.json({ message: 'Station deleted successfully' });
    } catch (error) {
      console.error('Error deleting station:', error);
      res.status(500).json({ message: 'Error deleting station', error: error.message });
    }
  }
  ,

  // Pumps endpoints (scoped under station)
  getPumpsForStation: async (req, res) => {
    try {
      // Ensure pumps table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS pumps (
          id INT PRIMARY KEY AUTO_INCREMENT,
          station_id INT NOT NULL,
          serial_number VARCHAR(255) NOT NULL,
          description VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
        )
      `);

      const stationId = req.params.id;
      const [rows] = await db.query('SELECT * FROM pumps WHERE station_id = ? ORDER BY created_at DESC', [stationId]);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching pumps:', error);
      res.status(500).json({ message: 'Error fetching pumps', error: error.message });
    }
  },

  addPump: async (req, res) => {
    try {
      const stationId = req.params.id;
      const { serial_number, description } = req.body;

      if (!serial_number || !description) {
        return res.status(400).json({ message: 'serial_number and description are required' });
      }

      // Ensure pumps table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS pumps (
          id INT PRIMARY KEY AUTO_INCREMENT,
          station_id INT NOT NULL,
          serial_number VARCHAR(255) NOT NULL,
          description VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
        )
      `);

      const [result] = await db.query(
        'INSERT INTO pumps (station_id, serial_number, description) VALUES (?, ?, ?)',
        [stationId, serial_number, description]
      );

      const [rows] = await db.query('SELECT * FROM pumps WHERE id = ?', [result.insertId]);
      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Error adding pump:', error);
      res.status(500).json({ message: 'Error adding pump', error: error.message });
    }
  }
  ,

  // Station store (inventory per station)
  getStationStore: async (req, res) => {
    try {
      // Ensure station_store table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_store (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          product_id INT(11) NOT NULL,
          qty DECIMAL(11,2) NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

      const stationId = req.params.id;
      const [rows] = await db.query('SELECT id, station_id, product_id, qty, updated_at FROM station_store WHERE station_id = ? ORDER BY product_id', [stationId]);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching station store:', error);
      res.status(500).json({ message: 'Error fetching station store', error: error.message });
    }
  },

  updateStationStore: async (req, res) => {
    const connection = db; // using pool with promises
    const stationId = req.params.id;
    const items = Array.isArray(req.body && req.body.items) ? req.body.items : null;

    if (!items) {
      return res.status(400).json({ message: 'items array is required' });
    }

    try {
      // Ensure table exists
      await connection.query(`
        CREATE TABLE IF NOT EXISTS station_store (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          product_id INT(11) NOT NULL,
          qty DECIMAL(11,2) NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);

      // Perform upserts in a transaction
      await connection.query('START TRANSACTION');
      const tzOffsetMinutes = parseInt(process.env.STATION_TZ_OFFSET_MINUTES || '180', 10); // default UTC+3
      const nowTz = formatDateTimeWithOffset(tzOffsetMinutes);
      for (const item of items) {
        const { product_id, qty } = item;
        // Try update first
        const [updateResult] = await connection.query(
          'UPDATE station_store SET qty = ?, updated_at = ? WHERE station_id = ? AND product_id = ?',
          [qty, nowTz, stationId, product_id]
        );
        // If no rows updated, insert
        // @ts-ignore - mysql2 returns OkPacket
        if (!updateResult || updateResult.affectedRows === 0) {
          await connection.query(
            'INSERT INTO station_store (station_id, product_id, qty, updated_at) VALUES (?, ?, ?, ?)',
            [stationId, product_id, qty, nowTz]
          );
        }
      }
      await connection.query('COMMIT');

      const [rows] = await connection.query('SELECT id, station_id, product_id, qty, updated_at FROM station_store WHERE station_id = ? ORDER BY product_id', [stationId]);
      res.json(rows);
    } catch (error) {
      console.error('Error updating station store:', error);
      try { await connection.query('ROLLBACK'); } catch {}
      res.status(500).json({ message: 'Error updating station store', error: error.message });
    }
  }
  ,

  // Fuel products lookup
  getFuelProducts: async (req, res) => {
    try {
      // Ensure table exists (best effort); if not, just attempt to read and let it error clearly
      await db.query(`
        CREATE TABLE IF NOT EXISTS fuel_products (
          id INT(11) NOT NULL AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          PRIMARY KEY (id)
        )
      `);

      // Discover display column
      const [columns] = await db.query('DESCRIBE fuel_products');
      const colNames = Array.isArray(columns) ? columns.map(c => c.Field) : [];
      const nameColumn = colNames.includes('name')
        ? 'name'
        : colNames.includes('product_name')
          ? 'product_name'
          : colNames.includes('product')
            ? 'product'
            : 'name';

      const [rows] = await db.query(`SELECT id, ${nameColumn} AS name FROM fuel_products ORDER BY ${nameColumn}`);
      res.json(rows);
    } catch (error) {
      console.error('Error fetching fuel products:', error);
      res.status(500).json({ message: 'Error fetching fuel products', error: error.message });
    }
  }
};

module.exports = stationController; 