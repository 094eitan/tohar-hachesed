import React, { useEffect, useRef, useState } from 'react'
import { auth, db } from '../lib/firebase'
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, getDoc } from 'firebase/firestore'

// בדיקה אם המשתמש אדמין: קיום מסמך admins/{uid}
async function isAdmin() {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const ref = doc(db, 'admins', uid)
  const snap = await getDoc(ref)
  return snap.exists()
}

export default function Admin() {
  const [allowed, setAllowed] = useState(false)
  const [rows, setRows] = useState([])
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const ok = await isAdmin()
      setAllowed(ok)
      if (!ok) return
      const q = query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'))
      unsub = onSnapshot(q, snap => {
        const a = []
        snap.forEach(d => a.push({ id: d.id, ...d.data() }))
        setRows(a)
      })
    })()
    return () => unsub()
  }, [])

  if (!auth.currentUser) {
    return <div dir="rtl" style={{maxWidth:900, margin:'24px auto'}}><h3>יש להתחבר תחילה</h3></div>
  }

  if (!allowed) {
    return (
      <div dir="rtl" style={{maxWidth:900, margin:'24px auto'}}>
        <h3>אין לך הרשאת אדמין</h3>
        <p>כדי להפוך לאדמין בלי פונקציות: פתח Firestore Console ← צור אוסף <code>admins</code> ← צור מסמך עם ה־ID של המשתמש המחובר (uid) שלך. רענן את העמוד.</p>
      </div>
    )
  }

  const addDelivery = async () => {
    const recipientName = prompt('שם נזקק:')
    const street = prompt('רחוב+מספר (ב-חריש):')
    const city = 'חריש'
    const apartment = prompt('דירה/הערה (אופציונלי):') || ''
    const phone = prompt('טלפון (אופציונלי):') || ''
    const lat = prompt('lat (אופציונלי):') || ''
    const lng = prompt('lng (אופציונלי):') || ''

    const address = {
      street, city, apartment,
      ...(lat && lng ? { lat: Number(lat), lng: Number(lng) } : {})
    }

    await addDoc(collection(db, 'deliveries'), {
      recipientName,
      address,
      phone,
      packageCount: 1,
      status: 'pending',
      assignedVolunteerId: null,
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date()
    })
  }

  const importCSV = async (file) => {
    setMsg('מייבא…')
    const text = await file.text()
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (!lines.length) { setMsg('קובץ ריק'); return }
    const header = lines.shift().split(',').map(s => s.trim())

    let ok=0, fail=0
    for (const line of lines) {
      try {
        const cells = parseCsvLine(line)
        const rec = Object.fromEntries(header.map((h,i)=>[h, cells[i]||'']))
        const address = {
          street: rec.street,
          city: rec.city || 'חריש',
          apartment: rec.apartment || '',
          lat: rec.lat ? Number(rec.lat) : undefined,
          lng: rec.lng ? Number(rec.lng) : undefined
        }

        await addDoc(collection(db,'deliveries'), {
          recipientName: rec.recipientName,
          address,
          phone: rec.phone||'',
          packageCount: Number(rec.packageCount||1),
          status: 'pending',
          assignedVolunteerId: null,
          notes: rec.notes||'',
          createdAt: new Date(),
          updatedAt: new Date()
        })
        ok++
      } catch {
        fail++
      }
    }
    setMsg(`יבוא הושלם: ${ok} נוספו${fail?`, ${fail} נכשלו`:''}`)
  }

  const releaseAssignment = async (id) => {
    await updateDoc(doc(db, 'deliveries', id), {
      status: 'pending',
      assignedVolunteerId: null,
      updatedAt: new Date()
    })
  }

  return (
    <div dir="rtl" style={{maxWidth:1100, margin:'24px auto'}}>
      <h2>אדמין — ניהול משלוחים</h2>

      <div style={{display:'flex', gap:8, margin:'8px 0'}}>
        <button onClick={addDelivery}>הוסף משלוח</button>
        <button onClick={() => fileRef.current?.click()}>ייבוא CSV</button>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files[0] && importCSV(e.target.files[0])} />
      </div>

      {msg && <p style={{color:'#444'}}>{msg}</p>}

      <table style={{width:'100%', borderCollapse:'collapse'}}>
        <thead>
          <tr>
            <th style={th}>שם</th>
            <th style={th}>כתובת</th>
            <th style={th}>טלפון</th>
            <th style={th}>סטטוס</th>
            <th style={th}>מתנדב</th>
            <th style={th}>פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={td}><b>{r.recipientName}</b></td>
              <td style={td}>{r.address?.street}, {r.address?.city}{r.address?.apartment?` — ${r.address.apartment}`:''}</td>
              <td style={td}>{r.phone || '—'}</td>
              <td style={td}><Badge status={r.status}/></td>
              <td style={td}>{r.assignedVolunteerId ? r.assignedVolunteerId.slice(0,6)+'…' : '—'}</td>
              <td style={td}>
                {r.assignedVolunteerId && <button onClick={()=>releaseAssignment(r.id)}>שחרר</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const th = { textAlign:'right', borderBottom:'1px solid #ddd', padding:'6px 8px' }
const td = { textAlign:'right', borderBottom:'1px solid #f1f1f1', padding:'6px 8px' }

function Badge({status}) {
  const colors = { pending:'#d2b48c', assigned:'#f9c74f', in_transit:'#90be6d', delivered:'#43aa8b', returned:'#f94144' }
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  return <span style={{background:colors[status]||'#ccc', padding:'3px 8px', borderRadius:8}}>{he[status]||status}</span>
}

function parseCsvLine(line){
  const out=[]; let cur='', inQ=false
  for(let i=0;i<line.length;i++){
    const ch=line[i]
    if(ch==='"'){ if(inQ && line[i+1]==='"'){cur+='"'; i++} else inQ=!inQ }
    else if(ch===',' && !inQ){ out.push(cur.trim()); cur='' }
    else { cur+=ch }
  }
  out.push(cur.trim())
  return out
}
