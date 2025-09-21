import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Admin from './pages/Admin'
import AdminVolunteers from './pages/AdminVolunteers'
import Volunteer from './pages/Volunteer'
import VolunteerStats from './pages/VolunteerStats'
import { auth } from './lib/firebase'
import AdminEditRequests from './pages/AdminEditRequests.jsx'
import ThemeToggle from './components/ThemeToggle'  // ✅ נתיב נכון

function NavBar()
{
  const [user, setUser] = useState(auth.currentUser)
  const nav = useNavigate()

  useEffect(() =>
  {
    const un = auth.onAuthStateChanged(setUser)
    return () => un()
  }, [])

  async function doLogout()
  {
    const { signOut } = await import('firebase/auth')
    await signOut(auth)
    nav('/') // חזרה לדף הכניסה
  }

  return (
    <nav className="navbar bg-base-100 border-b">
      <div className="flex-1">
        <Link className="btn btn-ghost text-xl" to="/">טוהר החסד</Link>
      </div>

      <div className="flex gap-2 items-center">
        {/* תמיד נראה את מתג הנושא בפינה הימנית */}
        <ThemeToggle />

        {/* קישורים כלליים */}
        <Link className="btn btn-ghost" to="/">כניסה</Link>
        <Link className="btn btn-ghost" to="/volunteer">מתנדב</Link>
        <Link className="btn btn-ghost" to="/admin">אדמין</Link>

        {/* כפתור התנתקות רק למשתמש מחובר */}
        {user && (
          <button className="btn btn-outline" onClick={doLogout}>
            התנתק
          </button>
        )}
      </div>
    </nav>
  )
}

export default function App()
{
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        {/* דף הבית = כניסה */}
        <Route path="/" element={<Landing />} />
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
    </BrowserRouter>
  )
}
