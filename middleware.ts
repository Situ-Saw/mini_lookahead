import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Auth routing (see lib/supabase/middleware.ts):
 * - /login, /auth/callback — public
 * - /select-project — requires login; never redirects to itself
 * - Other routes — require login and active_project cookie
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
