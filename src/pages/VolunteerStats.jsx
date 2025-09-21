// web/src/pages/Volunteer.jsx
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, doc, getDocs, onSnapshot, query,
  updateDoc, where, deleteDoc, limit, setDoc
} from 'firebase/firestore'

// ← חדש
import RequestEditModal from '../components/RequestEditModal'

export default function Volunteer() {
  const nav = useNavigate()

  // משתמש מחובר (לא אנונימי)
  const [user, setUser] = useState(auth.currentUser)
  useEffect(() => {
    const un = auth.onAuthStateChanged(async u => {
      setUser(u)
      if (!u || u.isAnonymous) { nav('/'); return }
      // פרופיל מתנדב + heartbeat ראשוני
      await setDoc(doc(db,'volunteers', u.uid), {
        displayName: u.displayName || (u.email ? u.email.split('@')[0] : 'מתנדב'),
        email: u.email || null,
        lastSeen: serverTimestamp(),
      }, { merge: true })
    })
    return () => un()
  }, [nav])

  // heartbeat כל דקה
  useEffect(()=>{
    if (!user || user.isAnonymous) return
    const iv = setInterval(()=>{
      setDoc(doc(db,'volunteers', user.uid), { lastSeen: serverTimestamp() }, { merge: true })
    }, 60*1000)
    return ()=>clearInterval(iv)
  }, [user])

  const displayName = useMemo(
    () => user ? (user.displayName || (user.email ? user.email.split('@')[0] : 'מתנדב')) : '',
    [user]
  )

  // שכונות פעילות
  const [neighborhoods, setNeighborhoods] = useState([])
  useEffect(() => {
    const un = onSnapshot(
      collection(db,'neighborhoods'),
      snap => {
        const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
        setNeighborhoods(arr.filter(n=>n.active).sort((a,b)=>a.name.localeCompare(b.name,'he')))
      }
    )
    return () => un()
  }, [])

  // ספירת ממתינים מכל שכונה (pending_index)
  const [pendingCounts, setPendingCounts] = useState({})
  useEffect(() => {
    const un = onSnapshot(collection(db,'pending_index'), snap => {
      const counts={}; snap.forEach(d=>{
        const nb=d.data()?.neighborhood||''; if(!nb) return
        counts[nb]=(counts[nb]||0)+1
      })
      setPendingCounts(counts)
    })
    return () => un()
  }, [])

  // בחירה לשיבוץ
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('')
  const [wantedCount, setWantedCount] = useState(1)
  const [msg, setMsg] = useState('')

  // ===================== המשלוחים שלי (שאילתה עם דגל השלמה) =====================
  const [my, setMy] = useState([])
  const [myErr, setMyErr] = useState('')

  useEffect(() => {
    if (!user) return
    // מציג רק משלוחים ששויכו אליי ושלא הושלמו
    const qMine = query(
      collection(db,'deliveries'),
      where('assignedVolunteerId','==', user.uid),
      where('volunteerCompleted','==', false)
    )

    const un = onSnapshot(qMine, snap => {
      const arr=[]; snap.forEach(d=>arr.push({id:d.id, ...d.data()}))
      arr.sort((x,y)=>{
        const tx = (x.updatedAt?.seconds||x.createdAt?.seconds||0)
        const ty = (y.updatedAt?.seconds||y.createdAt?.seconds||0)
        return ty - tx
      })
      setMy(arr)
      setMyErr('')
    }, err => {
      console.error('deliveries snapshot error', err)
      setMyErr('אין הרשאה/נתונים להצגה')
    })

    return () => un()
  }, [user])
  // ================================================================================

  // קבל שיבוץ (CLAIM) דרך pending_index
  async function claimAssignments() {
    if (!user) return
    if (!selectedNeighborhood) { setMsg('בחר שכונה'); return }
    const want = Math.max(1, Number(wantedCount||1))
    setMsg('מנסה לשבץ…')

    const qIds = query(
      collection(db,'pending_index'),
      where('neighborhood','==', selectedNeighborhood),
      limit(want*3)
    )
    const snap = await getDocs(qIds)
    if (snap.empty) { setMsg('אין משלוחים זמינים בשכונה הזו כרגע'); return }

    let ok=0
    for (const d of snap.docs){
      if (ok>=want) break
      const id = d.id
      try{
        await updateDoc(doc(db,'deliveries', id), {
          assignedVolunteerId: user.uid,
          status: 'assigned',
          updatedAt: serverTimestamp(),
          volunteerCompleted: false   // ← דגל התחלה
        })
        await deleteDoc(doc(db,'pending_index', id)).catch(()=>{})
        ok++
      }catch(e){ /* מישהו אחר לקח במקביל */ }
    }
    setMsg(ok ? `שובצו ${ok} משלוחים` : 'לא הצלחתי לשבץ, נסה שוב בעוד רגע')
  }

  // שינוי סטטוס — משמרים שיוך; ב-"נמסרה" כותבים גם deliveredBy/deliveredAt
  async function setStatus(id, status) {
    try{
      const patch = {
        status,
        updatedAt: serverTimestamp(),
        assignedVolunteerId: auth.currentUser?.uid || null
      }
      if (status === 'delivered') {
        patch.deliveredBy = auth.currentUser?.uid || null
        patch.deliveredAt = serverTimestamp()
      }
      await updateDoc(doc(db,'deliveries', id), patch)
    }catch(e){
      console.error('setStatus failed', e)
      alert('שגיאה בעדכון סטטוס: '+(e?.message||e))
    }
  }

  // שחרור שיבוץ (מחזיר ל-pending ויוצר אינדקס כדי שהמונה יתעדכן)
  async function releaseAssignment(id) {
    if (!confirm('לשחרר את המשלוח הזה מהשיבוץ שלך?')) return
    const item = my.find(x=>x.id===id)
    const nb = item?.address?.neighborhood || ''
    try{
      await updateDoc(doc(db,'deliveries', id), {
        status:'pending', assignedVolunteerId:null, updatedAt: serverTimestamp(),
        volunteerCompleted: false
      })
      await setDoc(doc(db,'pending_index', id), {
        neighborhood: nb, createdAt: serverTimestamp()
      }, { merge:true })
    }catch(e){
      console.error('releaseAssignment failed', e)
      alert('שגיאה בשחרור: '+(e?.message||e))
    }
  }

  // סיום משימה (אחרי "נמסרה") – נשאר Delivered באדמין, נעלם מהרשימה כאן
  async function completeAfterDelivered(id) {
    const ok = confirm('לסמן שהמשימה הסתיימה ולהעלים אותה מהרשימה? (הסטטוס יישאר "נמסרה")')
    if (!ok) return
    try{
      await updateDoc(doc(db,'deliveries', id), {
        volunteerCompleted: true,
        updatedAt: serverTimestamp()
      })
    }catch(e){
      console.error('completeAfterDelivered failed', e)
      alert('שגיאה בסימון סיום משימה: '+(e?.message||e))
    }
  }

  // ===== חדש: מצב/מודאל בקשת תיקון =====
  const [editOpen, setEditOpen] = useState(false)
  const [editDeliveryId, setEditDeliveryId] = useState(null)
  const openEdit = (id) => { setEditDeliveryId(id); setEditOpen(true) }
  const closeEdit = () => { setEditOpen(false); setEditDeliveryId(null) }

  if (!user || user.isAnonymous) return null

  return (
    <div dir="rtl" c
