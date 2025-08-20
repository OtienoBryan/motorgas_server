const db = require('../config/database');

async function initializeStockData() {
  try {
    console.log('Initializing stock data...');

    // Insert sample barracks
    const barracksData = [
      { name: 'Main Warehouse', location: 'Nairobi Central', description: 'Primary storage facility' },
      { name: 'North Depot', location: 'Thika', description: 'Northern region storage' },
      { name: 'South Depot', location: 'Mombasa', description: 'Coastal region storage' },
      { name: 'West Depot', location: 'Kisumu', description: 'Western region storage' },
      { name: 'East Depot', location: 'Machakos', description: 'Eastern region storage' }
    ];

    for (const barracks of barracksData) {
      const [result] = await db.query(
        'INSERT INTO barracks (name, location, description) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=name',
        [barracks.name, barracks.location, barracks.description]
      );
      console.log(`Barracks "${barracks.name}" initialized`);
    }

    // Insert sample items
    const itemsData = [
      { name: 'Diesel', description: 'Automotive diesel fuel', unit: 'L' },
      { name: 'Petrol', description: 'Automotive petrol fuel', unit: 'L' },
      { name: 'Kerosene', description: 'Domestic kerosene', unit: 'L' },
      { name: 'Lubricating Oil', description: 'Engine lubricating oil', unit: 'L' },
      { name: 'Grease', description: 'Industrial grease', unit: 'kg' },
      { name: 'Filters', description: 'Fuel and oil filters', unit: 'pcs' },
      { name: 'Spark Plugs', description: 'Automotive spark plugs', unit: 'pcs' }
    ];

    for (const item of itemsData) {
      const [result] = await db.query(
        'INSERT INTO items (name, description, unit) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=name',
        [item.name, item.description, item.unit]
      );
      console.log(`Item "${item.name}" initialized`);
    }

    // Insert sample stock data
    const stockData = [
      { barracks_id: 1, item_id: 1, quantity: 50000 }, // Main Warehouse - Diesel
      { barracks_id: 1, item_id: 2, quantity: 30000 }, // Main Warehouse - Petrol
      { barracks_id: 1, item_id: 3, quantity: 10000 }, // Main Warehouse - Kerosene
      { barracks_id: 2, item_id: 1, quantity: 20000 }, // North Depot - Diesel
      { barracks_id: 2, item_id: 2, quantity: 15000 }, // North Depot - Petrol
      { barracks_id: 3, item_id: 1, quantity: 25000 }, // South Depot - Diesel
      { barracks_id: 3, item_id: 2, quantity: 20000 }, // South Depot - Petrol
      { barracks_id: 4, item_id: 1, quantity: 18000 }, // West Depot - Diesel
      { barracks_id: 5, item_id: 1, quantity: 22000 }, // East Depot - Diesel
    ];

    for (const stock of stockData) {
      try {
        await db.query(
          'INSERT INTO barrack_stock (barracks_id, item_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)',
          [stock.barracks_id, stock.item_id, stock.quantity]
        );
        console.log(`Stock initialized for barracks ${stock.barracks_id}, item ${stock.item_id}`);
      } catch (error) {
        console.log(`Note: Could not initialize stock for barracks ${stock.barracks_id}, item ${stock.item_id}:`, error.message);
      }
    }

    console.log('Stock data initialization completed successfully!');
  } catch (error) {
    console.error('Error initializing stock data:', error);
  } finally {
    process.exit();
  }
}

initializeStockData();

