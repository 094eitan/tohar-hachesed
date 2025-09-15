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

  const goVolunteer = () => { window.location.href = '/volunteer' }

  const doLogin = async () => {
    setMsg('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      goVolunteer()
    } catch (e) {
      setMsg(prettyErr(e))
    }
  }

  const doSignup = async () => {
    setMsg('')
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
      if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
      goVolunteer()
    } catch (e) {
      setMsg(prettyErr(e))
    }
  }

  const doAnon = async () => {
    setMsg('')
    try {
      await signInAnonymously(auth)
      goVolunteer()
    } catch (e) {
      setMsg(prettyErr(e))
    }
  }

  return (
    <div dir="rtl" style={{maxWidth:420, margin:'40px auto', padding:16, border:'1px solid #eee', borderRadius:12}}>
      <h2 style={{marginTop:0}}>טוהר החסד — כניסה</h2>

      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <button onClick={()=>setMode('login')}  style={tab(mode==='login')}>כניסה במייל</button>
        <button onClick={()=>setMode('signup')} style={tab(mode==='signup')}>הרשמה</button>
      </div>

      {mode === 'signup' && (
        <>
          <label>שם (אופציונלי)</label>
          <input value={name} onChange={e=>setName(e.target.value)} style={input}/>
        </>
      )}

      <label>אימייל</label>
      <input value={email} onChange={e=>setEmail(e.target.value)} style={input} />

      <label>סיסמה</label>
      <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={input} />

      {mode === 'login'
        ? <button onClick={doLogin} style={btn}>התחבר</button>
        : <button onClick={doSignup} style={btn}>הרשמה</button>
      }

      <div style={{marginTop:12}}>
        <button onClick={doAnon} style={{...btn, background:'#888'}}>כניסה אנונימית</button>
      </div>

      {msg && <p style={{color:'#b00020', marginTop:12}}>{msg}</p>}

      <small style={{display:'block', marginTop:16, color:'#555'}}>
        כדי להפוך לאדמין: לאחר ההתחברות הראשונה, צור ב-Firestore אוסף <code>admins</code> ומסמך עם
        <code> Document ID = ה-UID שלך</code> (רואים אותו ב-Authentication → Users).
      </small>
    </div>
  )
}

const input = { width:'100%', margin:'4px 0 12px 0', padding:8 }
const btn = { padding:'8px 12px', border:'none', background:'#2f6feb', color:'#fff', borderRadius:8, cursor:'pointer' }
const tab = (active) => ({ padding:'6px 10px', borderRadius:8, border:'1px solid #ddd', background: active ? '#e8f0fe' : '#fff', cursor:'pointer' })

function prettyErr(e){
  const c = e?.code || ''
  if (c.includes('auth/invalid-email')) return 'אימייל לא תקין'
  if (c.includes('auth/missing-password')) return 'נא להזין סיסמה'
  if (c.includes('auth/weak-password')) return 'סיסמה חלשה (לפחות 6 תווים)'
  if (c.includes('auth/email-already-in-use')) return 'האימייל כבר בשימוש'
  if (c.includes('auth/invalid-credential')) return 'אימייל או סיסמה לא נכונים'
  return e?.message || 'שגיאה'
}
