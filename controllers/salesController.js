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

        // Update client ledger - add the sale amount as amount_out (client owes this money)
        // First, ensure client_ledger table exists
        try {
          await connection.query(`
            CREATE TABLE IF NOT EXISTS client_ledger (
              id INT PRIMARY KEY AUTO_INCREMENT,
              client_id INT NOT NULL,
              amount_in DECIMAL(10, 2) DEFAULT 0,
              amount_out DECIMAL(10, 2) DEFAULT 0,
              balance DECIMAL(10, 2) NOT NULL,
              reference VARCHAR(255),
              date DATETIME NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              INDEX idx_client_date (client_id, date),
              INDEX idx_client_balance (client_id, balance)
            )
          `);
        } catch (tableError) {
          // If table creation fails, continue (table might already exist)
          console.log('Note: Could not create client_ledger table:', tableError.message);
        }

        // Get current client balance
        const [clientBalanceRows] = await connection.query(
          'SELECT balance FROM client_ledger WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 1',
          [clientId]
        );

        let currentClientBalance = 0;
        if (clientBalanceRows.length > 0) {
          currentClientBalance = Number(clientBalanceRows[0].balance);
        }

        // Calculate new client balance (client owes more money)
        const newClientBalance = currentClientBalance + Number(totalPrice);

        // Insert client ledger entry
        await connection.query(
          'INSERT INTO client_ledger (client_id, amount_in, amount_out, balance, reference, date) VALUES (?, ?, ?, ?, ?, ?)',
          [clientId, 0, totalPrice, newClientBalance, `Fuel sale - ${quantity}L at ${unitPrice}/L from station ${stationId}`, formattedSaleDate]
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
  },

  // Get sales summaries grouped by date with optional filters
  getSalesSummaries: async (req, res) => {
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

      const { year, month, stationId, clientId, branchId } = req.query;

      // Build query with filters
      let query = `
        SELECT 
          DATE(s.sale_date) as date,
          COUNT(*) as totalSales,
          SUM(s.total_price) as totalRevenue,
          SUM(s.quantity) as totalQuantity
        FROM sales s
        JOIN stations st ON s.station_id = st.id
        JOIN branches b ON s.vehicle_id = b.id
        JOIN clients c ON s.client_id = c.id
        WHERE 1=1
      `;
      
      const queryParams = [];

      // Add year filter
      if (year) {
        query += ' AND YEAR(s.sale_date) = ?';
        queryParams.push(parseInt(year));
      }

      // Add month filter
      if (month) {
        query += ' AND MONTH(s.sale_date) = ?';
        queryParams.push(parseInt(month));
      }

      // Add station filter
      if (stationId) {
        query += ' AND s.station_id = ?';
        queryParams.push(parseInt(stationId));
      }

      // Add client filter
      if (clientId) {
        query += ' AND c.id = ?';
        queryParams.push(parseInt(clientId));
      }

      // Add branch filter
      if (branchId) {
        query += ' AND b.id = ?';
        queryParams.push(parseInt(branchId));
      }

      query += ' GROUP BY DATE(s.sale_date) ORDER BY date ASC';

      const [rows] = await db.query(query, queryParams);

      res.json(rows);
    } catch (error) {
      console.error('Error getting sales summaries:', error);
      res.status(500).json({ message: 'Error getting sales summaries', error: error.message });
    }
  },

  // Get all sales for a specific client
  getSalesByClient: async (req, res) => {
    try {
      const { clientId } = req.params;
      const { page = 1, limit = 50 } = req.query;
      
      const offset = (page - 1) * limit;

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

      // Get total count
      const [countRows] = await db.query(
        'SELECT COUNT(*) as total FROM sales WHERE client_id = ?',
        [clientId]
      );
      const total = countRows[0].total;

      // Get sales with station and vehicle details
      const [salesRows] = await db.query(`
        SELECT 
          s.id,
          s.station_id,
          s.vehicle_id,
          s.client_id,
          s.quantity,
          s.unit_price,
          s.total_price,
          s.sale_date,
          s.created_at,
          st.name as station_name,
          st.address as station_address,
          b.name as vehicle_name,
          b.address as vehicle_address
        FROM sales s
        JOIN stations st ON s.station_id = st.id
        JOIN branches b ON s.vehicle_id = b.id
        WHERE s.client_id = ?
        ORDER BY s.sale_date DESC
        LIMIT ? OFFSET ?
      `, [clientId, parseInt(limit), offset]);

      // Calculate total pages
      const totalPages = Math.ceil(total / limit);

      res.json({
        sales: salesRows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: totalPages
        }
      });
    } catch (error) {
      console.error('Error getting sales by client:', error);
      res.status(500).json({ message: 'Error getting sales by client', error: error.message });
    }
  },

  // Get all sales for a specific date
  getSalesByDate: async (req, res) => {
    try {
      const { date } = req.params;
      const { stationId, clientId, branchId } = req.query;
      
      console.log('🔍 Backend: getSalesByDate called with:', { date, stationId, clientId, branchId });
      
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

      // Check if there are any sales records at all
      const [allSales] = await db.query('SELECT COUNT(*) as total FROM sales');
      console.log('🔍 Backend: Total sales records in database:', allSales[0].total);
      
      if (allSales[0].total === 0) {
        console.log('🔍 Backend: No sales records found in database');
        return res.json({
          sales: [],
          summary: {
            date,
            totalSales: 0,
            totalRevenue: 0,
            totalQuantity: 0
          }
        });
      }

      // Check what dates are available in sales table
      const [availableDates] = await db.query('SELECT DISTINCT DATE(sale_date) as date FROM sales ORDER BY date DESC LIMIT 5');
      console.log('🔍 Backend: Available dates in sales table:', availableDates);

      // Build query with filters
      let query = `
        SELECT 
          s.id,
          s.station_id,
          s.vehicle_id,
          s.client_id,
          s.quantity,
          s.unit_price,
          s.total_price,
          s.sale_date,
          s.created_at,
          st.name as station_name,
          st.address as station_address,
          b.name as vehicle_name,
          b.address as vehicle_address,
          c.name as client_name,
          c.email as client_email
        FROM sales s
        JOIN stations st ON s.station_id = st.id
        JOIN branches b ON s.vehicle_id = b.id
        JOIN clients c ON s.client_id = c.id
        WHERE DATE(s.sale_date) = ?
      `;
      
      const queryParams = [date];
      console.log('🔍 Backend: Query params:', queryParams);

      // Add station filter
      if (stationId) {
        query += ' AND s.station_id = ?';
        queryParams.push(parseInt(stationId));
      }

      // Add client filter
      if (clientId) {
        query += ' AND s.client_id = ?';
        queryParams.push(parseInt(clientId));
      }

      // Add branch filter
      if (branchId) {
        query += ' AND s.vehicle_id = ?';
        queryParams.push(parseInt(branchId));
      }

      query += ' ORDER BY s.sale_date DESC';
      console.log('🔍 Backend: Final query:', query);

      const [salesRows] = await db.query(query, queryParams);
      console.log('🔍 Backend: Query result - rows found:', salesRows.length);
      console.log('🔍 Backend: First few rows:', salesRows.slice(0, 2));

      // Calculate summary totals
      const totalSales = salesRows.length;
      const totalRevenue = salesRows.reduce((sum, sale) => sum + Number(sale.total_price), 0);
      const totalQuantity = salesRows.reduce((sum, sale) => sum + Number(sale.quantity), 0);

      const response = {
        sales: salesRows,
        summary: {
          date,
          totalSales,
          totalRevenue,
          totalQuantity
        }
      };
      
      console.log('🔍 Backend: Sending response:', response);
      res.json(response);
    } catch (error) {
      console.error('❌ Backend: Error getting sales by date:', error);
      res.status(500).json({ message: 'Error getting sales by date', error: error.message });
    }
  },

  // Test method to check sales data
  testSalesData: async (req, res) => {
    try {
      console.log('🧪 Backend: Testing sales data...');
      
      // Check if sales table exists and has data
      const [tableCheck] = await db.query('SHOW TABLES LIKE "sales"');
      console.log('🧪 Backend: Sales table exists:', tableCheck.length > 0);
      
      if (tableCheck.length === 0) {
        return res.json({ message: 'Sales table does not exist' });
      }
      
      // Count total sales
      const [countResult] = await db.query('SELECT COUNT(*) as total FROM sales');
      const totalSales = countResult[0].total;
      console.log('🧪 Backend: Total sales records:', totalSales);
      
      if (totalSales === 0) {
        return res.json({ 
          message: 'Sales table exists but has no data',
          totalSales: 0,
          availableDates: []
        });
      }
      
      // Get sample sales data
      const [sampleSales] = await db.query('SELECT * FROM sales LIMIT 3');
      console.log('🧪 Backend: Sample sales:', sampleSales);
      
      // Get available dates
      const [datesResult] = await db.query('SELECT DISTINCT DATE(sale_date) as date FROM sales ORDER BY date DESC LIMIT 10');
      console.log('🧪 Backend: Available dates:', datesResult);
      
      res.json({
        message: 'Sales data found',
        totalSales,
        sampleSales,
        availableDates: datesResult.map(d => d.date)
      });
      
    } catch (error) {
      console.error('❌ Backend: Error testing sales data:', error);
      res.status(500).json({ message: 'Error testing sales data', error: error.message });
    }
  }
};