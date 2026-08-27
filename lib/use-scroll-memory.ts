"use client";

import { useLayoutEffect } from "react";

export function useScrollMemory(key: string) {
  useLayoutEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    const stored = sessionStorage.getItem(`gk-scroll:${key}`);
    const y = stored ? Number(stored) : 0;
    if (Number.isFinite(y) && y > 0) {
      window.scrollTo(0, y);
    }

    function persist() {
      sessionStorage.setItem(`gk-scroll:${key}`, String(window.scrollY));
    }

    window.addEventListener("scroll", persist, { passive: true });
    return () => {
      persist();
      window.removeEventListener("scroll", persist);
    };
  }, [key]);
}
