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
    try { const cred = await signInAnonymously(auth); await redirectAfterLogin(cred.user) }
    catch (e) { setMsg(prettyErr(e)) }
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6 grid md:grid-cols-2 gap-6">
      {/* ===== צד מידע / אודות ===== */}
      <section className="p-6 rounded-2xl border bg-base-100 shadow flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" alt="טוהר החסד" className="w-12 h-12 rounded-xl" />
          <h1 className="text-2xl font-bold">טוהר החסד</h1>
        </div>

        <div className="prose max-w-none text-sm leading-relaxed">
		  <p>
			עמותת <b>טוהר החסד</b> (ע.ר 580744209) פועלת בעיר חריש למעלה משלוש שנים,
			וכל פעילותה מוקדשת לתמיכה במשפחות קשות יום.
		  </p>
		  <p>
			מדי שבוע אנו מחלקים עשרות סלי מזון, ובחגים מקיימים מבצע מיוחד הכולל סל עשיר ומכובד לחג.
		  </p>
		  <p>
			בתקופת המלחמה שימשה העמותה גם כמרכז סיוע ללוחמים – החל מציוד בסיסי ועד לציוד לחימה מקצועי.
		  </p>
		  <p>
			לצד הפעילות ההומניטרית, אנו מקדמים גם יוזמות חברתיות כגון פרויקט איסוף בקבוקים לפיקדון.
		  </p>
		  <p className="font-semibold">
			בזכות התרומות והתמיכה שלכם אנו ממשיכים לפעול, לחזק, ולתת תקווה לכל מי שזקוק לכך.
		  </p>
		</div>

        <div className="prose max-w-none text-sm opacity-80">
          {/* הסבר על העמותה – יוכנס בהמשך */}
        </div>

        <div className="mt-2">
          <a href="tel:0523000676" className="btn btn-primary w-full md:w-auto">
            📞 צור קשר: 052-300-0676
          </a>
        </div>
      </section>

      {/* ===== צד כניסה / הרשמה ===== */}
      <section className="p-6 rounded-2xl border bg-base-100 shadow">
        <h2 className="text-xl font-semibold mb-4">התחברות / הרשמה</h2>

        <div className="join mb-4">
          <button
            onClick={()=>setMode('login')}
            className={`btn join-item ${mode==='login'?'btn-primary':''}`}
          >
            כניסה במייל
          </button>
          <button
            onClick={()=>setMode('signup')}
            className={`btn join-item ${mode==='signup'?'btn-primary':''}`}
          >
            הרשמה
          </button>
        </div>

        {/* מרווחים מסודרים כדי שהלייבלים לא "יידבקו" לטאבים */}
        <div className="space-y-2">
          {mode === 'signup' && (
            <>
              <label className="label mt-1"><span className="label-text">שם (אופציונלי)</span></label>
              <input className="input input-bordered w-full" value={name} onChange={e=>setName(e.target.value)} />
            </>
          )}

          <label className="label mt-1"><span className="label-text">אימייל</span></label>
          <input className="input input-bordered w-full" value={email} onChange={e=>setEmail(e.target.value)} />

          <label className="label mt-1"><span className="label-text">סיסמה</span></label>
          <input type="password" className="input input-bordered w-full" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>

        <div className="mt-4">
          {mode === 'login'
            ? <button onClick={doLogin} className="btn btn-primary w-full">התחבר</button>
            : <button onClick={doSignup} className="btn btn-primary w-full">הרשמה</button>
          }
        </div>

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
