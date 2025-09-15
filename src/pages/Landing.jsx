import React, { useState } from 'react'
import { auth, db } from '../lib/firebase'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  updateProfile
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

export default function Landing() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState('login') // login | signup

  const redirectAfterLogin = async (u) => {
    try {
      const snap = await getDoc(doc(db, 'admins', u.uid))
      if (snap.exists()) window.location.href = '/admin'
      else window.location.href = '/volunteer'
    } catch {
      window.location.href = '/volunteer'
    }
  }

  const doLogin = async () => {
    setMsg('')
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
      await redirectAfterLogin(cred.user)
    } catch (e) { setMsg(prettyErr(e)) }
  }

  const doSignup = async () => {
    setMsg('')
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
      await redirectAfterLogin(cred.user)
    } catch (e) { setMsg(prettyErr(e)) }
  }

  const doAnon = async () => {
    setMsg('')
    try {
      const cred = await signInAnonymously(auth)
      await redirectAfterLogin(cred.user)
    } catch (e) { setMsg(prettyErr(e)) }
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6 grid md:grid-cols-2 gap-6">
      {/* צד מידע על העמותה */}
      <section className="p-6 rounded-2xl border bg-base-100 shadow">
        <h1 className="text-2xl font-bold mb-2">טוהר החסד</h1>
        <p className="mb-2">
          העמותה מסייעת למשפחות נזקקות בחלוקת מזון, במיוחד סביב החגים.
        </p>
        <ul className="list-disc pr-5 space-y-1 text-sm opacity-80">
          <li>שמירה על פרטיות: מתנדב רואה רק משלוחים שהוקצו לו.</li>
          <li>ניהול חכם לאדמין: ייבוא כתובות, סטטוסים, מעקב.</li>
          <li>בלי עלות: משתמשים ב־Firebase מסלול חינמי.</li>
        </ul>
      </section>

      {/* צד כניסה/הרשמה */}
      <section className="p-6 rounded-2xl border bg-base-100 shadow">
        <h2 className="text-xl font-semibold mb-4">התחברות/הרשמה</h2>

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

        <div className="mt-3">
          <button onClick={doAnon} className="btn w-full">כניסה אנונימית</button>
        </div>

        {msg && <div className="alert alert-error mt-3"><span>{msg}</span></div>}
      </section>
    </div>
  )
}

function prettyErr(e){
  const c = e?.code || ''
  if (c.includes('auth/invalid-email')) return 'אימייל לא תקין'
  if (c.includes('auth/missing-password')) return 'נא להזין סיסמה'
  if (c.includes('auth/weak-password')) return 'סיסמה חלשה (לפחות 6 תווים)'
  if (c.includes('auth/email-already-in-use')) return 'האימייל כבר בשימוש'
  if (c.includes('auth/invalid-credential')) return 'אימייל או סיסמה לא נכונים'
  return e?.message || 'שגיאה'
}
