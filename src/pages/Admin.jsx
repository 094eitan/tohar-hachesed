// web/src/pages/Admin.jsx
import React, { useEffect, useRef, useState } from 'react'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, getDoc, setDoc, getDocs, limit
} from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom' // ← חדש: לנווט לעמוד ניהול מתנדבים
import WazeLink from '../components/WazeLink';

function addrString(a)
{
  if (!a)
  {
    return '';
  }

  const parts = [];

  if (a.street)
  {
    parts.push(a.street);
  }

  if (a.city)
  {
    parts.push(a.city);
  }

  if (a.apartment)
  {
    parts.push(`דירה ${a.apartment}`);
  }

  return parts.filter(Boolean).join(', ');
}

/* ---------- הרשאת אדמין ---------- */
async function isAdmin() {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const ref = doc(db, 'admins', uid)
  const snap = await getDoc(ref)
  return snap.exists()
}

/* ---------- עזרי CSV/XLSX ---------- */
const synonyms = {
  recipientName: ['Name','שם','שם מלא','שם הנזקק','מקבל','נזקק'],
  streetFull:    ['כתובת','כתובת מלאה','רחוב ומספר','רחוב+מספר'],
  streetName:    ['רחוב','שם רחוב'],
  houseNumber:   ['בית','מספר בית','מספר'],
  city:          ['עיר','ישוב','עיר/ישוב'],
  neighborhood:  ['שכונה','אזור','שכונה/אזור'],
  apartment:     ['דירה','מספר דירה'],
  entrance:      ['כניסה'],
  floor:         ['קומה'],
  phone:         ['Subitems','טלפון','טל','נייד','מספר טלפון','סלולרי','מספר נייד'],
  packageCount:  ['מספר חבילות','כמות','חבילות','סלים'],
  notes:         ['הערות','הערות לכתובת','הערה'],
  doorCode:      ['קוד כניסה לדלת','קוד כניסה','קוד'],
  householdSize: ['מספר נפשות'],
  campaign:      ['קמפיין','אירוע','ראש השנה תשפ"ו']
}
function norm(s=''){ return String(s).trim().toLowerCase().replace(/[\"׳״']/g,'').replace(/\s+/g,' ') }
function pick(row, keys){
  for (const k of keys){
    if (row[k] != null && row[k] !== '') return String(row[k]).trim()
    const found = Object.keys(row).find(col => norm(col) === norm(k))
    if (found && row[found] != null && row[found] !== '') return String(row[found]).trim()
  }
  return ''
}
function coerceNumber(v, fallback=null){ if (v===''||v==null) return fallback; const n=Number(String(v).replace(/[^\d\.\-]/g,'')); return isNaN(n)?fallback:n }
function parseCsvLine(line){ const out=[]; let cur='', inQ=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ if(inQ&&line[i+1]==='"'){cur+='"';i++} else inQ=!inQ } else if(ch===','&&!inQ){ out.push(cur); cur='' } else cur+=ch } out.push(cur); return out }
function csvToObjects(text){ const lines=text.split(/\r?\n/).filter(l=>l.trim()!==''); if(!lines.length) return []; const headers=parseCsvLine(lines.shift()).map(h=>h.trim()); return lines.map(ln=>{ const cells=parseCsvLine(ln); const obj={}; headers.forEach((h,i)=>obj[h]=(cells[i]??'').trim()); return obj }) }
function findHeaderRow(rows2D){
  const wanted=[...synonyms.recipientName,...synonyms.streetFull,...synonyms.streetName,...synonyms.phone,...synonyms.neighborhood].map(norm)
  for(let i=0;i<rows2D.length;i++){ const hits=rows2D[i].map(norm).filter(c=>wanted.includes(c)).length; if(hits>=2) return i }
  return 0
}

/* ---------- קומפוננטה ---------- */
export default function Admin() {
  const [allowed, setAllowed] = useState(false)
  const [rows, setRows] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterNeighborhood, setFilterNeighborhood] = useState('all')
  const [qtext, setQtext] = useState('')
  const [msg, setMsg] = useState('')
  const [importErrors, setImportErrors] = useState([])
  const fileRef = useRef(null)
  const nav = useNavigate() // ← חדש

  // ← חדש: volunteersMap כדי להציג שם מתנדב בעמודה
  const [volunteersMap, setVolunteersMap] = useState({})
  useEffect(() => {
    if (!allowed) return
    const un = onSnapshot(collection(db,'volunteers'), snap=>{
      const m={}
      snap.forEach(d=>{
        const v = d.data() || {}
        m[d.id] = v.displayName || (v.email ? String(v.email).split('@')[0] : d.id.slice(0,6))
      })
      setVolunteersMap(m)
    })
    return ()=>un()
  }, [allowed])

  useEffect(() => {
    let unsubDeliveries = () => {}, unsubNeighborhoods = () => {}
    ;(async ()=>{
      const ok = await isAdmin()
      setAllowed(ok)
      if (!ok) return
      const qDeliv = query(collection(db,'deliveries'), orderBy('createdAt','desc'))
      unsubDeliveries = onSnapshot(qDeliv, snap=>{
        const a=[]; snap.forEach(d=>a.push({id:d.id, ...d.data()})); setRows(a)
      })
      const qN = query(collection(db,'neighborhoods'), orderBy('name'))
      unsubNeighborhoods = onSnapshot(qN, snap=>{
        const a=[]; snap.forEach(d=>a.push({id:d.id, ...d.data()})); setNeighborhoods(a)
      })
    })()
    return ()=>{ unsubDeliveries(); unsubNeighborhoods() }
  }, [])

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (!allowed) return (
    <Wrap>
      <h3 className="text-lg font-semibold mb-2">אין לך הרשאת אדמין</h3>
      <p>ב־Firestore צור אוסף <code>admins</code> ומסמך עם ה־UID שלך (לדוגמה שדה <code>role: "admin"</code>).</p>
    </Wrap>
  )

  /* ---------- עזרי אינדקס לפנויים ---------- */
  async function ensurePendingIndex(id, neighborhood) {
    await setDoc(doc(db,'pending_index', id), {
      neighborhood: neighborhood || '',
      createdAt: serverTimestamp()
    }, { merge: true })
  }
  async function removePendingIndex(id){
    await deleteDoc(doc(db,'pending_index', id)).catch(()=>{})
  }
  async function syncPendingIndexFor(id, nextStatus, nextAssigned, nextNeighborhood){
    if (nextStatus === 'pending' && (nextAssigned == null || nextAssigned === '')) {
      await ensurePendingIndex(id, nextNeighborhood)
    } else {
      await removePendingIndex(id)
    }
  }

  /* ---------- פעולות ---------- */
  const addDelivery = async () => {
    const recipientName = prompt('שם נזקק:'); if (!recipientName) return
    const streetName = prompt('רחוב:'); if (!streetName) return
    const houseNumber = prompt('מספר בית (אופציונלי):')?.trim() || ''
    const city = prompt('עיר (ברירת מחדל חריש):')?.trim() || 'חריש'
    const neighborhood = prompt('שכונה (אופציונלי):')?.trim() || ''
    const apt = prompt('דירה (אופציונלי):')?.trim() || ''
    const ent = prompt('כניסה (אופציונלי):')?.trim() || ''
    const flr = prompt('קומה (אופציונלי):')?.trim() || ''
    const doorCode = prompt('קוד כניסה (אופציונלי):')?.trim() || ''
    const phone = prompt('טלפון (אופציונלי):')?.trim() || ''
    const pkg = Number(prompt('מספר חבילות (ברירת מחדל 1):')?.trim() || '1')
    const notes = prompt('הערות (אופציונלי):')?.trim() || ''

    const street = [streetName, houseNumber].filter(Boolean).join(' ')
    const aptParts = []; if (apt) aptParts.push(apt); if (ent) aptParts.push(`כניסה ${ent}`); if (flr) aptParts.push(`קומה ${flr}`)
    const apartment = aptParts.join(' ').trim()

    const address = { street, city }
    if (neighborhood) address.neighborhood = neighborhood
    if (apartment) address.apartment = apartment
    if (doorCode) address.doorCode = doorCode

    const ref = await addDoc(collection(db,'deliveries'), {
      recipientName, address, phone,
      packageCount: isNaN(pkg)?1:pkg,
      notes, status:'pending',
      assignedVolunteerId:null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    if (neighborhood) {
      const id = neighborhood.trim().toLowerCase().replace(/\s+/g,'-')
      await setDoc(doc(db,'neighborhoods',id), { name: neighborhood.trim(), active:true, order:0 }, { merge:true })
    }
    await ensurePendingIndex(ref.id, address.neighborhood || '')
  }

  async function importFile(file){
    setMsg('מייבא…'); setImportErrors([])
    try{
      const ext = file.name.toLowerCase().split('.').pop()
      let rawObjects = []

      if (ext==='csv'){
        rawObjects = csvToObjects(await file.text())
      } else if (ext==='xlsx' || ext==='xls'){
        const data = await file.arrayBuffer()
        const wb = XLSX.read(data,{type:'array'})
        const first = wb.Sheets[wb.SheetNames[0]]
        const rows2D = XLSX.utils.sheet_to_json(first,{header:1,defval:''})
        const headerRowIdx = findHeaderRow(rows2D)
        const headers = rows2D[headerRowIdx].map(h=>String(h||'').trim())
        const dataRows = rows2D.slice(headerRowIdx+1).filter(r=>r.some(c=>String(c).trim()!==''))
        rawObjects = dataRows.map((r,idx)=>{ const o={}; headers.forEach((h,i)=>o[h]=(r[i]??'').toString().trim()); o.__rowIndex = headerRowIdx+2+idx; return o })
      } else {
        throw new Error('קובץ לא נתמך (בחר CSV/XLSX/XLS)')
      }

      if (!rawObjects.length){ setMsg('קובץ ריק'); return }

      let ok=0, fail=0, lastError=''

      for (const r of rawObjects){
        try{
          const recipientName = pick(r, synonyms.recipientName)
          let street = pick(r, synonyms.streetFull)
          if (!street){
            const streetName = pick(r, synonyms.streetName)
            const houseNumber = pick(r, synonyms.houseNumber)
            street = [streetName, houseNumber].filter(Boolean).join(' ')
          }
          const city         = pick(r, synonyms.city) || 'חריש'
          const neighborhood = pick(r, synonyms.neighborhood)
          const apt = pick(r, synonyms.apartment)
          const ent = pick(r, synonyms.entrance)
          const flr = pick(r, synonyms.floor)
          const aptParts = []; if(apt) aptParts.push(apt); if(ent) aptParts.push(`כניסה ${ent}`); if(flr) aptParts.push(`קומה ${flr}`)
          const apartment = aptParts.join(' ').trim() || ''
          const phone         = pick(r, synonyms.phone)
          const packageCount  = coerceNumber(pick(r, synonyms.packageCount), 1)
          const notes         = pick(r, synonyms.notes)
          const doorCode      = pick(r, synonyms.doorCode)
          const householdSize = coerceNumber(pick(r, synonyms.householdSize), null)
          const campaign      = pick(r, synonyms.campaign)

          if (!recipientName || !street) throw new Error('שם וכתובת חובה')

          const address = { street, city }
          if (neighborhood) address.neighborhood = neighborhood
          if (apartment) address.apartment = apartment
          if (doorCode) address.doorCode = doorCode

          const ref = await addDoc(collection(db,'deliveries'), {
            recipientName, address, phone, packageCount, notes,
            householdSize, campaign,
            status:'pending', assignedVolunteerId:null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp()
          })
          if (neighborhood) {
            const id = neighborhood.trim().toLowerCase().replace(/\s+/g,'-')
            await setDoc(doc(db,'neighborhoods',id), { name: neighborhood.trim(), active:true, order:0 }, { merge:true })
          }
          await ensurePendingIndex(ref.id, address.neighborhood || '')
          ok++
        }catch(e){
          fail++; lastError = e?.message || String(e)
          setImportErrors(prev=>[...prev, { reason:lastError, raw:r }])
          console.error('שורה נכשלה:', e, r)
        }
      }

      setMsg(`ייבוא הושלם: ${ok} נוספו${fail?`, ${fail} נכשלו${lastError?` (אחרון: ${lastError})`:''}`:''}`)
    }catch(e){
      console.error(e); setMsg('שגיאה בייבוא: '+e.message)
    }
  }

  const deleteOne = async (id) => {
    if (!confirm('למחוק את הרשומה הזו?')) return
    await deleteDoc(doc(db,'deliveries',id))
    await removePendingIndex(id)
  }

  const deleteAll = async () => {
    const c1 = prompt('מחיקה גורפת של *כל* המשלוחים. כדי לאשר כתוב/י: מחיקה')
    if ((c1||'').trim() !== 'מחיקה') return
    const c2 = prompt('אישור אחרון – כתוב/י: כן, למחוק')
    if ((c2||'').trim() !== 'כן, למחוק') return
    setMsg('מוחק הכל…')
    const snap = await getDocs(collection(db,'deliveries'))
    let n=0
    for (const d of snap.docs){ await deleteDoc(d.ref); await removePendingIndex(d.id); n++ }
    setMsg(`נמחקו ${n} רשומות`)
  }

  const updateStatus = async (id, status) => {
    const ref = doc(db,'deliveries',id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const cur = snap.data()
    await updateDoc(ref, { status, updatedAt: serverTimestamp() })
    await syncPendingIndexFor(id, status, cur.assignedVolunteerId, cur.address?.neighborhood || '')
  }

  async function updateAddressField(id, key, value){
    const ref = doc(db,'deliveries',id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const cur = snap.data()
    const address = { ...(cur.address||{}) }
    address[key] = value
    await updateDoc(ref, { address, updatedAt: serverTimestamp() })
    if (key==='neighborhood'){
      const name = (value||'').trim()
      if (name){
        const nid = name.toLowerCase().replace(/\s+/g,'-')
        await setDoc(doc(db,'neighborhoods',nid), { name, active:true, order:0 }, { merge:true })
      }
      await syncPendingIndexFor(id, cur.status, cur.assignedVolunteerId, name)
    }
  }

  const updateTopField = async (id, key, value, coerce='string') => {
    const ref = doc(db,'deliveries',id)
    let v = value
    if (coerce==='number') v = coerceNumber(value, null)
    await updateDoc(ref, { [key]: v, updatedAt: serverTimestamp() })
  }

  async function addNeighborhood(){
    const name = prompt('שם שכונה:')
    if (!name) return
    const id = name.trim().toLowerCase().replace(/\s+/g,'-')
    await setDoc(doc(db,'neighborhoods',id), { name: name.trim(), active:true, order:0 }, { merge:true })
  }

  async function syncNeighborhoodsFromDeliveries(){
    const snap = await getDocs(collection(db,'deliveries'))
    const setN = new Set()
    snap.forEach(d=>{
      const nb = d.data()?.address?.neighborhood
      if (nb && String(nb).trim()) setN.add(String(nb).trim())
    })
    for (const name of setN){
      const id = name.toLowerCase().replace(/\s+/g,'-')
      await setDoc(doc(db,'neighborhoods',id), { name, active: true, order:0 }, { merge:true })
    }
    alert(`הסתנכרן! נמצאו ${setN.size} שכונות.`)
  }

  // שחרור ע"י אדמין
  async function releaseAssignmentAdmin(id) {
    const ref = doc(db, 'deliveries', id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const nb = snap.data()?.address?.neighborhood || ''
    await updateDoc(ref, { status: 'pending', assignedVolunteerId: null, updatedAt: serverTimestamp() })
    await ensurePendingIndex(id, nb)
  }

  // שחזור/בניית אינדקס
  async function rebuildPendingIndex(){
    setMsg('בונה אינדקס "ממתינים" מחדש…')
    const idxSnap = await getDocs(collection(db,'pending_index'))
    for (const d of idxSnap.docs) await deleteDoc(d.ref).catch(()=>{})
    const delSnap = await getDocs(collection(db,'deliveries'))
    let made = 0
    for (const d of delSnap.docs){
      const v = d.data()
      const nb = v?.address?.neighborhood || ''
      if (v?.status === 'pending' && (!v?.assignedVolunteerId)) {
        await setDoc(doc(db,'pending_index', d.id), { neighborhood: nb, createdAt: serverTimestamp() }, { merge:true })
        made++
      }
    }
    setMsg(`אינדקס נבנה: ${made} משלוחים פנויים`)
  }

  /* ---------- סינון/סיכומים ---------- */
  const visible = rows.filter(r=>{
    if (filterStatus!=='all' && r.status!==filterStatus) return false
    if (filterNeighborhood!=='all'){
      const nb = r.address?.neighborhood || ''
      if (nb !== filterNeighborhood) return false
    }
    const text = `${r.recipientName} ${r.address?.street||''} ${r.phone||''}`.toLowerCase()
    return text.includes(qtext.trim().toLowerCase())
  })
  const counts = countByStatus(filterNeighborhood==='all' ? rows : rows.filter(r=>(r.address?.neighborhood||'')===filterNeighborhood))

  // פונקציה קטנה להחזרת שם מתנדב
  function volunteerLabel(uid){
    if (!uid) return '—'
    return volunteersMap[uid] || (uid.length>6 ? uid.slice(0,6)+'…' : uid)
  }

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">אדמין — ניהול משלוחים</h2>
        {/* ← חדש: קיצור לעמוד ניהול מתנדבים */}
        <button className="btn btn-outline" onClick={()=>nav('/admin/volunteers')}>ניהול מתנדבים</button>
		<button className="btn btn-outline" onClick={()=>nav('/admin/edits')}>בקשות תיקון</button>
      </div>

      {/* ספירות */}
      <div className="flex flex-wrap gap-2 mb-3">
        <CountBadge label="ממתין" value={counts.pending}   color="badge-warning" />
        <CountBadge label="הוקצה"  value={counts.assigned}  color="badge-info" />
        <CountBadge label="בדרך"    value={counts.in_transit} color="badge-accent" />
        <CountBadge label="נמסרה"   value={counts.delivered} color="badge-success" />
        <CountBadge label="חזרה"    value={counts.returned}  color="badge-error" />
      </div>

      {/* פעולות עליונות */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button className="btn btn-primary" onClick={addDelivery}>הוסף משלוח</button>
        <button className="btn" onClick={()=>fileRef.current?.click()}>ייבוא קובץ (CSV/XLSX)</button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={e=>e.target.files[0]&&importFile(e.target.files[0])}/>
        <button className="btn btn-outline" onClick={addNeighborhood}>הוסף שכונה</button>
        <button className="btn btn-outline" onClick={syncNeighborhoodsFromDeliveries}>סנכרן שכונות</button>
        <button className="btn btn-outline" onClick={rebuildPendingIndex}>שחזר אינדקס ממתינים</button>
        <button className="btn btn-outline btn-error" onClick={deleteAll}>מחק הכל</button>
      </div>

      {/* ניהול שכונות */}
      <div className="mb-4 p-3 rounded-xl border">
        <div className="font-semibold mb-2">שכונות פעילות</div>
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map(n=>(
            <div key={n.id} className={`badge ${n.active?'badge-primary':'badge-ghost'} gap-2`}>
              {n.name}
              <button className="btn btn-xs" onClick={()=>updateDoc(doc(db,'neighborhoods',n.id), { active: !n.active })}>
                {n.active ? 'השבת' : 'הפעל'}
              </button>
            </div>
          ))}
          {neighborhoods.length===0 && <span className="opacity-60">אין שכונות עדיין</span>}
        </div>
      </div>

      {/* סרגל סינון */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="select select-bordered" value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="assigned">הוקצה</option>
          <option value="in_transit">בדרך</option>
          <option value="delivered">נמסרה</option>
          <option value="returned">חזרה</option>
        </select>

        <select className="select select-bordered" value={filterNeighborhood} onChange={e=>setFilterNeighborhood(e.target.value)}>
          <option value="all">כל השכונות</option>
          {neighborhoods.filter(n=>n.active).map(n=><option key={n.id} value={n.name}>{n.name}</option>)}
        </select>

        <input className="input input-bordered w-full" placeholder="חיפוש בשם/רחוב/טלפון" value={qtext} onChange={e=>setQtext(e.target.value)} />
      </div>

      {msg && <div className="alert mt-2"><span>{msg}</span></div>}

      {importErrors.length>0 && (
        <div className="mt-2 p-3 rounded-xl border bg-base-100">
          <div className="font-semibold mb-2">שגיאות בייבוא ({importErrors.length}):</div>
          <div className="max-h-52 overflow-auto text-sm">
            <table className="table table-sm">
              <thead><tr><th>#</th><th>סיבה</th><th>RAW</th></tr></thead>
              <tbody>
                {importErrors.slice(0,150).map((e,i)=>(
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td className="text-error">{e.reason}</td>
                    <td className="opacity-70">{JSON.stringify(e.raw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* טבלה */}
      <div className="overflow-x-auto mt-3">
        <table className="table table-zebra w-full">
          <thead className="sticky top-0 bg-base-100 z-10">
            <tr>
              <th>שם</th>
              <th>רחוב + עיר</th>
              <th>שכונה</th>
              <th>דירה/כניסה/קומה</th>
              <th>קוד כניסה</th>
              <th>טלפון</th>
              <th>הערות</th>
              <th>חבילות</th>
              <th>סטטוס</th>
              <th>מתנדב</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r=>(
              <tr key={r.id}>
                <td className="whitespace-nowrap">
                  <EditableCell value={r.recipientName||''} onSave={v=>updateTopField(r.id,'recipientName',v)} />
                </td>
                <td className="whitespace-nowrap">
                  <div className="flex gap-2 items-center">
                    <EditableCell value={r.address?.street||''} onSave={v=>updateAddressField(r.id,'street',v)} />
                    <span>—</span>
                    <EditableCell value={r.address?.city||''}   onSave={v=>updateAddressField(r.id,'city',v)} />
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  <EditableCell value={r.address?.neighborhood||''} onSave={v=>updateAddressField(r.id,'neighborhood',v)} />
                </td>
                <td className="whitespace-nowrap max-w-[220px]">
                  <EditableCell value={r.address?.apartment||''} onSave={v=>updateAddressField(r.id,'apartment',v)} />
                </td>
                <td className="whitespace-nowrap">
                  <EditableCell value={r.address?.doorCode||''} onSave={v=>updateAddressField(r.id,'doorCode',v)} />
                </td>
                <td className="whitespace-nowrap">
                  <EditableCell value={r.phone||''} onSave={v=>updateTopField(r.id,'phone',v)} />
                </td>
                <td className="whitespace-nowrap max-w-[280px]">
                  <EditableCell value={r.notes||''} textarea onSave={v=>updateTopField(r.id,'notes',v)} />
                </td>
                <td className="whitespace-nowrap">
                  <EditableCell value={String(r.packageCount??'')} onSave={v=>updateTopField(r.id,'packageCount',v,'number')} />
                </td>
                <td className="whitespace-nowrap"><Badge status={r.status} /></td>

                {/* ← חדש: מציג שם מתנדב במקום UID */}
                <td className="whitespace-nowrap">
                  {r.assignedVolunteerId ? volunteerLabel(r.assignedVolunteerId) : '—'}
                </td>

                <td className="flex flex-wrap gap-1">
				<WazeLink address={addrString(r.address)} label={"וויז"} className={"btn btn-xs"} title={"פתח ניווט ב-Waze"} />

                  <div className="join">
                    <button className="btn btn-xs join-item btn-warning" onClick={()=>updateStatus(r.id,'pending')}>ממתין</button>
                    <button className="btn btn-xs join-item" onClick={()=>updateStatus(r.id,'in_transit')}>בדרך</button>
                    <button className="btn btn-xs join-item btn-success" onClick={()=>updateStatus(r.id,'delivered')}>נמסרה</button>
                    <button className="btn btn-xs join-item btn-error" onClick={()=>updateStatus(r.id,'returned')}>חזרה</button>
                  </div>
                  {r.assignedVolunteerId && (
                    <button className="btn btn-xs" onClick={()=>releaseAssignmentAdmin(r.id)}>שחרר</button>
                  )}
                  <button className="btn btn-xs btn-outline btn-error" onClick={()=>deleteOne(r.id)}>מחק</button>
                </td>
              </tr>
            ))}
            {visible.length===0 && (<tr><td colSpan="11" className="opacity-60">אין נתונים לתצוגה</td></tr>)}
          </tbody>
        </table>
      </div>
    </Wrap>
  )
}

/* ---------- UI helpers ---------- */
function Wrap({children}){ return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div> }
function Badge({status}){
  const he = { pending:'ממתין', assigned:'הוקצה', in_transit:'בדרך', delivered:'נמסרה', returned:'חזרה למחסן' }
  const color = { pending:'badge-warning', assigned:'badge-info', in_transit:'badge-accent', delivered:'badge-success', returned:'badge-error' }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status]||status}</span>
}
function CountBadge({label,value,color}){ return <div className={`badge ${color} gap-2 text-sm`}>{label}<span className="badge">{value||0}</span></div> }
function countByStatus(list){ const out={pending:0,assigned:0,in_transit:0,delivered:0,returned:0}; for(const r of list){ if(out[r.status]!=null) out[r.status]++ } return out }

function EditableCell({ value:initial, onSave, textarea=false }){
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initial||'')
  useEffect(()=>{ setVal(initial||'') },[initial])
  const commit = async ()=>{ setEditing(false); const v=(val||'').trim(); if(v===(initial||'')) return; await onSave(v) }
  if(!editing){
    return <div onDoubleClick={()=>setEditing(true)} className="min-h-[32px] cursor-text">{initial ? <span>{initial}</span> : <span className="opacity-40">—</span>}</div>
  }
  if(textarea){
    return (
      <textarea autoFocus className="textarea textarea-bordered w-full min-h-[60px]" value={val}
        onChange={e=>setVal(e.target.value)} onBlur={commit}
        onKeyDown={e=>{ if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)) commit() }} placeholder="הקלד… (Ctrl/Cmd+Enter לשמירה)"/>
    )
  }
  return (
    <input autoFocus className="input input-bordered w-[220px]" value={val}
      onChange={e=>setVal(e.target.value)} onBlur={commit}
      onKeyDown={e=>{ if(e.key==='Enter') commit() }} placeholder="הקלד…"/>
  )
}
