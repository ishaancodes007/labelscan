"use client";
import Link from "next/link";
import { useRef } from "react";

const MAX_DEG = 4;
/** A link card that tilts at most 4 degrees toward the pointer. Pointer devices only, and never under reduced motion. */
export default function TiltCard({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const can = () => typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches && document.documentElement.dataset.motion !== "reduce";
  function move(e: React.PointerEvent) {
    const el = ref.current; if (!el || !can()) return;
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateX(${(-y * 2 * MAX_DEG).toFixed(2)}deg) rotateY(${(x * 2 * MAX_DEG).toFixed(2)}deg) translateY(-2px)`;
  }
  return <Link ref={ref} href={href} className="feature" onPointerMove={move} onPointerLeave={() => { if (ref.current) ref.current.style.transform = ""; }}><h3>{title}</h3>{children}</Link>;
}
