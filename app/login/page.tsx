"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

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
    <div className="flex h-screen overflow-hidden bg-zinc-900">
      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden px-10 py-10 lg:flex">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500 opacity-10 blur-3xl" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4 text-white"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white">
            Look Ahead Planner
          </span>
        </div>

        <div className="relative z-10 space-y-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
              Lean Construction Planning
            </p>
            <h2 className="mt-2 text-2xl font-bold leading-snug text-white">
              Plan smarter.
              <br />
              Build faster.
              <br />
              <span className="text-blue-400">Track what matters.</span>
            </h2>
          </div>

          <p className="max-w-xs text-sm leading-relaxed text-zinc-400">
            A multi-role construction planning platform built on Lean
            principles. Weekly PPC tracking, constraint management, and
            Primavera P6 import.
          </p>

          <div className="space-y-2">
            {[
              "Ready / Not Ready make-ready tracking",
              "Weekly PPC with variance analysis",
              "Role-based access for your entire team",
              "Primavera P6 import & delay analysis",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2">
                <div className="h-1 w-1 shrink-0 rounded-full bg-blue-400" />
                <p className="text-xs text-zinc-400">{feature}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-zinc-600">
            Designed for
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { role: "Admin", cls: "bg-zinc-700 text-zinc-300" },
              {
                role: "Planner",
                cls: "bg-blue-900/40 text-blue-300 border border-blue-800/40",
              },
              {
                role: "Site Engineer",
                cls: "bg-amber-900/30 text-amber-300 border border-amber-800/30",
              },
              { role: "Viewer", cls: "bg-zinc-800 text-zinc-400" },
            ].map(({ role, cls }) => (
              <span
                key={role}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-[55%]">
        <div className="mb-6 flex items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4 text-white"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-white">
            Look Ahead Planner
          </span>
        </div>

        <div
          className="w-full max-w-sm rounded-2xl p-8"
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
          }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-zinc-900">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Sign in with your User ID and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="user-id"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-zinc-700"
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
                  className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 pr-10 text-sm text-zinc-900 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isSigningIn}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-zinc-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
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

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setForgotMessage(
                  "Please contact your administrator to reset your password.",
                );
                setError(null);
              }}
              className="text-sm font-medium text-blue-600 transition-colors hover:text-blue-700"
            >
              Forgot password?
            </button>

            {forgotMessage && (
              <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                {forgotMessage}
              </p>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-zinc-400">
            Don&apos;t have an account?{" "}
            <span className="text-zinc-500">Contact your administrator.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
