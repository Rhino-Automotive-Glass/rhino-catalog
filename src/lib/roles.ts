import { createClient } from "./supabase-server";

export type RoleName =
  | "super_admin"
  | "admin"
  | "editor"
  | "quality_assurance"
  | "approver"
  | "viewer";

export type UserRole = {
  userId: string;
  role: RoleName;
  hierarchyLevel: number;
};

/**
 * Get the authenticated user's role from the shared RBAC tables.
 * Uses the cookie-based server client so it works in API routes and server components.
 * Returns null if not authenticated or no role assigned.
 */
export async function getUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("user_roles")
    .select("roles(name, hierarchy_level)")
    .eq("user_id", user.id)
    .single();

  if (!data) return null;

  // Supabase join returns typed as array but is actually an object
  const role = data.roles as unknown as {
    name: RoleName;
    hierarchy_level: number;
  } | null;

  if (!role) return null;

  return {
    userId: user.id,
    role: role.name,
    hierarchyLevel: role.hierarchy_level,
  };
}

/** Admin and super_admin can edit all product data */
export function canEditProducts(role: RoleName): boolean {
  return role === "super_admin" || role === "admin";
}

/** Admin, super_admin, and editor can edit product images */
export function canEditImages(role: RoleName): boolean {
  return role === "super_admin" || role === "admin" || role === "editor";
}
