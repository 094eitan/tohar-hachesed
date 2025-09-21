// web/src/pages/AdminEditRequests.jsx
import React, { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  collection, onSnapshot, query, where, doc, getDoc,
  runTransaction, serverTimestamp, updateDoc
} from "firebase/firestore";

/* הרשאת אדמין כמו אצלך */
async function isAdmin()
{
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const ref = doc(db, "admins", uid);
  const snap = await getDoc(ref);
  return snap.exists();
}

export default function AdminEditRequests()
{
  const [allowed, setAllowed] = useState(false);
  const [requests, setRequests] = useState([]);
  const [cacheDeliveries, setCacheDeliveries] = useState({}); // deliveryId -> delivery data

  useEffect(() =>
  {
    (async () =>
    {
      const ok = await isAdmin();
      setAllowed(ok);
      if (!ok) return;

      const q = query(collection(db, "editRequests"), where("status", "==", "pending"));
      const un = onSnapshot(q, async snap =>
      {
        const arr = [];
        const cache = { ...cacheDeliveries };
        for (const d of snap.docs)
        {
          const r = { id: d.id, ...d.data() };
          arr.push(r);

          if (r.deliveryId && !cache[r.deliveryId])
          {
            const ref = doc(db, "deliveries", r.deliveryId);
            const s = await getDoc(ref);
            if (s.exists())
            {
              cache[r.deliveryId] = { id: r.deliveryId, ...s.data() };
            }
          }
        }
        setRequests(arr);
        setCacheDeliveries(cache);
      });

      return () => un();
    })();
  }, []);

  if (!auth.currentUser) return <Wrap><h3>יש להתחבר תחילה</h3></Wrap>;
  if (!allowed) return <Wrap><NoAdmin /></Wrap>;

  async function approve(req)
  {
    try
    {
      await runTransaction(db, async (tx) =>
      {
        const reqRef = doc(db, "editRequests", req.id);
        const reqSnap = await tx.get(reqRef);
        if (!reqSnap.exists()) throw new Error("בקשה לא קיימת");
        const data = reqSnap.data();
        if (data.status !== "pending") throw new Error("הבקשה כבר טופלה");

        const delRef = doc(db, "deliveries", data.deliveryId);
        const delSnap = await tx.get(delRef);
        if (!delSnap.exists()) throw new Error("משלוח לא נמצא");

        const cur = delSnap.data() || {};
        const patch = {};

        // החלת השינויים: אם יש address חלקי—נמזג לתוך הכתובת הקיימת
        if (data.changes.recipientName != null) patch.recipientName = data.changes.recipientName;
        if (data.changes.phone != null) patch.phone = data.changes.phone;
        if (data.changes.packageCount != null) patch.packageCount = data.changes.packageCount;
        if (data.changes.notes != null) patch.notes = data.changes.notes;

        if (data.changes.address)
        {
          patch.address = { ...(cur.address || {}) , ...(data.changes.address || {}) };
        }

        tx.update(delRef, { ...patch, updatedAt: serverTimestamp() });

        tx.update(reqRef,
        {
          status: "approved",
          reviewedBy: auth.currentUser?.uid || null,
          reviewedAt: serverTimestamp()
        });
      });

      alert("אושר והנתונים עודכנו.");
    }
    catch(e)
    {
      console.error("approve failed", e);
      alert("נכשל אישור: " + (e?.message || e));
    }
  }

  async function reject(req)
  {
    try
    {
      await updateDoc(doc(db, "editRequests", req.id),
      {
        status: "rejected",
        reviewedBy: auth.currentUser?.uid || null,
        reviewedAt: serverTimestamp()
      });
      alert("הבקשה נדחתה.");
    }
    catch(e)
    {
      console.error("reject failed", e);
      alert("נכשל דחייה");
    }
  }

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">אדמין — בקשות תיקון משלוחים</h2>
        <div className="flex gap-2">
          <a className="btn" href="/admin">חזרה לניהול משלוחים</a>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="opacity-60">אין בקשות ממתינות כרגע.</div>
      ) : (
        <div className="space-y-5">
          {requests.map((r) =>
          {
            const del = cacheDeliveries[r.deliveryId] || {};
            return (
              <div key={r.id} className="p-4 rounded-xl border bg-base-100" dir="rtl">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-500">בקשה #{r.id}</div>
                  <div className="flex gap-2">
                    <button className="btn btn-success btn-sm" onClick={()=>approve(r)}>אשר</button>
                    <button className="btn btn-error btn-sm" onClick={()=>reject(r)}>דחה</button>
                  </div>
                </div>

                <div className="mb-2">
                  <div>משלוח: <b>{del.recipientName || "—"}</b> (ID: {r.deliveryId})</div>
                  <div className="text-sm opacity-75">
                    כתובת נוכחית: {del.address?.street || "—"}, {del.address?.city || "—"}
                    {del.address?.apartment ? ` — ${del.address.apartment}` : ""}
                    {del.address?.neighborhood ? ` | שכונה: ${del.address.neighborhood}` : ""}
                  </div>
                </div>

                <div className="overflow-auto">
                  <table className="table table-sm w-full">
                    <thead>
                      <tr><th>שדה</th><th>לפני</th><th>אחרי (מוצע)</th></tr>
                    </thead>
                    <tbody>
                      <DiffRow label="שם" before={del.recipientName} after={r.changes?.recipientName}/>
                      <DiffRow label="טלפון" before={del.phone} after={r.changes?.phone}/>
                      <DiffRow label="מס׳ חבילות" before={del.packageCount} after={r.changes?.packageCount}/>
                      <DiffRow label="הערות" before={del.notes} after={r.changes?.notes}/>
                      <DiffRow label="רחוב" before={del.address?.street} after={r.changes?.address?.street}/>
                      <DiffRow label="עיר" before={del.address?.city} after={r.changes?.address?.city}/>
                      <DiffRow label="שכונה" before={del.address?.neighborhood} after={r.changes?.address?.neighborhood}/>
                      <DiffRow label="דירה/כניסה/קומה" before={del.address?.apartment} after={r.changes?.address?.apartment}/>
                      <DiffRow label="קוד כניסה" before={del.address?.doorCode} after={r.changes?.address?.doorCode}/>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Wrap>
  );
}

function DiffRow({label, before, after})
{
  const changed = (after !== undefined) && (String(after) !== String(before ?? ""));
  return (
    <tr className={changed ? "bg-yellow-50" : ""}>
      <td className="font-medium">{label}</td>
      <td>{before ?? <span className="opacity-50">—</span>}</td>
      <td>{after ?? <span className="opacity-50">—</span>}</td>
    </tr>
  );
}

function Wrap({children}){ return <div dir="rtl" className="max-w-7xl mx-auto p-6">{children}</div>; }
function NoAdmin(){
  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">אין הרשאת אדמין</h3>
      <p>כדי להפוך לאדמין, צור/י מסמך על ה־UID שלך תחת <code>admins</code>.</p>
    </div>
  );
}
