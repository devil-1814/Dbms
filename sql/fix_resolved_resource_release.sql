-- SMART Emergency System: return resources for incidents already marked Resolved.
-- BACK UP your database first. Run this migration ONCE.
USE smart_emergency;

ALTER TABLE allocation_log
  ADD COLUMN released_at TIMESTAMP NULL DEFAULT NULL;

START TRANSACTION;

-- Count every still-unreleased allocation for resolved incidents by resource.
CREATE TEMPORARY TABLE tmp_resolved_resource_returns AS
SELECT al.resource_id, COUNT(*) AS units_to_return
FROM allocation_log al
INNER JOIN incidents i ON i.id = al.incident_id
WHERE i.status = 'Resolved'
  AND al.released_at IS NULL
GROUP BY al.resource_id;

-- Restore units without exceeding the resource's configured capacity.
UPDATE resources r
INNER JOIN tmp_resolved_resource_returns x ON x.resource_id = r.id
SET r.available_units = LEAST(r.capacity, r.available_units + x.units_to_return),
    r.status = CASE
      WHEN r.status = 'Maintenance' THEN 'Maintenance'
      ELSE 'Available'
    END;

-- Mark those historical allocations as returned, so they cannot be counted twice.
UPDATE allocation_log al
INNER JOIN incidents i ON i.id = al.incident_id
SET al.released_at = NOW()
WHERE i.status = 'Resolved'
  AND al.released_at IS NULL;

DROP TEMPORARY TABLE tmp_resolved_resource_returns;
COMMIT;

-- Verify resource availability and returned allocations.
SELECT id, name, capacity, available_units, status
FROM resources
ORDER BY id;

SELECT al.id, i.title AS incident, r.name AS resource,
       al.allocated_at, al.released_at
FROM allocation_log al
JOIN incidents i ON i.id = al.incident_id
JOIN resources r ON r.id = al.resource_id
ORDER BY al.id DESC;
