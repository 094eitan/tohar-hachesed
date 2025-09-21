// web/src/components/ThemeToggle.jsx
import React, { useEffect, useState } from "react";

/*
  כפתור קטן להחלפת מצב כהה/בהיר (DaisyUI).
  שמירה ב-localStorage תחת המפתח "theme".
  משתמש ב-data-theme על <html>.
*/

function getSystemPrefers()
{
  if (typeof window === "undefined" || !window.matchMedia)
  {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(t)
{
  if (typeof document !== "undefined")
  {
    document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
  }
}

export default function ThemeToggle()
{
  const [theme, setTheme] = useState("light");

  useEffect(function init()
  {
    const saved = localStorage.getItem("theme");
    const next = saved || getSystemPrefers();
    setTheme(next);
    applyTheme(next);
  }, []);

  function toggle()
  {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  }

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={toggle}
      title={theme === "dark" ? "מצב בהיר" : "מצב כהה"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
