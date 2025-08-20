-- Create staff_leaves table for managing staff leave requests
CREATE TABLE IF NOT EXISTS staff_leaves (
  id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  staff_id INT(11) NOT NULL,
  staff_name VARCHAR(255) NOT NULL,
  leave_type ENUM('annual', 'sick', 'personal', 'maternity', 'paternity', 'other') NOT NULL DEFAULT 'annual',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  approved_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Add indexes for better performance
  INDEX idx_staff_id (staff_id),
  INDEX idx_start_date (start_date),
  INDEX idx_end_date (end_date),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  
  -- Add foreign key constraint
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data for testing (optional)
-- INSERT INTO staff_leaves (staff_id, staff_name, leave_type, start_date, end_date, reason, status) VALUES
-- (1, 'John Doe', 'annual', '2024-01-15', '2024-01-17', 'Family vacation', 'approved'),
-- (2, 'Jane Smith', 'sick', '2024-01-20', '2024-01-21', 'Not feeling well', 'approved'),
-- (3, 'Mike Johnson', 'personal', '2024-01-25', '2024-01-25', 'Doctor appointment', 'pending');
