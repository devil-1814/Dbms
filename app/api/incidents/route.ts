import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { currentUser } from "../../../lib/auth";
import { cacheIncidentSnapshot, recordRedisActivity } from "../../../lib/redis";

export async function GET() {
  try {
    const [rows]: any = await pool.query(`
      SELECT i.*, u.name AS reporter_name,
             r.name AS resource_name,
             r.resource_type AS assigned_resource_type
      FROM incidents i
      INNER JOIN users u ON u.id = i.reported_by
      LEFT JOIN resources r ON r.id = i.assigned_resource_id
      ORDER BY FIELD(i.severity,'Critical','High','Medium','Low'),
               i.created_at DESC
    `);
    return NextResponse.json(rows);
  } catch (error) {
    console.error("Incident list error:", error);
    return NextResponse.json({ error: "Unable to load incidents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    }

    const body = await req.json();
    const title = String(body.title || "").trim();
    const description = String(body.description || "").trim();
    const type = String(body.emergency_type || "");
    const severity = String(body.severity || "");
    const location = String(body.location || "").trim();
    const people = Number(body.people_affected);

    if (
      title.length < 3 ||
      title.length > 120 ||
      location.length < 2 ||
      location.length > 180 ||
      description.length > 2000 ||
      !["Medical", "Fire", "Police", "Rescue", "Disaster"].includes(type) ||
      !["Critical", "High", "Medium", "Low"].includes(severity) ||
      !Number.isInteger(people) ||
      people < 1 ||
      people > 100000
    ) {
      return NextResponse.json(
        { error: "Please check all incident fields." },
        { status: 400 }
      );
    }

    const [result]: any = await pool.execute(
      `INSERT INTO incidents
       (title, description, emergency_type, severity, status,
        location, people_affected, reported_by)
       VALUES (?, ?, ?, ?, 'Reported', ?, ?, ?)`,
      [title, description, type, severity, location, people, user.id]
    );

    // Redis is an additional NoSQL store. A Redis failure must not undo
    // a successfully committed MySQL incident record.
    try {
      await cacheIncidentSnapshot({
        incidentId: Number(result.insertId),
        title,
        emergencyType: type,
        severity,
        status: "Reported",
        location
      });
      await recordRedisActivity({
        eventType: "INCIDENT_CREATED",
        incidentId: Number(result.insertId),
        title,
        emergencyType: type,
        severity,
        status: "Reported",
        location,
        message: "A new incident was registered."
      });
    } catch (redisError) {
      console.error("Redis incident cache/log unavailable:", redisError);
    }

    return NextResponse.json(
      { id: result.insertId, message: "Incident created" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Incident creation error:", error);
    return NextResponse.json({ error: "Unable to create incident." }, { status: 500 });
  }
}
