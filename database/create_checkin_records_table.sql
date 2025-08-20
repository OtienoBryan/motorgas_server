-- Create checkin_records table for staff attendance tracking
CREATE TABLE IF NOT EXISTS checkin_records (
  id BIGINT(20) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT(11) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  station_id INT(11) NOT NULL,
  station_name VARCHAR(255) NOT NULL,
  check_in_latitude DECIMAL(10,8) NOT NULL,
  check_in_longitude DECIMAL(11,8) NOT NULL,
  check_out_latitude DECIMAL(10,8) NULL,
  check_out_longitude DECIMAL(11,8) NULL,
  address TEXT NULL,
  status INT(11) NOT NULL DEFAULT 0,
  time_in DATETIME NULL,
  time_out DATETIME NULL,
  qr_data TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add indexes for better performance
  INDEX idx_user_id (user_id),
  INDEX idx_station_id (station_id),
  INDEX idx_status (status),
  INDEX idx_time_in (time_in),
  INDEX idx_time_out (time_out),
  INDEX idx_created_at (created_at),
  
  -- Add foreign key constraints
  FOREIGN KEY (user_id) REFERENCES staff(id) ON DELETE CASCADE,
  FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data for testing (optional)
-- INSERT INTO checkin_records (user_id, user_name, station_id, station_name, check_in_latitude, check_in_longitude, status, time_in) VALUES
-- (1, 'John Doe', 1, 'Main Station', 1.23456789, 103.12345678, 1, NOW()),
-- (2, 'Jane Smith', 1, 'Main Station', 1.23456789, 103.12345678, 0, DATE_SUB(NOW(), INTERVAL 2 HOUR));
