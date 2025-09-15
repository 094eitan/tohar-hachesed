import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Volunteer from './pages/Volunteer.jsx'
import Admin from './pages/Admin.jsx'

export default function App()
{
  return (
    <BrowserRouter>
      {/* ניווט קטן לעבודה מקומית */}
      <nav style={{display:'flex', gap:12, padding:12, borderBottom:'1px solid #eee'}}>
        <Link to="/login">Login</Link>
        <Link to="/volunteer">Volunteer</Link>
        <Link to="/admin">Admin</Link>
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login/>} />
        <Route path="/volunteer" element={<Volunteer/>} />
        <Route path="/admin" element={<Admin/>} />
      </Routes>
    </BrowserRouter>
  )
}
