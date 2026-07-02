import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === "/login";
  const isSelectProject = pathname === "/select-project";
  const isAuthCallback = pathname.startsWith("/auth/callback");
  const hasActiveProject = Boolean(request.cookies.get("active_project")?.value);

  if (!user && !isLogin && !isAuthCallback) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  if (user && isLogin) {
    const selectProjectUrl = request.nextUrl.clone();
    selectProjectUrl.pathname = "/select-project";
    return NextResponse.redirect(selectProjectUrl);
  }

  if (
    user &&
    !isLogin &&
    !isAuthCallback &&
    !isSelectProject &&
    !hasActiveProject
  ) {
    const selectProjectUrl = request.nextUrl.clone();
    selectProjectUrl.pathname = "/select-project";
    return NextResponse.redirect(selectProjectUrl);
  }

  return supabaseResponse;
}
