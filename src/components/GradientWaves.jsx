import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import chroma from "chroma-js";

/**
 * גרסת Portal: מציירת את הרקע ישירות תחת <body> → תמיד fixed על כל המסך.
 * אפשר להשתמש בה מכל מקום באפליקציה, היא תמיד תופיע מאחורי התוכן.
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
}) {
  // אלמנט יעד לפורטל (יושב ב-body)
  const portalElRef = useRef(null);
  // אלמנט שיכיל את ה-SVG
  const hostRef = useRef(null);

  // צור/הצמד אלמנט ל-body פעם אחת
  if (!portalElRef.current && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.id = "app-bg";
    el.style.position = "fixed";
    el.style.inset = "0";
    el.style.pointerEvents = "none";
    el.style.zIndex = "0";          // התוכן יהיה z-index גבוה יותר
    el.style.width = "100vw";
    // תמיכה ב־dv|sv|lvh + fallback
    el.style.height = "100dvh";
    el.style.height = "100svh";
    el.style.height = "100lvh";
    document.body.appendChild(el);
    portalElRef.current = el;
  }

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // מידות מסך (תמיד viewport)
    let winW = window.innerWidth;
    let winH = window.innerHeight;

    // Overflow כדי לסגור את הצדדים
    let overflow = Math.abs(lines * offsetX);

    // צבעים
    const startColor = `hsl(${hueStart}, ${satStart}%, ${lightStart}%)`;
    const endColor   = `hsl(${hueEnd}, ${satEnd}%, ${lightEnd}%)`;
    const Colors     = chroma.scale([startColor, endColor]).mode("lch").colors(lines + 2);

    // נקים SVG חדש בתוך host
    host.innerHTML = "";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.display = "block";
    svg.setAttribute("class", fill ? "path" : "stroke");
    svg.style.backgroundColor = fill ? Colors[0] : "#000";
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
            x += parseInt((Math.random() * amplitudeX / 2) + (amplitudeX / 2));
            const s = parseInt((Math.random() * amplitudeY / 2) + (amplitudeY / 2));
            const dir = Math.random() > 0.5 ? 1 : -1;
            y = s * dir + rootY;
          } else {
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

        let d = `M -${overflow} ${winH + overflow}`;
        d += ` L ${this.root[0].x} ${this.root[0].y}`;

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

        const reverse = [...this.root].reverse();
        d += ` L ${reverse[0].x} ${reverse[0].y}`;
        d += ` L ${winW + overflow} ${winH + overflow} Z`;

        path.setAttribute("d", d);
        svg.appendChild(path);
      }
    }

    // בנייה ראשונית
    for (let i = 0; i < lines + 1; i++) {
      const rootY = parseInt(winH / lines * i);
      const p = new Path(rootY, Colors[i + 1], offsetX * i);
      p.createRoot();
      p.createPath();
    }

    // רענון על שינוי גודל חלון
    const onResize = () => {
      winW = window.innerWidth;
      winH = window.innerHeight;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      svg.style.backgroundColor = fill ? Colors[0] : "#000";
      for (let i = 0; i < lines + 1; i++) {
        const rootY = parseInt(winH / lines * i);
        const p = new Path(rootY, Colors[i + 1], offsetX * i);
        p.createRoot();
        p.createPath();
      }
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      host.innerHTML = "";
    };
  }, [
    amplitudeX, amplitudeY, lines,
    hueStart, satStart, lightStart,
    hueEnd, satEnd, lightEnd,
    smoothness, offsetX, fill, crazyness
  ]);

  // מציירים <div> שיכיל את ה-SVG בתוך האלמנט שיושב ב-body:
  return portalElRef.current
    ? createPortal(<div ref={hostRef} style={{ width: "100%", height: "100%" }} />, portalElRef.current)
    : null;
}
