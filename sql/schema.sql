-- SMART Emergency System Allocation System
-- MySQL 8.0+ recommended. Run this script in MySQL Workbench.
CREATE DATABASE IF NOT EXISTS smart_emergency CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE smart_emergency;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin','Staff') NOT NULL DEFAULT 'Staff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_user_name CHECK (CHAR_LENGTH(TRIM(name)) >= 2)
);

CREATE TABLE IF NOT EXISTS resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  resource_type ENUM('Ambulance','Fire Engine','Police Unit','Rescue Team') NOT NULL,
  capacity INT UNSIGNED NOT NULL DEFAULT 1,
  available_units INT UNSIGNED NOT NULL DEFAULT 0,
  location VARCHAR(180) NOT NULL,
  status ENUM('Available','Deployed','Maintenance') NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_resource_capacity CHECK (available_units <= capacity)
);

CREATE TABLE IF NOT EXISTS incidents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(2000) NOT NULL DEFAULT '',
  emergency_type ENUM('Medical','Fire','Police','Rescue','Disaster') NOT NULL,
  severity ENUM('Critical','High','Medium','Low') NOT NULL DEFAULT 'Medium',
  status ENUM('Reported','Assigned','In Progress','Resolved') NOT NULL DEFAULT 'Reported',
  location VARCHAR(180) NOT NULL,
  people_affected INT UNSIGNED NOT NULL DEFAULT 1,
  reported_by BIGINT UNSIGNED NOT NULL,
  assigned_resource_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_incident_reporter FOREIGN KEY (reported_by) REFERENCES users(id),
  CONSTRAINT fk_incident_resource FOREIGN KEY (assigned_resource_id) REFERENCES resources(id) ON DELETE SET NULL,
  CONSTRAINT chk_incident_people CHECK (people_affected >= 1),
  CONSTRAINT chk_incident_title CHECK (CHAR_LENGTH(TRIM(title)) >= 3)
);

CREATE TABLE IF NOT EXISTS allocation_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  allocated_by BIGINT UNSIGNED NOT NULL,
  allocated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP NULL DEFAULT NULL,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  CONSTRAINT fk_log_incident FOREIGN KEY (incident_id) REFERENCES incidents(id),
  CONSTRAINT fk_log_resource FOREIGN KEY (resource_id) REFERENCES resources(id),
  CONSTRAINT fk_log_user FOREIGN KEY (allocated_by) REFERENCES users(id)
);

CREATE INDEX idx_incident_priority_status ON incidents(severity,status,created_at);
CREATE INDEX idx_incident_type_location ON incidents(emergency_type,location);
CREATE INDEX idx_resource_type_availability ON resources(resource_type,status,available_units);
CREATE INDEX idx_allocation_incident_time ON allocation_log(incident_id,allocated_at);

CREATE OR REPLACE VIEW v_active_incidents AS
SELECT i.id, i.title, i.emergency_type, i.severity, i.status, i.location,
       i.people_affected, i.created_at, u.name AS reporter, r.name AS allocated_resource
FROM incidents i JOIN users u ON i.reported_by=u.id
LEFT JOIN resources r ON i.assigned_resource_id=r.id
WHERE i.status <> 'Resolved';

CREATE TABLE IF NOT EXISTS incident_audit (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id BIGINT UNSIGNED NOT NULL,
  old_status VARCHAR(30) NOT NULL,
  new_status VARCHAR(30) NOT NULL,
  old_severity VARCHAR(20) NOT NULL,
  new_severity VARCHAR(20) NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_incident FOREIGN KEY (incident_id) REFERENCES incidents(id)
);


-- Audit severity/status changes and resolution transitions.
DELIMITER $$
CREATE TRIGGER IF NOT EXISTS trg_incident_update_audit
AFTER UPDATE ON incidents
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status OR OLD.severity <> NEW.severity THEN
    INSERT INTO incident_audit(incident_id,old_status,new_status,old_severity,new_severity,changed_at)
    VALUES(NEW.id,OLD.status,NEW.status,OLD.severity,NEW.severity,NOW());
  END IF;
END$$
DELIMITER ;

-- Seed operational resources. Safe to re-run because names are unique.
INSERT IGNORE INTO resources(name,resource_type,capacity,available_units,location,status) VALUES
('Central Ambulance 01','Ambulance',3,3,'Central Station','Available'),
('Central Ambulance 02','Ambulance',2,2,'Central Station','Available'),
('North Fire Engine 01','Fire Engine',2,2,'North Station','Available'),
('South Fire Engine 01','Fire Engine',2,2,'South Station','Available'),
('City Police Unit 01','Police Unit',4,4,'City HQ','Available'),
('City Police Unit 02','Police Unit',3,3,'City HQ','Available'),
('Rapid Rescue Team 01','Rescue Team',2,2,'Rescue Base','Available'),
('Rapid Rescue Team 02','Rescue Team',2,2,'Rescue Base','Available');

-- Examples of useful DBMS queries:
-- 1. Priority queue
SELECT id,title,severity,status,location,created_at FROM incidents
WHERE status <> 'Resolved'
ORDER BY FIELD(severity,'Critical','High','Medium','Low'), created_at ASC;
-- 2. Resource availability by type
SELECT resource_type,SUM(available_units) AS available_units,COUNT(*) AS resource_records
FROM resources GROUP BY resource_type HAVING SUM(available_units)>0;
-- 3. Allocation history with staff and incident details
SELECT al.id, i.title, i.location, r.name AS resource, u.name AS allocated_by, al.allocated_at
FROM allocation_log al JOIN incidents i ON i.id=al.incident_id
JOIN resources r ON r.id=al.resource_id JOIN users u ON u.id=al.allocated_by
ORDER BY al.allocated_at DESC;
-- 4. Severity count
SELECT severity,COUNT(*) AS incident_count FROM incidents GROUP BY severity
ORDER BY FIELD(severity,'Critical','High','Medium','Low');
-- 5. Subquery: incidents with severity above the current average rank is intentionally omitted;
-- use a transparent correlated query to find locations with more reports than average:
SELECT location,COUNT(*) AS reports FROM incidents GROUP BY location
HAVING COUNT(*) > (SELECT AVG(location_count) FROM (SELECT COUNT(*) location_count FROM incidents GROUP BY location) x);
-- 6. ALTER demonstration (run once if not already applied):
-- ALTER TABLE incidents ADD COLUMN source_channel VARCHAR(30) NOT NULL DEFAULT 'Web';
-- 7. DROP demonstration (do not run on the project database unless intended):
-- DROP VIEW IF EXISTS v_active_incidents;


-- Additional JOIN queries for DBMS demonstration and frontend reports.
-- 7. Incident list with reporter and currently assigned resource (INNER + LEFT JOIN).
SELECT i.id, i.title, i.emergency_type, i.severity, i.status, i.location,
       u.name AS reported_by, r.name AS assigned_resource
FROM incidents i
INNER JOIN users u ON u.id = i.reported_by
LEFT JOIN resources r ON r.id = i.assigned_resource_id
ORDER BY FIELD(i.severity,'Critical','High','Medium','Low'), i.created_at DESC;

-- 8. Full allocation history with incident, resource and staff details (multiple INNER JOINs).
SELECT al.id AS allocation_id, i.title AS incident, r.name AS resource,
       u.name AS allocated_by, al.allocated_at, al.notes
FROM allocation_log al
INNER JOIN incidents i ON i.id = al.incident_id
INNER JOIN resources r ON r.id = al.resource_id
INNER JOIN users u ON u.id = al.allocated_by
ORDER BY al.allocated_at DESC;

-- 9. Resource utilization and allocation count (LEFT JOIN + GROUP BY).
SELECT r.resource_type, r.name, r.capacity, r.available_units,
       COUNT(al.id) AS total_allocations
FROM resources r
LEFT JOIN allocation_log al ON al.resource_id = r.id
GROUP BY r.id, r.resource_type, r.name, r.capacity, r.available_units
ORDER BY r.resource_type, r.name;

-- 10. Incident audit trail with incident title.
SELECT i.title, a.old_status, a.new_status, a.old_severity, a.new_severity, a.changed_at
FROM incident_audit a
INNER JOIN incidents i ON i.id = a.incident_id
ORDER BY a.changed_at DESC;
