"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/app/components/ThemeToggle";

const INVALID_CREDENTIALS_MESSAGE =
  "Invalid User ID or password. Please check your credentials and try again.";

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setForgotMessage(null);

    const trimmedUserId = userId.trim();
    if (!trimmedUserId || !password) {
      setError(INVALID_CREDENTIALS_MESSAGE);
      return;
    }

    setIsSigningIn(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: `${userId.trim().toUpperCase()}@lookahead.app`,
      password,
    });

    if (signInError) {
      setError(INVALID_CREDENTIALS_MESSAGE);
      setIsSigningIn(false);
      return;
    }

    router.push("/select-project");
    router.refresh();
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-gradient-to-br from-[#e8f6f7] via-[#eaf4ff] to-[#f0f9ed] dark:bg-none dark:bg-[#0a1420]">
      <ThemeToggle
        className="fixed top-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-lg transition-colors hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/20"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden dark:block"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(53,159,171,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(84,181,251,0.25) 0%, transparent 50%)",
        }}
      />

      {/* ── Left branding panel (always dark) ── */}
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden px-10 py-10 lg:flex">
        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#359FAB]/10 ring-1 ring-[#359FAB]/30 dark:bg-[#54B5FB]/20 dark:ring-[#54B5FB]/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4 text-[#359FAB] dark:text-[#54B5FB]"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            Look Ahead Planner
          </span>
        </div>

        {/* Tagline & features */}
        <div className="relative z-10 space-y-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#359FAB] dark:text-[#54B5FB]">
              Lean Construction Planning
            </p>
            <h2 className="mt-3 text-3xl font-bold leading-snug text-zinc-900 dark:text-white">
              Plan smarter.
              <br />
              Build faster.
              <br />
              <span className="text-[#359FAB] dark:text-[#54B5FB]">
                Track what matters.
              </span>
            </h2>
          </div>

          <p className="max-w-xs text-base leading-relaxed text-zinc-600 dark:text-zinc-200">
            A multi-role construction planning platform built on Lean principles.
            Weekly PPC tracking, constraint management, and Primavera P6 import.
          </p>

          <div className="space-y-2.5">
            {[
              "Ready / Not Ready make-ready tracking",
              "Weekly PPC with variance analysis",
              "Role-based access for your entire team",
              "Primavera P6 import & delay analysis",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="h-1 w-1 shrink-0 rounded-full bg-[#359FAB] dark:bg-[#54B5FB]" />
                <p className="text-sm text-zinc-700 dark:text-zinc-300">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Role badges */}
        <div className="relative z-10">
          <p className="mt-6 mb-2 text-sm font-semibold uppercase tracking-widest text-zinc-600 dark:text-zinc-300">
            Designed for
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm font-medium text-white">
              Admin
            </span>
            <span className="rounded-full bg-blue-600 px-3 py-1 text-sm font-medium text-white">
              Planner
            </span>
            <span className="rounded-full bg-amber-600 px-3 py-1 text-sm font-medium text-white">
              Site Engineer
            </span>
            <span className="rounded-full bg-zinc-600 px-3 py-1 text-sm font-medium text-white">
              Viewer
            </span>
          </div>

          <div className="relative z-10 mt-6 border-t border-zinc-300 pt-4 dark:border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-600">
              © {new Date().getFullYear()} Mansycom Construction
            </p>
          </div>
        </div>
      </div>

      {/* ── Right login panel ── */}
      <div className="relative flex w-full flex-col items-center justify-center px-6 lg:w-[55%]">
        {/* Mobile logo */}
        <div className="relative z-10 mb-8 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#54B5FB]/20 ring-1 ring-[#54B5FB]/30">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4 text-[#54B5FB]"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
            Look Ahead Planner
          </span>
        </div>

        {/* Card */}
        <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-xl dark:bg-white/95 dark:shadow-xl dark:shadow-black/30">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-900">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
              Sign in with your User ID and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* User ID */}
            <div>
              <label
                htmlFor="user-id"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-700"
              >
                User ID
              </label>
              <input
                id="user-id"
                type="text"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                placeholder="e.g. BSL-ENG-0001"
                autoComplete="username"
                disabled={isSigningIn}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-[#54B5FB] focus:ring-2 focus:ring-[#54B5FB]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-700"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={isSigningIn}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 pr-10 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-[#54B5FB] focus:ring-2 focus:ring-[#54B5FB]/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isSigningIn}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSigningIn}
              className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                isSigningIn
                  ? "bg-zinc-200 text-zinc-500"
                  : "bg-[#54B5FB] text-white shadow-sm hover:bg-[#3a9ce8]"
              }`}
            >
              {isSigningIn ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* Forgot password */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setForgotMessage(
                  "Please contact your administrator to reset your password.",
                );
                setError(null);
              }}
              className="text-sm font-medium text-[#54B5FB] transition-colors hover:text-[#3a9ce8]"
            >
              Forgot password?
            </button>

            {forgotMessage && (
              <p className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-500">
                {forgotMessage}
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-xs text-zinc-400">
            Don&apos;t have an account?{" "}
            <span className="text-zinc-500">
              Contact your administrator.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
