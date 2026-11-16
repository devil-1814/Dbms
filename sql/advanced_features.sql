USE smart_emergency;
-- Optional stored procedure: assign resource in a controlled transaction is implemented in the API.
-- This stored procedure provides a queryable severity summary.
DELIMITER $$
DROP PROCEDURE IF EXISTS sp_incident_summary_by_type$$
CREATE PROCEDURE sp_incident_summary_by_type()
BEGIN
  SELECT emergency_type, severity, status, COUNT(*) AS incident_count
  FROM incidents GROUP BY emergency_type,severity,status
  ORDER BY emergency_type, FIELD(severity,'Critical','High','Medium','Low');
END$$
DELIMITER ;

-- Example: CALL sp_incident_summary_by_type();
-- Transaction demo (the actual application allocation route uses a transaction with row locks).
-- Indexes, view, trigger, procedure, foreign keys, checks and transactions are demonstrated.
