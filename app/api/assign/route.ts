import { NextResponse } from "next/server";
import { pool } from "../../../lib/db";
import { currentUser } from "../../../lib/auth";
import { cacheResource, recordRedisActivity } from "../../../lib/redis";

const resourceType: Record<string, string> = {
  Medical: "Ambulance",
  Fire: "Fire Engine",
  Police: "Police Unit",
  Rescue: "Rescue Team",
  Disaster: "Rescue Team"
};

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  let body: { incidentId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const id = Number(body.incidentId);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [incidentRows]: any = await conn.execute(
      "SELECT * FROM incidents WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!incidentRows.length) {
      await conn.rollback();
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }

    const incident = incidentRows[0];

    if (incident.status === "Resolved") {
      await conn.rollback();
      return NextResponse.json(
        { error: "Resolved incidents cannot be assigned." },
        { status: 409 }
      );
    }

    if (incident.assigned_resource_id) {
      await conn.rollback();
      return NextResponse.json(
        { error: "This incident already has a resource assigned." },
        { status: 409 }
      );
    }

    const wanted = resourceType[incident.emergency_type];
    const [resourceRows]: any = await conn.execute(
      `SELECT *
       FROM resources
       WHERE resource_type = ?
         AND status = 'Available'
         AND available_units > 0
       ORDER BY available_units DESC, id
       LIMIT 1
       FOR UPDATE`,
      [wanted]
    );

    if (!resourceRows.length) {
      await conn.rollback();
      return NextResponse.json(
        { error: `No available ${wanted} found.` },
        { status: 409 }
      );
    }

    const resource = resourceRows[0];

    await conn.execute(
      `UPDATE resources
       SET available_units = available_units - 1,
           status = IF(available_units - 1 = 0, 'Deployed', 'Available')
       WHERE id = ?`,
      [resource.id]
    );

    await conn.execute(
      "UPDATE incidents SET assigned_resource_id = ?, status = 'Assigned' WHERE id = ?",
      [resource.id, id]
    );

    await conn.execute(
      `INSERT INTO allocation_log
       (incident_id, resource_id, allocated_by, notes)
       VALUES (?, ?, ?, 'Automatic allocation by type and available capacity')`,
      [id, resource.id, user.id]
    );

    const [updatedResourceRows]: any = await conn.execute(
      "SELECT * FROM resources WHERE id = ?",
      [resource.id]
    );

    await conn.commit();

    const updatedResource = updatedResourceRows[0];

    // Update Redis only after MySQL commits. Redis is a cache/projection,
    // never the authority for deciding whether a resource can be allocated.
    try {
      await cacheResource(updatedResource);
      await recordRedisActivity({
        eventType: "RESOURCE_ALLOCATED",
        incidentId: id,
        title: incident.title,
        emergencyType: incident.emergency_type,
        severity: incident.severity,
        status: "Assigned",
        location: incident.location,
        resourceId: Number(resource.id),
        resourceName: resource.name,
        allocatedBy: Number(user.id),
        message: `${resource.name} was allocated to incident #${id}.`
      });
    } catch (redisError) {
      console.error("Redis allocation cache/log unavailable:", redisError);
    }

    return NextResponse.json({
      message: "Resource allocated",
      resource: {
        id: resource.id,
        name: resource.name,
        type: resource.resource_type,
        available_units: updatedResource.available_units,
        capacity: updatedResource.capacity,
        status: updatedResource.status
      }
    });
  } catch (error) {
    await conn.rollback();
    console.error("Allocation error:", error);
    return NextResponse.json({ error: "Allocation failed." }, { status: 500 });
  } finally {
    conn.release();
  }
}
