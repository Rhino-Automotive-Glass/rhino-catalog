import { isAuthApiError } from "@supabase/supabase-js";
import type { NextRequest, NextResponse } from "next/server";

const REFRESH_TOKEN_NOT_FOUND = "refresh_token_not_found";

export function isRefreshTokenNotFoundError(error: unknown): boolean {
  return (
    isAuthApiError(error) &&
    error.status === 400 &&
    error.code === REFRESH_TOKEN_NOT_FOUND
  );
}

function getAuthCookieName() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!supabaseUrl) return null;

  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
}

function isProjectAuthCookie(name: string, authCookieName: string) {
  return name === authCookieName || name.startsWith(`${authCookieName}.`);
}

export function clearSupabaseAuthCookies<T extends NextResponse>(
  request: NextRequest,
  response: T
): T {
  const authCookieName = getAuthCookieName();

  if (!authCookieName) return response;

  request.cookies
    .getAll()
    .filter((cookie) => isProjectAuthCookie(cookie.name, authCookieName))
    .forEach((cookie) => {
      request.cookies.set(cookie.name, "");
      response.cookies.set(cookie.name, "", {
        path: "/",
        maxAge: 0,
      });
    });

  return response;
}
