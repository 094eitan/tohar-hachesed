import React, { useEffect, useRef } from "react";
import chroma from "chroma-js";

/**
 * רקע גלים מונפש בסגנון CodePen (supah/gradient waves),
 * ארוז כקומפוננטה ל-React.
 *
 * Props אופציונליים לשינוי העיצוב:
 * - lines=20
 * - amplitudeX=100, amplitudeY=20
 * - hueStart=53, satStart=74, lightStart=67
 * - hueEnd=216, satEnd=100, lightEnd=7
 * - smoothness=3, offsetX=10
 * - fill=true  (אם false תקבל קווי מתאר בלבד)
 * - bgImageUrl (תמונת רקע עדינה מאחורי הגלים)
 */
export default function GradientWaves({
  lines = 20,
  amplitudeX = 100,
  amplitudeY = 20,
  hueStart = 53,
  satStart = 74,
  lightStart = 67,
  hueEnd = 216,
  satEnd = 100,
  lightEnd = 7,
  smoothness = 3,
  offsetX = 10,
  fill = true,
  bgImageUrl = "https://raw.githubusercontent.com/supahfunk/gradientwaves-svg/master/dist/img/bg-gradient-wave.png",
}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // מידות
    let winW = host.clientWidth || window.innerWidth;
    let winH = host.clientHeight || window.innerHeight;

    // Overflow כדי לסגור יפה את הצורה בצדי המסך
    let overflow = Math.abs(lines * offsetX);

    // צבעי התחלה/סיום
    const startColor = `hsl(${hueStart}, ${satStart}%, ${lightStart}%)`;
    const endColor   = `hsl(${hueEnd}, ${satEnd}%, ${lightEnd}%)`;
    const Colors     = chroma.scale([startColor, endColor]).mode("lch").colors(lines + 2);

    // נקים SVG חדש בתוך ה־host (לא על body)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    svg.setAttribute("id", "volunteer-waves");
    svg.setAttribute("class", fill ? "gw-path" : "gw-stroke");
    host.innerHTML = ""; // ניקוי אם היה קודם
    host.appendChild(svg);

    // רקע סטטי (כמו בדמו)
    if (fill) {
      svg.style.background = `url(${bgImageUrl}) center / cover no-repeat`;
    } else {
      svg.style.background = "#000";
    }

    class Path {
      constructor(y, fillColor, offX) {
        this.rootY = y;
        this.fill = fillColor;
        this.offsetX = offX;
        this.root = [];
      }

      createRoot() {
        let x = -overflow + this.offsetX;
        let y = 0;
        let rootY = this.rootY;
        let upSideDown = 0;

        this.root.push({ x, y: rootY });

        while (x < winW) {
          // גיאומטרי (כמו בדמו; “crazyness” כבוי)
          upSideDown = !upSideDown;
          const value = upSideDown ? -1 : 1;

          x += amplitudeX;
          y = amplitudeY * value + rootY;

          this.root.push({ x, y });
        }

        this.root.push({ x: winW + overflow, y: rootY });
      }

      createPath() {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", this.fill);
        path.setAttribute("stroke", this.fill);

        // ראשית מסלול
        let d = `M -${overflow} ${winH + overflow}`;
        d += ` L ${this.root[0].x} ${this.root[0].y}`;

        // עיקולים חלקים (smoothness)
        for (let i = 1; i < this.root.length - 1; i++) {
          const prev = this.root[i - 1];
          const curr = this.root[i];
          const diffX = (curr.x - prev.x) / smoothness;
          const x1 = prev.x + diffX;
          const x2 = curr.x - diffX;
          const y1 = prev.y;
          const y2 = curr.y;
          d += ` C ${x1} ${y1}, ${x2} ${y2}, ${curr.x} ${curr.y}`;
        }

        // לפני אחרון
        const reverse = [...this.root].reverse();
        d += ` L ${reverse[0].x} ${reverse[0].y}`;
        // נקודה אחרונה וסגירה
        d += ` L ${winW + overflow} ${winH + overflow} Z`;

        path.setAttribute("d", d);
        svg.appendChild(path);
      }
    }

    // בניית השכבות
    const paths = [];
    for (let i = 0; i < lines + 1; i++) {
      const y = parseInt(winH / lines * i);
      const p = new Path(y, Colors[i + 1], offsetX * i);
      p.createRoot();
      p.createPath();
      paths.push(p);
    }

    // האזנה לשינויי גודל בתוך הקונטיינר/חלון
    const onResize = () => {
      winW = host.clientWidth || window.innerWidth;
      winH = host.clientHeight || window.innerHeight;
      // רנדר מחדש
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      // רקע
      if (fill) {
        svg.style.background = `url(${bgImageUrl}) center / cover no-repeat`;
      } else {
        svg.style.background = "#000";
      }
      const newPaths = [];
      for (let i = 0; i < lines + 1; i++) {
        const y = parseInt(winH / lines * i);
        const p = new Path(y, Colors[i + 1], offsetX * i);
        p.createRoot();
        p.createPath();
        newPaths.push(p);
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    window.addEventListener("resize", onResize);

    // ניקוי
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      host.innerHTML = "";
    };
  }, [
    lines, amplitudeX, amplitudeY,
    hueStart, satStart, lightStart,
    hueEnd, satEnd, lightEnd,
    smoothness, offsetX, fill, bgImageUrl
  ]);

  // הקונטיינר צריך להיות absolute מאחורי התוכן
  return (
    <div
      ref={hostRef}
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      aria-hidden
    />
  );
}
