import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET() {
  try {
    // JOIN incidents to users/resources so the dashboard summary reflects related records.
    const [incidentSummary]: any = await pool.query(`
      SELECT i.status, i.severity, COUNT(*) AS total
      FROM incidents i
      INNER JOIN users u ON u.id = i.reported_by
      LEFT JOIN resources r ON r.id = i.assigned_resource_id
      GROUP BY i.status, i.severity
      ORDER BY FIELD(i.severity,'Critical','High','Medium','Low')
    `);
    const [resourceSummary]: any = await pool.query(`
      SELECT r.resource_type, SUM(r.available_units) AS available_units,
             SUM(r.capacity) AS total_capacity, COUNT(DISTINCT r.id) AS resource_count
      FROM resources r
      LEFT JOIN allocation_log al ON al.resource_id = r.id
      GROUP BY r.resource_type
      ORDER BY r.resource_type
    `);
    const [allocationCount]: any = await pool.query(`
      SELECT COUNT(DISTINCT al.id) AS total_allocations
      FROM allocation_log al
      INNER JOIN incidents i ON i.id = al.incident_id
      INNER JOIN resources r ON r.id = al.resource_id
      INNER JOIN users u ON u.id = al.allocated_by
    `);
    return NextResponse.json({ incidentSummary, resourceSummary, totalAllocations: allocationCount[0]?.total_allocations ?? 0 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to load dashboard summary." }, { status: 500 });
  }
}
