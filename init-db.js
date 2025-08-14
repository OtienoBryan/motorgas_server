const db = require('./database/db');

async function initDatabase() {
  try {
    console.log('Testing database connection...');
    
    // Test connection
    const [test] = await db.query('SELECT 1');
    console.log('Database connection successful:', test);
    
    // Check if client_ledger table exists
    const [tables] = await db.query('SHOW TABLES LIKE "client_ledger"');
    console.log('client_ledger table check:', tables);
    
    if (tables.length === 0) {
      console.log('Creating client_ledger table...');
      
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
      
      console.log('client_ledger table created successfully!');
    } else {
      console.log('client_ledger table already exists');
    }
    
    // Check table structure
    const [structure] = await db.query('DESCRIBE client_ledger');
    console.log('Table structure:', structure);
    
    // Check if there are any clients
    const [clients] = await db.query('SELECT COUNT(*) as total FROM clients');
    console.log('Total clients:', clients[0].total);
    
    // Check if there are any ledger entries
    const [entries] = await db.query('SELECT COUNT(*) as total FROM client_ledger');
    console.log('Total ledger entries:', entries[0].total);
    
    console.log('Database initialization completed successfully!');
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
  } finally {
    process.exit(0);
  }
}

initDatabase();
