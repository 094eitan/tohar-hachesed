// web/src/components/RequestEditModal.jsx
import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";

/*
  מודאל "הצע תיקון" עבור משלוח ספציפי (delivery).
  props:
    open            : bool
    onClose         : function
    deliveryId      : string (מזהה המשלוח)
    currentUserUid  : string (uid של המתנדב)
*/
export default function RequestEditModal({ open, onClose, deliveryId, currentUserUid })
{
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState(null);

  // שדות מוצעים לתיקון:
  const [recipientName, setRecipientName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [apartment, setApartment] = useState("");
  const [doorCode, setDoorCode] = useState("");
  const [phone, setPhone] = useState("");
  const [packageCount, setPackageCount] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() =>
  {
    if (!open || !deliveryId)
    {
      return;
    }
    (async () =>
    {
      try
      {
        const ref = doc(db, "deliveries", deliveryId);
        const snap = await getDoc(ref);
        if (snap.exists())
        {
          const v = snap.data() || {};
          setCur(v);

          setRecipientName(v.recipientName || "");
          setStreet(v.address?.street || "");
          setCity(v.address?.city || "");
          setNeighborhood(v.address?.neighborhood || "");
          setApartment(v.address?.apartment || "");
          setDoorCode(v.address?.doorCode || "");
          setPhone(v.phone || "");
          setPackageCount(v.packageCount ?? "");
          setNotes(v.notes || "");
        }
        else
        {
          setCur(null);
        }
      }
      catch(e)
      {
        console.error("Failed to load delivery for edit:", e);
      }
    })();
  }, [open, deliveryId]);

  const submit = async () =>
  {
    if (!currentUserUid || !deliveryId)
    {
      alert("חסר משתמש מחובר או מזהה משלוח");
      return;
    }
    setLoading(true);
    try
    {
      const changes = {};

      // נשמור רק מה ששונה מהמצב הנוכחי (כדי להקל על האדמין לראות דלתא)
      if ((recipientName || "") !== (cur?.recipientName || "")) { changes.recipientName = recipientName.trim(); }
      // address
      const addr = {};
      if ((street || "") !== (cur?.address?.street || "")) { addr.street = street.trim(); }
      if ((city || "") !== (cur?.address?.city || "")) { addr.city = city.trim(); }
      if ((neighborhood || "") !== (cur?.address?.neighborhood || "")) { addr.neighborhood = neighborhood.trim(); }
      if ((apartment || "") !== (cur?.address?.apartment || "")) { addr.apartment = apartment.trim(); }
      if ((doorCode || "") !== (cur?.address?.doorCode || "")) { addr.doorCode = doorCode.trim(); }
      if (Object.keys(addr).length > 0) { changes.address = addr; }

      if ((phone || "") !== (cur?.phone || "")) { changes.phone = phone.trim(); }

      const pc = String(packageCount ?? "").trim();
      if (pc !== "" && Number(pc) !== Number(cur?.packageCount ?? "")) { changes.packageCount = Number(pc); }

      if ((notes || "") !== (cur?.notes || "")) { changes.notes = notes; }

      if (Object.keys(changes).length === 0)
      {
        alert("לא בוצעו שינויים.");
        setLoading(false);
        return;
      }

      await addDoc(collection(db, "editRequests"),
      {
        deliveryId,
        changes,
        status: "pending",           // pending | approved | rejected
        createdBy: currentUserUid,
        createdAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        adminNote: ""
      });

      alert("הבקשה נשלחה לאדמין. תודה!");
      onClose();
    }
    catch(e)
    {
      console.error("submit edit request failed", e);
      alert("שגיאה בשליחת בקשה: " + (e?.message || e));
    }
    finally
    {
      setLoading(false);
    }
  };

  if (!open)
  {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-4 w-full max-w-xl" dir="rtl">
        <h3 className="text-lg font-bold mb-3">הצע תיקון פרטי משלוח</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <Text label="שם נזקק" value={recipientName} onChange={setRecipientName} />
          <Text label="טלפון" value={phone} onChange={setPhone} />
          <Text label="רחוב + מספר" value={street} onChange={setStreet} />
          <Text label="עיר" value={city} onChange={setCity} />
          <Text label="שכונה" value={neighborhood} onChange={setNeighborhood} />
          <Text label="דירה/כניסה/קומה" value={apartment} onChange={setApartment} />
          <Text label="קוד כניסה" value={doorCode} onChange={setDoorCode} />
          <Text label="מס׳ חבילות" type="number" value={packageCount} onChange={setPackageCount} />
          <div className="sm:col-span-2">
            <label className="label"><span className="label-text">הערות</span></label>
            <textarea className="textarea textarea-bordered w-full" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button className="btn" onClick={onClose} disabled={loading}>ביטול</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? "שולח…" : "שלח בקשה"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Text({label, value, onChange, type="text"})
{
  return (
    <div>
      <label className="label"><span className="label-text">{label}</span></label>
      <input className="input input-bordered w-full" type={type} value={value} onChange={e=>onChange(e.target.value)} />
    </div>
  );
}
