import React, { useEffect, useRef, useState } from 'react'
import { auth, db, serverTimestamp } from '../lib/firebase'
import {
  collection, onSnapshot, addDoc, updateDoc, doc, query, orderBy, getDoc,
  setDoc
} from 'firebase/firestore'
import * as XLSX from 'xlsx'

/** ===========================
 *  עוזר: בדיקת אדמין
 *  =========================== */
async function isAdmin() {
  const uid = auth.currentUser?.uid
  if (!uid) return false
  const ref = doc(db, 'admins', uid)
  const snap = await getDoc(ref)
  return snap.exists()
}

/** ===========================
 *  עוזרים לייבוא
 *  =========================== */
// כינויים נפוצים בעברית/אנגלית לכותרות
const synonyms = {
  recipientName: ['שם', 'שם מלא', 'שם הנזקק', 'מקבל', 'נזקק', 'שם משפחה ושם פרטי'],
  street:        ['רחוב', 'כתובת', 'רחוב ומספר', 'רחוב+מספר', 'כתובת מלאה'],
  city:          ['עיר', 'ישוב', 'עיר/ישוב'],
  neighborhood:  ['שכונה', 'אזור', 'שכונה/אזור'],
  apartment:     ['דירה', 'מספר דירה', 'קומה', 'כניסה', 'דירה/קומה/כניסה'],
  phone:         ['טלפון', 'טל', 'נייד', 'מספר טלפון', 'סלולרי', 'מספר נייד'],
  packageCount:  ['כמות', 'מספר חבילות', 'חבילות', 'סלים'],
  notes:         ['הערות', 'הערה', 'מידע נוסף'],
}

function norm(s = '') {
  return String(s).trim().toLowerCase()
    .replace(/[\"׳״']/g, '')
    .replace(/\s+/g, ' ')
}

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') return String(row[k]).trim()
    const found = Object.keys(row).find(col => norm(col) === norm(k))
    if (found && row[found] != null && row[found] !== '') return String(row[found]).trim()
  }
  return ''
}

function coerceNumber(v, fallback = null) {
  if (v === '' || v == null) return fallback
  const n = Number(String(v).replace(/[^\d\.\-]/g, ''))
  return isNaN(n) ? fallback : n
}

function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ
    } else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else { cur += ch }
  }
  out.push(cur)
  return out
}

function csvToObjects(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  if (!lines.length) return []
  const headers = parseCsvLine(lines.shift()).map(h => h.trim())
  const out = []
  for (const line of lines) {
    const cells = parseCsvLine(line)
    const obj = {}
    headers.forEach((h, i) => obj[h] = (cells[i] ?? '').trim())
    out.push(obj)
  }
  return out
}

/** ===========================
 *  רכיב ראשי: Admin
 *  =========================== */
export default function Admin() {
  const [allowed, setAllowed] = useState(false)

  // נתונים
  const [rows, setRows] = useState([])
  const [neighborhoods, setNeighborhoods] = useState([]) // [{id, name, active}]

  // סינון/חיפוש
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterNeighborhood, setFilterNeighborhood] = useState('all')
  const [qtext, setQtext] = useState('')

  // UI helpers
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')

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

    return () => {
      unsubDeliveries()
      unsubNeighborhoods()
    }
  }, [])

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>
  if (!allowed) return (
    <Wrap>
      <h3 className="text-lg font-semibold mb-2">אין לך הרשאת אדמין</h3>
      <p>כדי להפוך לאדמין: ב־Firestore צור אוסף <code>admins</code> ומסמך עם ה־UID שלך. ערך לדוגמה: <code>{`{ role: "admin" }`}</code></p>
    </Wrap>
  )

  /** ===== פעולות אדמין ===== */
  const addDelivery = async () => {
    const recipientName = prompt('שם נזקק:'); if (!recipientName) return
    const street = prompt('רחוב+מספר:'); if (!street) return
    const city = prompt('עיר (ברירת מחדל חריש):')?.trim() || 'חריש'
    const neighborhood = prompt('שכונה (אופציונלי):')?.trim() || ''
    const apartment = prompt('דירה/קומה/כניסה (אופציונלי):')?.trim() || ''
    const phone = prompt('טלפון (אופציונלי):')?.trim() || ''
    const pkg = Number(prompt('מספר חבילות (ברירת מחדל 1):')?.trim() || '1')

    const address = { street, city }
    if (apartment) address.apartment = apartment
    if (neighborhood) address.neighborhood = neighborhood

    await addDoc(collection(db, 'deliveries'), {
      recipientName,
      address,
      phone,
      packageCount: isNaN(pkg) ? 1 : pkg,
      notes: '',
      status: 'pending',
      assignedVolunteerId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
  }

  const importFile = async (file) => {
    setMsg('מייבא…')
    try {
      const ext = file.name.toLowerCase().split('.').pop()
      let rows = []
      if (ext === 'csv') {
        rows = csvToObjects(await file.text())
      } else if (ext === 'xlsx' || ext === 'xls') {
        const data = await file.arrayBuffer()
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
      } else {
        throw new Error('קובץ לא נתמך (בחר CSV/XLSX/XLS)')
      }

      if (!rows.length) { setMsg('קובץ ריק'); return }

      let ok = 0, fail = 0
      for (const r of rows) {
        try {
          const recipientName = pick(r, synonyms.recipientName)
          const fullStreet = pick(r, synonyms.street)
          const city = pick(r, synonyms.city) || 'חריש'
          const neighborhood = pick(r, synonyms.neighborhood)
          const apartment = pick(r, synonyms.apartment)
          const phone = pick(r, synonyms.phone)
          const packageCount = coerceNumber(pick(r, synonyms.packageCount), 1)
          const notes = pick(r, synonyms.notes)

          if (!recipientName || !fullStreet) throw new Error('שם וכתובת חובה')

          const address = { street: fullStreet, city }
          if (apartment) address.apartment = apartment
          if (neighborhood) address.neighborhood = neighborhood

          await addDoc(collection(db, 'deliveries'), {
            recipientName,
            address,
            phone,
            packageCount,
            notes,
            status: 'pending',
            assignedVolunteerId: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })
          ok++
        } catch (e) {
          console.error('שורה נכשלה', e)
          fail++
        }
      }
      setMsg(`ייבוא הושלם: ${ok} נוספו${fail ? `, ${fail} נכשלו` : ''}`)
    } catch (e) {
      console.error(e)
      setMsg('שגיאה בייבוא: ' + e.message)
    }
  }

  const releaseAssignment = async (id) => {
    await updateDoc(doc(db, 'deliveries', id), {
      status: 'pending',
      assignedVolunteerId: null,
      updatedAt: serverTimestamp()
    })
  }

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, 'deliveries', id), {
      status,
      updatedAt: serverTimestamp()
    })
  }

  const addNeighborhood = async () => {
    const name = prompt('שם שכונה:')
    if (!name) return
    const id = name.trim().toLowerCase().replace(/\s+/g, '-')
    await setDoc(doc(db, 'neighborhoods', id), { name: name.trim(), active: true, order: 0 })
  }

  const toggleNeighborhood = async (n) => {
    await updateDoc(doc(db, 'neighborhoods', n.id), { active: !n.active })
  }

  /** ===== סינון מוצג ===== */
  const visible = rows.filter(r => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (filterNeighborhood !== 'all') {
      const nb = r.address?.neighborhood || ''
      if (nb !== filterNeighborhood) return false
    }
    const text = `${r.recipientName} ${r.address?.street || ''} ${r.phone || ''}`.toLowerCase()
    return text.includes(qtext.trim().toLowerCase())
  })

  return (
    <Wrap>
      <h2 className="text-xl font-semibold mb-3">אדמין — ניהול משלוחים</h2>

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
        <button className="btn btn-outline" onClick={addNeighborhood}>הוסף שכונה</button>
      </div>

      {/* ניהול שכונות */}
      <div className="mb-4 p-3 rounded-xl border">
        <div className="font-semibold mb-2">שכונות פעילות</div>
        <div className="flex flex-wrap gap-2">
          {neighborhoods.map(n => (
            <div key={n.id} className={`badge ${n.active ? 'badge-primary' : 'badge-ghost'} gap-2`}>
              {n.name}
              <button className="btn btn-xs"
                onClick={() => toggleNeighborhood(n)}>
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

        <input className="input input-bordered w-full" placeholder="חיפוש בשם/רחוב/טלפון" value={qtext} onChange={e => setQtext(e.target.value)} />
      </div>

      {msg && <div className="alert mt-2"><span>{msg}</span></div>}

      {/* טבלה */}
      <div className="overflow-x-auto">
        <table className="table table-zebra w-full">
          <thead>
            <tr>
              <th>שם</th>
              <th>כתובת</th>
              <th>שכונה</th>
              <th>טלפון</th>
              <th>סטטוס</th>
              <th>מתנדב</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td className="whitespace-nowrap"><b>{r.recipientName}</b></td>
                <td className="whitespace-nowrap">
                  {r.address?.street}, {r.address?.city}
                  {r.address?.apartment ? ` — ${r.address.apartment}` : ''}
                </td>
                <td className="whitespace-nowrap">{r.address?.neighborhood || '—'}</td>
                <td className="whitespace-nowrap">{r.phone || '—'}</td>
                <td className="whitespace-nowrap"><Badge status={r.status} /></td>
                <td className="whitespace-nowrap">{r.assignedVolunteerId ? r.assignedVolunteerId.slice(0, 6) + '…' : '—'}</td>
                <td className="flex gap-1">
                  <div className="join">
                    <button className="btn btn-xs join-item" onClick={() => updateStatus(r.id, 'in_transit')}>בדרך</button>
                    <button className="btn btn-xs join-item btn-success" onClick={() => updateStatus(r.id, 'delivered')}>נמסרה</button>
                    <button className="btn btn-xs join-item btn-error" onClick={() => updateStatus(r.id, 'returned')}>חזרה</button>
                  </div>
                  {r.assignedVolunteerId && (
                    <button className="btn btn-xs" onClick={() => releaseAssignment(r.id)}>שחרר</button>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr><td colSpan="7" className="opacity-60">אין נתונים לתצוגה</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Wrap>
  )
}

/** ===========================
 *  קומפוננטות עזר
 *  =========================== */
function Wrap({ children }) {
  return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div>
}

function Badge({ status }) {
  const he = { pending: 'ממתין', assigned: 'הוקצה', in_transit: 'בדרך', delivered: 'נמסרה', returned: 'חזרה למחסן' }
  const color = {
    pending: 'badge-warning',
    assigned: 'badge-info',
    in_transit: 'badge-accent',
    delivered: 'badge-success',
    returned: 'badge-error'
  }[status] || 'badge-ghost'
  return <span className={`badge ${color}`}>{he[status] || status}</span>
}
