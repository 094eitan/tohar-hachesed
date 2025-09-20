// web/src/pages/AdminVolunteers.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, doc, getDoc, query, where,
  updateDoc, deleteDoc
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

  // ----- הרשאות / טעינה -----
  const [allowed, setAllowed] = useState(null) // null=טוען, true/false=תוצאה
  const [errMsg, setErrMsg] = useState('')
  useEffect(() => {
    (async () => {
      try {
        const ok = await isAdmin()
        setAllowed(ok)
        if (!ok) setErrMsg('אין הרשאת אדמין')
      } catch (e) {
        setAllowed(false)
        setErrMsg('שגיאה בבדיקת הרשאות: ' + (e?.message || e))
      }
    })()
  }, [])

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (allowed === null) return <Wrap><Loader text="טוען נתונים..." /></Wrap>
  if (!allowed) return <Wrap><ErrorBox msg={errMsg || 'אין הרשאת אדמין'} /></Wrap>

  // ----- קריאת מתנדבים -----
  const [vols, setVols] = useState([])
  useEffect(() => {
    const un = onSnapshot(
      collection(db, 'volunteers'),
      snap => {
        const a = []
        snap.forEach(d => a.push({ id: d.id, ...d.data() }))
        setVols(a)
      },
      err => setErrMsg('אין הרשאה לקרוא volunteers או תקלה זמנית: ' + (err?.message || err))
    )
    return () => un()
  }, [])

  // "מחובר עכשיו" (דקה וחצי אחרונות)
  function isOnline(v) {
    const t = v?.lastSeen?.seconds ? v.lastSeen.seconds * 1000 : (v?.lastSeen || 0)
    return Date.now() - t < 90 * 1000
  }

  // ----- סטטיסטיקות לכל מתנדב (Aggregations) -----
  const [stats, setStats] = useState({}) // {uid: {assigned, delivered}}
  useEffect(() => {
    async function loadCounts() {
      const next = {}
      for (const v of vols) {
        const qAssigned = query(collection(db, 'deliveries'), where('assignedVolunteerId', '==', v.id))
        const qDelivered = query(
          collection(db, 'deliveries'),
          where('assignedVolunteerId', '==', v.id),
          where('status', '==', 'delivered')
        )
        const [c1, c2] = await Promise.all([getCountFromServer(qAssigned), getCountFromServer(qDelivered)])
        next[v.id] = { assigned: c1.data().count, delivered: c2.data().count }
      }
      setStats(next)
    }
    if (vols.length) loadCounts()
  }, [vols])

  // ----- חיפוש/סינון/מיון -----
  const [qText, setQText] = useState('')
  const [onlyOnline, setOnlyOnline] = useState(false)
  const filtered = useMemo(() => {
    const q = (qText || '').trim()
    const norm = s => (s || '').toString().toLowerCase()
    return vols
      .filter(v => (onlyOnline ? isOnline(v) : true))
      .filter(v => {
        if (!q) return true
        const name = v.displayName || (v.email ? v.email.split('@')[0] : v.id.slice(0, 6))
        return norm(name).includes(norm(q)) || norm(v.email || '').includes(norm(q))
      })
      .sort((a, b) => {
        const aD = stats[a.id]?.delivered || 0
        const bD = stats[b.id]?.delivered || 0
        return bD - aD // הכי תורמים למעלה
      })
  }, [vols, stats, qText, onlyOnline])

  // ----- הקצאה ידנית -----
  const [pickVolunteer, setPickVolunteer] = useState('')
  const [deliveryId, setDeliveryId] = useState('')
  const [opMsg, setOpMsg] = useState('')

  async function assignManually() {
    if (!pickVolunteer || !deliveryId) { setOpMsg('בחר/י מתנדב והזן/י מזהה משלוח'); return }
    setOpMsg('מקצה…')
    try {
      const ref = doc(db, 'deliveries', deliveryId.trim())
      const snap = await getDoc(ref)
      if (!snap.exists()) { setOpMsg('משלוח לא נמצא'); return }
      await updateDoc(ref, {
        assignedVolunteerId: pickVolunteer,
        status: 'assigned',
        updatedAt: serverTimestamp()
      })
      // ניקוי pending_index (החוקים הפשוטים מאפשרים)
      await deleteDocSafe('pending_index', deliveryId.trim())
      setOpMsg('המשלוח הוקצה בהצלחה')
      setDeliveryId('')
    } catch (e) {
      setOpMsg('שגיאה בהקצאה: ' + (e?.message || e))
    }
  }

  // עזרים
  function nameOf(v) { return v.displayName || (v.email ? v.email.split('@')[0] : v.id.slice(0, 6)) }
  async function deleteDocSafe(col, id) {
    try { const { deleteDoc, doc: d } = await import('firebase/firestore'); await deleteDoc(d(db, col, id)) } catch { }
  }

  return (
    <Wrap>
      <Header title="ניהול מתנדבים" onBack={()=>nav('/admin')} />

      {/* חיפוש/סינון + הקצאה ידנית */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <div className="p-4 rounded-xl border bg-base-100 md:col-span-2">
          <div className="font-semibold mb-2">חיפוש וסינון</div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow">
              <label className="label"><span className="label-text">חפש לפי שם/אימייל</span></label>
              <input className="input input-bordered w-full" placeholder="לדוגמה: איתן"
                     value={qText} onChange={e=>setQText(e.target.value)} />
            </div>
            <label className="label cursor-pointer gap-2">
              <span className="label-text">מחוברים בלבד</span>
              <input type="checkbox" className="toggle" checked={onlyOnline} onChange={e=>setOnlyOnline(e.target.checked)} />
            </label>
          </div>
        </div>

        <div className="p-4 rounded-xl border bg-base-100">
          <div className="font-semibold mb-2">הקצאה ידנית</div>
          <div className="flex flex-col gap-2">
            <select className="select select-bordered"
                    value={pickVolunteer} onChange={e=>setPickVolunteer(e.target.value)}>
              <option value="">בחר/י מתנדב…</option>
              {vols.slice().sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'he')).map(v=>(
                <option key={v.id} value={v.id}>{nameOf(v)}</option>
              ))}
            </select>
            <input className="input input-bordered" placeholder="מזהה משלוח (deliveryId)"
                   value={deliveryId} onChange={e=>setDeliveryId(e.target.value)} />
            <button className="btn btn-primary" onClick={assignManually}>הקצה</button>
            {opMsg && <div className="text-xs opacity-70">{opMsg}</div>}
          </div>
        </div>
      </div>

      {/* טבלת מתנדבים */}
      <div className="p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-3">מתנדבים</div>

        {errMsg && <ErrorBox msg={errMsg} />}
        {filtered.length === 0 ? (
          <div className="opacity-60 text-sm">לא נמצאו מתנדבים תואמים</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead className="sticky top-0 bg-base-100">
                <tr>
                  <th>#</th>
                  <th>שם</th>
                  <th>אימייל</th>
                  <th>סטטוס</th>
                  <th>שובצו</th>
                  <th>נמסרו</th>
                  <th>נראה לאחרונה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, idx) => {
                  const s = stats[v.id] || { assigned: 0, delivered: 0 }
                  const online = isOnline(v)
                  const last = v?.lastSeen?.seconds ? new Date(v.lastSeen.seconds*1000) : (v?.lastSeen ? new Date(v.lastSeen) : null)
                  return (
                    <tr key={v.id}>
                      <td>{idx + 1}</td>
                      <td><b>{nameOf(v)}</b></td>
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

/* ===== UI helpers ===== */
function Wrap({ children }) {
  return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div>
}
function Header({ title, onBack }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="flex gap-2">
        <button className="btn" onClick={onBack}>חזרה לניהול משלוחים</button>
      </div>
    </div>
  )
}
function Loader({ text }) {
  return <div className="flex items-center gap-2 opacity-70"><span className="loading loading-spinner"></span>{text||'טוען...'}</div>
}
function ErrorBox({ msg }) {
  return <div className="alert alert-error mb-3"><span>{msg}</span></div>
}
