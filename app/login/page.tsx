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
    <div
      className="relative flex h-screen overflow-hidden"
      style={{ background: "#0d1f1f" }}
    >
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(45,212,191,0.2), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(20,184,166,0.15), transparent 70%)",
        }}
      />

      <div className="relative hidden w-[45%] flex-col justify-between overflow-hidden px-10 py-10 lg:flex">
        <div className="relative z-10 flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "rgba(45,212,191,0.2)",
              border: "1px solid rgba(45,212,191,0.3)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
              style={{ color: "#2dd4bf" }}
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
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: "#2dd4bf" }}
            >
              Lean Construction Planning
            </p>
            <h2 className="mt-3 text-2xl font-bold leading-snug text-white">
              Plan smarter.
              <br />
              Build faster.
              <br />
              <span style={{ color: "#2dd4bf" }}>Track what matters.</span>
            </h2>
          </div>

          <p
            className="max-w-xs text-sm leading-relaxed"
            style={{ color: "#64748b" }}
          >
            A multi-role construction planning platform built on Lean
            principles. Weekly PPC tracking, constraint management, and
            Primavera P6 import.
          </p>

          <div className="space-y-2.5">
            {[
              "Ready / Not Ready make-ready tracking",
              "Weekly PPC with variance analysis",
              "Role-based access for your entire team",
              "Primavera P6 import & delay analysis",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div
                  className="h-1 w-1 shrink-0 rounded-full"
                  style={{ background: "#2dd4bf" }}
                />
                <p className="text-xs" style={{ color: "#94a3b8" }}>
                  {feature}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p
            className="mb-2 text-xs font-medium uppercase tracking-[0.15em]"
            style={{ color: "#334155" }}
          >
            Designed for
          </p>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                {
                  role: "Admin",
                  style: {
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#94a3b8",
                  },
                },
                {
                  role: "Planner",
                  style: {
                    background: "rgba(45,212,191,0.08)",
                    border: "1px solid rgba(45,212,191,0.2)",
                    color: "#2dd4bf",
                  },
                },
                {
                  role: "Site Engineer",
                  style: {
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.2)",
                    color: "#fbbf24",
                  },
                },
                {
                  role: "Viewer",
                  style: {
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "#64748b",
                  },
                },
              ] as Array<{ role: string; style: React.CSSProperties }>
            ).map(({ role, style }) => (
              <span
                key={role}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                style={style}
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex w-full flex-col items-center justify-center px-6 lg:w-[55%]">
        <div className="relative z-10 mb-8 flex items-center gap-2.5 lg:hidden">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              background: "rgba(45,212,191,0.2)",
              border: "1px solid rgba(45,212,191,0.3)",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-4 w-4"
              style={{ color: "#2dd4bf" }}
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
          className="relative z-10 w-full max-w-sm rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow:
              "0 25px 50px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Welcome back</h1>
            <p className="mt-1 text-sm" style={{ color: "#64748b" }}>
              Sign in with your User ID and password
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="user-id"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide"
                style={{ color: "#94a3b8" }}
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
                className="w-full rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
                onFocus={(event) => {
                  event.target.style.borderColor = "#2dd4bf";
                  event.target.style.background = "rgba(45,212,191,0.05)";
                  event.target.style.boxShadow =
                    "0 0 0 3px rgba(45,212,191,0.1)";
                }}
                onBlur={(event) => {
                  event.target.style.borderColor = "rgba(255,255,255,0.1)";
                  event.target.style.background = "rgba(255,255,255,0.05)";
                  event.target.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide"
                style={{ color: "#94a3b8" }}
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
                  className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm text-white outline-none transition-all placeholder:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  onFocus={(event) => {
                    event.target.style.borderColor = "#2dd4bf";
                    event.target.style.background = "rgba(45,212,191,0.05)";
                    event.target.style.boxShadow =
                      "0 0 0 3px rgba(45,212,191,0.1)";
                  }}
                  onBlur={(event) => {
                    event.target.style.borderColor = "rgba(255,255,255,0.1)";
                    event.target.style.background = "rgba(255,255,255,0.05)";
                    event.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isSigningIn}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 transition-colors disabled:opacity-50"
                  style={{ color: "#475569" }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.color = "#94a3b8";
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.color = "#475569";
                  }}
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
              <div
                className="rounded-xl px-4 py-2.5 text-sm"
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  color: "#fca5a5",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isSigningIn}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: isSigningIn
                  ? "rgba(255,255,255,0.1)"
                  : "#ffffff",
                color: isSigningIn ? "#94a3b8" : "#0d1f1f",
                boxShadow: isSigningIn
                  ? "none"
                  : "0 4px 15px rgba(255,255,255,0.1)",
              }}
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
              className="text-sm font-medium transition-colors"
              style={{ color: "#2dd4bf" }}
              onMouseEnter={(event) => {
                event.currentTarget.style.color = "#5eead4";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color = "#2dd4bf";
              }}
            >
              Forgot password?
            </button>

            {forgotMessage && (
              <p
                className="mt-3 rounded-xl px-4 py-2.5 text-sm"
                style={{
                  color: "#94a3b8",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {forgotMessage}
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-xs" style={{ color: "#334155" }}>
            Don&apos;t have an account?{" "}
            <span style={{ color: "#475569" }}>Contact your administrator.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
