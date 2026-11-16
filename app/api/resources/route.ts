import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { syncResourceSnapshot } from "../../../lib/redis";

export async function GET() {
  try {
    const [rows]: any = await pool.query(`
      SELECT r.*, COUNT(al.id) AS allocation_count
      FROM resources r
      LEFT JOIN allocation_log al ON al.resource_id = r.id
      GROUP BY r.id, r.name, r.resource_type, r.capacity,
               r.available_units, r.location, r.status, r.created_at
      ORDER BY r.resource_type, r.name
    `);

    // Refresh Redis with the latest authoritative MySQL resource state.
    try {
      await syncResourceSnapshot(rows);
    } catch (redisError) {
      console.error("Redis resource cache refresh failed:", redisError);
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Resource list error:", error);
    return NextResponse.json({ error: "Unable to load resources." }, { status: 500 });
  }
}
