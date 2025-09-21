// web/src/pages/VolunteerStats.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../lib/firebase'
import {
  collection, doc, getDocs, onSnapshot, query, where, setDoc
} from 'firebase/firestore'
import { getCountFromServer } from 'firebase/firestore'

function startOfDay(d=new Date()){ const x=new Date(d); x.setHours(0,0,0,0); return x }
function startOfWeek(d=new Date()){ const x=startOfDay(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x }
function startOfMonth(d=new Date()){ const x=startOfDay(d); x.setDate(1); return x }

export default function VolunteerStats(){
  const nav = useNavigate()
  const [user, setUser] = useState(auth.currentUser)

  useEffect(()=>{
    const un = auth.onAuthStateChanged(u=>{
      setUser(u)
      if (!u || u.isAnonymous) nav('/')
    })
    return ()=>un()
  }, [nav])

  // יעדים אישיים
  const [goals, setGoals] = useState({ daily: 5, weekly: 20, monthly: 40 })
  useEffect(()=>{
    if (!user) return
    const un = onSnapshot(doc(db,'volunteers', user.uid), snap=>{
      const v = snap.data() || {}
      if (v.goals) setGoals(v.goals)
    })
    return ()=>un()
  }, [user])

  // סיכומי נמסרה (למשתמש)
  const [counts, setCounts] = useState({ day:0, week:0, month:0 })
  useEffect(()=>{
    if (!user) return
    async function load(){
      const qMine = query(collection(db,'deliveries'),
        where('assignedVolunteerId','==', user.uid),
        where('status','==','delivered')
      )
      const snap = await getDocs(qMine)
      const list=[]; snap.forEach(d=>list.push(d.data()))
      const now=new Date()
      const d0=startOfDay(now).getTime()/1000
      const w0=startOfWeek(now).getTime()/1000
      const m0=startOfMonth(now).getTime()/1000
      let cDay=0,cWeek=0,cMonth=0
      for (const r of list){
        const t=r.updatedAt?.seconds || r.createdAt?.seconds || 0
        if (t>=d0) cDay++
        if (t>=w0) cWeek++
        if (t>=m0) cMonth++
      }
      setCounts({ day:cDay, week:cWeek, month:cMonth })
    }
    load()
  }, [user])

  async function saveGoals(){
    if (!user) return
    await setDoc(doc(db,'volunteers', user.uid), { goals }, { merge: true })
    alert('היעדים נשמרו!')
  }

  // ---------- Leaderboard: Top 5 ----------
  const [leaders, setLeaders] = useState([]) // [{uid, name, delivered}]
  useEffect(()=>{
    async function buildLeaderboard(){
      // מביאים את כל המתנדבים (דורש rule: read ל-volunteers לכל מחובר)
      const vsnap = await getDocs(collection(db,'volunteers'))
      const vols = []
      vsnap.forEach(d=>{
        const v = d.data() || {}
        const name = v.displayName || (v.email ? v.email.split('@')[0] : d.id.slice(0,6))
        vols.push({ id:d.id, name })
      })
      // עבור כל מתנדב מבקשים ספירה של delivered (Aggregate)
      const rows = []
      for (const v of vols){
        const qDelivered = query(
          collection(db,'deliveries'),
          where('assignedVolunteerId','==', v.id),
          where('status','==','delivered')
        )
        const agg = await getCountFromServer(qDelivered)
        rows.push({ uid:v.id, name:v.name, delivered: agg.data().count })
      }
      rows.sort((a,b)=> b.delivered - a.delivered)
      setLeaders(rows.slice(0,5))
    }
    buildLeaderboard()
  }, [])

  if (!user) return null

  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">סיכומים ויעדים</h2>
        <button className="btn btn-ghost" onClick={()=>nav('/volunteer')}>חזרה לדף מתנדב</button>
      </div>

      {/* כרטיסי סטטוס מול יעד */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="היום" value={counts.day} goal={goals.daily}/>
        <StatCard title="השבוע" value={counts.week} goal={goals.weekly}/>
        <StatCard title="החודש" value={counts.month} goal={goals.monthly}/>
      </div>

      {/* הגדרת יעדים */}
      <div className="mt-6 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-3">הגדרת יעדים</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <NumInput label="יעד יומי" value={goals.daily} onChange={v=>setGoals({...goals, daily:v})}/>
          <NumInput label="יעד שבועי" value={goals.weekly} onChange={v=>setGoals({...goals, weekly:v})}/>
          <NumInput label="יעד חודשי" value={goals.monthly} onChange={v=>setGoals({...goals, monthly:v})}/>
        </div>
        <button className="btn btn-primary mt-4" onClick={saveGoals}>שמור יעדים</button>
      </div>

      {/* Leaderboard */}
      <div className="mt-6 p-4 rounded-xl border bg-base-100">
        <div className="font-semibold mb-3">ה־5 שחילקו הכי הרבה</div>
        {leaders.length === 0 ? (
          <div className="opacity-60 text-sm">אין נתונים להצגה עדיין</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>מקום</th>
                  <th>מתנדב</th>
                  <th>משלוחים שנמסרו</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((r,idx)=>(
                  <tr key={r.uid} className={idx===0 ? 'bg-base-200' : idx===1 ? 'bg-base-100' : ''}>
                    <td>
                      <span className={`badge ${idx===0?'badge-warning':idx===1?'':'badge-ghost'}`}>
                        #{idx+1}
                      </span>
                    </td>
                    <td><b>{r.name}</b></td>
                    <td>
                      <span className="badge badge-success">{r.delivered}</span>
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

function NumInput({label, value, onChange}){
  return (
    <div>
      <label className="label"><span className="label-text">{label}</span></label>
      <input type="number" min="0" className="input input-bordered w-full"
             value={value} onChange={e=>onChange(Number(e.target.value)||0)} />
    </div>
  )
}

function StatCard({title, value, goal}){
  const pct = goal>0 ? Math.min(100, Math.round((value/goal)*100)) : 0
  return (
    <div className="p-4 rounded-xl border bg-base-100">
      <div className="text-sm opacity-70 mb-1">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-2">
        <div className="text-xs mb-1">יעד: {goal}</div>
        <progress className="progress w-full" value={pct} max="100"/>
        <div className="text-xs mt-1">{pct}% מהיעד</div>
      </div>
    </div>
  )
}
