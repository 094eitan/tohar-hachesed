import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { auth } from './lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import Login from './pages/Login.jsx'
import Volunteer from './pages/Volunteer.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined=טוען, null=לא מחובר

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub()
  }, [])

  if (user === undefined) {
    return <div dir="rtl" className="p-6">טוען…</div>
  }

  return (
    <BrowserRouter>
      <nav className="navbar bg-base-100 border-b">
        <div className="flex-1">
          <span className="btn btn-ghost text-xl">טוהר החסד</span>
        </div>
        <div className="flex gap-2">
          <Link className="btn btn-ghost" to="/login">כניסה</Link>
          <Link className="btn btn-ghost" to="/volunteer">מתנדב</Link>
          <Link className="btn btn-ghost" to="/admin">אדמין</Link>
          {user && (
            <button className="btn btn-outline" onClick={()=>signOut(auth)}>
              התנתק
            </button>
          )}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to={user ? '/volunteer' : '/login'} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/volunteer" element={<Protected user={user}><Volunteer/></Protected>} />
        <Route path="/admin" element={<Protected user={user}><Admin/></Protected>} />
        <Route path="*" element={<NotFound/>} />
      </Routes>
    </BrowserRouter>
  )
}

function Protected({ user, children }) {
  if (!user) return <Navigate to="/login" replace />
  return children
}

function NotFound() {
  return <div dir="rtl" className="p-6">עמוד לא נמצא</div>
}
