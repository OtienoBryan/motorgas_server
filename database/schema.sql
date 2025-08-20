CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    role ENUM('admin', 'user') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  client_name VARCHAR(255) NOT NULL,
  pickup_location VARCHAR(255) NOT NULL,
  delivery_location VARCHAR(255) NOT NULL,
  pickup_date DATETIME NOT NULL,
  description TEXT,
  priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
  status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
  created_at DATETIME NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS teams (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  crew_commander_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (crew_commander_id) REFERENCES staff(id)
);

-- Barracks table for storing different storage locations
CREATE TABLE IF NOT EXISTS barracks (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Items table for different types of stock
CREATE TABLE IF NOT EXISTS items (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  unit VARCHAR(50) DEFAULT 'L',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Barrack stock table for current stock levels
CREATE TABLE IF NOT EXISTS barrack_stock (
  id INT PRIMARY KEY AUTO_INCREMENT,
  barracks_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity DECIMAL(11,2) DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (barracks_id) REFERENCES barracks(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  UNIQUE KEY unique_barrack_item (barracks_id, item_id)
);

-- Stock transfers table for transfer requests
CREATE TABLE IF NOT EXISTS stock_transfers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  from_barracks_id INT NOT NULL,
  to_barracks_id INT NOT NULL,
  item_id INT NOT NULL,
  quantity DECIMAL(11,2) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  requested_by INT NOT NULL,
  approved_by INT,
  request_date DATETIME NOT NULL,
  approval_date DATETIME,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (from_barracks_id) REFERENCES barracks(id),
  FOREIGN KEY (to_barracks_id) REFERENCES barracks(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Stock ledger table for tracking all stock movements
CREATE TABLE IF NOT EXISTS stock_ledger (
  id INT PRIMARY KEY AUTO_INCREMENT,
  item_id INT NOT NULL,
  barracks_id INT NOT NULL,
  quantity_in DECIMAL(11,2) DEFAULT 0,
  quantity_out DECIMAL(11,2) DEFAULT 0,
  date DATETIME NOT NULL,
  comment TEXT,
  requested_by INT,
  approved_by INT,
  transfer_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (barracks_id) REFERENCES barracks(id),
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (approved_by) REFERENCES users(id),
  FOREIGN KEY (transfer_id) REFERENCES stock_transfers(id)
); 