-- Add sample coordinates to existing stations
-- This script adds realistic coordinates for stations in Kenya

-- Update existing stations with sample coordinates
UPDATE stations SET 
  latitude = -1.2921, 
  longitude = 36.8219 
WHERE id = 1;

-- Add more stations with coordinates if they don't exist
INSERT INTO stations (name, address, phone, email, latitude, longitude) VALUES
('Nairobi Central Station', 'Nairobi CBD, Kenya', '+254700000001', 'nairobi@example.com', -1.2921, 36.8219),
('Mombasa Station', 'Mombasa, Kenya', '+254700000002', 'mombasa@example.com', -4.0435, 39.6682),
('Kisumu Station', 'Kisumu, Kenya', '+254700000003', 'kisumu@example.com', -0.1022, 34.7617),
('Nakuru Station', 'Nakuru, Kenya', '+254700000004', 'nakuru@example.com', -0.3031, 36.0800),
('Eldoret Station', 'Eldoret, Kenya', '+254700000005', 'eldoret@example.com', 0.5204, 35.2699),
('Thika Station', 'Thika, Kenya', '+254700000006', 'thika@example.com', -1.0392, 37.0840),
('Nyeri Station', 'Nyeri, Kenya', '+254700000007', 'nyeri@example.com', -0.4201, 36.9476),
('Machakos Station', 'Machakos, Kenya', '+254700000008', 'machakos@example.com', -1.5221, 37.2636),
('Kakamega Station', 'Kakamega, Kenya', '+254700000009', 'kakamega@example.com', 0.2833, 34.7500),
('Kericho Station', 'Kericho, Kenya', '+254700000010', 'kericho@example.com', -0.3670, 35.2831)
ON DUPLICATE KEY UPDATE 
  latitude = VALUES(latitude),
  longitude = VALUES(longitude);
