import React, { useState } from 'react'
import { auth } from '../lib/firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile
} from 'firebase/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState('login') // 'login' | 'signup'

  const goVolunteer = () => (window.location.href = '/volunteer')

  const doLogin = async () => {
    setMsg('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      goVolunteer()
    } catch (e) { setMsg(heError(e)) }
  }

  const doSignup = async () => {
    setMsg('')
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
      goVolunteer()
    } catch (e) { setMsg(heError(e)) }
  }

  const doAnon = async () => {
    setMsg('')
    try { await signInAnonymously(auth); goVolunteer() }
    catch (e) { setMsg(heError(e)) }
  }

  return (
    <div dir="rtl" className="max-w-md mx-auto mt-10 p-6 rounded-2xl border bg-base-100 shadow">
      <h2 className="text-2xl font-semibold mb-4">טוהר החסד — כניסה</h2>

      <div className="join mb-4">
        <button onClick={()=>setMode('login')}  className={`btn join-item ${mode==='login'?'btn-primary':''}`}>כניסה במייל</button>
        <button onClick={()=>setMode('signup')} className={`btn join-item ${mode==='signup'?'btn-primary':''}`}>הרשמה</button>
      </div>

      {mode === 'signup' && (
        <>
          <label className="label"><span className="label-text">שם (אופציונלי)</span></label>
          <input className="input input-bordered w-full mb-3" value={name} onChange={e=>setName(e.target.value)} />
        </>
      )}

      <label className="label"><span className="label-text">אימייל</span></label>
      <input className="input input-bordered w-full mb-3" value={email} onChange={e=>setEmail(e.target.value)} />

      <label className="label"><span className="label-text">סיסמה</span></label>
      <input type="password" className="input input-bordered w-full mb-3" value={password} onChange={e=>setPassword(e.target.value)} />

      {mode === 'login'
        ? <button onClick={doLogin} className="btn btn-primary w-full">התחבר</button>
        : <button onClick={doSignup} className="btn btn-primary w-full">הרשמה</button>
      }

/*
      <div className="mt-3">
        <button onClick={doAnon} className="btn w-full">כניסה אנונימית</button>
      </div>
	  כניסה אנונימית היה בשביל הטסטים והורדתי את זה 
*/
      {msg && <div className="alert alert-error mt-3"><span>{msg}</span></div>}

      <small className="block mt-3 text-gray-500">
        כדי להיות אדמין: לאחר ההתחברות הראשונה, צור ב-Firestore אוסף <code>admins</code> ומסמך עם
        <code> Document ID = ה-UID שלך</code> (Authentication → Users).
      </small>
    </div>
  )
}

function heError(e) {
  const c = e?.code || ''
  if (c.includes('auth/invalid-email')) return 'אימייל לא תקין'
  if (c.includes('auth/missing-password')) return 'נא להזין סיסמה'
  if (c.includes('auth/weak-password')) return 'סיסמה חלשה (לפחות 6 תווים)'
  if (c.includes('auth/email-already-in-use')) return 'האימייל כבר בשימוש'
  if (c.includes('auth/invalid-credential')) return 'אימייל או סיסמה לא נכונים'
  return e?.message || 'שגיאה'
}
