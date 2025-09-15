import React, { useState } from 'react'
import { auth, RecaptchaVerifier, signInWithPhoneNumber } from '../lib/firebase'

export default function Login()
{
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [conf, setConf] = useState(null)
  const [msg, setMsg] = useState('')

  // ⚠️ בפיתוח: אפשר להזין +9725XXXXXXXX (עם קידומת)
  const sendCode = async () =>
  {
    setMsg('')
    try
    {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'sign-in-button', { size: 'invisible' })
      const confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier)
      setConf(confirmation)
      setMsg('קוד נשלח ב-SMS')
    }
    catch (e)
    {
      console.error(e)
      setMsg('שגיאה בשליחת קוד: ' + e.message)
    }
  }

  const verify = async () =>
  {
    try
    {
      await conf.confirm(code)
      window.location.href = '/volunteer'
    }
    catch (e)
    {
      setMsg('קוד לא תקין')
    }
  }

  return (
    <div dir="rtl" style={{maxWidth:420, margin:'40px auto'}}>
      <h2>טוהר החסד — כניסה</h2>

      <label>טלפון (לדוגמה: +9725XXXXXXXX)</label>
      <input value={phone} onChange={e=>setPhone(e.target.value)} style={{width:'100%'}} />

      {!conf
        ? <button id="sign-in-button" onClick={sendCode} style={{marginTop:8}}>שלח קוד</button>
        : <>
            <label style={{display:'block', marginTop:12}}>קוד אימות</label>
            <input value={code} onChange={e=>setCode(e.target.value)} style={{width:'100%'}} />
            <button onClick={verify} style={{marginTop:8}}>אשר</button>
          </>
      }

      {msg && <p style={{color:'#444', marginTop:12}}>{msg}</p>}

      <div style={{marginTop:16}}>
        <small>לאדמין: לאחר התחברות, יש דף /admin. כדי לקבל הרשאת אדמין, תריץ פעם אחת פונקציית Bootstrap (נסביר בהמשך).</small>
      </div>
    </div>
  )
}
