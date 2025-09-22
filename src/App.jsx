// src/App.jsx
import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useNavigate } from "react-router-dom";

import Login from "./pages/Login";
import Admin from "./pages/Admin";
import AdminVolunteers from "./pages/AdminVolunteers";
import Volunteer from "./pages/Volunteer";
import VolunteerStats from "./pages/VolunteerStats";
import AdminEditRequests from "./pages/AdminEditRequests.jsx";

import ThemeToggle from "./components/ThemeToggle";   // ✅ נתיב נכון
import GradientWaves from "./components/GradientWaves"; // 👈 הרקע הקבוע לכל האפליקציה

function NavBar() {
  const [user, setUser] = useState(null);
  const nav = useNavigate();

  useEffect(() => {
    const un = (await import("./lib/firebase")).auth.onAuthStateChanged(setUser);
    return () => un();
  }, []);

  async function doLogout() {
    const { auth } = await import("./lib/firebase");
    const { signOut } = await import("firebase/auth");
    await signOut(auth);
    nav("/"); // חזרה לדף הכניסה
  }

  return (
    // שקיפות קלה + blur כדי לראות את הרקע זז מתחת
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
          <button className="btn btn-outline" onClick={doLogout}>
            התנתק
          </button>
        )}
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {/* 🔵 רקע הגלים – קבוע לכל המסך, לא זז בגלילה */}
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

      {/* כל האפליקציה מעל הרקע */}
      <div className="relative z-10 min-h-screen">
        <NavBar />

        <main className="max-w-6xl mx-auto p-6">
          <Routes>
            {/* דף הבית = כניסה */}
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/volunteers" element={<AdminVolunteers />} />
            <Route path="/admin/edits" element={<AdminEditRequests />} />
            <Route path="/volunteer" element={<Volunteer />} />
            <Route path="/volunteer/stats" element={<VolunteerStats />} />

            {/* 404 */}
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
