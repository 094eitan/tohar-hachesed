// src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";

import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminVolunteers from "./pages/AdminVolunteers";
import Volunteer from "./pages/Volunteer";
import VolunteerStats from "./pages/VolunteerStats";
import AdminEditRequests from "./pages/AdminEditRequests.jsx";

import { auth } from "./lib/firebase";             // ✅ ייבוא סטטי (אין await)
import ThemeToggle from "./components/ThemeToggle";
import GradientWaves from "./components/GradientWaves"; // 👈 רקע קבוע למסך

function NavBar() {
  const [user, setUser] = useState(auth.currentUser);
  const nav = useNavigate();

  useEffect(() => {
    const un = auth.onAuthStateChanged(setUser);   // ✅ בלי await
    return () => un();
  }, []);

  async function doLogout() {
    const { signOut } = await import("firebase/auth"); // זה בתוך async, מותר
    await signOut(auth);
    nav("/");
  }

  return (
    <nav className="navbar bg-base-100/60 backdrop-blur border-b sticky top-0 z-20">
      <div className="flex-1">
        <Link className="btn btn-ghost text-xl" to="/">טוהר החסד</Link>
      </div>
      <div className="flex gap-2 items-center">
        <ThemeToggle />
        <Link className="btn btn-ghost" to="/">כניסה</Link>
        <Link className="btn btn-ghost" to="/volunteer">מתנדב</Link>
        <Link className="btn btn-ghost" to="/admin">אדמין</Link>
        {user && (
          <button className="btn btn-outline" onClick={doLogout}>התנתק</button>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 🔵 רקע הגלים — קבוע, מכסה תמיד 100vh/100vw, ולא זז בגלילה */}
      <GradientWaves
        className="fixed inset-0 -z-10 w-screen h-[100dvh]"	
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

      {/* התוכן מעל הרקע */}
      <div className="relative z-10 min-h-screen">
        <NavBar />
        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/volunteers" element={<AdminVolunteers />} />
            <Route path="/admin/edits" element={<AdminEditRequests />} />
            <Route path="/volunteer" element={<Volunteer />} />
            <Route path="/volunteer/stats" element={<VolunteerStats />} />
            <Route
              path="*"
              element={
                <div dir="rtl" className="p-10 text-center">
                  <h2 className="text-2xl">הדף לא נמצא</h2>
                  <Link className="btn mt-4" to="/">חזרה לדף הבית</Link>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
