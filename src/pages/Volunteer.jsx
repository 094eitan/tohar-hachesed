// web/src/pages/Volunteer.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, doc, getDocs, onSnapshot, query, updateDoc, where, deleteDoc, limit
} from 'firebase/firestore'

export default function Volunteer() {
  const nav = useNavigate()

  // רק משתמש רשום (לא אנונימי)
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => {
    const un = auth.onAuthStateChanged(u => {
      setUser(u)
      if (!u || u.isAnonymous) nav('/')
    })
    return () => un()
  }, [nav])

  const displayName = useMemo(() => {
    if (!user) return ''
    return user.displayName || (user.email ? user.email.split('@')[0] : 'מתנדב')
  }, [user])

  // שכונות פעילות
  const [neighborhoods, setNeighborhoods] = useState([])
  useEffect(() => {
    const un = onSnapshot(collection(db,'neighborhoods'), snap => {
      const arr=[]
      snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      setNeighborhoods(arr.filter(n=>n.active).sort((a,b)=>a.name.localeCompare(b.name,'he')))
    })
    return () => un()
  }, [])

  // ספירות "ממתין" לפי שכונה מתוך pending_index (בלי לחשוף פרטי אנשים)
  const [pendingCounts, setPendingCounts] = useState({})
  useEffect(() => {
    const un = onSnapshot(collection(db,'pending_index'), snap => {
      const counts={}
      snap.forEach(d=>{
        const nb = d.data()?.neighborhood || ''
        if (!nb) return
        counts[nb] = (counts[nb]||0)+1
      })
      setPendingCounts(counts)
    })
    return () => un()
  }, [])

  // בחירת שכונה + כמות
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('')
  const [wantedCount, setWantedCount] = useState(1)
  const [msg, setMsg] = useState('')

  // המשלוחים שלי
  const [my, setMy] = useState([])
  useEffect(() => {
    if (!user) return
    const qMine = query(collection(db,'deliveries'), where('assignedVolunteerId','==', user.uid))
    const un = onSnapshot(qMine, snap => {
      const arr=[]
      snap.forEach(d => arr.push({id:d.id, ...d.data()}))
      arr.sort((a,b)=>{
        const ta = (a.updatedAt?.seconds||a.createdAt?.seconds||0)
        const tb = (b.updatedAt?.seconds||b.createdAt?.seconds||0)
        return tb-ta
      })
      setMy(arr)
    })
    return () => un()
  }, [user])

  // CLAIM דרך pending_index
  async function claimAssignments() {
    if (!user) return
    if (!selectedNeighborhood) { setMsg('בחר שכונה'); return }
    const want = Math.max(1, Number(wantedCount||1))
    setMsg('מנסה לשבץ…')

    // קח מזהים מהאינדקס לשכונה הזו
    const qIds = query(
      collection(db,'pending_index'),
      where('neighborhood', '==', selectedNeighborhood),
      limit(want * 3) // קצת ספייר למירוצים
    )
    const snap = await getDocs(qIds)
    if (snap.empty) { setMsg('אין משלוחים זמינים בשכונה הזו כרגע'); return }

    let ok = 0
    for (const docIdx of snap.docs) {
      if (ok >= want) break
      const id = docIdx.id
      try {
        // נסה לתפוס אם עדיין פנוי
        await updateDoc(doc(db,'deliveries', id), {
          assignedVolunteerId: user.uid,
          status: 'assigned',
          updatedAt: serverTimestamp()
        })
        // הצליח → מחק מהאינדקס
        await deleteDoc(doc(db,'pending_index', id)).catch(()=>{})
        ok++
      } catch (e) {
        // מישהו הקדים אותנו / הרשאות – נמשיך ל־ID הבא
        console.debug('claim failed for', id, e?.message)
      }
    }

    setMsg(ok ? `שובצו ${ok} משלוחים` : 'לא הצלחתי לשבץ, נסה שוב בעוד רגע')
  }

  async function setStatus(id, status) {
    await updateDoc(doc(db,'deliveries', id), { status, updatedAt: serverTimestamp() })
  }

  // שחרור שיבוץ (לעצמו בלבד)
  async function releaseAssignment(id) {
    if (!confirm('לשחרר את המשלוח הזה מהשיבוץ שלך?')) return
    await updateDoc(doc(db,'deliveries', id), {
      status: 'pending',
      assignedVolunteerId: null,
      updatedAt: serverTimestamp()
    })
    // אין צורך ליצור מחדש אינדקס כאן — כללי האדמין כבר דואגים לזה כשהוא מחזיר ל-pending.
    // אם תרצה שגם מתנדב ייצור אינדקס, אפשר להוסיף:
    // await setDoc(doc(db,'pending_index', id), { neighborhood: d.address?.neighborhood||'', createdAt: serverTimestamp() }, { merge:true })
  }

  if (!user || user.isAnonymous) return null

  return (
    <div dir="rtl" className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">שלום {displayName} 👋</h2>
        <a className="btn btn-ghost" href="/">דף הבית</a>
      </div>

      {/* שיבוץ לפי שכונה */}
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

      {/* הטבלה – ללא עריכה, שינוי סטטוס + שחרור */}
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
