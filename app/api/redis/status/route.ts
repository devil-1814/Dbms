import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { getRedisDashboardStatus } from "../../../../lib/redis";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  const status = await getRedisDashboardStatus();
  return NextResponse.json(status);
}
