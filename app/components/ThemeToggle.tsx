"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

interface ThemeToggleProps {
  showLabel?: boolean;
  className?: string;
}

export default function ThemeToggle({
  showLabel = false,
  className,
}: ThemeToggleProps) {
  const [isDark, setIsDark] = useState(false);

  // Sync local state with whatever the blocking script already applied
  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const html = document.documentElement;
    const nowDark = html.classList.contains("dark");

    if (nowDark) {
      html.classList.remove("dark");
      try {
        localStorage.setItem("theme", "light");
      } catch (_) {
        // localStorage unavailable — toggle still works for this session
      }
      setIsDark(false);
    } else {
      html.classList.add("dark");
      try {
        localStorage.setItem("theme", "dark");
      } catch (_) {
        // localStorage unavailable — toggle still works for this session
      }
      setIsDark(true);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={
        className ??
        `group flex w-full items-center rounded-lg py-2.5 text-sm font-medium transition-colors
        text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900
        dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white
        ${showLabel ? "gap-3 px-3" : "justify-center px-0"}`
      }
    >
      {isDark ? (
        <Sun className="h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5 shrink-0" aria-hidden="true" />
      )}

      {!className && (
        <span
          className={`truncate whitespace-nowrap transition-opacity duration-200 ${
            showLabel
              ? "opacity-100"
              : "pointer-events-none w-0 overflow-hidden opacity-0"
          }`}
        >
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}

      {/* Tooltip when collapsed */}
      {!className && !showLabel && (
        <span className="pointer-events-none absolute left-full z-50 ml-3 hidden whitespace-nowrap rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-lg group-hover:block dark:bg-zinc-800 dark:text-white">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
