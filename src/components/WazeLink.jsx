// /src/components/WazeLink.jsx

import React from "react";

/*
  קומפוננטה קטנה שמייצרת לינק לניווט ב-Waze.

  פרופסים:
  - lat (מספר)        -> אופציונלי: קו רוחב
  - lng (מספר)        -> אופציונלי: קו אורך
  - address (מחרוזת)  -> אופציונלי: כתובת חופשית (בעברית/אנגלית)
  - label (מחרוזת)    -> אופציונלי: טקסט הכפתור (ברירת מחדל: "פתח בוויז")
  - className (מחרוזת)-> אופציונלי: מחלקות CSS (למשל btn btn-xs)
  - title (מחרוזת)    -> אופציונלי: tooltip

  עדיפות:
  1) אם יש lat/lng -> ul?ll=LAT,LNG&navigate=yes
  2) אחרת אם יש address -> ul?q=ADDRESS&navigate=yes
  3) אם אין כלום -> לא מציג לינק
*/

function buildWazeUrl(lat, lng, address)
{
  const base = "https://waze.com/ul";

  if (typeof lat === "number" && typeof lng === "number")
  {
    const ll = `${lat},${lng}`;
    return `${base}?ll=${encodeURIComponent(ll)}&navigate=yes`;
  }

  if (address && address.trim().length > 0)
  {
    return `${base}?q=${encodeURIComponent(address)}&navigate=yes`;
  }

  return null;
}

export default function WazeLink(props)
{
  const {
    lat,
    lng,
    address,
    label,
    className,
    title
  } = props;

  const url = buildWazeUrl(lat, lng, address);

  if (!url)
  {
    return null;
  }

  const cls = className && className.trim().length > 0
    ? className
    : "btn btn-primary btn-sm"; // ברירת מחדל

  return (
    <a
      href={url}
      target={"_blank"}
      rel={"noopener noreferrer"}
      className={cls}
      title={title || "פתח ניווט ב-Waze"}
    >
      {label ? label : "פתח בוויז"}
    </a>
  );
}
