const db = require('../database/db');

// Helper function to ensure client_ledger table exists
const ensureClientLedgerTable = async () => {
  try {
    // Check if table exists
    const [tables] = await db.query('SHOW TABLES LIKE "client_ledger"');
    
    if (tables.length === 0) {
      console.log('Creating client_ledger table...');
      
      try {
        // Create the table
        await db.query(`
          CREATE TABLE client_ledger (
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
        
        console.log('client_ledger table created successfully (without foreign key)');
      } catch (fkError) {
        console.log('Failed to create with foreign key, trying without...');
        
        // Try creating without foreign key constraint
        await db.query(`
          CREATE TABLE client_ledger (
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
        
        console.log('client_ledger table created successfully (without foreign key constraint)');
      }
    } else {
      console.log('client_ledger table already exists');
    }
  } catch (error) {
    console.error('Error ensuring client_ledger table:', error);
    throw error;
  }
};

const clientController = {
  // Get all clients
  getAllClients: async (req, res) => {
    try {
      console.log('Attempting to fetch all clients...');
      
      // Test database connection
      try {
        const [test] = await db.query('SELECT 1');
        console.log('Database connection test successful:', test);
      } catch (dbError) {
        console.error('Database connection test failed:', dbError);
        throw dbError;
      }

      // Check if clients table exists
      try {
        const [tables] = await db.query('SHOW TABLES LIKE "clients"');
        console.log('Tables check result:', tables);
        if (tables.length === 0) {
          throw new Error('Clients table does not exist');
        }
      } catch (tableError) {
        console.error('Table check failed:', tableError);
        throw tableError;
      }

      // Fetch all clients
      const [clients] = await db.query('SELECT * FROM clients ORDER BY created_at DESC');
      console.log('Clients fetched successfully:', clients);
      
      res.json(clients);
    } catch (error) {
      console.error('Error in getAllClients:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage
      });
      res.status(500).json({ 
        message: 'Failed to fetch clients',
        error: error.message 
      });
    }
  },

  getClient: async (req, res) => {
    try {
      const { id } = req.params;
      const [clients] = await db.query('SELECT * FROM clients WHERE id = ?', [id]);
      
      if (clients.length === 0) {
        return res.status(404).json({ message: 'Client not found' });
      }
      
      res.json(clients[0]);
    } catch (error) {
      console.error('Error getting client:', error);
      res.status(500).json({ message: 'Error getting client', error: error.message });
    }
  },

  // Create a new client
  createClient: async (req, res) => {
    try {
      const { name, email, phone, address } = req.body;

      if (!name || !email) {
        return res.status(400).json({ 
          message: 'Name and email are required' 
        });
      }

      // Insert new client
      const [result] = await db.query(
        'INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)',
        [name, email, phone || null, address || null]
      );

      // Fetch the newly created client
      const [newClient] = await db.query(
        'SELECT * FROM clients WHERE id = ?',
        [result.insertId]
      );

      res.status(201).json(newClient[0]);
    } catch (error) {
      console.error('Error creating client:', error);
      res.status(500).json({ 
        message: 'Failed to create client',
        error: error.message 
      });
    }
  },

  // Update client
  updateClient: async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email, phone, address } = req.body;

      if (!name || !email) {
        return res.status(400).json({ 
          message: 'Name and email are required' 
        });
      }

      // Update client
      await db.query(
        'UPDATE clients SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
        [name, email, phone || null, address || null, id]
      );

      // Fetch the updated client
      const [updatedClient] = await db.query(
        'SELECT * FROM clients WHERE id = ?',
        [id]
      );

      if (updatedClient.length === 0) {
        return res.status(404).json({ message: 'Client not found' });
      }

      res.json(updatedClient[0]);
    } catch (error) {
      console.error('Error updating client:', error);
      res.status(500).json({ 
        message: 'Failed to update client',
        error: error.message 
      });
    }
  },

  // Delete client
  deleteClient: async (req, res) => {
    try {
      const { id } = req.params;

      // Check if client exists
      const [client] = await db.query(
        'SELECT * FROM clients WHERE id = ?',
        [id]
      );

      if (client.length === 0) {
        return res.status(404).json({ message: 'Client not found' });
      }

      // Delete client
      await db.query('DELETE FROM clients WHERE id = ?', [id]);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting client:', error);
      res.status(500).json({ 
        message: 'Failed to delete client',
        error: error.message 
      });
    }
  },

  // Get client ledger entries
  getClientLedger: async (req, res) => {
    try {
      // Ensure table exists
      await ensureClientLedgerTable();
      
      const { clientId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Get total count
      const [countResult] = await db.query(
        'SELECT COUNT(*) as total FROM client_ledger WHERE client_id = ?',
        [clientId]
      );
      const total = countResult[0].total;

      // Get ledger entries with pagination
      const [entries] = await db.query(
        `SELECT * FROM client_ledger 
         WHERE client_id = ? 
         ORDER BY date DESC, created_at DESC 
         LIMIT ? OFFSET ?`,
        [clientId, parseInt(limit), offset]
      );

      // Convert numeric fields to proper numbers
      const processedEntries = entries.map(entry => ({
        ...entry,
        amount_in: parseFloat(entry.amount_in || 0),
        amount_out: parseFloat(entry.amount_out || 0),
        balance: parseFloat(entry.balance || 0)
      }));

      console.log('📝 Processed entries:', processedEntries);

      // Get current balance
      const [balanceResult] = await db.query(
        'SELECT balance FROM client_ledger WHERE client_id = ? ORDER BY created_at DESC LIMIT 1',
        [clientId]
      );
      const currentBalance = balanceResult.length > 0 ? parseFloat(balanceResult[0].balance) : 0;

      console.log('💰 Current balance from DB:', balanceResult[0]?.balance, 'Converted to:', currentBalance);

      res.json({
        entries: processedEntries,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        currentBalance
      });
    } catch (error) {
      console.error('Error getting client ledger:', error);
      res.status(500).json({ message: 'Error getting client ledger', error: error.message });
    }
  },

  // Add new ledger entry
  addLedgerEntry: async (req, res) => {
    try {
      console.log('🚀 addLedgerEntry endpoint called');
      console.log('📥 Request params:', req.params);
      console.log('📦 Request body:', req.body);
      console.log('🔍 Request headers:', req.headers);
      
      // Ensure table exists
      console.log('🔧 Ensuring client_ledger table exists...');
      await ensureClientLedgerTable();
      console.log('✅ Table check completed');
      
      const { clientId } = req.params;
      const { amountIn, amountOut, reference, date } = req.body;

      console.log('📊 Extracted data:', { clientId, amountIn, amountOut, reference, date });

      if (!clientId || (!amountIn && !amountOut) || !date) {
        console.log('❌ Validation failed:', { clientId, amountIn, amountOut, date });
        return res.status(400).json({ 
          message: 'clientId, amountIn or amountOut, and date are required' 
        });
      }

      // Validate amounts
      if (amountIn && amountIn < 0) {
        console.log('❌ Amount in is negative:', amountIn);
        return res.status(400).json({ message: 'Amount in cannot be negative' });
      }
      if (amountOut && amountOut < 0) {
        console.log('❌ Amount out is negative:', amountOut);
        return res.status(400).json({ message: 'Amount out cannot be negative' });
      }

      console.log('✅ Input validation passed');

      // Check if client exists first
      console.log('🔍 Checking if client exists...');
      const [clientCheck] = await db.query(
        'SELECT id FROM clients WHERE id = ?',
        [clientId]
      );
      console.log('👤 Client check result:', clientCheck);

      if (clientCheck.length === 0) {
        console.log('❌ Client not found:', clientId);
        return res.status(404).json({ 
          message: 'Client not found' 
        });
      }

      console.log('✅ Client exists');

      // Format date for MySQL DATETIME
      let formattedDate = date;
      if (date && !date.includes(' ')) {
        // If only date is provided (YYYY-MM-DD), convert to DATETIME
        formattedDate = `${date} 00:00:00`;
      }

      console.log('📅 Date formatting:', { original: date, formatted: formattedDate });

      // Get current balance
      console.log('💰 Getting current balance...');
      const [balanceResult] = await db.query(
        'SELECT balance FROM client_ledger WHERE client_id = ? ORDER BY created_at DESC LIMIT 1',
        [clientId]
      );
      const currentBalance = balanceResult.length > 0 ? balanceResult[0].balance : 0;

      console.log('💵 Current balance:', currentBalance);

      // Calculate new balance
      const newBalance = currentBalance + (amountIn || 0) - (amountOut || 0);

      console.log('🧮 Balance calculation:', {
        current: currentBalance,
        amountIn: amountIn || 0,
        amountOut: amountOut || 0,
        new: newBalance
      });

      // Insert new entry
      console.log('💾 Inserting new ledger entry...');
      const insertQuery = `INSERT INTO client_ledger (client_id, amount_in, amount_out, balance, reference, date) VALUES (?, ?, ?, ?, ?, ?)`;
      const insertParams = [clientId, amountIn || 0, amountOut || 0, newBalance, reference, formattedDate];
      
      console.log('📝 Insert query:', insertQuery);
      console.log('🔢 Insert parameters:', insertParams);
      
      const [result] = await db.query(insertQuery, insertParams);

      console.log('✅ Insert result:', result);

      const response = {
        message: 'Ledger entry added successfully',
        entryId: result.insertId,
        newBalance
      };
      
      console.log('📤 Sending response:', response);
      res.status(201).json(response);
      
    } catch (error) {
      console.error('❌ Error in addLedgerEntry:', error);
      console.error('🚨 Error details:', {
        message: error.message,
        code: error.code,
        errno: error.errno,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        stack: error.stack
      });
      res.status(500).json({ message: 'Error adding ledger entry', error: error.message });
    }
  },

  // Get client balance
  getClientBalance: async (req, res) => {
    try {
      // Ensure table exists
      await ensureClientLedgerTable();
      
      const { clientId } = req.params;

      // Get current balance
      const [balanceResult] = await db.query(
        'SELECT balance FROM client_ledger WHERE client_id = ? ORDER BY created_at DESC LIMIT 1',
        [clientId]
      );
      const currentBalance = balanceResult.length > 0 ? balanceResult[0].balance : 0;

      res.json({ balance: currentBalance });
    } catch (error) {
      console.error('Error getting client balance:', error);
      res.status(500).json({ message: 'Error getting client balance', error: error.message });
    }
  },

  // Test method to check table structure
  testTableStructure: async (req, res) => {
    try {
      // Ensure table exists
      await ensureClientLedgerTable();
      
      // Get table structure
      const [structure] = await db.query('DESCRIBE client_ledger');
      
      // Check if there are any existing records
      const [count] = await db.query('SELECT COUNT(*) as total FROM client_ledger');
      
      res.json({
        tableExists: true,
        structure,
        recordCount: count[0].total
      });
    } catch (error) {
      console.error('Error testing table structure:', error);
      res.status(500).json({ message: 'Error testing table structure', error: error.message });
    }
  }
};

module.exports = clientController; 