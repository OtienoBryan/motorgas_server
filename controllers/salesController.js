const db = require('../config/database');

module.exports = {
  // Post a new sale
  postSale: async (req, res) => {
    try {
      // Ensure sales table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          vehicle_id INT(11) NOT NULL,
          client_id INT(11) NOT NULL,
          quantity DECIMAL(11,2) NOT NULL,
          unit_price DECIMAL(11,2) NOT NULL,
          total_price DECIMAL(11,2) NOT NULL,
          sale_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          FOREIGN KEY (vehicle_id) REFERENCES branches(id),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);

      // Ensure station_stock_ledger table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_stock_ledger (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          quantity_in DECIMAL(11,2) DEFAULT 0,
          quantity_out DECIMAL(11,2) DEFAULT 0,
          balance DECIMAL(11,2) NOT NULL,
          date DATETIME NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          INDEX idx_station_date (station_id, date)
        )
      `);

      const { stationId, vehicleId, clientId, quantity, unitPrice, totalPrice, saleDate } = req.body;

      if (!stationId || !vehicleId || !clientId || !quantity || !unitPrice || !totalPrice || !saleDate) {
        return res.status(400).json({ 
          message: 'stationId, vehicleId, clientId, quantity, unitPrice, totalPrice, and saleDate are required' 
        });
      }

      // Adjust timezone for the sale date
      const STATION_TZ_OFFSET_MINUTES = 180; // +3 hours (East Africa Time)
      const saleDateObj = new Date(saleDate);
      const adjustedSaleDate = new Date(saleDateObj.getTime() + (STATION_TZ_OFFSET_MINUTES * 60 * 1000));
      const formattedSaleDate = adjustedSaleDate.toISOString().slice(0, 19).replace('T', ' ');

      // Verify station exists and has current fuel price
      const [stationRows] = await db.query(
        'SELECT id, current_fuel_price FROM stations WHERE id = ?',
        [stationId]
      );

      if (stationRows.length === 0) {
        return res.status(404).json({ message: 'Station not found' });
      }

      if (!stationRows[0].current_fuel_price) {
        return res.status(400).json({ message: 'Station does not have a current fuel price set' });
      }

      // Check if there's enough fuel quantity in station stock
      const [stockRows] = await db.query(
        'SELECT SUM(qty) as total_stock FROM station_store WHERE station_id = ?',
        [stationId]
      );

      const totalStock = stockRows[0].total_stock || 0;
      
      if (totalStock < quantity) {
        return res.status(400).json({ 
          message: `Insufficient fuel stock. Available: ${totalStock.toFixed(2)}L, Requested: ${quantity}L` 
        });
      }

      // Verify the unit price matches the station's current fuel price
      if (Math.abs(Number(unitPrice) - Number(stationRows[0].current_fuel_price)) > 0.01) {
        return res.status(400).json({ 
          message: 'Unit price does not match station current fuel price' 
        });
      }

      // Start transaction for sale, stock update, and ledger entry
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // Insert the sale
        const [result] = await connection.query(
          'INSERT INTO sales (station_id, vehicle_id, client_id, quantity, unit_price, total_price, sale_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [stationId, vehicleId, clientId, quantity, unitPrice, totalPrice, formattedSaleDate]
        );

        // Deduct quantity from station stock (deduct from the first available product)
        const [productRows] = await connection.query(
          'SELECT id, qty FROM station_store WHERE station_id = ? AND qty > 0 ORDER BY qty DESC LIMIT 1',
          [stationId]
        );

        if (productRows.length > 0) {
          const productId = productRows[0].id;
          const currentQty = productRows[0].qty;
          const newQty = Math.max(0, currentQty - quantity);

          await connection.query(
            'UPDATE station_store SET qty = ?, updated_at = NOW() WHERE id = ?',
            [newQty, productId]
          );
        }

        // Get current balance from ledger or calculate from station_store
        const [ledgerRows] = await connection.query(
          'SELECT balance FROM station_stock_ledger WHERE station_id = ? ORDER BY date DESC, id DESC LIMIT 1',
          [stationId]
        );

        let currentBalance = 0;
        if (ledgerRows.length > 0) {
          currentBalance = Number(ledgerRows[0].balance);
        } else {
          // If no ledger entries, calculate from current station_store
          const [currentStock] = await connection.query(
            'SELECT SUM(qty) as total FROM station_store WHERE station_id = ?',
            [stationId]
          );
          currentBalance = Number(currentStock[0].total || 0);
        }

        // Calculate new balance after sale
        const newBalance = Math.max(0, currentBalance - quantity);

        // Insert ledger entry for the sale
        await connection.query(
          'INSERT INTO station_stock_ledger (station_id, quantity_in, quantity_out, balance, date, description) VALUES (?, ?, ?, ?, ?, ?)',
          [stationId, 0, quantity, newBalance, formattedSaleDate, `Fuel sale - ${quantity}L to client ${clientId}, vehicle ${vehicleId}`]
        );

        await connection.commit();

        // Get the inserted sale record
        const [rows] = await db.query(
          'SELECT id, station_id, vehicle_id, client_id, quantity, unit_price, total_price, sale_date, created_at FROM sales WHERE id = ?',
          [result.insertId]
        );

        res.status(201).json(rows[0]);
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error posting sale:', error);
      res.status(500).json({ message: 'Error posting sale', error: error.message });
    }
  },

  // Get all sales for a station
  getStationSales: async (req, res) => {
    try {
      const stationId = req.params.stationId;

      // Ensure sales table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          vehicle_id INT(11) NOT NULL,
          client_id INT(11) NOT NULL,
          quantity DECIMAL(11,2) NOT NULL,
          unit_price DECIMAL(11,2) NOT NULL,
          total_price DECIMAL(11,2) NOT NULL,
          sale_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          FOREIGN KEY (vehicle_id) REFERENCES branches(id),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);

      const [rows] = await db.query(
        'SELECT id, station_id, vehicle_id, client_id, quantity, unit_price, total_price, sale_date, created_at FROM sales WHERE station_id = ? ORDER BY sale_date DESC',
        [stationId]
      );

      res.json(rows);
    } catch (error) {
      console.error('Error getting station sales:', error);
      res.status(500).json({ message: 'Error getting station sales', error: error.message });
    }
  },

  // Get all sales across all stations
  getAllSales: async (req, res) => {
    try {
      // Ensure sales table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          vehicle_id INT(11) NOT NULL,
          client_id INT(11) NOT NULL,
          quantity DECIMAL(11,2) NOT NULL,
          unit_price DECIMAL(11,2) NOT NULL,
          total_price DECIMAL(11,2) NOT NULL,
          sale_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          FOREIGN KEY (vehicle_id) REFERENCES branches(id),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);

      const [rows] = await db.query(`
        SELECT s.id, s.station_id, s.vehicle_id, s.client_id, s.quantity, s.unit_price, s.total_price, s.sale_date, s.created_at,
               st.name as station_name, st.address as station_address,
               b.name as vehicle_name, b.address as vehicle_address,
               c.name as client_name
        FROM sales s
        JOIN stations st ON s.station_id = st.id
        JOIN branches b ON s.vehicle_id = b.id
        JOIN clients c ON s.client_id = c.id
        ORDER BY s.sale_date DESC
      `);

      res.json(rows);
    } catch (error) {
      console.error('Error getting all sales:', error);
      res.status(500).json({ message: 'Error getting all sales', error: error.message });
    }
  },

  // Get station stock information
  getStationStock: async (req, res) => {
    try {
      const stationId = req.params.stationId;

      // Ensure station_store table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_store (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          product_id INT(11) NOT NULL,
          qty DECIMAL(11,2) NOT NULL,
          updated_at DATETIME NOT NULL,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id)
        )
      `);

      const [rows] = await db.query(`
        SELECT ss.id, ss.station_id, ss.product_id, ss.qty, ss.updated_at,
               fp.name as product_name
        FROM station_store ss
        LEFT JOIN fuel_products fp ON ss.product_id = fp.id
        WHERE ss.station_id = ?
        ORDER BY ss.qty DESC
      `, [stationId]);

      // Calculate total stock
      const totalStock = rows.reduce((sum, row) => sum + Number(row.qty), 0);

      res.json({
        stationId: parseInt(stationId),
        totalStock: totalStock,
        products: rows
      });
    } catch (error) {
      console.error('Error getting station stock:', error);
      res.status(500).json({ message: 'Error getting station stock', error: error.message });
    }
  },

  // Get station stock ledger
  getStationStockLedger: async (req, res) => {
    try {
      const stationId = req.params.stationId;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const offset = (page - 1) * limit;

      // Ensure station_stock_ledger table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_stock_ledger (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          quantity_in DECIMAL(11,2) DEFAULT 0,
          quantity_out DECIMAL(11,2) DEFAULT 0,
          balance DECIMAL(11,2) NOT NULL,
          date DATETIME NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          INDEX idx_station_date (station_id, date)
        )
      `);

      // Get total count
      const [countRows] = await db.query(
        'SELECT COUNT(*) as total FROM station_stock_ledger WHERE station_id = ?',
        [stationId]
      );

      // Get ledger entries with pagination
      const [rows] = await db.query(`
        SELECT id, station_id, quantity_in, quantity_out, balance, date, description, created_at
        FROM station_stock_ledger 
        WHERE station_id = ? 
        ORDER BY date DESC, id DESC 
        LIMIT ? OFFSET ?
      `, [stationId, limit, offset]);

      // Get current balance
      const [currentBalanceRows] = await db.query(
        'SELECT balance FROM station_stock_ledger WHERE station_id = ? ORDER BY date DESC, id DESC LIMIT 1',
        [stationId]
      );

      const currentBalance = currentBalanceRows.length > 0 ? Number(currentBalanceRows[0].balance) : 0;

      res.json({
        stationId: parseInt(stationId),
        currentBalance: currentBalance,
        totalEntries: countRows[0].total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(countRows[0].total / limit),
        entries: rows
      });
    } catch (error) {
      console.error('Error getting station stock ledger:', error);
      res.status(500).json({ message: 'Error getting station stock ledger', error: error.message });
    }
  },

  // Add stock to station (quantity_in)
  addStationStock: async (req, res) => {
    try {
      const { stationId, quantity, date, description } = req.body;

      if (!stationId || !quantity || !date) {
        return res.status(400).json({ 
          message: 'stationId, quantity, and date are required' 
        });
      }

      // Ensure station_stock_ledger table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS station_stock_ledger (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          quantity_in DECIMAL(11,2) DEFAULT 0,
          quantity_out DECIMAL(11,2) DEFAULT 0,
          balance DECIMAL(11,2) NOT NULL,
          date DATETIME NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          INDEX idx_station_date (station_id, date)
        )
      `);

      // Verify station exists
      const [stationRows] = await db.query(
        'SELECT id FROM stations WHERE id = ?',
        [stationId]
      );

      if (stationRows.length === 0) {
        return res.status(404).json({ message: 'Station not found' });
      }

      // Adjust timezone for the date
      const STATION_TZ_OFFSET_MINUTES = 180; // +3 hours (East Africa Time)
      const dateObj = new Date(date);
      const adjustedDate = new Date(dateObj.getTime() + (STATION_TZ_OFFSET_MINUTES * 60 * 1000));
      const formattedDate = adjustedDate.toISOString().slice(0, 19).replace('T', ' ');

      // Start transaction
      const connection = await db.getConnection();
      await connection.beginTransaction();

      try {
        // Get current balance from ledger
        const [ledgerRows] = await connection.query(
          'SELECT balance FROM station_stock_ledger WHERE station_id = ? ORDER BY date DESC, id DESC LIMIT 1',
          [stationId]
        );

        let currentBalance = 0;
        if (ledgerRows.length > 0) {
          currentBalance = Number(ledgerRows[0].balance);
        }

        // Calculate new balance after adding stock
        const newBalance = currentBalance + Number(quantity);

        // Insert ledger entry for stock addition
        await connection.query(
          'INSERT INTO station_stock_ledger (station_id, quantity_in, quantity_out, balance, date, description) VALUES (?, ?, ?, ?, ?, ?)',
          [stationId, quantity, 0, newBalance, formattedDate, description || `Stock addition - ${quantity}L`]
        );

        // Update station_store if it exists
        try {
          const [storeRows] = await connection.query(
            'SELECT id FROM station_store WHERE station_id = ? LIMIT 1',
            [stationId]
          );

          if (storeRows.length > 0) {
            // Update existing store entry
            await connection.query(
              'UPDATE station_store SET qty = qty + ?, updated_at = NOW()',
              [quantity, stationId]
            );
          } else {
            // Create new store entry (assuming product_id = 1 for now)
            await connection.query(
              'INSERT INTO station_store (station_id, product_id, qty, updated_at) VALUES (?, ?, ?, NOW())',
              [stationId, 1, quantity]
            );
          }
        } catch (storeError) {
          // If station_store table doesn't exist or has issues, continue with ledger only
          console.log('Note: Could not update station_store:', storeError.message);
        }

        await connection.commit();

        res.status(201).json({
          message: 'Stock added successfully',
          stationId: parseInt(stationId),
          quantityAdded: Number(quantity),
          newBalance: newBalance,
          date: formattedDate
        });
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Error adding station stock:', error);
      res.status(500).json({ message: 'Error adding station stock', error: error.message });
    }
  },

  // Get monthly sales data for dashboard
  getMonthlySales: async (req, res) => {
    try {
      // Ensure sales table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          vehicle_id INT(11) NOT NULL,
          client_id INT(11) NOT NULL,
          quantity DECIMAL(11,2) NOT NULL,
          unit_price DECIMAL(11,2) NOT NULL,
          total_price DECIMAL(11,2) NOT NULL,
          sale_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          FOREIGN KEY (vehicle_id) REFERENCES branches(id),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);

      // Get current month's sales
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

      const [rows] = await db.query(`
        SELECT COUNT(*) as totalSales, SUM(total_price) as totalValue
        FROM sales 
        WHERE sale_date >= ? AND sale_date <= ?
      `, [startOfMonth.toISOString().slice(0, 19).replace('T', ' '), endOfMonth.toISOString().slice(0, 19).replace('T', ' ')]);

      const totalSales = rows[0].totalSales || 0;
      const totalValue = rows[0].totalValue || 0;

      res.json({
        totalSales: totalSales,
        totalValue: totalValue
      });
    } catch (error) {
      console.error('Error getting monthly sales:', error);
      res.status(500).json({ message: 'Error getting monthly sales', error: error.message });
    }
  },

  // Get daily sales trend for current month
  getDailySalesTrend: async (req, res) => {
    try {
      // Ensure sales table exists
      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INT(11) NOT NULL AUTO_INCREMENT,
          station_id INT(11) NOT NULL,
          vehicle_id INT(11) NOT NULL,
          client_id INT(11) NOT NULL,
          quantity DECIMAL(11,2) NOT NULL,
          unit_price DECIMAL(11,2) NOT NULL,
          total_price DECIMAL(11,2) NOT NULL,
          sale_date DATETIME NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          FOREIGN KEY (station_id) REFERENCES stations(id),
          FOREIGN KEY (vehicle_id) REFERENCES branches(id),
          FOREIGN KEY (client_id) REFERENCES clients(id)
        )
      `);

      // Get date range from query parameters or default to current month
      let startDate, endDate;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate);
        endDate = new Date(req.query.endDate);
        // Set end date to end of day
        endDate.setHours(23, 59, 59, 999);
      } else {
        // Default to current month
        const currentDate = new Date();
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      }

      // Build query with optional station filter
      let query = `
        SELECT 
          DATE(sale_date) as date,
          COUNT(*) as salesCount,
          SUM(total_price) as dailyRevenue,
          SUM(quantity) as totalQuantity
        FROM sales 
        WHERE sale_date >= ? AND sale_date <= ?
      `;
      
      const queryParams = [
        startDate.toISOString().slice(0, 19).replace('T', ' '), 
        endDate.toISOString().slice(0, 19).replace('T', ' ')
      ];

      // Add station filter if provided
      if (req.query.stationId) {
        query += ' AND station_id = ?';
        queryParams.push(parseInt(req.query.stationId));
      }

      query += ' GROUP BY DATE(sale_date) ORDER BY date ASC';

      const [rows] = await db.query(query, queryParams);

      // Fill in missing dates with zero values
      const dailyData = [];
      const current = new Date(startDate);
      
      while (current <= endDate) {
        const dateStr = current.toISOString().split('T')[0];
        const existingData = rows.find(row => row.date.toISOString().split('T')[0] === dateStr);
        
        dailyData.push({
          date: dateStr,
          salesCount: existingData ? Number(existingData.salesCount) : 0,
          dailyRevenue: existingData ? Number(existingData.dailyRevenue) : 0,
          totalQuantity: existingData ? Number(existingData.totalQuantity) : 0
        });
        
        current.setDate(current.getDate() + 1);
      }

      res.json(dailyData);
    } catch (error) {
      console.error('Error getting daily sales trend:', error);
      res.status(500).json({ message: 'Error getting daily sales trend', error: error.message });
    }
  }
};