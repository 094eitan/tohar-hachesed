import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { auth } from './lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Login from './pages/Login.jsx'
import Volunteer from './pages/Volunteer.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined = עדיין טוען, null = לא מחובר

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub()
  }, [])

  if (user === undefined) {
    // בזמן טעינת סטטוס התחברות – מונע מסך לבן
    return (
      <div dir="rtl" style={{padding:24}}>
        <b>טוען…</b>
      </div>
    )
  }

  return (
    <BrowserRouter>
      {/* ניווט קטן לנוחות פיתוח */}
      <nav style={{display:'flex', gap:12, padding:12, borderBottom:'1px solid #eee'}}>
        <Link to="/login">Login</Link>
        <Link to="/volunteer">Volunteer</Link>
        <Link to="/admin">Admin</Link>
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
  return <div dir="rtl" style={{padding:24}}>עמוד לא נמצא</div>
}
