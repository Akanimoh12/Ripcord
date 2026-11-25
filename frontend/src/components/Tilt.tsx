"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Tilts its contents toward the pointer in 3D. Sets --px / --py (-1..1) on itself,
 * which children can read for parallax. Stays flat for touch and reduced motion.
 */
export function Tilt({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useRef(false);

  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => (enabled.current = fine.matches && !still.matches);
    update();
    fine.addEventListener("change", update);
    still.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      still.removeEventListener("change", update);
    };
  }, []);

  function set(px: number, py: number, glare: number) {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--px", px.toFixed(3));
    el.style.setProperty("--py", py.toFixed(3));
    el.style.setProperty("--glare", String(glare));
  }

  return (
    <div className="tilt-stage">
      <div
        ref={ref}
        className={`tilt ${className}`}
        style={style}
        onPointerMove={(e) => {
          if (!enabled.current) return;
          const r = e.currentTarget.getBoundingClientRect();
          set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1, 1);
        }}
        onPointerLeave={() => set(0, 0, 0)}
      >
        {children}
        <div className="tilt-glare" aria-hidden="true" />
      </div>
    </div>
  );
}
