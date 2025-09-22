// web/src/pages/Volunteer.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, serverTimestamp } from "../lib/firebase";
import {
  collection, doc, getDocs, onSnapshot, query,
  updateDoc, where, deleteDoc, limit, setDoc
} from "firebase/firestore";

import WazeLink from "../components/WazeLink";
import RequestEditModal from "../components/RequestEditModal";
import GradientWaves from "../components/GradientWaves"; // 👈 הרקע החדש

/* פונקציה ליצירת כתובת חופשית ל-Waze אם אין קואורדינטות */
function addrString(a)
{
  if (!a) { return ""; }
  const parts = [];
  if (a.street) { parts.push(a.street); }
  if (a.city)   { parts.push(a.city); }
  parts.push("ישראל");
  return parts.filter(Boolean).join(", ");
}

export default function Volunteer()
{
  const nav = useNavigate();

  // משתמש
  const [user, setUser] = useState(auth.currentUser);
  useEffect(() =>
  {
    const un = auth.onAuthStateChanged(async u =>
    {
      setUser(u);
      if (!u || u.isAnonymous) { nav("/"); return; }
      await setDoc(doc(db, "volunteers", u.uid),
      {
        displayName: u.displayName || (u.email ? u.email.split("@")[0] : "מתנדב"),
        email: u.email || null,
        lastSeen: serverTimestamp(),
      }, { merge: true });
    });
    return () => un();
  }, [nav]);

  // heartbeat כל דקה
  useEffect(() =>
  {
    if (!user || user.isAnonymous) return;
    const iv = setInterval(() =>
    {
      setDoc(doc(db, "volunteers", user.uid), { lastSeen: serverTimestamp() }, { merge: true });
    }, 60 * 1000);
    return () => clearInterval(iv);
  }, [user]);

  const displayName = useMemo(
    () => user ? (user.displayName || (user.email ? user.email.split("@")[0] : "מתנדב")) : "",
    [user]
  );

  // שכונות פעילות
  const [neighborhoods, setNeighborhoods] = useState([]);
  useEffect(() =>
  {
    const un = onSnapshot(collection(db, "neighborhoods"), snap =>
    {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      setNeighborhoods(arr.filter(n => n.active).sort((a, b) => a.name.localeCompare(b.name, "he")));
    });
    return () => un();
  }, []);

  // ממתינים לפי שכונה
  const [pendingCounts, setPendingCounts] = useState({});
  useEffect(() =>
  {
    const un = onSnapshot(collection(db, "pending_index"), snap =>
    {
      const counts = {};
      snap.forEach(d =>
      {
        const nb = d.data()?.neighborhood || "";
        if (!nb) return;
        counts[nb] = (counts[nb] || 0) + 1;
      });
      setPendingCounts(counts);
    });
    return () => un();
  }, []);

  // בחירה לשיבוץ
  const [selectedNeighborhood, setSelectedNeighborhood] = useState("");
  const [wantedCount, setWantedCount] = useState(1);
  const [msg, setMsg] = useState("");

  // המשלוחים שלי (לא מושלמים)
  const [my, setMy] = useState([]);
  const [myErr, setMyErr] = useState("");

  useEffect(() =>
  {
    if (!user) return;
    const qMine = query(
      collection(db, "deliveries"),
      where("assignedVolunteerId", "==", user.uid),
      where("volunteerCompleted", "==", false)
    );

    const un = onSnapshot(qMine, snap =>
    {
      const arr = [];
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }));
      arr.sort((x, y) =>
      {
        const tx = (x.updatedAt?.seconds || x.createdAt?.seconds || 0);
        const ty = (y.updatedAt?.seconds || y.createdAt?.seconds || 0);
        return ty - tx;
      });
      setMy(arr);
      setMyErr("");
    }, err =>
    {
      console.error("deliveries snapshot error", err);
      setMyErr("אין הרשאה/נתונים להצגה");
    });

    return () => un();
  }, [user]);

  // קבל שיבוץ
  async function claimAssignments()
  {
    if (!user) return;
    if (!selectedNeighborhood) { setMsg("בחר שכונה"); return; }
    const want = Math.max(1, Number(wantedCount || 1));
    setMsg("מנסה לשבץ…");

    const qIds = query(
      collection(db, "pending_index"),
      where("neighborhood", "==", selectedNeighborhood),
      limit(want * 3)
    );
    const snap = await getDocs(qIds);
    if (snap.empty) { setMsg("אין משלוחים זמינים בשכונה הזו כרגע"); return; }

    let ok = 0;
    for (const d of snap.docs)
    {
      if (ok >= want) break;
      const id = d.id;
      try
      {
        await updateDoc(doc(db, "deliveries", id),
        {
          assignedVolunteerId: user.uid,
          status: "assigned",
          updatedAt: serverTimestamp(),
          volunteerCompleted: false
        });
        await deleteDoc(doc(db, "pending_index", id)).catch(() => {});
        ok++;
      }
      catch(e) { /* מישהו אחר תפס במקביל */ }
    }
    setMsg(ok ? `שובצו ${ok} משלוחים` : "לא הצלחתי לשבץ, נסה שוב בעוד רגע");
  }

  // שינוי סטטוס
  async function setStatus(id, status)
  {
    try
    {
      const patch = {
        status,
        updatedAt: serverTimestamp(),
        assignedVolunteerId: auth.currentUser?.uid || null
      };
      if (status === "delivered")
      {
        patch.deliveredBy = auth.currentUser?.uid || null;
        patch.deliveredAt = serverTimestamp();
      }
      await updateDoc(doc(db, "deliveries", id), patch);
    }
    catch(e)
    {
      console.error("setStatus failed", e);
      alert("שגיאה בעדכון סטטוס: " + (e?.message || e));
    }
  }

  // שחרור שיבוץ
  async function releaseAssignment(id)
  {
    if (!confirm("לשחרר את המשלוח הזה מהשיבוץ שלך?")) return;
    const item = my.find(x => x.id === id);
    const nb = item?.address?.neighborhood || "";
    try
    {
      await updateDoc(doc(db, "deliveries", id),
      {
        status: "pending", assignedVolunteerId: null, updatedAt: serverTimestamp(),
        volunteerCompleted: false
      });
      await setDoc(doc(db, "pending_index", id),
      { neighborhood: nb, createdAt: serverTimestamp() }, { merge: true });
    }
    catch(e)
    {
      console.error("releaseAssignment failed", e);
      alert("שגיאה בשחרור: " + (e?.message || e));
    }
  }

  // סיום משימה (אחרי "נמסרה")
  async function completeAfterDelivered(id)
  {
    const ok = confirm("לסמן שהמשימה הסתיימה ולהעלים אותה מהרשימה? (הסטטוס יישאר \"נמסרה\")");
    if (!ok) return;
    try
    {
      await updateDoc(doc(db, "deliveries", id),
      {
        volunteerCompleted: true,
        updatedAt: serverTimestamp()
      });
    }
    catch(e)
    {
      console.error("completeAfterDelivered failed", e);
      alert("שגיאה בסימון סיום משימה: " + (e?.message || e));
    }
  }

  // מודאל "הצע תיקון"
  const [editOpen, setEditOpen] = useState(false);
  const [editDeliveryId, setEditDeliveryId] = useState(null);
  const openEdit  = (id) => { setEditDeliveryId(id); setEditOpen(true); };
  const closeEdit = () => { setEditOpen(false); setEditDeliveryId(null); };

  if (!user || user.isAnonymous) return null;

	return (
	  <>
		{/* רקע קבוע שמכסה את כל המסך, לא זז בגלילה */}
		<GradientWaves
		  className="fixed inset-0"   // 👈 חשוב: fixed + inset-0
		  lines={20}
		  amplitudeX={100}
		  amplitudeY={20}
		  hueStart={53}
		  satStart={74}
		  lightStart={67}
		  hueEnd={216}
		  satEnd={100}
		  lightEnd={7}
		  smoothness={3}
		  offsetX={10}
		  fill={true}
		  crazyness={false}
		/>

		{/* כל התוכן מעל הרקע הקבוע */}
		<div
		  dir="rtl"
		  className="relative z-10 max-w-6xl mx-auto p-6 min-h-screen"
		>


      {/* Header קטן */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h2 className="text-xl font-semibold">שלום {displayName} 👋</h2>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => nav("/volunteer/stats")}>סיכומים ויעדים</button>
          <a className="btn btn-ghost" href="/">דף הבית</a>
        </div>
      </div>

      {/* מלבן #1 — הסבר + פיצ'רים */}
      <div className="relative z-10 mb-6 p-5 rounded-2xl border bg-white/10 dark:bg-white/10 backdrop-blur-md border-white/20 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold">איך זה עובד? ✨</h3>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 text-sm leading-6">
            <div className="font-semibold opacity-90">זרימת שיבוץ ומשלוח</div>
            <ol className="list-decimal pr-5 space-y-1">
              <li>בחר/י שכונה וכמות, ואז <b>📦 קבל שיבוץ</b>.</li>
              <li>בכל שורה ניתן לעדכן סטטוס: <em>בדרך</em> / <em>נמסרה</em> / <em>חזרה</em>, או <b>שחרר</b>.</li>
              <li>אחרי <b>נמסרה</b> יופיע <b>סיים משימה</b> — זה מסתיר אותה מהרשימה שלך.</li>
              <li>ניווט? <b>וויז</b> עם עדיפות ל-<code>lat/lng</code>, ואם אין – לפי כתובת.</li>
            </ol>
          </div>
          <div className="space-y-2 text-sm leading-6">
            <div className="font-semibold opacity-90">מה חדש בדף?</div>
            <ul className="space-y-2">
              <li>✅ כפתור Waze כחול (lat/lng → כתובת).</li>
              <li>✅ סיים משימה מסתיר משלוחים שסומנו נמסרה.</li>
              <li>✅ הצע תיקון — מודאל שמייצר בקשה לאדמין.</li>
              <li>✅ סטטיסטיקות ויעדים בעמוד נפרד.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* מלבן #2 — שיבוץ לפי שכונה */}
      <div className="relative z-10 mb-6 p-5 rounded-2xl border bg-white/10 dark:bg-white/10 backdrop-blur-md border-white/20 shadow-xl">
        <div className="font-semibold mb-3">שיבוץ לפי שכונה</div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">שכונה</span>
            <select
              className="select select-bordered min-w-[180px]"
              value={selectedNeighborhood}
              onChange={e => setSelectedNeighborhood(e.target.value)}
            >
              <option value="">בחר…</option>
              {neighborhoods.map(n =>
              {
                const c = pendingCounts[n.name] || 0;
                return <option key={n.id} value={n.name}>{n.name} — {c} ממתינים</option>;
              })}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm opacity-80">כמות משלוחים</span>
            <input
              type="number" min="1"
              className="input input-bordered w-24 text-center"
              value={wantedCount}
              onChange={e => setWantedCount(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={claimAssignments}
            disabled={!selectedNeighborhood}
            title="קבל שיבוץ"
          >
            📦 קבל שיבוץ
          </button>
        </div>

        {msg && <div className="alert mt-3"><span>{msg}</span></div>}
      </div>

      {/* מלבן #3 — המשלוחים שלי */}
      <div className="relative z-10 p-5 rounded-2xl border bg-white/10 dark:bg-white/10 backdrop-blur-md border-white/20 shadow-xl">
        <div className="font-semibold mb-2">המשלוחים ששובצו לך</div>
        {myErr && <div className="alert alert-error mb-3"><span>{myErr}</span></div>}

        {my.length === 0 ? (
          <div className="opacity-60 text-sm">לא שובצו לך משלוחים עדיין</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr>
                  <th>#</th><th>שם</th><th>שכונה</th><th>כתובת</th><th>טלפון</th>
                  <th>חבילות</th><th>הערות</th><th>סטטוס</th><th>פעולות</th>
                </tr>
              </thead>
              <tbody>
                {my.map((d, idx) => (
                  <tr key={d.id}>
                    <td>{idx + 1}</td>
                    <td><b>{d.recipientName}</b></td>
                    <td>{d.address?.neighborhood || "—"}</td>
                    <td>
                      {d.address?.street}, {d.address?.city}
                      {d.address?.apartment ? ` — ${d.address.apartment}` : ""}
                      {d.address?.doorCode ? ` (קוד: ${d.address.doorCode})` : ""}
                    </td>
                    <td>{d.phone ? <a className="link" href={`tel:${d.phone}`}>{d.phone}</a> : "—"}</td>
                    <td>{d.packageCount ?? 1}</td>
                    <td className="max-w-[260px] truncate" title={d.notes || ""}>{d.notes || "—"}</td>
                    <td><StatusBadge status={d.status} /></td>
                    <td className="flex flex-wrap gap-1">
                      <WazeLink lat={d.lat} lng={d.lng} address={addrString(d.address)} label={"ניווט עם וויז"} />
                      <div className="join">
                        <button className="btn btn-xs join-item" onClick={() => setStatus(d.id, "in_transit")}>בדרך</button>
                        <button className="btn btn-xs join-item btn-success" onClick={() => setStatus(d.id, "delivered")}>נמסרה</button>
                        <button className="btn btn-xs join-item btn-error" onClick={() => setStatus(d.id, "returned")}>חזרה</button>
                      </div>
                      <button className="btn btn-xs" onClick={() => releaseAssignment(d.id)}>שחרר</button>
                      {d.status === "delivered" && (
                        <button className="btn btn-xs btn-outline" onClick={() => completeAfterDelivered(d.id)}>סיים משימה</button>
                      )}
                      <button className="btn btn-xs btn-warning" onClick={() => openEdit(d.id)}>הצע תיקון</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 text-sm opacity-80">
              סה״כ שובצו לך: <b>{my.length}</b> משלוחים (מסתיר כל משלוח שסומן "סיים משימה").
            </div>
          </div>
        )}
      </div>

      {/* מודאל בקשת תיקון */}
      <RequestEditModal
        open={editOpen}
        onClose={closeEdit}
        deliveryId={editDeliveryId}
        currentUserUid={user?.uid}
      />
     </div>
   </>
  );
}

function StatusBadge({ status })
{
  const he = { pending: "ממתין", assigned: "הוקצה", in_transit: "בדרך", delivered: "נמסרה", returned: "חזרה למחסן" };
  const color = {
    pending: "badge-warning",
    assigned: "badge-info",
    in_transit: "badge-accent",
    delivered: "badge-success",
    returned: "badge-error"
  }[status] || "badge-ghost";
  return <span className={`badge ${color}`}>{he[status] || status}</span>;
}
