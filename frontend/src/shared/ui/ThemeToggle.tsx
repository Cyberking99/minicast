"use client";

import React, { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState("dark"); // Default to dark mode

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") || "dark";
    setTheme(storedTheme);
    document.documentElement.setAttribute("data-theme", storedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      title="Toggle between Brutalist Light and Dark modes"
      style={{
        marginRight: "8px",
        cursor: "pointer",
        background: "var(--surface)",
        color: "var(--fg)",
        border: "1.5px solid var(--border)",
        padding: "6px 12px",
        fontSize: "11px",
        fontFamily: "var(--font-mono)",
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {theme === "dark" ? "☀ LIGHT" : "☾ DARK"}
    </button>
  );
}
