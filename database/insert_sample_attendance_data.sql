-- Insert sample attendance data for testing
-- Make sure you have staff and stations in your database first

-- Insert sample check-in records
INSERT INTO checkin_records (
  user_id, 
  user_name, 
  station_id, 
  station_name, 
  check_in_latitude, 
  check_in_longitude, 
  address, 
  status, 
  time_in
) VALUES 
(1, 'John Doe', 1, 'Main Station', 1.23456789, 103.12345678, '123 Main Street, City', 1, NOW()),
(2, 'Jane Smith', 1, 'Main Station', 1.23456789, 103.12345678, '123 Main Street, City', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(3, 'Mike Johnson', 2, 'North Station', 1.34567890, 103.23456789, '456 North Road, City', 0, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(4, 'Sarah Wilson', 2, 'North Station', 1.34567890, 103.23456789, '456 North Road, City', 1, DATE_SUB(NOW(), INTERVAL 1 HOUR));

-- Update some records to have check-out times (status = 0)
UPDATE checkin_records 
SET 
  check_out_latitude = check_in_latitude,
  check_out_longitude = check_in_longitude,
  status = 0,
  time_out = DATE_ADD(time_in, INTERVAL 8 HOUR)
WHERE id IN (1, 3);

-- Verify the data
SELECT 
  cr.id,
  cr.user_name,
  cr.station_name,
  cr.status,
  cr.time_in,
  cr.time_out,
  TIMESTAMPDIFF(MINUTE, cr.time_in, COALESCE(cr.time_out, NOW())) as duration_minutes
FROM checkin_records cr
ORDER BY cr.time_in DESC;
