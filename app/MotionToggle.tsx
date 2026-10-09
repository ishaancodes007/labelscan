"use client";
import { useEffect, useState } from "react";

/** On-page "Reduce motion" switch. The choice is stored in localStorage (try/catch) and applied as <html data-motion>. */
export default function MotionToggle() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => { setReduce(document.documentElement.dataset.motion === "reduce"); }, []);
  function change(v: boolean) {
    setReduce(v);
    document.documentElement.dataset.motion = v ? "reduce" : "full";
    try { localStorage.setItem("beautylens.motion", v ? "reduce" : "full"); } catch { /* preference just won't persist */ }
  }
  return <label className="motion"><input type="checkbox" checked={reduce} onChange={(e) => change(e.target.checked)} /> Reduce motion</label>;
}
