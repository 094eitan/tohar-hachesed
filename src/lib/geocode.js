// /src/lib/geocode.js

/*
  Geocoding חינמי בעזרת Nominatim (OpenStreetMap).
  מיועד לנפחים קטנים-בינוניים. אנחנו שומרים lat/lng ב-Firestore
  כדי לא לבקש שוב (Fair-Use).
*/

export function normalizeAddressForGeocode(address)
{
  if (!address)
  {
    return "";
  }

  // חשוב: שאצלך address.street יכיל "רחוב + מספר" (למשל: "צבעוני 1")
  const parts = [];

  if (address.street && address.street.trim().length > 0)
  {
    parts.push(address.street.trim());
  }

  if (address.city && address.city.trim().length > 0)
  {
    parts.push(address.city.trim());
  }

  // מוסיפים מדינה כדי להקטין עמימות
  parts.push("ישראל");

  return parts.filter(Boolean).join(", ");
}

export async function geocodeAddress(address)
{
  const q = normalizeAddressForGeocode(address);

  if (!q || q.split(",").length < 2)
  {
    // אין מספיק מידע (צריך לפחות "רחוב+מספר, עיר")
    return null;
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&q=${encodeURIComponent(q)}`;

  // דפדפן לא מאפשר לשנות User-Agent; זה עדיין עובד לנפחים קטנים,
  // וה-Referer של האתר נשמר. מוסיפים Accept-Language לעברית.
  const res = await fetch(url,
  {
    headers:
    {
      "Accept-Language": "he"
    }
  });

  if (!res.ok)
  {
    throw new Error(`Nominatim HTTP ${res.status}`);
  }

  const data = await res.json();

  if (Array.isArray(data) && data.length > 0)
  {
    const { lat, lon } = data[0];
    return {
      lat: parseFloat(lat),
      lng: parseFloat(lon)
    };
  }

  return null;
}
