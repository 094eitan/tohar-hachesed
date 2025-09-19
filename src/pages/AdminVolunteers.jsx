// web/src/pages/AdminVolunteers.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc,
  query, where, getDoc
} from 'firebase/firestore'
import { getCountFromServer } from 'firebase/firestore'

async function isAdmin() {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const ref = doc(db, 'admins', uid)
  const snap = await getDoc(ref)
  return snap.exists()
}

export default function AdminVolunteers() {
  const nav = useNavigate()
  const [allowed, setAllowed] = useState(false)

  useEffect(()=>{
    (async()=>{
      const ok = await isAdmin()
      setAllowed(ok)
    })()
  },[])
  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (!allowed) return <Wrap><h3>אין הרשאת אדמין</h3></Wrap>

  // מתנדבים (אוסף volunteers – נוצר ע"י צד מתנדב)
  const [vols, setVols] = useState([])
  useEffect(()=>{
    const un = onSnapshot(collection(db,'volunteers'), snap=>{
      const arr=[]
      snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      setVols(arr)
    })
    return ()=>un()
  },[])

  // חישוב "מחובר עכשיו" לפי lastSeen בתוך 2 דקות
  const now = Date.now()
  function isOnline(v){
    const t = v?.lastSeen?.seconds ? v.lastSeen.seconds*1000 : (v?.lastSeen || 0)
    return now - t < 2*60*1000
  }

  // סטטיסטיקות – נסיק counters מהשרת (ללא הורדת כל הרשומות)
  const [stats, setStats] = useState({}) // { uid: {assigned: X, delivered: Y} }
  useEffect(()=>{
    async function loadCounts(){
      const next = {}
      for (const v of vols){
        const qAssigned = query(collection(db,'deliveries'), where('assignedVolunteerId','==', v.id))
        const qDelivered = query(collection(db,'deliveries'), where('assignedVolunteerId','==', v.id), where('status','==','delivered'))
        const [c1, c2] = await Promise.all([
          getCountFromServer(qAssigned),
          getCountFromServer(qDelivered)
        ])
        next[v.id] = { assigned: c1.data().count, delivered: c2.data().count }
      }
      setStats(next)
    }
    if (vols.length) loadCounts()
  }, [vols])

  // הקצאה ידנית
  const [pickVolunteer, setPickVolunteer] = useState('')
  const [deliveryId, setDeliveryId] = useState('')
  const [msg, setMsg] = useState('')

  async function assignManually(){
    if (!pickVolunteer || !deliveryId) { setMsg('בחר/י מתנדב והזן/י מזהה משלוח'); return }
    setMsg('מקצה…')
    try{
      const ref = doc(db,'deliveries', deliveryId.trim())
      const snap = await getDoc(ref)
      if (!snap.exists()){ setMsg('משלוח לא נמצא'); return }
      await updateDoc(ref, {
        assignedVolunteerId: pickVolunteer,
        status: 'assigned',
        updatedAt: serverTimestamp()
      })
      // מחיקת pending_index אם קיים
      await deleteDoc(doc(db,'pending_index', deliveryId.trim())).catch(()=>{})
      setMsg('המשלוח הוקצה בהצלחה')
      setDeliveryId('')
    }catch(e){
      setMsg('שגיאה בהקצאה: '+(e?.message||e))
    }
  }

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">אדמין — ניהול מתנדבים</h2>
        <div className="flex gap-2">
          <button className="btn" onClick={()=>nav('/admin')}>חזרה לניהול משלוחים</button>
        </div>
      </div>

      {/* הקצאה ידנית */}
      <div className="mb-6 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-2">הקצאה ידנית</div>
        <div className="flex flex-wrap gap-2 items-end">
          <select className="select select-bordered min-w-56" value={pickVolunteer} onChange={e=>setPickVolunteer(e.target.value)}>
            <option value="">בחר/י מתנדב…</option>
            {vols.sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||'', 'he')).map(v=>(
              <option key={v.id} value={v.id}>
                {v.displayName || (v.email ? v.email.split('@')[0] : v.id.slice(0,6))}
              </option>
            ))}
          </select>
          <input className="input input-bordered min-w-64" placeholder="מזהה משלוח (deliveryId)"
                 value={deliveryId} onChange={e=>setDeliveryId(e.target.value)} />
          <button className="btn btn-primary" onClick={assignManually}>הקצה</button>
        </div>
        {msg && <div className="alert mt-3"><span>{msg}</span></div>}
        <div className="text-xs opacity-70 mt-2">טיפ: את ה־ID של המשלוח אפשר להעתיק מרשימת המשלוחים (עמודת פעולות/קונסול).</div>
      </div>

      {/* טבלת מתנדבים */}
      <div className="p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-3">מתנדבים</div>
        {vols.length===0 ? (
          <div className="opacity-60 text-sm">אין מתנדבים עדיין</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>שם</th>
                  <th>אימייל</th>
                  <th>סטטוס</th>
                  <th>שובצו (סה״כ)</th>
                  <th>נמסרו (סה״כ)</th>
                  <th>נראה לאחרונה</th>
                </tr>
              </thead>
              <tbody>
                {vols.map((v,idx)=>{
                  const s = stats[v.id] || {assigned:0, delivered:0}
                  const online = isOnline(v)
                  const last = v?.lastSeen?.seconds ? new Date(v.lastSeen.seconds*1000) : (v?.lastSeen ? new Date(v.lastSeen) : null)
                  return (
                    <tr key={v.id}>
                      <td>{idx+1}</td>
                      <td><b>{v.displayName || (v.email ? v.email.split('@')[0] : v.id.slice(0,6))}</b></td>
                      <td>{v.email || '—'}</td>
                      <td>{online ? <span className="badge badge-success">מחובר</span> : <span className="badge">לא מחובר</span>}</td>
                      <td>{s.assigned}</td>
                      <td>{s.delivered}</td>
                      <td>{last ? last.toLocaleString('he-IL') : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Wrap>
  )
}

function Wrap({children}){ return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div> }
