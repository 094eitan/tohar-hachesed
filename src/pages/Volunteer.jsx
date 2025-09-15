import React, { useEffect, useState } from 'react'
import { auth, db, serverTimestamp } from '../lib/firebase'
import { collection, query, where, onSnapshot, updateDoc, doc, getDocs, runTransaction } from 'firebase/firestore'

const DEFAULT_CITY = 'חריש'

export default function Volunteer(){
  const [street, setStreet] = useState('')
  const [count, setCount] = useState(3)
  const [assigned, setAssigned] = useState([])
  const [msg, setMsg] = useState('')

  useEffect(()=>{
    if(!auth.currentUser) return
    const q = query(collection(db, 'deliveries'), where('assignedVolunteerId','==', auth.currentUser.uid))
    const unsub = onSnapshot(q, snap => {
      const rows = []
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }))
      rows.sort((a,b)=> (a.updatedAt?.toMillis?.()||0) - (b.updatedAt?.toMillis?.()||0))
      setAssigned(rows)
    })
    return () => unsub()
  },[])

  const assignNow = async () => {
    setMsg('')
    try{
      const qy = query(collection(db,'deliveries'), where('status','==','pending'), where('address.city','==', DEFAULT_CITY))
      const snap = await getDocs(qy)
      const candidates = []
      snap.forEach(d=> candidates.push({ id: d.id, ...d.data() }))

      if(!candidates.length){ setMsg('לא נמצאו חבילות ממתינות בחריש'); return }

      const target = street.trim()
      const withScore = candidates.map(d=>{
        const sameStreet = target && (d.address?.street || '').includes(target) ? 1 : 0
        const dist = (d.address?.lat && d.address?.lng) ? 0 : 99999
        return { id:d.id, sameStreet, dist, raw:d }
      })
      withScore.sort((a,b)=> (b.sameStreet - a.sameStreet) || (a.dist - b.dist))
      const chosen = withScore.slice(0, Math.max(0, Math.min(count, withScore.length)))

      await runTransaction(db, async (tx)=>{
        for(const c of chosen){
          const ref = doc(db,'deliveries', c.id)
          const snap = await tx.get(ref)
          if(!snap.exists()) continue
          const cur = snap.data()
          if(cur.status !== 'pending') continue
          tx.update(ref, {
            status: 'assigned',
            assignedVolunteerId: auth.currentUser.uid,
            updatedAt: serverTimestamp()
          })
        }
      })

      setMsg(`שובצו ${chosen.length} חבילות`)
    }catch(e){ setMsg('שגיאה בשיבוץ: ' + e.message) }
  }

  const setStatus = async (id, status) => {
    await updateDoc(doc(db,'deliveries',id), { status, updatedAt: serverTimestamp() })
  }

  return (
    <div dir="rtl" className="max-w-5xl mx-auto p-6">
      <h2 className="text-xl font-semibold mb-3">שלום מתנדב 👋</h2>

      <div className="flex flex-wrap gap-2 mb-3">
        <input className="input input-bordered" placeholder="רחוב מועדף (ב-חריש)" value={street} onChange={e=>setStreet(e.target.value)} />
        <input className="input input-bordered w-24" type="number" min={1} value={count} onChange={e=>setCount(parseInt(e.target.value||'1'))} />
        <button className="btn btn-primary" onClick={assignNow}>קבל שיבוץ</button>
      </div>

      {msg && <div className="alert mt-2"><span>{msg}</span></div>}

      <ol className="mt-4 space-y-3">
        {assigned.map((d,idx)=>(
          <li key={d.id} className="p-3 rounded-xl border flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70">#{idx+1}</div>
              <Badge status={d.status}/>
            </div>

            <div className="font-semibold">{d.recipientName}</div>
            <div>
              {d.address?.street}, {d.address?.city}{d.address?.apartment?` — ${d.address.apartment}`:''}
              {d.address?.lat && d.address?.lng && (
                <a className="link link-primary mr-2"
                   target="_blank"
                   href={`https://www.google.com/maps?q=${d.address.lat},${d.address.lng}`}>
                   פתח מפה
                </a>
              )}
            </div>

            <div className="join self-end">
              <button className="btn join-item" onClick={()=>setStatus(d.id,'in_transit')}>בדרך</button>
              <button className="btn join-item btn-success" onClick={()=>setStatus(d.id,'delivered')}>נמסרה</button>
              <button className="btn join-item btn-error" onClick={()=>setStatus(d.id,'returned')}>חזרה</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Badge({status}){
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  const color = {
    pending:'badge-warning',
    assigned:'badge-info',
    in_transit:'badge-accent',
    delivered:'badge-success',
    returned:'badge-error'
  }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status]||status}</span>
}
