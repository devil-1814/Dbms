import { NextResponse } from "next/server";
import { pool } from "../../../../lib/db";
import { currentUser } from "../../../../lib/auth";
import {
  cacheIncidentSnapshot,
  cacheResource,
  recordRedisActivity
} from "../../../../lib/redis";

const validStatuses = ["Reported", "Assigned", "In Progress", "Resolved"];

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const id = Number(params.id);
  let body: { status?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const status = body.status;
  if (!Number.isInteger(id) || id < 1 || !status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: "Invalid incident or status." },
      { status: 400 }
    );
  }

  const conn = await pool.getConnection();
  let resourceForRedis: any = null;
  let incidentForRedis: any = null;

  try {
    await conn.beginTransaction();

    const [incidentRows]: any = await conn.execute(
      `SELECT id, title, emergency_type, severity, status, location,
              assigned_resource_id
       FROM incidents
       WHERE id = ?
       FOR UPDATE`,
      [id]
    );

    if (!incidentRows.length) {
      await conn.rollback();
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }

    const incident = incidentRows[0];

    if (incident.status === "Resolved" && status !== "Resolved") {
      await conn.rollback();
      return NextResponse.json(
        { error: "A resolved incident cannot be reopened. Register a new incident if further assistance is needed." },
        { status: 409 }
      );
    }

    if (
      status === "Resolved" &&
      incident.status !== "Resolved" &&
      incident.assigned_resource_id
    ) {
      const resourceId = incident.assigned_resource_id;

      const [resourceRows]: any = await conn.execute(
        "SELECT id, capacity, available_units, status FROM resources WHERE id = ? FOR UPDATE",
        [resourceId]
      );

      if (resourceRows.length) {
        await conn.execute(
          `UPDATE resources
           SET available_units = LEAST(capacity, available_units + 1),
               status = CASE
                 WHEN status = 'Maintenance' THEN 'Maintenance'
                 WHEN available_units + 1 >= capacity THEN 'Available'
                 ELSE 'Deployed'
               END
           WHERE id = ?`,
          [resourceId]
        );

        const [freshResourceRows]: any = await conn.execute(
          "SELECT * FROM resources WHERE id = ?",
          [resourceId]
        );
        resourceForRedis = freshResourceRows[0] || null;
      }

      // Keep allocation history but mark the latest active allocation returned.
      await conn.execute(
        `UPDATE allocation_log
         SET released_at = NOW()
         WHERE incident_id = ?
           AND resource_id = ?
           AND released_at IS NULL
         ORDER BY allocated_at DESC, id DESC
         LIMIT 1`,
        [id, resourceId]
      );
    }

    await conn.execute(
      "UPDATE incidents SET status = ? WHERE id = ?",
      [status, id]
    );

    incidentForRedis = {
      incidentId: id,
      title: incident.title,
      emergencyType: incident.emergency_type,
      severity: incident.severity,
      status,
      location: incident.location
    };

    await conn.commit();

    // Cache synchronization is deliberately best-effort after the MySQL commit.
    try {
      await cacheIncidentSnapshot(incidentForRedis);
      if (resourceForRedis) await cacheResource(resourceForRedis);
      await recordRedisActivity({
        eventType: status === "Resolved" ? "INCIDENT_RESOLVED" : "INCIDENT_STATUS_UPDATED",
        incidentId: id,
        title: incident.title,
        emergencyType: incident.emergency_type,
        severity: incident.severity,
        status,
        location: incident.location,
        resourceId: incident.assigned_resource_id ?? undefined,
        message: status === "Resolved"
          ? "Incident resolved; the allocated resource was returned to availability."
          : `Incident status changed to ${status}.`
      });
    } catch (redisError) {
      console.error("Redis status cache/log unavailable:", redisError);
    }

    return NextResponse.json({
      message: status === "Resolved"
        ? "Incident resolved. Its allocated resource has been returned to availability."
        : "Incident status updated."
    });
  } catch (error) {
    await conn.rollback();
    console.error("Incident status update error:", error);
    return NextResponse.json(
      { error: "Unable to update incident status or release its resource." },
      { status: 500 }
    );
  } finally {
    conn.release();
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await currentUser();
    if (!user || user.role !== "Admin") {
      return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    }

    const id = Number(params.id);
    if (!Number.isInteger(id) || id < 1) {
      return NextResponse.json({ error: "Invalid incident id." }, { status: 400 });
    }

    const [result]: any = await pool.execute(
      "DELETE FROM incidents WHERE id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return NextResponse.json({ error: "Incident not found." }, { status: 404 });
    }

    try {
      await recordRedisActivity({
        eventType: "INCIDENT_DELETED",
        incidentId: id,
        message: `Incident #${id} was deleted by an administrator.`
      });
    } catch (redisError) {
      console.error("Redis activity log unavailable:", redisError);
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    console.error("Incident deletion error:", error);
    return NextResponse.json({ error: "Unable to delete incident." }, { status: 500 });
  }
}
