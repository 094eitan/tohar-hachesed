import React, { useEffect, useRef } from "react";
import chroma from "chroma-js";

/**
 * GradientWaves — גרסת "supah" עם settings מלאים:
 * props:
 *  - amplitudeX=100, amplitudeY=20
 *  - lines=20
 *  - hueStart=53,  satStart=74,  lightStart=67
 *  - hueEnd=216,   satEnd=100,   lightEnd=7
 *  - smoothness=3
 *  - offsetX=10
 *  - fill=true      (אם false — קווי מתאר)
 *  - crazyness=false (גלים "פרועים" אקראיים)
 *  - className (אופציונלי, לעיצוב העוטף)
 */
export default function GradientWaves({
  amplitudeX = 100,
  amplitudeY = 20,
  lines = 20,
  hueStart = 53,
  satStart = 74,
  lightStart = 67,
  hueEnd = 216,
  satEnd = 100,
  lightEnd = 7,
  smoothness = 3,
  offsetX = 10,
  fill = true,
  crazyness = false,
  className = "",
}) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let winW = host.clientWidth || window.innerWidth;
    let winH = host.clientHeight || window.innerHeight;
    let overflow = Math.abs(lines * offsetX);

    // צבעים כמו בקוד המקור
    const startColor = `hsl(${hueStart}, ${satStart}%, ${lightStart}%)`;
    const endColor   = `hsl(${hueEnd}, ${satEnd}%, ${lightEnd}%)`;
    const Colors     = chroma.scale([startColor, endColor]).mode("lch").colors(lines + 2);

    // בונים SVG בתוך ה־host (לא על body)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    svg.setAttribute("id", "svg");
    svg.setAttribute("class", fill ? "path" : "stroke");
    // רקע לפי Colors[0] (כמו בדמו)
    svg.style.backgroundColor = fill ? Colors[0] : "#000";

    host.innerHTML = "";
    host.appendChild(svg);

    class Path {
      constructor(y, color, offX) {
        this.rootY = y;
        this.fill = color;
        this.offsetX = offX;
        this.root = [];
      }

      createRoot() {
        const rootY = this.rootY;
        let x = -overflow + this.offsetX;
        let y = 0;
        let upSideDown = 0;

        this.root = [{ x, y: rootY }];

        while (x < winW) {
          if (crazyness) {
            // גרסה "משוגעת" — צעדים אקראיים
            x += parseInt((Math.random() * amplitudeX / 2) + (amplitudeX / 2));
            const s = parseInt((Math.random() * amplitudeY / 2) + (amplitudeY / 2));
            const dir = Math.random() > 0.5 ? 1 : -1;
            y = s * dir + rootY;
          } else {
            // גיאומטרי מדויק — הפיכות למעלה/למטה לסירוגין
            upSideDown = !upSideDown;
            const dir = upSideDown ? -1 : 1;
            x += amplitudeX;
            y = amplitudeY * dir + rootY;
          }
          this.root.push({ x, y });
        }
        this.root.push({ x: winW + overflow, y: rootY });
      }

      createPath() {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("fill", this.fill);
        path.setAttribute("stroke", this.fill);

        // נקודות התחלה
        let d = `M -${overflow} ${winH + overflow}`;
        d += ` L ${this.root[0].x} ${this.root[0].y}`;

        // עקומות חלקות (smoothness)
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

        // אחרון + סגירה
        d += ` L ${winW + overflow} ${winH + overflow} Z`;

        path.setAttribute("d", d);
        svg.appendChild(path);
      }
    }

    // יצירת כל השכבות
    for (let i = 0; i < lines + 1; i++) {
      const rootY = parseInt(winH / lines * i);
      const p = new Path(rootY, Colors[i + 1], offsetX * i);
      p.createRoot();
      p.createPath();
    }

    const onResize = () => {
      winW = host.clientWidth || window.innerWidth;
      winH = host.clientHeight || window.innerHeight;
      // רנדר מחדש
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.style.backgroundColor = fill ? Colors[0] : "#000";
      for (let i = 0; i < lines + 1; i++) {
        const rootY = parseInt(winH / lines * i);
        const p = new Path(rootY, Colors[i + 1], offsetX * i);
        p.createRoot();
        p.createPath();
      }
    };

    const ro = new ResizeObserver(onResize);
    ro.observe(host);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      host.innerHTML = "";
    };
  }, [
    amplitudeX, amplitudeY, lines,
    hueStart, satStart, lightStart,
    hueEnd, satEnd, lightEnd,
    smoothness, offsetX, fill, crazyness
  ]);

  // מאחורי כל התוכן
  return (
    <div
      ref={hostRef}
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
      aria-hidden
    />
  );
}
