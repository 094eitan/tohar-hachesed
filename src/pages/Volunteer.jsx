// web/src/pages/Volunteer.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, updateDoc, where, addDoc
} from 'firebase/firestore'

export default function Volunteer() {
  const nav = useNavigate()

  // הגנה: לא מחוברים → לוגין
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => {
    const un = auth.onAuthStateChanged(u => {
      setUser(u)
      if (!u) nav('/login') // אין גישה לא-מחובר
    })
    return () => un()
  }, [nav])

  // ברכה: שם משתמש
  const displayName = useMemo(() => {
    if (!user) return ''
    return user.displayName || (user.email ? user.email.split('@')[0] : 'מתנדב')
  }, [user])

  // אירועים פעילים (בשלב הזה מספיק אירוע אחד “חלוקה לראש השנה”)
  const [events, setEvents] = useState([])          // [{id, name, active}]
  const [selectedEventId, setSelectedEventId] = useState('')
  useEffect(() => {
    const qEv = query(collection(db,'events'), where('active','==',true), orderBy('name'))
    const un = onSnapshot(qEv, snap => {
      const arr=[]
      snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      setEvents(arr)
      if (!selectedEventId && arr.length) setSelectedEventId(arr[0].id)
    })
    return () => un()
  }, [selectedEventId])

  const selectedEvent = events.find(e=>e.id===selectedEventId) || null
  const eventName = selectedEvent?.name || '' // נשתמש לשיוך בקמפיין (campaign)

  // שכונות פעילות
  const [neighborhoods, setNeighborhoods] = useState([]) // [{id,name,active}]
  useEffect(() => {
    const qN = query(collection(db,'neighborhoods'), orderBy('name'))
    const un = onSnapshot(qN, snap => {
      const arr=[]
      snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      setNeighborhoods(arr.filter(n=>n.active))
    })
    return () => un()
  }, [])

  // ספירות "ממתין" לכל שכונה (מסונן לאירוע אם יש campaign תואם, או בלי קמפיין)
  const [pendingCounts, setPendingCounts] = useState({}) // { 'אבני חן': 12, ...}
  useEffect(() => {
    // מביאים את כל ה-pending (נחסוך אינדקסים, נסנן קליינט)
    const qDel = query(collection(db, 'deliveries'), where('status','==','pending'))
    const un = onSnapshot(qDel, snap => {
      const all=[]
      snap.forEach(d => all.push({ id:d.id, ...d.data() }))

      const counts = {}
      for (const r of all) {
        // מסנן כתובת + שכונה + לא מוקצה
        const nb = r.address?.neighborhood || ''
        if (!nb) continue
        if (r.assignedVolunteerId) continue

        // אם נבחר אירוע: מציג רק כאלה עם campaign תואם או ריק
        if (eventName) {
          const c = r.campaign || ''
          if (c && c !== eventName) continue
        }

        counts[nb] = (counts[nb] || 0) + 1
      }
      setPendingCounts(counts)
    })
    return () => un()
  }, [eventName])

  // בחירת שכונה וכמות
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('')
  const [wantedCount, setWantedCount] = useState(1)
  const [msg, setMsg] = useState('')

  // משימות שלי
  const [my, setMy] = useState([]) // רשימת השיבוצים שלי
  useEffect(() => {
    if (!user) return
    const qMine = query(collection(db,'deliveries'), where('assignedVolunteerId','==', user.uid), orderBy('updatedAt','desc'))
    const un = onSnapshot(qMine, snap => {
      const arr=[]
      snap.forEach(d => arr.push({id:d.id, ...d.data()}))
      setMy(arr)
    })
    return () => {}
  }, [user])

  async function claimAssignments() {
    if (!user) return
    if (!selectedNeighborhood) { setMsg('בחר שכונה'); return }
    const want = Math.max(1, Number(wantedCount||1))

    setMsg('מנסה לשבץ…')

    // מביאים רשימת pending בשכונה, נסנן ידנית שלא מוקצה ושהקמפיין מתאים
    const qP = query(collection(db,'deliveries'),
      where('status','==','pending'),
      where('address.neighborhood','==', selectedNeighborhood)
    )
    const snap = await getDocs(qP)
    const pool=[]
    snap.forEach(d => {
      const r = { id:d.id, ...d.data() }
      if (r.assignedVolunteerId) return // כבר הוקצה
      if (eventName) {
        const c = r.campaign || ''
        if (c && c !== eventName) return
      }
      pool.push(r)
    })

    if (!pool.length) { setMsg('אין משלוחים זמינים בשכונה הזו כרגע'); return }

    // בוחרים עד X
    const chosen = pool.slice(0, want)
    let ok=0
    for (const r of chosen) {
      try {
        await updateDoc(doc(db,'deliveries', r.id), {
          assignedVolunteerId: user.uid,
          status: 'assigned',
          // אם לא היה campaign – נשייך לאירוע הנוכחי כדי "לסמן"
          ...(eventName ? { campaign: (r.campaign || eventName) } : {}),
          updatedAt: serverTimestamp()
        })
        ok++
      } catch (e) {
        console.error('assign fail', e)
      }
    }
    setMsg(`שובצו ${ok} משלוחים${ok<want?` (אין מספיק זמינים כרגע)`:''}`)
  }

  async function setStatus(id, status) {
    await updateDoc(doc(db,'deliveries', id), {
      status, updatedAt: serverTimestamp()
    })
  }

  async function releaseOne(id) {
    await updateDoc(doc(db,'deliveries', id), {
      status: 'pending',
      assignedVolunteerId: null,
      updatedAt: serverTimestamp()
    })
  }

  if (!user) return null

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-6">
      {/* כותרת וברכה */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">שלום {displayName} 👋</h2>
      </div>

      {/* בחירת אירוע */}
      <div className="mb-4 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">אירוע</div>
        {events.length === 0 ? (
          <div className="opacity-60 text-sm">אין אירועים פעילים כרגע</div>
        ) : (
          <select className="select select-bordered"
                  value={selectedEventId}
                  onChange={e=>setSelectedEventId(e.target.value)}>
            {events.map(e=>(
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* בחירת שכונה + כמות */}
      <div className="mb-4 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">בחר שכונה וכמות משלוחים</div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label"><span className="label-text">שכונה</span></label>
            <select className="select select-bordered"
                    value={selectedNeighborhood}
                    onChange={e=>setSelectedNeighborhood(e.target.value)}>
              <option value="">בחר…</option>
              {neighborhoods.map(n=>{
                const c = pendingCounts[n.name] || 0
                return <option key={n.id} value={n.name}>{n.name} — {c} ממתינים</option>
              })}
            </select>
          </div>

          <div>
            <label className="label"><span className="label-text">כמות</span></label>
            <input type="number" min="1" className="input input-bordered w-32"
                   value={wantedCount}
                   onChange={e=>setWantedCount(e.target.value)} />
          </div>

          <button className="btn btn-primary" onClick={claimAssignments}>קבל שיבוץ</button>
        </div>

        {msg && <div className="alert mt-3"><span>{msg}</span></div>}
      </div>

      {/* רשימת המשימות שלי */}
      <div className="p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">המשלוחים שלי</div>
        {my.length === 0 ? (
          <div className="opacity-60 text-sm">לא שובצו לך משלוחים עדיין</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>שם</th>
                  <th>שכונה</th>
                  <th>כתובת</th>
                  <th>טלפון</th>
                  <th>סטטוס</th>
                  <th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {my.map((d,idx)=>(
                  <tr key={d.id}>
                    <td>{idx+1}</td>
                    <td><b>{d.recipientName}</b></td>
                    <td>{d.address?.neighborhood || '—'}</td>
                    <td>
                      {d.address?.street}, {d.address?.city}
                      {d.address?.apartment ? ` — ${d.address.apartment}` : ''}
                      {d.address?.doorCode ? ` (קוד: ${d.address.doorCode})` : ''}
                    </td>
                    <td>
                      {d.phone
                        ? <a className="link" href={`tel:${d.phone}`}>{d.phone}</a>
                        : '—'}
                    </td>
                    <td><Badge status={d.status} /></td>
                    <td className="flex gap-1">
                      <div className="join">
                        <button className="btn btn-xs join-item" onClick={()=>setStatus(d.id,'in_transit')}>בדרך</button>
                        <button className="btn btn-xs join-item btn-success" onClick={()=>setStatus(d.id,'delivered')}>נמסרה</button>
                        <button className="btn btn-xs join-item btn-error" onClick={()=>setStatus(d.id,'returned')}>חזרה</button>
                      </div>
                      <button className="btn btn-xs" onClick={()=>releaseOne(d.id)}>שחרר</button>
                      {d.address?.street && (
                        <button
                          className="btn btn-xs btn-outline"
                          onClick={()=>copyText(`${d.recipientName}, ${d.address?.street}, ${d.address?.city}${d.address?.apartment?` — ${d.address?.apartment}`:''}`)}
                        >העתק כתובת</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ status }) {
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  const color = {
    pending:'badge-warning',
    assigned:'badge-info',
    in_transit:'badge-accent',
    delivered:'badge-success',
    returned:'badge-error'
  }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status] || status}</span>
}

async function copyText(t) {
  try { await navigator.clipboard.writeText(t) } catch {}
}
