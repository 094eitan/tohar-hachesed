import React from "react";
import ThemeToggle from "./ThemeToggle";

export default function Header()
{
    // כותרת עליונה לכל הדפים: לוגו/שם, ניווט קצר, ומתג מצב
    return (
        <header className="sticky top-0 z-40 bg-base-100/80 backdrop-blur border-b border-base-300">
            <div className="navbar max-w-6xl mx-auto px-4">
                <div className="flex-1 items-center gap-3">
                    <span className="text-2xl font-extrabold tracking-tight">טוהר החסד</span>
                    <span className="hidden md:inline-block text-sm opacity-70">מערכת מתנדבים ומשלוחים</span>
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                </div>
            </div>
        </header>
    );
}
