// web/src/pages/Volunteer.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, doc, getDocs, onSnapshot, query, updateDoc, where
} from 'firebase/firestore'

export default function Volunteer() {
  const nav = useNavigate()

  // הגנה: רק משתמש רשום (לא אנונימי)
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => {
    const un = auth.onAuthStateChanged(u => {
      setUser(u)
      if (!u || u.isAnonymous) nav('/') // אין גישה לא אנונימי
    })
    return () => un()
  }, [nav])

  const displayName = useMemo(() => {
    if (!user) return ''
    return user.displayName || (user.email ? user.email.split('@')[0] : 'מתנדב')
  }, [user])

  // שכונות פעילות
  const [neighborhoods, setNeighborhoods] = useState([]) // [{id,name,active}]
  useEffect(() => {
    const un = onSnapshot(collection(db,'neighborhoods'), snap => {
      const arr=[]
      snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      setNeighborhoods(arr.filter(n=>n.active).sort((a,b)=>a.name.localeCompare(b.name,'he')))
    })
    return () => un()
  }, [])

  // ספירות "ממתין" לכל שכונה
  const [pendingCounts, setPendingCounts] = useState({})
  useEffect(() => {
    const qDel = query(collection(db, 'deliveries'), where('status','==','pending'))
    const un = onSnapshot(qDel, snap => {
      const counts={}
      snap.forEach(d=>{
        const r = {id:d.id, ...d.data()}
        const nb = r.address?.neighborhood || ''
        if (!nb) return
        if (r.assignedVolunteerId) return
        counts[nb] = (counts[nb]||0)+1
      })
      setPendingCounts(counts)
    })
    return () => un()
  }, [])

  // בחירת שכונה + “כמות משלוחים”
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('')
  const [wantedCount, setWantedCount] = useState(1)
  const [msg, setMsg] = useState('')

  // המשימות שלי (ללא orderBy כדי לא לדרוש אינדקס)
  const [my, setMy] = useState([])
  useEffect(() => {
    if (!user) return
    const qMine = query(collection(db,'deliveries'), where('assignedVolunteerId','==', user.uid))
    const un = onSnapshot(qMine, snap => {
      const arr=[]
      snap.forEach(d => arr.push({id:d.id, ...d.data()}))
      // מיון מקומי (חדש -> ישן)
      arr.sort((a,b)=>{
        const ta = (a.updatedAt?.seconds||a.createdAt?.seconds||0)
        const tb = (b.updatedAt?.seconds||b.createdAt?.seconds||0)
        return tb-ta
      })
      setMy(arr)
    })
    return () => un()
  }, [user])

  async function claimAssignments() {
    if (!user) return
    if (!selectedNeighborhood) { setMsg('בחר שכונה'); return }
    const want = Math.max(1, Number(wantedCount||1))
    setMsg('מנסה לשבץ…')

    // מביא pending בשכונה (ונסנן מי שכבר הוקצה)
    const qP = query(
      collection(db,'deliveries'),
      where('status','==','pending'),
      where('address.neighborhood','==', selectedNeighborhood)
    )
    const snap = await getDocs(qP)
    const pool=[]
    snap.forEach(d=>{
      const r = {id:d.id, ...d.data()}
      if (r.assignedVolunteerId) return
      pool.push(r)
    })

    if (!pool.length) { setMsg('אין משלוחים זמינים בשכונה הזו כרגע'); return }

    const chosen = pool.slice(0, want)
    let ok=0
    for (const r of chosen) {
      try {
        await updateDoc(doc(db,'deliveries', r.id), {
          assignedVolunteerId: user.uid,
          status: 'assigned',
          updatedAt: serverTimestamp()
        })
        ok++
      } catch(e) {
        console.error('assign fail', e)
      }
    }
    setMsg(`שובצו ${ok} משלוחים${ok<want?` (אין מספיק זמינים כרגע)`:''}`)
  }

  async function setStatus(id, status) {
    await updateDoc(doc(db,'deliveries', id), { status, updatedAt: serverTimestamp() })
  }

  // *** חדש: שחרור שיבוץ (החזרה ל"ממתין" וניקוי assignedVolunteerId) ***
  async function releaseAssignment(id) {
    if (!confirm('לשחרר את המשלוח הזה מהשיבוץ שלך?')) return
    await updateDoc(doc(db,'deliveries', id), {
      status: 'pending',
      assignedVolunteerId: null,
      updatedAt: serverTimestamp()
    })
  }

  if (!user || user.isAnonymous) return null

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6">
      {/* כותרת וברכה */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">שלום {displayName} 👋</h2>
        <a className="btn btn-ghost" href="/">דף הבית</a>
      </div>

      {/* בחירת שכונה + כמות משלוחים */}
      <div className="mb-6 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">שיבוץ לפי שכונה</div>

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
            <label className="label"><span className="label-text">כמות משלוחים</span></label>
            <input type="number" min="1" className="input input-bordered w-40"
                   value={wantedCount}
                   onChange={e=>setWantedCount(e.target.value)} />
          </div>

          <button className="btn btn-primary" onClick={claimAssignments}>קבל שיבוץ</button>
        </div>

        {msg && <div className="alert mt-3"><span>{msg}</span></div>}
      </div>

      {/* טבלה – קריאה בלבד, שינוי סטטוס + שחרור */}
      <div className="p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">המשלוחים ששובצו לך</div>
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
                  <th>חבילות</th>
                  <th>הערות</th>
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
                    <td>{d.phone ? <a className="link" href={`tel:${d.phone}`}>{d.phone}</a> : '—'}</td>
                    <td>{d.packageCount ?? 1}</td>
                    <td className="max-w-[260px] truncate" title={d.notes || ''}>{d.notes || '—'}</td>
                    <td><Badge status={d.status} /></td>
                    <td className="flex gap-1">
                      <div className="join">
                        <button className="btn btn-xs join-item" onClick={()=>setStatus(d.id,'in_transit')}>בדרך</button>
                        <button className="btn btn-xs join-item btn-success" onClick={()=>setStatus(d.id,'delivered')}>נמסרה</button>
                        <button className="btn btn-xs join-item btn-error" onClick={()=>setStatus(d.id,'returned')}>חזרה</button>
                      </div>
                      <button className="btn btn-xs" onClick={()=>releaseAssignment(d.id)}>שחרר</button>
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
