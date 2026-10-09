"use client";
import { useEffect, useRef } from "react";

/** Reveal-once on scroll. Content is visible by default (also without JS); below-the-fold blocks are hidden only after mount and revealed once. */
export default function Reveal({ as: Tag = "div", className = "", children, ...rest }: { as?: "div" | "section" | "ol" | "ul"; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (document.documentElement.dataset.motion === "reduce" || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;     // already on screen: leave as is
    el.classList.add("pre");
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as React.ElementType;
  return <T ref={ref} className={`reveal ${className}`} {...rest}>{children}</T>;
}
