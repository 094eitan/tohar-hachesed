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
      // מועמדים ממתינים בעיר חריש
      const q = query(collection(db,'deliveries'), where('status','==','pending'), where('address.city','==', DEFAULT_CITY))
      const snap = await getDocs(q)
      const candidates = []
      snap.forEach(d=>{
        const it = { id: d.id, ...d.data() }
        candidates.push(it)
      })

      if(!candidates.length){
        setMsg('לא נמצאו חבילות ממתינות בחריש')
        return
      }

      // דירוג: קודם התאמת רחוב, אח"כ לפי מרחק אם יש lat/lng
      const target = street.trim()
      const withScore = candidates.map(d=>{
        const sameStreet = target && (d.address?.street || '').includes(target) ? 1 : 0
        const dist = (d.address?.lat && d.address?.lng) ? 0 : 99999 // אם אין קואורדינטות—שלח לסוף
        return { id:d.id, sameStreet, dist, raw:d }
      })

      // אם יש lat/lng למועמדים וגם למתנדב אין—נישאר רק על sameStreet;
      // אפשרות (לא חובה): להשתמש ב-Nominatim להמיר רחוב->latlng (חינמי) ואז לחשב מרחק אמיתי.

      withScore.sort((a,b)=>{
        if(b.sameStreet !== a.sameStreet) return b.sameStreet - a.sameStreet
        return a.dist - b.dist
      })

      const chosen = withScore.slice(0, Math.max(0, Math.min(count, withScore.length)))

      if(!chosen.length){
        setMsg('לא נמצאו חבילות מתאימות')
        return
      }

      // טרנזקציה לקוח—נעילה אטומית
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
    }catch(e){
      console.error(e)
      setMsg('שגיאה בשיבוץ: ' + e.message)
    }
  }

  const setStatus = async (id, status) => {
    await updateDoc(doc(db,'deliveries',id), { status, updatedAt: serverTimestamp() })
  }

  return (
    <div dir="rtl" style={{maxWidth:900, margin:'24px auto'}}>
      <h2>שלום מתנדב 👋</h2>
      <div style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
        <input placeholder="רחוב מועדף (ב-חריש)" value={street} onChange={e=>setStreet(e.target.value)} />
        <input type="number" min={1} value={count} onChange={e=>setCount(parseInt(e.target.value||'1'))} />
        <button onClick={assignNow}>קבל שיבוץ</button>
      </div>

      {msg && <p style={{color:'#444'}}>{msg}</p>}

      <ol style={{marginTop:16}}>
        {assigned.map((d,idx)=>(
          <li key={d.id} style={{display:'grid', gridTemplateColumns:'40px 1fr 2fr 260px', gap:8, alignItems:'center', padding:'8px 0', borderBottom:'1px solid #eee'}}>
            <div>#{idx+1}</div>
            <div><b>{d.recipientName}</b></div>
            <div>
              {d.address?.street}, {d.address?.city}
              {d.address?.apartment?` — ${d.address.apartment}`:''}
            </div>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <Badge status={d.status}/>
              <button onClick={()=>setStatus(d.id,'in_transit')}>בדרך</button>
              <button onClick={()=>setStatus(d.id,'delivered')}>נמסרה</button>
              <button onClick={()=>setStatus(d.id,'returned')}>חזרה</button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Badge({status}){
  const colors = { pending:'#d2b48c', assigned:'#f9c74f', in_transit:'#90be6d', delivered:'#43aa8b', returned:'#f94144' }
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  return <span style={{background:colors[status]||'#ccc', padding:'4px 8px', borderRadius:8}}>{he[status]||status}</span>
}
