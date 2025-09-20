// web/src/pages/AdminVolunteers.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, getDoc,
  query, where
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

  // --- כל ה-hooks תמיד בראש! ---
  const [user, setUser] = useState(auth.currentUser)
  useEffect(()=>{ const un = auth.onAuthStateChanged(setUser); return ()=>un() }, [])

  const [allowed, setAllowed] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  useEffect(()=>{
    (async()=>{
      try{
        const ok = await isAdmin()
        setAllowed(ok); setAuthChecked(true)
        if (!ok) setErrMsg('אין הרשאת אדמין')
      }catch(e){
        setAllowed(false); setAuthChecked(true)
        setErrMsg('שגיאה בבדיקת הרשאות: ' + (e?.message || e))
      }
    })()
  },[])

  // מתנדבים
  const [vols, setVols] = useState([])
  useEffect(()=>{
    if (!authChecked || !allowed) return
    const un = onSnapshot(collection(db,'volunteers'),
      snap => { const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()})); setVols(arr) },
      err  => { setErrMsg('אין הרשאה/תקלה בקריאת volunteers: '+(err?.message||err)) }
    )
    return ()=>un()
  }, [authChecked, allowed])

  function isOnline(v){
    const t = v?.lastSeen?.seconds ? v.lastSeen.seconds*1000 : (v?.lastSeen || 0)
    return Date.now() - t < 90*1000
  }
  const nameOf = v => v.displayName || (v.email ? v.email.split('@')[0] : v.id.slice(0,6))

  // סטטיסטיקות
  const [stats, setStats] = useState({})
  useEffect(()=>{
    if (!authChecked || !allowed || !vols.length) return
    async function loadCounts(){
      const next={}
      for (const v of vols){
        const qAssigned  = query(collection(db,'deliveries'), where('assignedVolunteerId','==', v.id))
        const qDelivered = query(collection(db,'deliveries'), where('assignedVolunteerId','==', v.id), where('status','==','delivered'))
        const [c1,c2]=await Promise.all([getCountFromServer(qAssigned), getCountFromServer(qDelivered)])
        next[v.id]={ assigned:c1.data().count, delivered:c2.data().count }
      }
      setStats(next)
    }
    loadCounts()
  }, [authChecked, allowed, vols])

  const [qText,setQText]=useState(''); const [onlyOnline,setOnlyOnline]=useState(false)
  const filtered = useMemo(()=>{
    const q=(qText||'').trim().toLowerCase()
    return vols
      .filter(v=> onlyOnline ? isOnline(v) : true)
      .filter(v=> !q ? true : (nameOf(v).toLowerCase().includes(q) || (v.email||'').toLowerCase().includes(q)))
      .sort((a,b)=> (stats[b.id]?.delivered||0) - (stats[a.id]?.delivered||0))
  },[vols,stats,qText,onlyOnline])

  // הקצאה ידנית
  const [pickVolunteer, setPickVolunteer] = useState(''); const [deliveryId,setDeliveryId]=useState(''); const [opMsg,setOpMsg]=useState('')
  async function assignManually(){
    if (!pickVolunteer || !deliveryId){ setOpMsg('בחר/י מתנדב והזן/י מזהה משלוח'); return }
    setOpMsg('מקצה…')
    try{
      const ref = doc(db,'deliveries', deliveryId.trim()); const snap = await getDoc(ref)
      if (!snap.exists()){ setOpMsg('משלוח לא נמצא'); return }
      await updateDoc(ref, { assignedVolunteerId: pickVolunteer, status:'assigned', updatedAt: serverTimestamp() })
      await deleteDoc(doc(db,'pending_index', deliveryId.trim())).catch(()=>{})
      setOpMsg('המשלוח הוקצה בהצלחה'); setDeliveryId('')
    }catch(e){ setOpMsg('שגיאה בהקצאה: '+(e?.message||e)) }
  }

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">אדמין — ניהול מתנדבים</h2>
        <div className="flex gap-2">
          <button className="btn" onClick={()=>nav('/admin')}>חזרה לניהול משלוחים</button>
        </div>
      </div>

      {!user && <InfoBox kind="warn" text="יש להתחבר תחילה" />}
      {!authChecked && <InfoBox kind="muted" text="טוען הרשאות…" />}
      {authChecked && !allowed && <InfoBox kind="error" text={errMsg || 'אין הרשאת אדמין'} />}

      {authChecked && allowed && (
        <>
          <div className="grid gap-4 md:grid-cols-3 mb-6">
            <div className="p-4 rounded-xl border bg-base-100 md:col-span-2">
              <div className="font-semibold mb-2">חיפוש וסינון</div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grow">
                  <label className="label"><span className="label-text">חפש לפי שם/אימייל</span></label>
                  <input className="input input-bordered w-full" value={qText} onChange={e=>setQText(e.target.value)} placeholder="לדוגמה: איתן"/>
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
                <select className="select select-bordered" value={pickVolunteer} onChange={e=>setPickVolunteer(e.target.value)}>
                  <option value="">בחר/י מתנדב…</option>
                  {vols.slice().sort((a,b)=>nameOf(a).localeCompare(nameOf(b),'he')).map(v=>(
                    <option key={v.id} value={v.id}>{nameOf(v)}</option>
                  ))}
                </select>
                <input className="input input-bordered" placeholder="מזהה משלוח (deliveryId)" value={deliveryId} onChange={e=>setDeliveryId(e.target.value)} />
                <button className="btn btn-primary" onClick={assignManually}>הקצה</button>
                {opMsg && <div className="text-xs opacity-70">{opMsg}</div>}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl border bg-base-100">
            <div className="font-semibold mb-3">מתנדבים</div>
            {errMsg && <InfoBox kind="error" text={errMsg} />}
            {filtered.length===0 ? (
              <div className="opacity-60 text-sm">לא נמצאו מתנדבים</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-zebra w-full">
                  <thead className="sticky top-0 bg-base-100">
                    <tr><th>#</th><th>שם</th><th>אימייל</th><th>סטטוס</th><th>שובצו</th><th>נמסרו</th><th>נראה לאחרונה</th></tr>
                  </thead>
                  <tbody>
                  {filtered.map((v,idx)=>{
                    const s=stats[v.id]||{assigned:0,delivered:0}
                    const last = v?.lastSeen?.seconds ? new Date(v.lastSeen.seconds*1000) : (v?.lastSeen ? new Date(v.lastSeen) : null)
                    return (
                      <tr key={v.id}>
                        <td>{idx+1}</td>
                        <td><b>{nameOf(v)}</b></td>
                        <td>{v.email || '—'}</td>
                        <td>{isOnline(v) ? <span className="badge badge-success">מחובר</span> : <span className="badge">לא מחובר</span>}</td>
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
        </>
      )}
    </Wrap>
  )
}

function Wrap({children}){ return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div> }
function InfoBox({kind='muted', text}){
  const cls = kind==='error' ? 'alert-error' : kind==='warn' ? 'alert-warning' : 'alert'
  return <div className={`alert ${cls} mb-3`}><span>{text}</span></div>
}
