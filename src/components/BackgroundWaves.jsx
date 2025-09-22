import React from "react";

/**
 * רקע גלים אנימטיבי בסגנון loading.io — חינמי, ללא תלות בספריות.
 * פרופסים שימושיים:
 *  - height     (px)     גובה הרקע (ברירת מחדל 320)
 *  - speed      (sec)    מהירות הגל האיטי (ברירת מחדל 18)
 *  - gradientA  (hex)    צבע התחלה לגרדיאנט (ברירת מחדל #ff00ff)
 *  - gradientB  (hex)    צבע סיום לגרדיאנט (ברירת מחדל #00ffff)
 *  - opacityTop/mid/bot  שקיפות לכל שכבה (0..1)
 */
export default function BackgroundWaves({
  height = 320,
  speed = 18,
  gradientA = "#ff00ff",
  gradientB = "#00ffff",
  opacityTop = 0.25,
  opacityMid = 0.35,
  opacityBot = 0.45,
}) {
  // רוחב גדול כדי לאפשר תנועה חלקה (נתמרגם לרוחב מסך עם objectFit)
  const W = 2400; // viewBox width
  const H = 600;  // viewBox height (גבוה כדי לאבד קצוות)
  const dur1 = speed;        // שכבה עליונה
  const dur2 = speed * 1.3;  // שכבה אמצעית
  const dur3 = speed * 1.7;  // שכבה תחתונה

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      style={{ height: "100%" }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block"
      >
        {/* גרדיאנט רקע מלא */}
        <defs>
          <linearGradient id="bgGrad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={gradientA} />
            <stop offset="100%" stopColor={gradientB} />
          </linearGradient>

          {/* מסיכה לגובה הרצוי של הראינו (כמו height בפרמטרים) */}
          <clipPath id="clip">
            <rect x="0" y="0" width={W} height={height} rx="0" />
          </clipPath>

          {/* גל בסיס (צורה רכה) — נתיב יחסי בסגנון loading.io */}
          <path
            id="wavePath1"
            d="
              M0 300
              C 200 260, 400 340, 600 300
              C 800 260, 1000 340, 1200 300
              C 1400 260, 1600 340, 1800 300
              C 2000 260, 2200 340, 2400 300
              V 600 H 0 Z
            "
          />
          <path
            id="wavePath2"
            d="
              M0 320
              C 200 280, 400 360, 600 320
              C 800 280, 1000 360, 1200 320
              C 1400 280, 1600 360, 1800 320
              C 2000 280, 2200 360, 2400 320
              V 600 H 0 Z
            "
          />
          <path
            id="wavePath3"
            d="
              M0 340
              C 200 300, 400 380, 600 340
              C 800 300, 1000 380, 1200 340
              C 1400 300, 1600 380, 1800 340
              C 2000 300, 2200 380, 2400 340
              V 600 H 0 Z
            "
          />
        </defs>

        {/* שכבת גרדיאנט מלאה מאחור כדי לקבל מעבר צבעים חלק מתחת לגלים */}
        <rect x="0" y="0" width={W} height={height} fill="url(#bgGrad)" clipPath="url(#clip)" />

        {/* שלוש שכבות גלים — כל אחת משוכפלת פעמיים ומוזזת, כדי לקבל לופ חלק */}
        <g clipPath="url(#clip)">
          {/* עליון — הכי שקוף ומהיר */}
          <g opacity={opacityTop}>
            <use href="#wavePath1" fill="url(#bgGrad)">
              <animateTransform attributeName="transform" type="translate" from="0 0" to="-1200 0" dur={`${dur1}s`} repeatCount="indefinite" />
            </use>
            <use href="#wavePath1" fill="url(#bgGrad)" transform="translate(1200,0)">
              <animateTransform attributeName="transform" type="translate" from="1200 0" to="0 0" dur={`${dur1}s`} repeatCount="indefinite" />
            </use>
          </g>

          {/* אמצעי */}
          <g opacity={opacityMid}>
            <use href="#wavePath2" fill="url(#bgGrad)">
              <animateTransform attributeName="transform" type="translate" from="0 0" to="-1200 0" dur={`${dur2}s`} repeatCount="indefinite" />
            </use>
            <use href="#wavePath2" fill="url(#bgGrad)" transform="translate(1200,0)">
              <animateTransform attributeName="transform" type="translate" from="1200 0" to="0 0" dur={`${dur2}s`} repeatCount="indefinite" />
            </use>
          </g>

          {/* תחתון — איטי ועם שקיפות גבוהה יותר */}
          <g opacity={opacityBot}>
            <use href="#wavePath3" fill="url(#bgGrad)">
              <animateTransform attributeName="transform" type="translate" from="0 0" to="-1200 0" dur={`${dur3}s`} repeatCount="indefinite" />
            </use>
            <use href="#wavePath3" fill="url(#bgGrad)" transform="translate(1200,0)">
              <animateTransform attributeName="transform" type="translate" from="1200 0" to="0 0" dur={`${dur3}s`} repeatCount="indefinite" />
            </use>
          </g>
        </g>
      </svg>
    </div>
  );
}
