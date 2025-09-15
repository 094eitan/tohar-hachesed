import React, { useEffect, useRef, useState } from 'react'
import { auth, db } from '../lib/firebase'
import { collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, getDoc } from 'firebase/firestore'

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
  const [filter, setFilter] = useState('all')
  const [qtext, setQtext] = useState('')
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let unsub = () => {}
    ;(async () => {
      const ok = await isAdmin()
      setAllowed(ok)
      if (!ok) return
      const qy = query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'))
      unsub = onSnapshot(qy, snap => {
        const a = []
        snap.forEach(d => a.push({ id: d.id, ...d.data() }))
        setRows(a)
      })
    })()
    return () => unsub()
  }, [])

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (!allowed) return (
    <Wrap>
      <h3>אין לך הרשאת אדמין</h3>
      <p>כדי להפוך לאדמין: Firestore → צור אוסף <code>admins</code> ומסמך ש־ID שלו הוא ה-UID שלך.</p>
    </Wrap>
  )

  const addDelivery = async () => {
    const recipientName = prompt('שם נזקק:'); if(!recipientName) return
    const street = prompt('רחוב+מספר (ב-חריש):'); if(!street) return
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

        if (!rec.recipientName || !rec.street) throw new Error('שם וכתובת חובה')
        if (rec.lat && isNaN(Number(rec.lat))) throw new Error('lat לא מספר')
        if (rec.lng && isNaN(Number(rec.lng))) throw new Error('lng לא מספר')

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

  const visible = rows.filter(r=>{
    if (filter!=='all' && r.status!==filter) return false
    const text = `${r.recipientName} ${r.address?.street||''} ${r.phone||''}`.toLowerCase()
    return text.includes(qtext.trim().toLowerCase())
  })

  return (
    <Wrap>
      <h2 className="text-xl font-semibold mb-3">אדמין — ניהול משלוחים</h2>

      <div className="flex flex-wrap gap-2 mb-3">
        <button className="btn btn-primary" onClick={addDelivery}>הוסף משלוח</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>ייבוא CSV</button>
        <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files[0] && importCSV(e.target.files[0])} />
      </div>

      <div className="flex gap-2 mb-3">
        <select className="select select-bordered" value={filter} onChange={e=>setFilter(e.target.value)}>
          <option value="all">הכל</option>
          <option value="pending">ממתין</option>
          <option value="assigned">הוקצה</option>
          <option value="in_transit">בדרך</option>
          <option value="delivered">נמסרה</option>
          <option value="returned">חזרה</option>
        </select>
        <input className="input input-bordered w-full" placeholder="חיפוש בשם/רחוב/טלפון" value={qtext} onChange={e=>setQtext(e.target.value)} />
      </div>

      {msg && <div className="alert mt-2"><span>{msg}</span></div>}

      <table className="table table-zebra w-full">
        <thead>
          <tr><th>שם</th><th>כתובת</th><th>טלפון</th><th>סטטוס</th><th>מתנדב</th><th>פעולות</th></tr>
        </thead>
        <tbody>
          {visible.map(r=>(
            <tr key={r.id}>
              <td><b>{r.recipientName}</b></td>
              <td>{r.address?.street}, {r.address?.city}{r.address?.apartment?` — ${r.address.apartment}`:''}</td>
              <td>{r.phone||'—'}</td>
              <td><Badge status={r.status}/></td>
              <td>{r.assignedVolunteerId ? r.assignedVolunteerId.slice(0,6)+'…' : '—'}</td>
              <td>
                {r.assignedVolunteerId && <button className="btn btn-sm" onClick={()=>releaseAssignment(r.id)}>שחרר</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Wrap>
  )
}

function Wrap({children}) {
  return <div dir="rtl" className="max-w-6xl mx-auto p-6">{children}</div>
}

function Badge({status}) {
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  const color = {
    pending:'badge-warning', assigned:'badge-info', in_transit:'badge-accent',
    delivered:'badge-success', returned:'badge-error'
  }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status]||status}</span>
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
