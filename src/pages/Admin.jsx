// web/src/pages/Admin.jsx
import React, { useEffect, useRef, useState } from 'react'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, getDoc, setDoc
} from 'firebase/firestore'
import * as XLSX from 'xlsx'

/** ───────── בדיקת אדמין (admins/{uid}) ───────── */
async function isAdmin() {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const ref = doc(db, 'admins', uid)
  const snap = await getDoc(ref)
  return snap.exists()
}

/** ───────── מילון כינויים לעמודות (מותאם לאקסל שלך) ───────── */
const synonyms = {
  recipientName: ['Name','שם','שם מלא','שם הנזקק','מקבל','נזקק','שם משפחה ושם פרטי'],

  // כתובת – או שדה אחד מלא או מפוצל
  streetFull:    ['כתובת','כתובת מלאה','רחוב ומספר','רחוב+מספר'],
  streetName:    ['רחוב','שם רחוב'],
  houseNumber:   ['בית','מספר בית','מספר','בית מספר'],

  city:          ['עיר','ישוב','עיר/ישוב'],
  neighborhood:  ['שכונה','אזור','שכונה/אזור'],

  apartment:     ['דירה','מספר דירה'],
  entrance:      ['כניסה'],
  floor:         ['קומה'],

  phone:         ['Subitems','טלפון','טל','נייד','מספר טלפון','סלולרי','מספר נייד'],

  packageCount:  ['מספר חבילות','כמות','חבילות','סלים'],
  notes:         ['הערות','הערות לכתובת','הערה','מידע נוסף'],

  // ייעודי
  doorCode:      ['קוד כניסה לדלת','קוד כניסה','קוד'],
  householdSize: ['מספר נפשות'],
  campaign:      ['ראש השנה תשפ"ו','קמפיין','אירוע']
}

/** ───────── עזרי נירמול/CSV ───────── */
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

/** ───────── קומפוננטה ראשית ───────── */
export default function Admin() {
  const [allowed, setAllowed] = useState(false)

  // נתונים
  const [rows, setRows] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([]) // [{id,name,active}]

  // סינון/חיפוש
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterNeighborhood, setFilterNeighborhood] = useState('all')
  const [qtext, setQtext] = useState('')

  // UI / ייבוא
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')
  const [importErrors, setImportErrors] = useState([]) // [{index, reason, raw}]

  useEffect(() => {
    let unsubDeliveries = () => {}, unsubNeighborhoods = () => {}

    ;(async () => {
      const ok = await isAdmin()
      setAllowed(ok)
      if (!ok) return

      // משלוחים
      const qDeliv = query(collection(db, 'deliveries'), orderBy('createdAt', 'desc'))
      unsubDeliveries = onSnapshot(qDeliv, snap => {
        const a = []
        snap.forEach(d => a.push({ id: d.id, ...d.data() }))
        setRows(a)
      })

      // שכונות
      const qN = query(collection(db, 'neighborhoods'), orderBy('name'))
      unsubNeighborhoods = onSnapshot(qN, snap => {
        const a = []
        snap.forEach(d => a.push({ id: d.id, ...d.data() }))
        setNeighborhoods(a)
      })
    })()

    return () => { unsubDeliveries(); unsubNeighborhoods() }
  }, [])

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (!allowed) return (
    <Wrap>
      <h3 className="text-lg font-semibold mb-2">אין לך הרשאת אדמין</h3>
      <p>ב־Firestore צור אוסף <code>admins</code> ומסמך עם ה־UID שלך. לדוגמה: <code>{`{ role: "admin" }`}</code></p>
    </Wrap>
  )

  /** ───────── פעולות אדמין ───────── */
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
    const aptParts = []
    if (apt) aptParts.push(apt)
    if (ent) aptParts.push(`כניסה ${ent}`)
    if (flr) aptParts.push(`קומה ${flr}`)
    const apartment = aptParts.join(' ').trim()

    const address = { street, city }
    if (neighborhood) address.neighborhood = neighborhood
    if (apartment) address.apartment = apartment
    if (doorCode) address.doorCode = doorCode

    await addDoc(collection(db, 'deliveries'), {
      recipientName,
      address,
      phone,
      packageCount: isNaN(pkg) ? 1 : pkg,
      notes,
      status: 'pending',
      assignedVolunteerId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })

    if (neighborhood) {
      const id = neighborhood.trim().toLowerCase().replace(/\s+/g,'-')
      await setDoc(doc(db, 'neighborhoods', id), { name: neighborhood.trim(), active: true, order: 0 }, { merge: true })
    }
  }

  /** ───────── ייבוא קובץ (CSV/XLSX/XLS) + שכונות אוטומטיות (גם גיליון "שכונות") ───────── */
  async function importFile(file){
    setMsg('מייבא…'); setImportErrors([])
    try{
      const ext = file.name.toLowerCase().split('.').pop()
      let rawObjects = []
      let sheetNeighborhoods = [] // שכונות מגיליון "שכונות"

      if (ext === 'csv'){
        rawObjects = csvToObjects(await file.text())
      } else if (ext === 'xlsx' || ext === 'xls'){
        const data = await file.arrayBuffer()
        const wb = XLSX.read(data, { type:'array' })

        // נתוני משלוחים מהגיליון הראשון
        const first = wb.Sheets[wb.SheetNames[0]]
        const rows2D = XLSX.utils.sheet_to_json(first, { header:1, defval:'' })
        const headerRowIdx = findHeaderRow(rows2D)
        const headers = rows2D[headerRowIdx].map(h => String(h||'').trim())
        const dataRows = rows2D.slice(headerRowIdx+1).filter(r => r.some(c => String(c).trim() !== ''))
        rawObjects = dataRows.map((r,idx)=>{
          const o={}
          headers.forEach((h,i)=> o[h] = (r[i] ?? '').toString().trim())
          o.__rowIndex = headerRowIdx + 2 + idx // מספר שורה אנושי
          return o
        })

        // שכונות מגיליון בשם "שכונות" (אם קיים)
        const sheetName = wb.SheetNames.find(n => norm(n) === norm('שכונות'))
        if (sheetName){
          const sh = wb.Sheets[sheetName]
          const arr = XLSX.utils.sheet_to_json(sh, { header:1, defval:'' })
          // נניח שהעמודה הראשונה היא שם שכונה; נתעלם מכותרות ריקות
          sheetNeighborhoods = arr
            .map(r => String(r?.[0] || '').trim())
            .filter(name => !!name && name !== 'שכונה' && name !== 'שם שכונה')
        }
      } else {
        throw new Error('קובץ לא נתמך (בחר CSV/XLSX/XLS)')
      }

      if (!rawObjects.length){ setMsg('קובץ ריק'); return }

      let ok=0, fail=0, lastError=''
      const seenNeighborhoods = new Set(sheetNeighborhoods.map(n => n.trim()))

      for (const r of rawObjects){
        try{
          const recipientName = pick(r, synonyms.recipientName)

          // כתובת: או "כתובת מלאה" או מרכיבים רחוב+בית
          let street = pick(r, synonyms.streetFull)
          if (!street){
            const streetName  = pick(r, synonyms.streetName)
            const houseNumber = pick(r, synonyms.houseNumber)
            street = [streetName, houseNumber].filter(Boolean).join(' ')
          }

          const city         = pick(r, synonyms.city) || 'חריש'
          const neighborhood = pick(r, synonyms.neighborhood)
          const aptParts = []
          const apt = pick(r, synonyms.apartment)
          const ent = pick(r, synonyms.entrance)
          const flr = pick(r, synonyms.floor)
          if (apt) aptParts.push(apt)
          if (ent) aptParts.push(`כניסה ${ent}`)
          if (flr) aptParts.push(`קומה ${flr}`)
          const apartment = aptParts.join(' ').trim() || ''

          const phone         = pick(r, synonyms.phone)
          const packageCount  = coerceNumber(pick(r, synonyms.packageCount), 1)
          const notesRaw      = pick(r, synonyms.notes)
          const doorCode      = pick(r, synonyms.doorCode)
          const householdSize = coerceNumber(pick(r, synonyms.householdSize), null)
          const campaign      = pick(r, synonyms.campaign)

          if (!recipientName || !street) throw new Error('שם וכתובת חובה')

          const address = { street, city }
          if (neighborhood) { address.neighborhood = neighborhood; seenNeighborhoods.add(neighborhood.trim()) }
          if (apartment)    address.apartment    = apartment
          if (doorCode)     address.doorCode     = doorCode

          const notes = notesRaw

          await addDoc(collection(db,'deliveries'), {
            recipientName,
            address,
            phone,
            packageCount,
            notes,
            householdSize,
            campaign,
            status: 'pending',
            assignedVolunteerId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })

          ok++
        }catch(e){
          fail++; lastError = e?.message || String(e)
          setImportErrors(prev => [...prev, { index: r.__rowIndex ?? null, reason: lastError, raw: r }])
          console.error('שורה נכשלה:', e, r)
        }
      }

      // יצירת שכונות אוטומטית (מגיליון "שכונות" ומהנתונים)
      for (const name of seenNeighborhoods){
        const clean = name.trim()
        if (!clean) continue
        const id = clean.toLowerCase().replace(/\s+/g,'-')
        await setDoc(doc(db, 'neighborhoods', id), { name: clean, active: true, order: 0 }, { merge: true })
      }

      setMsg(`ייבוא הושלם: ${ok} נוספו${fail?`, ${fail} נכשלו${lastError?` (אחרון: ${lastError})`:''}`:''}`)
    }catch(e){
      console.error(e)
      setMsg('שגיאה בייבוא: ' + e.message)
    }
  }

  /** ───────── מחיקה: בודד ───────── */
  const deleteOne = async (id) => {
    if (!confirm('למחוק את הרשומה הזו?')) return
    await deleteDoc(doc(db, 'deliveries', id))
  }

  /** ───────── עדכוני שדות ───────── */
  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, 'deliveries', id), { status, updatedAt: serverTimestamp() })
  }

  async function updateAddressField(id, key, value){
    const ref = doc(db,'deliveries',id)
    const snap = await getDoc(ref)
    if (!snap.exists()) return
    const cur = snap.data()
    const address = { ...(cur.address || {}) }
    address[key] = value
    await updateDoc(ref, { address, updatedAt: serverTimestamp() })
    if (key==='neighborhood' && value && value.trim()){
      const name = value.trim()
      const nid = name.toLowerCase().replace(/\s+/g,'-')
      await setDoc(doc(db,'neighborhoods',nid), { name, active: true, order: 0 }, { merge: true })
    }
  }

  const updateTopField = async (id, key, value, coerce='string') => {
    const ref = doc(db,'deliveries',id)
    let v = value
    if (coerce==='number') v = coerceNumber(value, null)
    await updateDoc(ref, { [key]: v, updatedAt: serverTimestamp() })
  }

  /** ───────── סינון/סיכומים ───────── */
  const visible = rows.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterNeighborhood !== 'all') {
      const nb = r.address?.neighborhood || ''
      if (nb !== filterNeighborhood) return false
    }
    const text = `${r.recipientName} ${r.address?.street || ''} ${r.phone || ''}`.toLowerCase()
    return text.includes(qtext.trim().toLowerCase())
  })

  const counts = countByStatus(filterNeighborhood==='all' ? rows : rows.filter(r=>(r.address?.neighborhood||'')===filterNeighborhood))

  return (
    <Wrap>
      <h2 className="text-xl font-semibold mb-3">אדמין — ניהול משלוחים</h2>

      {/* ספירת סטטוסים */}
      <div className="flex flex-wrap gap-2 mb-3">
        <CountBadge label="ממתין" value={counts.pending} color="badge-warning" />
        <CountBadge label="הוקצה" value={counts.assigned} color="badge-info" />
        <CountBadge label="בדרך" value={counts.in_transit} color="badge-accent" />
        <CountBadge label="נמסרה" value={counts.delivered} color="badge-success" />
        <CountBadge label="חזרה" value={counts.returned} color="badge-error" />
      </div>

      {/* פעולות עליונות */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button className="btn btn-primary" onClick={addDelivery}>הוסף משלוח</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>ייבוא קובץ (CSV/XLSX)</button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          hidden
          onChange={e => e.target.files[0] && importFile(e.target.files[0])}
        />
        <button className="btn btn-outline" onClick={()=>addNeighborhood()}>הוסף שכונה</button>
      </div>

      {/* ניהול שכונות */}
      <div className="mb-4 p-3 rounded-xl border">
        <div className="font-semibold mb-2">שכונות פעילות</div>
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map(n => (
            <div key={n.id} className={`badge ${n.active ? 'badge-primary' : 'badge-ghost'} gap-2`}>
              {n.name}
              <button className="btn btn-xs" onClick={() => updateDoc(doc(db,'neighborhoods',n.id), { active: !n.active })}>
                {n.active ? 'השבת' : 'הפעל'}
              </button>
            </div>
          ))}
          {neighborhoods.length === 0 && <span className="opacity-60">אין שכונות עדיין</span>}
        </div>
      </div>

      {/* סרגל סינון */}
      <div className="flex flex-wrap gap-2 mb-3">
        <select className="select select-bordered" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="assigned">הוקצה</option>
          <option value="in_transit">בדרך</option>
          <option value="delivered">נמסרה</option>
          <option value="returned">חזרה</option>
        </select>

        <select className="select select-bordered" value={filterNeighborhood} onChange={e => setFilterNeighborhood(e.target.value)}>
          <option value="all">כל השכונות</option>
          {neighborhoods.filter(n => n.active).map(n =>
            <option key={n.id} value={n.name}>{n.name}</option>
          )}
        </select>

        <input
          className="input input-bordered w-full"
          placeholder="חיפוש בשם/רחוב/טלפון"
          value={qtext}
          onChange={e => setQtext(e.target.value)}
        />
      </div>

      {msg && <div className="alert mt-2"><span>{msg}</span></div>}

      {importErrors.length > 0 && (
        <div className="mt-2 p-3 rounded-xl border bg-base-100">
          <div className="font-semibold mb-2">שגיאות בייבוא ({importErrors.length}):</div>
          <div className="max-h-52 overflow-auto text-sm">
            <table className="table table-sm">
              <thead><tr><th>#</th><th>שורה בקובץ</th><th>סיבה</th><th>תצוגה גולמית</th></tr></thead>
              <tbody>
                {importErrors.slice(0,100).map((e,i)=>(
                  <tr key={i}>
                    <td>{i+1}</td>
                    <td>{e.index ?? '—'}</td>
                    <td className="text-error">{e.reason}</td>
                    <td className="opacity-70">{JSON.stringify(e.raw)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {importErrors.length>100 && <div className="mt-1 text-xs opacity-60">מוצגות 100 הראשונות…</div>}
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
            {visible.map(r => (
              <tr key={r.id}>
                {/* שם */}
                <td className="whitespace-nowrap">
                  <EditableCell
                    value={r.recipientName || ''}
                    onSave={val => updateTopField(r.id, 'recipientName', val)}
                  />
                </td>

                {/* רחוב + עיר */}
                <td className="whitespace-nowrap">
                  <div className="flex gap-2 items-center">
                    <EditableCell
                      value={r.address?.street || ''}
                      onSave={val => updateAddressField(r.id, 'street', val)}
                    />
                    <span>—</span>
                    <EditableCell
                      value={r.address?.city || ''}
                      onSave={val => updateAddressField(r.id, 'city', val)}
                    />
                  </div>
                </td>

                {/* שכונה */}
                <td className="whitespace-nowrap">
                  <EditableCell
                    value={r.address?.neighborhood || ''}
                    onSave={val => updateAddressField(r.id, 'neighborhood', val)}
                  />
                </td>

                {/* דירה/כניסה/קומה (טקסט אחד) */}
                <td className="whitespace-nowrap max-w-[220px]">
                  <EditableCell
                    value={r.address?.apartment || ''}
                    onSave={val => updateAddressField(r.id, 'apartment', val)}
                  />
                </td>

                {/* קוד כניסה */}
                <td className="whitespace-nowrap">
                  <EditableCell
                    value={r.address?.doorCode || ''}
                    onSave={val => updateAddressField(r.id, 'doorCode', val)}
                  />
                </td>

                {/* טלפון */}
                <td className="whitespace-nowrap">
                  <EditableCell
                    value={r.phone || ''}
                    onSave={val => updateTopField(r.id, 'phone', val)}
                  />
                </td>

                {/* הערות */}
                <td className="whitespace-nowrap max-w-[280px]">
                  <EditableCell
                    value={r.notes || ''}
                    textarea
                    onSave={val => updateTopField(r.id, 'notes', val)}
                  />
                </td>

                {/* חבילות */}
                <td className="whitespace-nowrap">
                  <EditableCell
                    value={String(r.packageCount ?? '')}
                    onSave={val => updateTopField(r.id, 'packageCount', val, 'number')}
                  />
                </td>

                {/* סטטוס */}
                <td className="whitespace-nowrap"><Badge status={r.status} /></td>

                {/* מתנדב */}
                <td className="whitespace-nowrap">{r.assignedVolunteerId ? r.assignedVolunteerId.slice(0, 6) + '…' : '—'}</td>

                {/* פעולות */}
                <td className="flex flex-wrap gap-1">
                  <div className="join">
                    <button className="btn btn-xs join-item btn-warning" onClick={() => updateStatus(r.id, 'pending')}>ממתין</button>
                    <button className="btn btn-xs join-item" onClick={() => updateStatus(r.id, 'in_transit')}>בדרך</button>
                    <button className="btn btn-xs join-item btn-success" onClick={() => updateStatus(r.id, 'delivered')}>נמסרה</button>
                    <button className="btn btn-xs join-item btn-error" onClick={() => updateStatus(r.id, 'returned')}>חזרה</button>
                  </div>
                  {r.assignedVolunteerId && (
                    <button className="btn btn-xs" onClick={() => updateStatus(r.id, 'pending')}>שחרר</button>
                  )}
                  <button className="btn btn-xs btn-outline btn-error" onClick={()=>deleteOne(r.id)}>מחק</button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan="11" className="opacity-60">אין נתונים לתצוגה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Wrap>
  )
}

/** ───────── קומפוננטות/עוזרים ───────── */
function Wrap({ children }) { return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div> }

function Badge({ status }) {
  const he = { pending: 'ממתין', assigned: 'הוקצה', in_transit: 'בדרך', delivered: 'נמסרה', returned: 'חזרה למחסן' }
  const color = { pending:'badge-warning', assigned:'badge-info', in_transit:'badge-accent', delivered:'badge-success', returned:'badge-error' }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status] || status}</span>
}
function CountBadge({label, value, color}) {
  return <div className={`badge ${color} gap-2 text-sm`}>{label}<span className="badge">{value||0}</span></div>
}
function countByStatus(list){
  const out = { pending:0, assigned:0, in_transit:0, delivered:0, returned:0 }
  for (const r of list){ if (out[r.status]!=null) out[r.status]++ }
  return out
}

/** עורך תא כללי (dblclick → edit, Enter/Blur → save) */
function EditableCell({ value:initial, onSave, textarea=false }){
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(initial||'')

  useEffect(()=>{ setVal(initial||'') },[initial])

  const commit = async () => {
    setEditing(false)
    const v = (val||'').trim()
    if (v === (initial||'')) return
    await onSave(v)
  }

  if (!editing){
    return (
      <div onDoubleClick={()=>setEditing(true)} className="min-h-[32px] cursor-text">
        {initial ? <span>{initial}</span> : <span className="opacity-40">—</span>}
      </div>
    )
  }
  if (textarea){
    return (
      <textarea
        autoFocus
        className="textarea textarea-bordered w-full min-h-[60px]"
        value={val}
        onChange={e=>setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={e=>{ if(e.key==='Enter' && (e.ctrlKey||e.metaKey)) commit() }}
        placeholder="הקלד… (Ctrl/Cmd+Enter לשמירה)"
      />
    )
  }
  return (
    <input
      autoFocus
      className="input input-bordered w-[220px]"
      value={val}
      onChange={e=>setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e=>{ if(e.key==='Enter') commit() }}
      placeholder="הקלד…"
    />
  )
}
