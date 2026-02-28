import { NextResponse } from "next/server";
import { getUserRole } from "@/lib/roles";

/** GET /api/me/role — return the authenticated user's role */
export async function GET() {
  const userRole = await getUserRole();

  if (!userRole) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    role: userRole.role,
    hierarchyLevel: userRole.hierarchyLevel,
  });
}
