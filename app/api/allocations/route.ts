import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";

export async function GET() {
  try {
    const [rows]: any = await pool.query(`
      SELECT al.id, al.incident_id, i.title AS incident_title,
             i.emergency_type, i.severity, i.status AS incident_status,
             i.location AS incident_location,
             r.name AS resource_name, r.resource_type,
             u.name AS allocated_by_name, al.allocated_at, al.released_at, al.notes
      FROM allocation_log al
      INNER JOIN incidents i ON i.id = al.incident_id
      INNER JOIN resources r ON r.id = al.resource_id
      INNER JOIN users u ON u.id = al.allocated_by
      ORDER BY al.allocated_at DESC, al.id DESC
      LIMIT 100
    `);
    return NextResponse.json(rows);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Unable to load allocation history." }, { status: 500 });
  }
}
