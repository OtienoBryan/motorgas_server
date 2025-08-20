-- Add staff_id column to sales table
-- This script will add the staff_id column, index, and foreign key constraint
-- Run this script manually if you encounter any issues with the automatic setup

-- Add staff_id column (will fail if column already exists - that's okay)
ALTER TABLE sales ADD COLUMN staff_id INT(11) NULL;

-- Add index (will fail if index already exists - that's okay)
ALTER TABLE sales ADD INDEX idx_staff_id (staff_id);

-- Add foreign key constraint (will fail if constraint already exists - that's okay)
ALTER TABLE sales ADD CONSTRAINT fk_sales_staff 
FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL;

-- Update existing sales records to assign a default staff member if needed
-- This is optional and can be customized based on business logic
-- UPDATE sales SET staff_id = (SELECT id FROM staff LIMIT 1) WHERE staff_id IS NULL;
