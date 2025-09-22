// src/App.jsx
import React from "react";
import { BrowserRouter as Router, Routes, Route, NavLink } from "react-router-dom";

import Login from "./Login";
import Volunteer from "./Volunteer";
import VolunteerStats from "./VolunteerStats";
import Admin from "./Admin";
import AdminVolunteers from "./AdminVolunteers";
import AdminEditRequests from "./AdminEditRequests";

import ThemeToggle from "./ThemeToggle";
import GradientWaves from "./components/GradientWaves"; // 👈 הרקע הקבוע

export default function App() {
  return (
    <Router>
      {/* רקע הגלים: קבוע לכל המסך, לא זז בגלילה */}
      <GradientWaves
        className="fixed inset-0 w-screen h-screen -z-10"
        lines={20}
        amplitudeX={100}
        amplitudeY={20}
        hueStart={53}
        satStart={74}
        lightStart={67}
        hueEnd={216}
        satEnd={100}
        lightEnd={7}
        smoothness={3}
        offsetX={10}
        fill={true}
        crazyness={false}
      />

      {/* מעטפת כל התוכן מעל הרקע */}
      <div className="relative z-10 min-h-screen">
        {/* Nav קטן (אופציונלי) */}
        <header className="sticky top-0 z-20 bg-base-300/60 backdrop-blur border-b border-base-200">
          <nav className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
            <div className="flex-1 font-extrabold text-lg">טוהר החסד</div>
            <div className="flex items-center gap-3">
              <NavLink className="btn btn-ghost btn-sm" to="/">דף הבית</NavLink>
              <NavLink className="btn btn-ghost btn-sm" to="/volunteer">מתנדב</NavLink>
              <NavLink className="btn btn-ghost btn-sm" to="/volunteer/stats">סיכומים ויעדים</NavLink>
              <NavLink className="btn btn-ghost btn-sm" to="/admin">אדמין</NavLink>
              <ThemeToggle />
            </div>
          </nav>
        </header>

        {/* התוכן הפר-דף */}
        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/volunteer" element={<Volunteer />} />
            <Route path="/volunteer/stats" element={<VolunteerStats />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/volunteers" element={<AdminVolunteers />} />
            <Route path="/admin/edits" element={<AdminEditRequests />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
