import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useNavigate } from 'react-router-dom'
import { auth, db } from './lib/firebase'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import Landing from './pages/Landing.jsx'      // 👈 דף הבית/כניסה/מידע
import Volunteer from './pages/Volunteer.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const [user, setUser] = useState(undefined) // undefined=טוען, null=לא מחובר
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setIsAdmin(false); return }
      setUser(u)
      // בדיקת אדמין
      const snap = await getDoc(doc(db, 'admins', u.uid))
      setIsAdmin(snap.exists())
    })
    return () => unsub()
  }, [])

  if (user === undefined) return <div dir="rtl" className="p-6">טוען…</div>

  return (
    <BrowserRouter>
      <TopBar user={user} />

      <Routes>
        {/* דף הבית הוא גם דף הכניסה/הרשמה + מידע */}
        <Route path="/" element={ user ? <Navigate to={isAdmin ? '/admin' : '/volunteer'} replace /> : <Landing /> } />
        <Route path="/volunteer" element={<Protected user={user}><Volunteer/></Protected>} />
        <Route path="/admin" element={<Protected user={user}><Admin/></Protected>} />
        <Route path="*" element={<NotFound/>} />
      </Routes>
    </BrowserRouter>
  )
}

function TopBar({ user }) {
  return (
    <nav className="navbar bg-base-100 border-b">
      <div className="flex-1">
        <Link to="/" className="btn btn-ghost text-xl">טוהר החסד</Link>
      </div>
      <div className="flex gap-2">
        {!user ? (
          // לא מחובר – אין קישורים מיותרים
          <></>
        ) : (
          <>
            <Link className="btn btn-ghost" to="/volunteer">דף המתנדב</Link>
            <button className="btn btn-outline" onClick={()=>signOut(auth)}>התנתק</button>
          </>
        )}
      </div>
    </nav>
  )
}

function Protected({ user, children }) {
  if (!user) return <Navigate to="/" replace />
  return children
}

function NotFound() {
  return <div dir="rtl" className="p-6">עמוד לא נמצא</div>
}
