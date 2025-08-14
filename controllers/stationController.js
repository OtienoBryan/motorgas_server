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
  ,

  // Inventory: stations with their store items
  getStationsInventory: async (req, res) => {
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

      const query = `
        SELECT 
          s.id,
          s.name,
          s.address,
          s.phone,
          s.email,
          COALESCE(
            JSON_ARRAYAGG(
              CASE WHEN ss.id IS NOT NULL THEN
                JSON_OBJECT(
                  'id', ss.id,
                  'product_id', ss.product_id,
                  'qty', ss.qty,
                  'updated_at', DATE_FORMAT(ss.updated_at, '%Y-%m-%d %H:%i:%s')
                )
              ELSE NULL END
            ),
            JSON_ARRAY()
          ) AS items
        FROM stations s
        LEFT JOIN station_store ss ON ss.station_id = s.id
        GROUP BY s.id
        ORDER BY s.name
      `;

      const [rows] = await db.query(query);
      // Parse items JSON; remove nulls
      const result = rows.map((r) => {
        try {
          const parsed = JSON.parse(r.items);
          r.items = parsed.filter((x) => x !== null);
        } catch {
          r.items = [];
        }
        return r;
      });

      res.json(result);
    } catch (error) {
      console.error('Error fetching stations inventory:', error);
      res.status(500).json({ message: 'Error fetching inventory', error: error.message });
    }
  },

  // Get total inventory across all stations
  getTotalInventory: async (req, res) => {
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

      const [rows] = await db.query(`
        SELECT COALESCE(SUM(qty), 0) as totalQuantity
        FROM station_store
      `);

      const totalQuantity = Number(rows[0].totalQuantity);

      res.json({
        totalQuantity: totalQuantity
      });
    } catch (error) {
      console.error('Error fetching total inventory:', error);
      res.status(500).json({ message: 'Error fetching total inventory', error: error.message });
    }
  },

  // Station prices
  getStationPrices: async (req, res) => {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_price (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          price_id DECIMAL(11,2) NOT NULL,
          start_date DATETIME NOT NULL,
          end_date DATETIME NOT NULL,
          PRIMARY KEY (id)
        )
      `);

      const stationId = req.params.id;
      const [rows] = await db.query(
        'SELECT id, station_id, price_id, start_date, end_date FROM station_price WHERE station_id = ? ORDER BY start_date DESC',
        [stationId]
      );
      res.json(rows);
    } catch (error) {
      console.error('Error fetching station prices:', error);
      res.status(500).json({ message: 'Error fetching station prices', error: error.message });
    }
  },

  addStationPrice: async (req, res) => {
    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_price (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          price_id DECIMAL(11,2) NOT NULL,
          start_date DATETIME NOT NULL,
          end_date DATETIME NOT NULL,
          PRIMARY KEY (id)
        )
      `);

      const stationId = req.params.id;
      const { price, startDate, endDate } = req.body || {};

      if (price == null || !startDate || !endDate) {
        return res.status(400).json({ message: 'price, startDate and endDate are required' });
      }

      // Normalize datetime strings to MySQL format
      const toMysql = (input) => {
        const d = new Date(input);
        const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        const seconds = pad(d.getSeconds());
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      const start = toMysql(startDate);
      const end = toMysql(endDate);

      const [result] = await db.query(
        'INSERT INTO station_price (station_id, price_id, start_date, end_date) VALUES (?, ?, ?, ?)',
        [stationId, price, start, end]
      );

      const [rows] = await db.query('SELECT id, station_id, price_id, start_date, end_date FROM station_price WHERE id = ?', [result.insertId]);
      
      // Ensure stations.current_fuel_price exists
      try {
        const [cols] = await db.query('DESCRIBE stations');
        const hasCurrent = Array.isArray(cols) && cols.some(c => c.Field === 'current_fuel_price');
        if (!hasCurrent) {
          await db.query('ALTER TABLE stations ADD COLUMN current_fuel_price DECIMAL(11,2) NULL');
        }
      } catch {}

      // If the newly added price is currently effective (based on timezone), update stations.current_fuel_price
      const tzOffsetMinutes = parseInt(process.env.STATION_TZ_OFFSET_MINUTES || '180', 10);
      const nowTz = formatDateTimeWithOffset(tzOffsetMinutes);
      
      // Convert to Date objects for proper comparison
      const startDateObj = new Date(start);
      const endDateObj = new Date(end);
      const nowDate = new Date(nowTz);
      const isCurrentlyEffective = nowDate >= startDateObj; // Changed: only check if current date is >= start date
      
      // Additional timezone debugging
      const nowUTC = new Date();
      const nowLocal = new Date();
      
      console.log('Debug - addStationPrice:', {
        stationId,
        price,
        start,
        end,
        tzOffsetMinutes,
        timezoneOffset: `${tzOffsetMinutes >= 0 ? '+' : ''}${tzOffsetMinutes / 60} hours`,
        nowUTC: nowUTC.toISOString(),
        nowLocal: nowLocal.toString(),
        nowTz,
        startDate: startDateObj.toISOString(),
        endDate: endDateObj.toISOString(),
        nowDate: nowDate.toISOString(),
        isCurrentlyEffective
      });
      
      if (isCurrentlyEffective) {
        console.log('Updating current_fuel_price to:', price);
        await db.query('UPDATE stations SET current_fuel_price = ? WHERE id = ?', [price, stationId]);
        console.log('Updated current_fuel_price successfully');
      } else {
        console.log('Price is not currently effective, not updating current_fuel_price');
      }

      res.status(201).json(rows[0]);
    } catch (error) {
      console.error('Error adding station price:', error);
      res.status(500).json({ message: 'Error adding station price', error: error.message });
    }
  }
  ,

  updateStationPrice: async (req, res) => {
    try {
      const stationId = req.params.id;
      const priceId = req.params.priceId;
      const { price, startDate, endDate } = req.body || {};

      if (price == null || !startDate || !endDate) {
        return res.status(400).json({ message: 'price, startDate and endDate are required' });
      }

      const toMysql = (input) => {
        const d = new Date(input);
        const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
        const year = d.getFullYear();
        const month = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hours = pad(d.getHours());
        const minutes = pad(d.getMinutes());
        const seconds = pad(d.getSeconds());
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      const start = toMysql(startDate);
      const end = toMysql(endDate);

      await db.query(
        'UPDATE station_price SET price_id = ?, start_date = ?, end_date = ? WHERE id = ? AND station_id = ?',
        [price, start, end, priceId, stationId]
      );

      const [rows] = await db.query('SELECT id, station_id, price_id, start_date, end_date FROM station_price WHERE id = ? AND station_id = ?', [priceId, stationId]);
      if (rows.length === 0) {
        return res.status(404).json({ message: 'Price record not found' });
      }

      // Ensure column exists
      try {
        const [cols] = await db.query('DESCRIBE stations');
        const hasCurrent = Array.isArray(cols) && cols.some(c => c.Field === 'current_fuel_price');
        if (!hasCurrent) {
          await db.query('ALTER TABLE stations ADD COLUMN current_fuel_price DECIMAL(11,2) NULL');
        }
      } catch {}

      // Recalculate current price based on current time
      const tzOffsetMinutes = parseInt(process.env.STATION_TZ_OFFSET_MINUTES || '180', 10);
      const nowTz = formatDateTimeWithOffset(tzOffsetMinutes);
      
      // Additional timezone debugging
      const nowUTC = new Date();
      const nowLocal = new Date();
      
      console.log('Debug - updateStationPrice:', {
        stationId,
        tzOffsetMinutes,
        timezoneOffset: `${tzOffsetMinutes >= 0 ? '+' : ''}${tzOffsetMinutes / 60} hours`,
        nowUTC: nowUTC.toISOString(),
        nowLocal: nowLocal.toString(),
        nowTz
      });
      const [active] = await db.query(
        'SELECT price_id FROM station_price WHERE station_id = ? AND ? >= start_date ORDER BY start_date DESC LIMIT 1',
        [stationId, nowTz]
      );
      console.log('Active prices found:', active);
      if (active.length > 0) {
        console.log('Updating current_fuel_price to:', active[0].price_id);
        await db.query('UPDATE stations SET current_fuel_price = ? WHERE id = ?', [active[0].price_id, stationId]);
        console.log('Updated current_fuel_price successfully');
      } else {
        console.log('No active prices found, setting current_fuel_price to NULL');
        await db.query('UPDATE stations SET current_fuel_price = NULL WHERE id = ?', [stationId]);
      }

      res.json(rows[0]);
    } catch (error) {
      console.error('Error updating station price:', error);
      res.status(500).json({ message: 'Error updating station price', error: error.message });
    }
  }
  ,

  deleteStationPrice: async (req, res) => {
    try {
      const stationId = req.params.id;
      const priceId = req.params.priceId;
      const [result] = await db.query('DELETE FROM station_price WHERE id = ? AND station_id = ?', [priceId, stationId]);
      // @ts-ignore OkPacket
      if (!result || result.affectedRows === 0) {
        return res.status(404).json({ message: 'Price record not found' });
      }

      // Ensure column exists and recalc current price
      try {
        const [cols] = await db.query('DESCRIBE stations');
        const hasCurrent = Array.isArray(cols) && cols.some(c => c.Field === 'current_fuel_price');
        if (!hasCurrent) {
          await db.query('ALTER TABLE stations ADD COLUMN current_fuel_price DECIMAL(11,2) NULL');
        }
      } catch {}

      const tzOffsetMinutes = parseInt(process.env.STATION_TZ_OFFSET_MINUTES || '180', 10);
      const nowTz = formatDateTimeWithOffset(tzOffsetMinutes);
      
      // Additional timezone debugging
      const nowUTC = new Date();
      const nowLocal = new Date();
      
      console.log('Debug - deleteStationPrice:', {
        stationId,
        tzOffsetMinutes,
        timezoneOffset: `${tzOffsetMinutes >= 0 ? '+' : ''}${tzOffsetMinutes / 60} hours`,
        nowUTC: nowUTC.toISOString(),
        nowLocal: nowLocal.toString(),
        nowTz
      });
      const [active] = await db.query(
        'SELECT price_id FROM station_price WHERE station_id = ? AND ? >= start_date ORDER BY start_date DESC LIMIT 1',
        [stationId, nowTz]
      );
      console.log('Active prices found after deletion:', active);
      if (active.length > 0) {
        console.log('Updating current_fuel_price to:', active[0].price_id);
        await db.query('UPDATE stations SET current_fuel_price = ? WHERE id = ?', [active[0].price_id, stationId]);
        console.log('Updated current_fuel_price successfully');
      } else {
        console.log('No active prices found, setting current_fuel_price to NULL');
        await db.query('UPDATE stations SET current_fuel_price = NULL WHERE id = ?', [stationId]);
      }

      res.status(204).send();
    } catch (error) {
      console.error('Error deleting station price:', error);
      res.status(500).json({ message: 'Error deleting station price', error: error.message });
    }
  }
};

module.exports = stationController; 