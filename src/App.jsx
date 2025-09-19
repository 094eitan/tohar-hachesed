import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom'
import Login from './pages/Login'
import Admin from './pages/Admin'
import AdminVolunteers from './pages/AdminVolunteers'
import Volunteer from './pages/Volunteer'
import VolunteerStats from './pages/VolunteerStats'
import { auth } from './lib/firebase'

function NavBar() {
  const [user, setUser] = useState(auth.currentUser)
  const nav = useNavigate()

  useEffect(() => {
    const un = auth.onAuthStateChanged(setUser)
    return () => un()
  }, [])

  async function doLogout() {
    const { signOut } = await import('firebase/auth')
    await signOut(auth)
    nav('/') // <<< חשוב: חוזר לדף הבית (שם ה-Login)
  }

  return (
    <nav className="navbar bg-base-100 border-b">
      <div className="flex-1">
        <Link className="btn btn-ghost text-xl" to="/">טוהר החסד</Link>
      </div>
      <div className="flex gap-2">
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
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <NavBar />
      <Routes>
        {/* דף הבית הוא דף הכניסה */}
        <Route path="/" element={<Login />} />
        <Route path="/admin" element={<Admin/>} />
		<Route path="/admin/volunteers" element={<AdminVolunteers/>} />
		<Route path="/volunteer" element={<Volunteer/>} />
		<Route path="/volunteer/stats" element={<VolunteerStats/>} />
        {/* 404 */}
        <Route path="*" element={
          <div dir="rtl" className="p-10 text-center">
            <h2 className="text-2xl">הדף לא נמצא</h2>
            <Link className="btn mt-4" to="/">חזרה לדף הבית</Link>
          </div>
        }/>
      </Routes>
    </BrowserRouter>
  )
}
